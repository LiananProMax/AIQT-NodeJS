const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('querystring');

router.get('/balance', async (req, res) => {
  try {
    const { currency } = req.query;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    if (!currency) {
      return res.status(400).json({
        code: 400,
        msg: 'Currency parameter is required',
        data: null
      });
    }

    const timestamp = Date.now();
    const params = { timestamp };
    const queryString = qs.stringify(params, { sort: true, encode: true });
    
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    const response = await axios.get(`${baseURL}/fapi/v2/account`, {
      headers: { 'X-MBX-APIKEY': apiKey },
      params: { ...params, signature }
    });

    const asset = response.data.assets.find(a => a.asset === currency.toUpperCase());

    res.json({
      code: 200,
      msg: 'Success',
      data: {
        currency,
        balance: asset ? parseFloat(asset.walletBalance) : 0,
        available: asset ? parseFloat(asset.availableBalance) : 0
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
