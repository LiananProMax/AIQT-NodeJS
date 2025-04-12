const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/funding-rate', async (req, res) => {
  try {
    const { symbol, limit = 1 } = req.query;

    if (!symbol) {
      return res.status(400).json({
        code: 400,
        msg: 'Symbol parameter is required',
        data: null
      });
    }

    // 获取当前资金费率
    const currentRateResponse = await axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', {
      params: {
        symbol: symbol.toUpperCase()
      }
    });

    // 获取历史资金费率
    const historyResponse = await axios.get('https://fapi.binance.com/fapi/v1/fundingRate', {
      params: {
        symbol: symbol.toUpperCase(),
        limit: Math.min(limit, 1000)
      }
    });

    const result = {
      symbol: symbol.toUpperCase(),
      currentRate: {
        rate: parseFloat(currentRateResponse.data.lastFundingRate),
        time: currentRateResponse.data.time,
        nextFundingTime: currentRateResponse.data.nextFundingTime
      },
      historyRates: historyResponse.data.map(item => ({
        rate: parseFloat(item.fundingRate),
        time: item.fundingTime,
        realized: parseFloat(item.fundingRate) * 0.0001 // 费率转换为实际百分比影响
      }))
    };

    res.json({
      code: 200,
      msg: 'Success',
      data: limit === 1 ? { ...result, historyRates: undefined } : result
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
