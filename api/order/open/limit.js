const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const validateSignature = require('../../../middleware/signatureValidator');

// 辅助函数：获取服务器时间（带3次重试）
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


// 持仓模式检查函数
async function checkPositionMode(apiKey, apiSecret, baseURL) {
  const timestamp = Date.now();
  const params = { timestamp };

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(new URLSearchParams(params).toString())
    .digest('hex');

  try {
    const response = await axios.get(`${baseURL}/fapi/v1/positionSide/dual`, {
      headers: { 'X-MBX-APIKEY': apiKey },
      params: { ...params, signature }
    });
    return response.data.dualSidePosition;
  } catch (error) {
    console.error('Failed to check position mode:', error.message);
    return false;
  }
}

// 生成签名函数
function generateSignature(params, secret) {
  const orderedParams = new URLSearchParams(
    Object.entries(params)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, v.toString()])
  ).toString();

  return crypto
    .createHmac('sha256', secret)
    .update(orderedParams)
    .digest('hex');
}

// 订单响应格式化
function formatOrderResponse(data) {
  return {
    orderId: data.orderId,
    symbol: data.symbol,
    positionSide: data.positionSide || 'BOTH',
    price: parseFloat(data.price),
    quantity: parseFloat(data.origQty),
    status: data.status,
    type: data.type,
    updateTime: data.updateTime,
    timeInForce: data.timeInForce
  };
}

// 统一错误处理
function handleOrderError(error, res) {
  const binanceError = error.response?.data;
  const statusCode = error.response?.status || 500;

  const errorMessages = {
    '-1116': 'Invalid price/quantity precision',
    '-2010': 'Order would immediately trigger',
    '-2021': 'Order price out of range',
    '-4061': 'Position side conflict',
    '-1021': 'Timestamp out of recvWindow'
  };

  res.status(statusCode).json({
    code: binanceError?.code || statusCode,
    msg: errorMessages[binanceError?.code] || binanceError?.msg || error.message,
    data: binanceError || null
  });
}

// 路由处理器
router.post('/limit', validateSignature(), async (req, res) => {
  try {
    const { symbol, side, quantity, price, positionSide, timeInForce = 'GTC' } = req.body;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 1. 参数基础验证
    if (!symbol || !side || !quantity || !price) {
      return res.status(400).json({
        code: 400,
        msg: 'Missing required parameters: symbol, side, quantity, price',
        data: null
      });
    }

    // 2. 获取服务器时间（带重试机制）
    let timestamp;
    for (let retry = 0; retry < 3; retry++) {
      try {
        const timeRes = await axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 });
        timestamp = Number(timeRes.data.serverTime);
        break;
      } catch (error) {
        if (retry === 2) throw new Error('Failed to get server time');
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 3. 构建基础参数
    const params = {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase(),
      type: 'LIMIT',
      quantity: Number(quantity).toFixed(8),
      price: Number(price).toFixed(2),
      timeInForce: timeInForce.toUpperCase(),
      timestamp,
      recvWindow: 10000
    };

    // 4. 检查持仓模式并处理positionSide
    const isHedgeMode = await checkPositionMode(apiKey, apiSecret, baseURL);
    console.log('Position Mode:', isHedgeMode ? 'HEDGE' : 'ONE-WAY');

    if (isHedgeMode) {
      if (!positionSide) {
        return res.status(400).json({
          code: 400,
          msg: 'positionSide is required in hedge mode',
          data: null
        });
      }
      params.positionSide = positionSide.toUpperCase();
    } else {
      // 单向模式必须移除positionSide
      delete params.positionSide;
    }

    // 5. 生成签名
    const signature = generateSignature(params, apiSecret);

    // 6. 发送请求
    const response = await axios.post(
      `${baseURL}/fapi/v1/order`,
      new URLSearchParams({ ...params, signature }).toString(),
      {
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 8000
      }
    );

    // 7. 格式化响应
    res.json({
      code: 200,
      msg: 'Limit order placed',
      data: formatOrderResponse(response.data)
    });

  } catch (error) {
    handleOrderError(error, res);
  }
});

// 导出路由和工具函数
module.exports = router;
module.exports.getServerTimeWithRetry = getServerTimeWithRetry;
module.exports.checkPositionMode = checkPositionMode;
module.exports.generateSignature = generateSignature;
module.exports.formatOrderResponse = formatOrderResponse;
module.exports.handleOrderError = handleOrderError;
