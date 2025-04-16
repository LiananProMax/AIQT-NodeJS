const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { Decimal } = require('decimal.js');
const validateSignature = require('../../../middleware/signatureValidator');

const marketClose = require('./market'); // 获取整个路由模块
const {
  getServerTimeWithRetry,
  getPositionInfo,
  formatOrderResponse
} = marketClose; // 从模块属性解构辅助函数

router.post('/conditional', validateSignature(), async (req, res) => {
  try {
    const { symbol, stopPrice, takeProfit, positionSide } = req.body;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 参数验证
    if (!symbol || (!stopPrice && !takeProfit)) {
      return res.status(400).json({
        code: 400,
        msg: 'Missing symbol or price parameters',
        data: null
      });
    }

    // 获取账户信息
    const [position, ticker] = await Promise.all([
      getPositionInfo(symbol, positionSide, apiKey, apiSecret, baseURL),
      axios.get(`${baseURL}/fapi/v1/ticker/price`, { params: { symbol } })
    ]);

    if (!position || new Decimal(position.positionAmt).eq(0)) {
      return res.status(400).json({
        code: -2013,
        msg: 'No active position to close',
        data: { symbol }
      });
    }

    // 计算风险参数
    const currentPrice = new Decimal(ticker.data.price);
    const positionAmt = new Decimal(position.positionAmt);
    const isLong = positionAmt.gt(0);

    // 生成订单参数
    const orders = [];
    if (stopPrice) {
      const stopOrder = buildConditionalOrder({
        symbol,
        positionSide,
        price: stopPrice,
        currentPrice,
        isLong,
        type: 'STOP_MARKET',
        positionAmt: positionAmt.abs()
      });
      orders.push(stopOrder);
    }

    if (takeProfit) {
      const tpOrder = buildConditionalOrder({
        symbol,
        positionSide,
        price: takeProfit,
        currentPrice,
        isLong,
        type: 'TAKE_PROFIT_MARKET',
        positionAmt: positionAmt.abs()
      });
      orders.push(tpOrder);
    }

    // 批量下单
    const timestamp = await getServerTimeWithRetry(baseURL);
    const responses = await Promise.all(
      orders.map(order => submitOrder(order, timestamp, apiKey, apiSecret, baseURL))
    );

    res.json({
      code: 200,
      msg: 'Conditional orders placed',
      data: responses.map(r => formatOrderResponse(r.data))
    });

  } catch (error) {
    handleConditionalError(error, res);
  }
});

// 构建条件订单参数
function buildConditionalOrder({
  symbol,
  positionSide,
  price,
  currentPrice,
  isLong,
  type,
  positionAmt
}) {
  const priceDec = new Decimal(price);
  const validStop = isLong 
    ? priceDec.lessThan(currentPrice)
    : priceDec.greaterThan(currentPrice);

  if (!validStop) {
    throw {
      code: 400,
      message: isLong 
        ? 'Stop loss must be below current price for long positions'
        : 'Stop loss must be above current price for short positions'
    };
  }

  return {
    symbol: symbol.toUpperCase(),
    side: isLong ? 'SELL' : 'BUY',
    type,
    stopPrice: priceDec.toDecimalPlaces(8).toString(),
    quantity: positionAmt.toDecimalPlaces(8).toString(),
    closePosition: 'true',
    ...(positionSide && { positionSide: positionSide.toUpperCase() })
  };
}

// 提交订单
async function submitOrder(orderParams, timestamp, apiKey, apiSecret, baseURL) {
  const params = {
    ...orderParams,
    timestamp,
    recvWindow: 10000
  };

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(new URLSearchParams(params).toString())
    .digest('hex');

  return axios.post(
    `${baseURL}/fapi/v1/order`,
    new URLSearchParams({ ...params, signature }).toString(),
    { headers: { 'X-MBX-APIKEY': apiKey } }
  );
}

// 错误处理
function handleConditionalError(error, res) {
  const binanceError = error.response?.data;
  const status = error.response?.status || 500;
  
  res.status(status).json({
    code: binanceError?.code || status,
    msg: binanceError?.msg || error.message,
    data: binanceError || null
  });
}

module.exports = router;
