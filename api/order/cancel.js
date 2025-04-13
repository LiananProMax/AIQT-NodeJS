// api/order/cancel.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const validateSignature = require('../../middleware/signatureValidator');

router.delete('/:orderId', validateSignature(), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { symbol } = req.query;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 参数验证
    if (!symbol || !orderId) {
      return res.status(400).json({
        code: 400,
        msg: 'Both symbol and orderId are required',
        data: null
      });
    }

    // 获取时间戳（与币安服务器同步）
    const timeRes = await axios.get(`${baseURL}/fapi/v1/time`);
    const timestamp = Number(timeRes.data.serverTime);

    // 构建签名参数（按字母顺序）
    const params = {
      symbol: symbol.toUpperCase(),
      orderId: parseInt(orderId),  // 强制转换为数字
      timestamp
    };

    // 生成规范化的查询字符串
    const orderedParams = new URLSearchParams(
      Object.entries(params)
        .sort((a, b) => a[0].localeCompare(b[0])) // 严格字母排序
        .map(([k, v]) => [k, v.toString()])      // 确保字符串类型
    ).toString();

    // 生成签名
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(orderedParams)
      .digest('hex');

    // 调试输出（生产环境应移除）
    console.log('Signature Base:', orderedParams);
    console.log('Generated Signature:', signature);

    // 构建最终请求URL
    const requestURL = `${baseURL}/fapi/v1/order?${orderedParams}&signature=${signature}`;

    // 发送请求（使用手动构建的URL）
    const response = await axios.delete(requestURL, {
      headers: { 'X-MBX-APIKEY': apiKey }
    });

    res.json({
      code: 200,
      msg: 'Order canceled',
      data: {
        orderId: response.data.orderId,
        status: response.data.status
      }
    });

  } catch (error) {
    // 增强错误处理
    const binanceError = error.response?.data;
    const errorMessage = binanceError?.msg || error.message;
    
    // 处理特定错误码
    if (binanceError?.code === -2011) {
      return res.status(404).json({
        code: 404,
        msg: 'Order does not exist',
        data: null
      });
    }

    res.status(error.response?.status || 500).json({
      code: binanceError?.code || 500,
      msg: errorMessage,
      data: binanceError || null
    });
  }
});

module.exports = router;
