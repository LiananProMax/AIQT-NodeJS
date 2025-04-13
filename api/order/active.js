// api/order/active.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const validateSignature = require('../../middleware/signatureValidator');

router.get('/', validateSignature(), async (req, res) => {
  try {
    const { symbol } = req.query;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 参数验证
    if (!symbol) {
      return res.status(400).json({
        code: 400,
        msg: 'Symbol parameter is required',
        data: null
      });
    }

    // 获取时间戳
    const timeRes = await axios.get(`${baseURL}/fapi/v1/time`);
    const timestamp = Number(timeRes.data.serverTime);

    // 构建参数
    const params = {
      symbol: symbol.toUpperCase(),
      timestamp
    };

    // 生成签名
    const orderedParams = new URLSearchParams(
      Object.entries(params).sort()
    ).toString();
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(orderedParams)
      .digest('hex');

    // 发送请求
    const response = await axios.get(`${baseURL}/fapi/v1/openOrders`, {
      headers: { 'X-MBX-APIKEY': apiKey },
      params: { ...params, signature }
    });

    // 格式化响应
    const orders = response.data.map(order => ({
      orderId: order.orderId,
      symbol: order.symbol,
      price: parseFloat(order.price),
      origQty: parseFloat(order.origQty),
      executedQty: parseFloat(order.executedQty),
      status: order.status,
      type: order.type,
      side: order.side,
      time: order.time
    }));

    res.json({
      code: 200,
      msg: 'Success',
      data: orders
    });

  } catch (error) {
    const binanceError = error.response?.data;
    res.status(error.response?.status || 500).json({
      code: binanceError?.code || 500,
      msg: binanceError?.msg || error.message,
      data: null
    });
  }
});

module.exports = router;
