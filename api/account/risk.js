const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('querystring');

function generateSignature(queryString) {
  return crypto
    .createHmac('sha256', process.env.API_SECRET)
    .update(queryString)
    .digest('hex');
}

router.get('/risk', async (req, res) => {
  try {
    const { symbol } = req.query;
    const timestamp = Date.now();
    
    // 关键修复：无论是否传symbol，只保留timestamp参数
    const params = { timestamp };
    const queryString = qs.stringify(params, { encode: true, sort: true });
    const signature = generateSignature(queryString);

    const response = await axios.get('https://fapi.binance.com/fapi/v2/account', {
      headers: {
        'X-MBX-APIKEY': process.env.API_KEY
      },
      params: {
        ...params,
        signature
      }
    });

    // 本地过滤持仓
    const accountData = response.data;
    const positions = symbol 
      ? accountData.positions.filter(p => p.symbol === symbol.toUpperCase())
      : accountData.positions;

    const result = positions
      .filter(p => Math.abs(parseFloat(p.positionAmt)) > 0)
      .map(position => {
        const positionAmt = parseFloat(position.positionAmt);
        const entryPrice = parseFloat(position.entryPrice) || 0;
        const markPrice = parseFloat(position.markPrice) || 0;
        const leverage = parseFloat(position.leverage) || 1;
        const isolatedWallet = parseFloat(position.isolatedWallet) || 0;

        // 格式化函数
        const format = (num, decimals) => 
          num !== null ? Number(num.toFixed(decimals)) : null;

        // 强平价计算
        let liquidationPrice = null;
        if (positionAmt !== 0) {
          const rate = positionAmt > 0 ? (1 - 1/leverage + 0.004) : (1 + 1/leverage - 0.004);
          liquidationPrice = entryPrice * rate;
        }

        return {
          symbol: position.symbol,
          marginMode: position.isolated ? 'ISOLATED' : 'CROSS',
          leverage,
          entryPrice: format(entryPrice, 2),
          markPrice: format(markPrice, 2),
          liquidationPrice: format(liquidationPrice, 2),
          positionAmt: format(Math.abs(positionAmt), 4),
          side: positionAmt > 0 ? 'LONG' : 'SHORT',
          unrealizedProfit: format(
            positionAmt * (markPrice - entryPrice),
            4
          ),
          marginRatio: format(
            isolatedWallet > 0 
              ? (positionAmt * (markPrice - entryPrice)) / isolatedWallet
              : parseFloat(accountData.totalMarginBalance) > 0
                ? (positionAmt * (markPrice - entryPrice)) / parseFloat(accountData.totalMarginBalance)
                : 0,
            4
          )
        };
      });

    // 处理空结果
    res.json({
      code: 200,
      msg: 'Success',
      data: symbol ? (result[0] || null) : result
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
