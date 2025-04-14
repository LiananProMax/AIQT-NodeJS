const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('querystring');
const validateSignature = require('../../middleware/signatureValidator');

router.get('/risk', validateSignature(), async (req, res) => {
  try {
    // 获取查询参数
    const { symbol, positionSide } = req.query;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 检查账户是否为对冲模式
    const isHedgeMode = await checkPositionMode(apiKey, apiSecret, baseURL);

    const timestamp = Date.now();
    const params = { timestamp };
    const queryString = qs.stringify(params, {
      sort: true,
      encode: true,
      strict: true // 严格模式确保空值不参与签名
    })

    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    const response = await axios.get(`${baseURL}/fapi/v2/account`, {
      headers: { 'X-MBX-APIKEY': apiKey },
      params: { ...params, signature }
    });

    // 本地过滤持仓
    const accountData = response.data;
    const positions = symbol
      ? accountData.positions.filter(p =>
        p.symbol === symbol.toUpperCase() &&
        (isHedgeMode ? p.positionSide === positionSide?.toUpperCase() : true)
      )
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
          const rate = positionAmt > 0 ? (1 - 1 / leverage + 0.004) : (1 + 1 / leverage - 0.004);
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
// 在文件底部添加检查持仓模式的函数
async function checkPositionMode(apiKey, apiSecret, baseURL) {
  const timestamp = Date.now();
  const params = { timestamp };
  const queryString = qs.stringify(params, { sort: true, encode: true });
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');

  const response = await axios.get(`${baseURL}/fapi/v1/positionSide/dual`, {
    headers: { 'X-MBX-APIKEY': apiKey },
    params: { ...params, signature }
  });

  return response.data.dualSidePosition;
}
module.exports = router;
