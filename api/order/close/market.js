const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs');
const validateSignature = require('../../../middleware/signatureValidator');

router.post('/market', validateSignature(), async (req, res) => {
  let isHedgeMode = false;
  let timestamp;
  let currentPrice = 0;

  try {
    // 1. 参数验证
    const { symbol, positionSide, quantity } = req.body;
    if (!symbol || !positionSide) {
      return res.status(400).json({
        code: 400,
        msg: 'Missing required parameters',
        data: { required: ['symbol', 'positionSide'] }
      });
    }

    // 2. 获取服务器时间和最新价格（并行请求）
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    const [timeRes, ticker] = await Promise.all([
      axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 }),
      axios.get(`${baseURL}/fapi/v1/ticker/price`, {
        params: { symbol: symbol.toUpperCase() },
        timeout: 2000
      })
    ]);

    timestamp = timeRes.data.serverTime;
    currentPrice = parseFloat(ticker.data.price);
    console.log('Synced server timestamp:', timestamp);
    console.log('Current market price:', currentPrice);

    // 3. 价格有效性验证
    if (currentPrice <= 0) {
      return res.status(500).json({
        code: 500,
        msg: 'Invalid market price',
        data: null
      });
    }

    // 4. 获取账户配置和持仓信息（并行请求）
    const riskParams = { timestamp };
    const riskQuery = qs.stringify({ timestamp }, { sort: true });
    const riskSignature = crypto
      .createHmac('sha256', apiSecret)
      .update(riskQuery)
      .digest('hex');

    const [accountInfo, accountConfig] = await Promise.all([
      axios.get(`${baseURL}/fapi/v2/account`, {
        headers: { 'X-MBX-APIKEY': apiKey },
        params: { timestamp, signature: riskSignature },
        timeout: 3000
      }),
      axios.get(`${baseURL}/fapi/v1/positionSide/dual`, {
        headers: { 'X-MBX-APIKEY': apiKey },
        params: { timestamp, signature: riskSignature },
        timeout: 3000
      })
    ]);

    // 5. 检查持仓
    isHedgeMode = accountConfig.data.dualSidePosition;
    const position = accountInfo.data.positions.find(p => {
      const isMatch = p.symbol === symbol.toUpperCase();
      return isHedgeMode
        ? isMatch && p.positionSide === positionSide.toUpperCase()
        : isMatch && Math.sign(parseFloat(p.positionAmt)) === (positionSide.toUpperCase() === 'LONG' ? 1 : -1);
    });

    if (!position || Math.abs(parseFloat(position.positionAmt)) <= 0) {
      return res.status(400).json({
        code: 400,
        msg: 'No active position found',
        data: {
          symbol,
          positionSide,
          mode: isHedgeMode ? 'HEDGE' : 'ONE-WAY'
        }
      });
    }

    // 6. 处理平仓数量
    const positionAmt = Math.abs(parseFloat(position.positionAmt));
    let closeQuantity = positionAmt; // 默认全平

    if (quantity !== undefined) {
      closeQuantity = parseFloat(quantity);
      if (isNaN(closeQuantity) || closeQuantity <= 0) {
        return res.status(400).json({
          code: 400,
          msg: 'Invalid quantity (must be positive number)',
          data: null
        });
      }

      if (closeQuantity > positionAmt) {
        return res.status(400).json({
          code: 400,
          msg: `Quantity exceeds position (max: ${positionAmt})`,
          data: null
        });
      }
    }

    // 7. 检查对冲模式反向仓位
    if (isHedgeMode) {
      const otherSidePosition = accountInfo.data.positions.find(p =>
        p.symbol === symbol.toUpperCase() &&
        p.positionSide === (positionSide.toUpperCase() === 'LONG' ? 'SHORT' : 'LONG')
      );

      if (otherSidePosition) {
        console.log('Hedge mode detected opposite position:',
          `Side: ${otherSidePosition.positionSide}`,
          `Amount: ${otherSidePosition.positionAmt}`
        );
      }
    }

    // 8. 构建订单参数
    const params = {
      symbol: symbol.toUpperCase(),
      side: positionSide.toUpperCase() === 'LONG' ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: closeQuantity.toFixed(8),
      timestamp,
      recvWindow: 10000
    };

    if (isHedgeMode) params.positionSide = positionSide.toUpperCase();

    // 9. 生成签名
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(qs.stringify(params, { sort: true }))
      .digest('hex');

    // 10. 发送订单（带重试机制）
    let response;
    for (let i = 0; i < 3; i++) {
      try {
        response = await axios.post(`${baseURL}/fapi/v1/order`,
          qs.stringify({ ...params, signature }),
          {
            headers: {
              'X-MBX-APIKEY': apiKey,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 8000
          }
        );
        break;
      } catch (e) {
        if (i === 2) throw e;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }

    // 11. 计算滑点
    const entryPrice = parseFloat(position.entryPrice);
    const slippage = entryPrice > 0
      ? ((currentPrice - entryPrice) / entryPrice * 100).toFixed(4) + '%'
      : 'N/A';

    // 12. 成功响应
    res.json({
      code: 200,
      msg: 'Order executed',
      data: {
        ...response.data,
        mode: isHedgeMode ? 'HEDGE' : 'ONE-WAY',
        executedPrice: currentPrice,
        slippage,
        remainingPosition: (positionAmt - closeQuantity).toFixed(8),
        positionClosed: closeQuantity === positionAmt
      }
    });

  } catch (error) {
    console.error('Order Error:', error.response?.data || error.message);

    const status = error.response?.status || 500;
    const message = error.response?.data?.msg || error.message;
    const errorCode = error.response?.data?.code;

    res.status(status).json({
      code: errorCode || status,
      msg: errorCode === -1021
        ? 'Server time sync failed. Please retry.'
        : message,
      data: {
        timestamp,
        currentPrice,
        isHedgeMode,
        error: error.response?.data || null
      }
    });
  }
});


