const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('querystring');
const { Decimal } = require('decimal.js');
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });
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
      .filter(p => new Decimal(p.positionAmt).abs().gt(0))
      .map(position => {
        // 使用 Decimal 包装所有数值
        const positionAmt = new Decimal(position.positionAmt || 0);
        const entryPrice = new Decimal(position.entryPrice || 0);
        const markPrice = new Decimal(position.markPrice || 0);
        const leverage = new Decimal(position.leverage || 1);
        const isolatedWallet = new Decimal(position.isolatedWallet || 0);
        const totalMarginBalance = new Decimal(accountData.totalMarginBalance || 0);
        // 格式化函数适配 Decimal
        const format = (num, decimals) =>
          num !== null ? new Decimal(num).toDecimalPlaces(decimals).toNumber() : null;
        // 重新计算关键指标
        const unrealizedProfit = positionAmt.mul(markPrice.minus(entryPrice));
        const marginRatio = isolatedWallet.gt(0)
          ? unrealizedProfit.div(isolatedWallet)
          : totalMarginBalance.gt(0)
            ? unrealizedProfit.div(totalMarginBalance)
            : new Decimal(0);
        // 强平价计算（使用 Decimal 运算）
        let liquidationPrice = null;
        if (!positionAmt.isZero()) {
          const rate = positionAmt.gt(0)
            ? new Decimal(1).sub(new Decimal(1).div(leverage)).add(0.004)
            : new Decimal(1).add(new Decimal(1).div(leverage)).sub(0.004);
          liquidationPrice = entryPrice.mul(rate);
        }
        return {
          symbol: position.symbol,
          marginMode: position.isolated ? 'ISOLATED' : 'CROSS',
          leverage: leverage.toNumber(),
          entryPrice: format(entryPrice, 2),
          markPrice: format(markPrice, 2),
          liquidationPrice: format(liquidationPrice, 2),
          positionAmt: format(positionAmt.abs(), 4),
          side: positionAmt.gt(0) ? 'LONG' : 'SHORT',
          unrealizedProfit: format(unrealizedProfit, 4),
          marginRatio: format(marginRatio, 4)
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
