const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

// 生成请求签名
function generateSignature(queryString) {
  return crypto
    .createHmac('sha256', process.env.API_SECRET)
    .update(queryString)
    .digest('hex');
}

router.get('/balance', async (req, res) => {
  try {
    const { currency } = req.query;
    
    if (!currency) {
      return res.status(400).json({
        code: 400,
        msg: 'Currency parameter is required',
        data: null
      });
    }

    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = generateSignature(query);

    const response = await axios.get('https://fapi.binance.com/fapi/v2/account', {
      headers: {
        'X-MBX-APIKEY': process.env.API_KEY
      },
      params: {
        timestamp,
        signature
      }
    });

    const asset = response.data.assets.find(a => a.asset === currency);
    if (!asset) {
      return res.json({
        code: 200,
        msg: 'Success',
        data: {
          currency,
          balance: 0,
          available: 0
        }
      });
    }

    res.json({
      code: 200,
      msg: 'Success',
      data: {
        currency,
        balance: parseFloat(asset.walletBalance),
        available: parseFloat(asset.availableBalance)
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
