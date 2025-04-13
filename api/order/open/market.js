const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('querystring');
const validateSignature = require('../../../middleware/signatureValidator');

router.post('/market', validateSignature(), async (req, res) => {
  try {
    // 1. 检查请求头
    if (!req.headers['content-type']?.includes('application/json')) {
      return res.status(400).json({
        code: 400,
        msg: 'Content-Type must be application/json',
        data: null
      });
    }

    // 2. 参数提取与验证
    const { symbol, side, quantity, reduceOnly = false } = req.body;

    if (!symbol || !side || !quantity) {
      return res.status(400).json({
        code: 400,
        msg: 'Missing required parameters',
        data: {
          required: ['symbol', 'side', 'quantity'],
          received: req.body
        }
      });
    }

    // 验证 side 参数
    if (!['BUY', 'SELL'].includes(side.toUpperCase())) {
      return res.status(400).json({
        code: 400,
        msg: 'Invalid side (valid: BUY/SELL)',
        data: null
      });
    }

    // 3. 获取网络配置
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 4. 获取服务器时间（确保时间戳同步）
    let timestamp;
    try {
      const serverTimeResponse = await axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 });
      timestamp = serverTimeResponse.data.serverTime;
      console.log('Server Time:', timestamp);
    } catch (timeError) {
      console.error('Failed to get server time:', timeError.message);
      timestamp = Date.now(); // 回退到本地时间
    }

    // 5. 构建签名参数
    const params = {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase(),
      type: 'MARKET',
      quantity: Number(quantity).toFixed(8), // 固定 8 位小数
      timestamp: timestamp, // 确保拼写为 timestamp
      reduceOnly: reduceOnly.toString() // 转为字符串 true/false
    };

    // 6. 生成查询字符串
    const queryString = qs.stringify(params, { sort: true, encode: true }); // 添加排序
    console.log('Sorted Query String:', queryString); // 已排序
    console.log('Params:', params);

    // 7. 生成签名
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');
    console.log('Signature:', signature);

    // 8. 发送请求到币安 API
    const requestBody = `${queryString}&signature=${signature}`; // 排序后字符串 + 签名
    console.log('Request Body:', requestBody);

    // 9. 发送请求到币安 API (修改！)
    const response = await axios.post(
      `${baseURL}/fapi/v1/order`,
      requestBody, // 使用新的 requestBody
      {
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000 // 建议添加超时
      }
    );

    // 10. 处理响应
    res.json({
      code: 200,
      msg: 'Order placed',
      data: formatOrderResponse(response.data)
    });

  } catch (error) {
    handleError(error, res);
  }
});

// 格式化订单响应
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

// 统一错误处理
function handleError(error, res) {
  console.error('Order Error:', error.message, error.response?.data);
  const status = error.response?.status || 500;
  const message = error.response?.data?.msg || error.message;
  const binanceCode = error.response?.data?.code;

  res.status(status).json({
    code: binanceCode || status,
    msg: message,
    data: error.response?.data || null
  });
}

module.exports = router;