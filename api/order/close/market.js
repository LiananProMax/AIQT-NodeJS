const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('querystring');
const validateSignature = require('../../../middleware/signatureValidator');

router.post('/market', validateSignature(), async (req, res) => {
  try {
    const { symbol, positionSide } = req.body;

    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 参数验证
    if (!symbol || !positionSide) {
      return res.status(400).json({
        code: 400,
        msg: 'Missing required parameters: symbol, positionSide',
        data: null
      });
    }

    if (!['LONG', 'SHORT'].includes(positionSide.toUpperCase())) {
      return res.status(400).json({
        code: 400,
        msg: 'Invalid positionSide (valid: LONG/SHORT)',
        data: null
      });
    }

    // 获取服务器时间
    let timestamp;
    try {
      const serverTimeResponse = await axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 });
      timestamp = serverTimeResponse.data.serverTime;
    } catch (timeError) {
      console.error('Failed to get server time:', timeError.message);
      timestamp = Date.now();
    }
    const closeSide = positionSide.toUpperCase() === 'LONG' ? 'SELL' : 'BUY';

    // 构建参数（添加recvWindow）
    const params = {
      symbol: symbol.toUpperCase(),
      side: closeSide,
      type: 'MARKET',
      timestamp,
      reduceOnly: 'true',
      positionSide: positionSide.toUpperCase(),
      recvWindow: 5000 // 添加接收窗口
    };
    // 生成签名（严格模式）
    const queryString = qs.stringify(params, {
      sort: true,
      encode: true,
      strict: true
    });

    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    // 发送到币安API
    const response = await axios.post(
      `${baseURL}/fapi/v1/order`,
      qs.stringify({ ...params, signature }),
      {
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // 格式化响应
    const orderData = response.data;
    res.json({
      code: 200,
      msg: 'Position closed',
      data: {
        orderId: orderData.orderId,
        symbol: orderData.symbol,
        executedQty: parseFloat(orderData.executedQty),
        avgPrice: parseFloat(orderData.avgPrice),
        status: orderData.status,
        closedPosition: parseFloat(orderData.executedQty) > 0
      }
    });

  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.msg || error.message;
    res.status(status).json({
      code: status,
      msg: message,
      data: null
    });
  }
});

module.exports = router;