function formatOrderResponse(data) {
  return {
    orderId: data.orderId,
    symbol: data.symbol,
    executedQty: parseFloat(data.executedQty || 0),
    avgPrice: parseFloat(data.avgPrice || 0),
    status: data.status,
    updateTime: data.updateTime,
    clientOrderId: data.clientOrderId
  };
}


async function getPositionInfo(symbol, positionSide, apiKey, apiSecret, baseURL) {
  const timestamp = Date.now();
  const params = { timestamp };
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(new URLSearchParams(params).toString())
    .digest('hex');
  const response = await axios.get(`${baseURL}/fapi/v2/account`, {
    headers: { 'X-MBX-APIKEY': apiKey },
    params: { ...params, signature }
  });
  return response.data.positions.find(p =>
    p.symbol === symbol.toUpperCase() &&
    (positionSide === 'BOTH' || p.positionSide === positionSide.toUpperCase())
  );
}

async function getServerTimeWithRetry(baseURL) {
  for (let i = 0; i < 3; i++) {
    try {
      const timeRes = await axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 });
      const serverTime = Number(timeRes.data.serverTime);
      const localTime = Date.now();

      // 时间差超过5秒显示警告
      if (Math.abs(serverTime - localTime) > 5000) {
        console.warn(`⚠️ 时间不同步 | Server: ${serverTime} | Local: ${localTime} | Diff: ${serverTime - localTime}ms`);
      }

      return serverTime;
    } catch (e) {
      if (i === 2) throw new Error('Failed to get server time');
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

module.exports = router; // 直接导出路由实例
module.exports.getPositionInfo = getPositionInfo; // 附加辅助函数为属性
module.exports.formatOrderResponse = formatOrderResponse;
module.exports.getServerTimeWithRetry = getServerTimeWithRetry;