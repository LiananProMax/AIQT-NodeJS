// api/order/open/market.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { Decimal } = require('decimal.js');
const validateSignature = require('../../../middleware/signatureValidator');

// 简化版：只计算目标价格
function calculateTargetPrice(input, basePrice) {
  const priceStr = input.toString().trim();
  const isPercentage = priceStr.endsWith('%');
  // 移除 '+' 或 '-' (如果存在) 来获取数值部分，保留原始符号用于判断方向
  const sign = priceStr.startsWith('-') ? -1 : (priceStr.startsWith('+') ? 1 : 1); // 默认为正
  const valueStr = priceStr.replace(/[%+-]/g, ''); // 移除所有 %, +, -
  let offsetValue = new Decimal(valueStr);

  if (isPercentage) {
    // 百分比是相对于基准价的偏移
    const offsetAmount = basePrice.mul(offsetValue.div(100));
    return basePrice.add(offsetAmount.mul(sign)); // 应用符号
  } else {
    // 绝对值偏移
    return basePrice.add(offsetValue.mul(sign)); // 应用符号
  }
}

// 生成批量订单唯一ID - 无需修改
function generateOrderIdRoot() {
  return `x-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

router.post('/market', validateSignature(), async (req, res) => {
  let debugLog = [];
  try {
    const startTime = Date.now();
    const { symbol, side, quantity, stopLoss, takeProfit } = req.body;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');
    // 1. 参数验证
    const requiredParams = { symbol, side, quantity, stopLoss, takeProfit };
    const missingParams = Object.entries(requiredParams)
      .filter(([k, v]) => !v)
      .map(([k]) => k);

    if (missingParams.length > 0) {
      return res.status(400).json({
        code: 400,
        msg: '缺少必要参数',
        data: { missing: missingParams }
      });
    }

    // 2. 获取最新标记价格
    debugLog.push('Fetching mark price...');
    const premiumIndexRes = await axios.get(`${baseURL}/fapi/v1/premiumIndex`, {
      params: { symbol: symbol.toUpperCase() }
    });
    if (!premiumIndexRes.data || !premiumIndexRes.data.markPrice) {
      throw new Error(`Failed to fetch valid mark price for ${symbol} from premiumIndex.`);
    }
    const currentMarkPrice = new Decimal(premiumIndexRes.data.markPrice);
    debugLog.push(`Mark Price fetched successfully: ${currentMarkPrice}`);

    // 3. 计算目标价格
    // 假设 stopLoss 输入总是负向偏移 (e.g., '-5%', -100)
    // 假设 takeProfit 输入总是正向偏移 (e.g., '+3%', +50)
    const stopLossTargetPrice = calculateTargetPrice(stopLoss, currentMarkPrice);
    const takeProfitTargetPrice = calculateTargetPrice(takeProfit, currentMarkPrice);
    debugLog.push(`Target prices calculated - StopLossTarget: ${stopLossTargetPrice}, TakeProfitTarget: ${takeProfitTargetPrice}`);

    // 4. 确定最终的触发价格，并防止立即触发
    let finalStopLossTriggerPrice;
    let finalTakeProfitTriggerPrice;
    const pricePrecision = 2; // 根据交易对调整精度，例如 BTCUSDT 是 2
    const minPriceIncrement = new Decimal('0.01'); // 最小价格变动单位

    if (side.toUpperCase() === 'BUY') { // 开多，平仓是 SELL
      // 止损单 (SELL): 触发价需低于当前 Mark Price
      finalStopLossTriggerPrice = stopLossTargetPrice;
      if (finalStopLossTriggerPrice.gte(currentMarkPrice)) {
        console.warn(`Stop Loss target price ${finalStopLossTriggerPrice} >= current Mark Price ${currentMarkPrice}. Adjusting down.`);
        finalStopLossTriggerPrice = currentMarkPrice.sub(minPriceIncrement); // 调整到刚好低于当前价
      }

      // 止盈单 (SELL): 触发价需高于当前 Mark Price
      finalTakeProfitTriggerPrice = takeProfitTargetPrice;
      if (finalTakeProfitTriggerPrice.lte(currentMarkPrice)) {
        console.warn(`Take Profit target price ${finalTakeProfitTriggerPrice} <= current Mark Price ${currentMarkPrice}. Adjusting up.`);
        finalTakeProfitTriggerPrice = currentMarkPrice.add(minPriceIncrement); // 调整到刚好高于当前价
      }
    } else { // 开空，平仓是 BUY
      // 止损单 (BUY): 触发价需高于当前 Mark Price
      finalStopLossTriggerPrice = stopLossTargetPrice;
      if (finalStopLossTriggerPrice.lte(currentMarkPrice)) {
        console.warn(`Stop Loss target price ${finalStopLossTriggerPrice} <= current Mark Price ${currentMarkPrice}. Adjusting up.`);
        finalStopLossTriggerPrice = currentMarkPrice.add(minPriceIncrement);
      }

      // 止盈单 (BUY): 触发价需低于当前 Mark Price
      finalTakeProfitTriggerPrice = takeProfitTargetPrice;
      if (finalTakeProfitTriggerPrice.gte(currentMarkPrice)) {
        console.warn(`Take Profit target price ${finalTakeProfitTriggerPrice} >= current Mark Price ${currentMarkPrice}. Adjusting down.`);
        finalTakeProfitTriggerPrice = currentMarkPrice.sub(minPriceIncrement);
      }
    }

    // 应用精度
    finalStopLossTriggerPrice = finalStopLossTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_DOWN); // 止损往不利方向取整
    finalTakeProfitTriggerPrice = finalTakeProfitTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_UP); // 止盈往不利方向取整 (对多头是向上，对空头是向下，但此处逻辑简化为向上）
    // 更精确的取整：
    if (side.toUpperCase() === 'BUY') {
      finalStopLossTriggerPrice = finalStopLossTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_DOWN); // Sell SL 向下取
      finalTakeProfitTriggerPrice = finalTakeProfitTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_UP);   // Sell TP 向上取
    } else {
      finalStopLossTriggerPrice = finalStopLossTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_UP);     // Buy SL 向上取
      finalTakeProfitTriggerPrice = finalTakeProfitTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_DOWN);  // Buy TP 向下取
    }


    debugLog.push(`Final trigger prices (adjusted & rounded) - StopLoss: ${finalStopLossTriggerPrice}, TakeProfit: ${finalTakeProfitTriggerPrice}`);

    // 5. 生成订单ID前缀
    const orderIdRoot = generateOrderIdRoot();

    // 6. 构建批量订单
    const batchOrders = [
      // 市价开仓单
      {
        symbol: symbol.toUpperCase(),
        side: side.toUpperCase(),
        type: 'MARKET',
        quantity: new Decimal(quantity).toDecimalPlaces(8).toString(),
        newClientOrderId: `${orderIdRoot}-M`,
      },
      // 止损市价平仓单 - 移除 reduceOnly
      {
        symbol: symbol.toUpperCase(),
        side: side.toUpperCase() === 'BUY' ? 'SELL' : 'BUY',
        type: 'STOP_MARKET',
        stopPrice: finalStopLossTriggerPrice.toFixed(pricePrecision),
        newClientOrderId: `${orderIdRoot}-SL`,
        closePosition: 'true', // 依赖这个参数
        workingType: 'MARK_PRICE',
        // reduceOnly: "true" // <-- 删除此行
      },
      // 止盈市价平仓单 - 移除 reduceOnly
      {
        symbol: symbol.toUpperCase(),
        side: side.toUpperCase() === 'BUY' ? 'SELL' : 'BUY',
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: finalTakeProfitTriggerPrice.toFixed(pricePrecision),
        newClientOrderId: `${orderIdRoot}-TP`,
        closePosition: 'true', // 依赖这个参数
        workingType: 'MARK_PRICE',
        // reduceOnly: "true" // <-- 删除此行
      }
    ];

    // 7. 获取服务器时间（关键！）
    const timeRes = await axios.get(`${baseURL}/fapi/v1/time`);
    const timestamp = timeRes.data.serverTime;
    debugLog.push(`服务器时间同步成功: ${timestamp}`);

    // 8. 准备签名参数（严格编码）
    const batchOrdersStr = JSON.stringify(batchOrders, (key, value) => {
      // 统一转换数值为字符串
      if (typeof value === 'number') return value.toString();
      return value;
    }).replace(/\s+/g, '');

    const signatureParams = {
      batchOrders: batchOrdersStr,
      timestamp,
      recvWindow: 10000
    };

    // 9. 生成规范查询字符串（字母顺序）
    const orderedQuery = Object.keys(signatureParams)
      .sort()
      .map(key => {
        const encodedKey = encodeURIComponent(key);
        // 所有值都进行严格URI编码
        const encodedValue = encodeURIComponent(signatureParams[key]);
        return `${encodedKey}=${encodedValue}`;
      })
      .join('&');

    // 调试输出
    console.log('最终签名参数:', orderedQuery);

    // 10. 生成签名（关键步骤）
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(orderedQuery)
      .digest('hex');
    debugLog.push(`生成签名: ${signature}`);

    // 11. 构建最终请求体字符串 (手动拼接签名)
    const requestBody = `${orderedQuery}&signature=${signature}`;
    console.log('发送的请求体:', requestBody); // 添加日志方便调试

    // 12. 发送批量订单 (使用手动构建的 requestBody)
    const response = await axios.post(
      `${baseURL}/fapi/v1/batchOrders`, // URL 不再包含参数
      requestBody,                     // 直接发送构建好的字符串
      {
        headers: {
          'X-MBX-APIKEY': apiKey,
          // Content-Type 必须是 'application/x-www-form-urlencoded'
          // axios 默认会根据 requestBody 类型自动设置，但明确指定更保险
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 8000 // 稍微增加超时时间
      }
    );

    // 13. 格式化响应
    const result = {
      // 检查 o 和 o.clientOrderId 都存在，然后再调用 includes
      market: response.data.find(o => o && o.clientOrderId && o.clientOrderId.includes('-M')),
      stopLoss: response.data.find(o => o && o.clientOrderId && o.clientOrderId.includes('-SL')),
      takeProfit: response.data.find(o => o && o.clientOrderId && o.clientOrderId.includes('-TP'))
    };

    // 可选：找出并记录失败的订单
    const errorsInBatch = response.data.filter(o => o && o.code && o.msg);
    if (errorsInBatch.length > 0) {
      console.warn('批处理订单中包含错误:', JSON.stringify(errorsInBatch, null, 2));
      // 你可以在最终响应中包含这些错误信息
    }

    debugLog.push(`请求完成，耗时: ${Date.now() - startTime}ms`);

    // 14. 最终响应
    return res.json({
      code: 200, // 即使部分失败，HTTP 状态码通常也是 200
      msg: errorsInBatch.length > 0 ? '部分订单提交失败' : '订单提交成功',
      data: result, // result 中失败的订单对应的值会是 undefined
      errors: errorsInBatch.length > 0 ? errorsInBatch : undefined, // 可选地返回具体错误
      debug: process.env.NODE_ENV === 'development' ? debugLog : undefined
    });

  } catch (error) {
    // 增强错误处理
    const binanceError = error.response?.data || (error.isAxiosError ? null : error);
    const errorInfo = {
      code: binanceError?.code || (error.response?.status || 500),
      msg: binanceError?.msg || error.message,
      details: binanceError
    };
    console.error('订单错误:', {
      params: req.body,
      error: errorInfo,
      axiosError: error.isAxiosError ? { config: error.config, request: error.request, response: error.response } : undefined,
      debugLog
    });
    const statusCode = (typeof errorInfo.code === 'number' && errorInfo.code >= 400 && errorInfo.code < 600) ? errorInfo.code : (error.response?.status || 500);
    return res.status(statusCode).json({
      ...errorInfo,
      debug: process.env.NODE_ENV === 'development' ? debugLog : undefined
    });
  }
});

module.exports = router;