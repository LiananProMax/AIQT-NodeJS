const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/klines', async (req, res) => {
  try {
    const { symbol, interval = '1m', limit = 500 } = req.query;

    if (!symbol) {
      return res.status(400).json({
        code: 400,
        msg: 'Symbol parameter is required',
        data: null
      });
    }

    const response = await axios.get('https://fapi.binance.com/fapi/v1/klines', {
      params: {
        symbol: symbol.toUpperCase(),
        interval,
        limit: Math.min(limit, 1000)
      }
    });

    const klines = response.data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
      quoteVolume: parseFloat(k[7])
    }));

    res.json({
      code: 200,
      msg: 'Success',
      data: {
        symbol,
        interval,
        klines
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
