// api/order/close/limit.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const validateSignature = require('../../../middleware/signatureValidator');

router.post('/limit', validateSignature(), async (req, res) => {
  try {
    const { symbol, positionSide, quantity, price, timeInForce = 'GTC' } = req.body;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 1. 检查持仓模式
    const isHedgeMode = await checkPositionMode(apiKey, apiSecret, baseURL);
    
    // 对冲模式必须验证positionSide
    if (isHedgeMode && !positionSide) {
      return res.status(400).json({
        code: -4061,
        msg: 'Hedge mode requires positionSide'
      });
    }

    // 2. 参数基础验证
    if (!symbol || !quantity || !price) {
      return res.status(400).json({
        code: 400,
        msg: 'Missing symbol/quantity/price',
        data: null
      });
    }

    // 3. 获取服务器时间（带重试）
    const timestamp = await getServerTimeWithRetry(baseURL);

    // 4. 查询持仓信息
    const position = await getPositionInfo(
      symbol,
      isHedgeMode ? positionSide : 'BOTH',
      apiKey, apiSecret, baseURL
    );

    if (!position || Math.abs(position.positionAmt) < quantity) {
      return res.status(400).json({
        code: 400,
        msg: 'Insufficient position',
        data: { available: position?.positionAmt || 0 }
      });
    }

    // 5. 构建请求参数
    const params = {
      symbol: symbol.toUpperCase(),
      side: position.positionAmt > 0 ? 'SELL' : 'BUY',
      type: 'LIMIT',
      quantity: Math.min(quantity, Math.abs(position.positionAmt)).toFixed(8),
      price: Number(price).toFixed(2),
      timeInForce: timeInForce.toUpperCase(),
      timestamp,
      recvWindow: 10000
    };

    // 6. 对冲模式处理
    if (isHedgeMode) {
      params.positionSide = positionSide.toUpperCase();
    }

    // 7. 生成签名
    const orderedParams = new URLSearchParams(
      Object.entries(params)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => [k, v.toString()])
    ).toString();

    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(orderedParams)
      .digest('hex');

    // 8. 发送请求
    const response = await axios.post(
      `${baseURL}/fapi/v1/order?${orderedParams}&signature=${signature}`,
      null,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );

    // 9. 响应处理
    res.json({
      code: 200,
      msg: 'Limit close order placed',
      data: {
        orderId: response.data.orderId,
        executedQty: parseFloat(response.data.executedQty),
        status: response.data.status
      }
    });

  } catch (error) {
    handleOrderError(error, res);
  }
});

// 辅助函数：获取服务器时间（带3次重试）
async function getServerTimeWithRetry(baseURL) {
  for (let i = 0; i < 3; i++) {
    try {
      const timeRes = await axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 });
      return Number(timeRes.data.serverTime);
    } catch (e) {
      if (i === 2) throw new Error('Failed to get server time');
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// 辅助函数：查询持仓模式
async function checkPositionMode(apiKey, apiSecret, baseURL) {
  const timestamp = Date.now();
  const params = { timestamp };
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(new URLSearchParams(params).toString())
    .digest('hex');

  const response = await axios.get(`${baseURL}/fapi/v1/positionSide/dual`, {
    headers: { 'X-MBX-APIKEY': apiKey },
    params: { ...params, signature }
  });

  return response.data.dualSidePosition;
}

// 辅助函数：获取持仓信息
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

// 错误处理（复用开仓逻辑）
const { handleOrderError } = require('../open/limit');
module.exports = router;
