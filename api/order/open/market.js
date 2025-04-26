// api/order/open/market.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { Decimal } = require('decimal.js');
const qs = require('qs');
const validateSignature = require('../../../middleware/signatureValidator');

// --- 移除 calculateTargetPrice 函数，因为它不适用于绝对价格输入 ---
// function calculateTargetPrice(input, basePrice, side) { ... }

// 生成批量订单唯一ID - 无需修改
function generateOrderIdRoot() {
    return `x-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

router.post('/market', validateSignature(), async (req, res) => {
    let debugLog = [];
    try {
        const startTime = Date.now();
        const { symbol, side, quantity, stopLoss, takeProfit } = req.body; // 直接获取传入的绝对价格字符串
        const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

        // 1. 参数验证 (保持不变)
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

        // --- 新增：验证传入的 stopLoss 和 takeProfit 是否是有效数字 ---
        try {
            new Decimal(stopLoss);
            new Decimal(takeProfit);
        } catch (e) {
             return res.status(400).json({
                code: 400,
                msg: '无效的 stopLoss 或 takeProfit 价格格式',
                data: { stopLoss, takeProfit }
            });
        }
        // --- 结束验证 ---


        // 2. 获取最新标记价格 (保持不变)
        debugLog.push('Fetching mark price...');
        const premiumIndexRes = await axios.get(`${baseURL}/fapi/v1/premiumIndex`, {
            params: { symbol: symbol.toUpperCase() }
        });
        if (!premiumIndexRes.data || !premiumIndexRes.data.markPrice) {
            throw new Error(`Failed to fetch valid mark price for ${symbol} from premiumIndex.`);
        }
        const currentMarkPrice = new Decimal(premiumIndexRes.data.markPrice);
        debugLog.push(`Mark Price fetched successfully: ${currentMarkPrice}`);

        // 3. --- 修改：直接使用传入的 stopLoss 和 takeProfit 作为目标价格 ---
        const inputStopLossPrice = new Decimal(stopLoss);
        const inputTakeProfitPrice = new Decimal(takeProfit);
        debugLog.push(`Input prices received - StopLoss: ${inputStopLossPrice}, TakeProfit: ${inputTakeProfitPrice}`);

        // 4. 确定最终的触发价格，并防止立即触发 (应用在原始输入价格上)
        let finalStopLossTriggerPrice;
        let finalTakeProfitTriggerPrice;
        // --- 获取价格精度和最小变动单位 (重要！需要根据币安API获取或硬编码) ---
        // 这里暂时硬编码 SOLUSDT 的精度为 2，最小变动 0.01，你需要根据实际情况调整
        const pricePrecision = 2; //  <--- !! 重要：根据交易对调整 !!
        const minPriceIncrement = new Decimal('0.01'); // <-- !! 重要：根据交易对调整 !!
        // --- 结束获取精度 ---

        if (side.toUpperCase() === 'BUY') { // 开多，平仓是 SELL
            // 止损单 (SELL): 触发价需低于当前 Mark Price
            finalStopLossTriggerPrice = inputStopLossPrice; // 直接使用输入
            if (finalStopLossTriggerPrice.gte(currentMarkPrice)) {
                console.warn(`[调整] 多头止损目标价 ${finalStopLossTriggerPrice} >= 标记价 ${currentMarkPrice}。向下调整。`);
                finalStopLossTriggerPrice = currentMarkPrice.sub(minPriceIncrement); // 调整到刚好低于当前价
            }

            // 止盈单 (SELL): 触发价需高于当前 Mark Price
            finalTakeProfitTriggerPrice = inputTakeProfitPrice; // 直接使用输入
            if (finalTakeProfitTriggerPrice.lte(currentMarkPrice)) {
                console.warn(`[调整] 多头止盈目标价 ${finalTakeProfitTriggerPrice} <= 标记价 ${currentMarkPrice}。向上调整。`);
                finalTakeProfitTriggerPrice = currentMarkPrice.add(minPriceIncrement); // 调整到刚好高于当前价
            }
        } else { // 开空，平仓是 BUY
            // 止损单 (BUY): 触发价需高于当前 Mark Price
            finalStopLossTriggerPrice = inputStopLossPrice; // 直接使用输入
            if (finalStopLossTriggerPrice.lte(currentMarkPrice)) {
                console.warn(`[调整] 空头止损目标价 ${finalStopLossTriggerPrice} <= 标记价 ${currentMarkPrice}。向上调整。`);
                finalStopLossTriggerPrice = currentMarkPrice.add(minPriceIncrement);
            }

            // 止盈单 (BUY): 触发价需低于当前 Mark Price
            finalTakeProfitTriggerPrice = inputTakeProfitPrice; // 直接使用输入
            if (finalTakeProfitTriggerPrice.gte(currentMarkPrice)) {
                console.warn(`[调整] 空头止盈目标价 ${finalTakeProfitTriggerPrice} >= 标记价 ${currentMarkPrice}。向下调整。`);
                finalTakeProfitTriggerPrice = currentMarkPrice.sub(minPriceIncrement);
            }
        }

        // 5. 应用精度 (根据币安规则进行正确的舍入)
        if (side.toUpperCase() === 'BUY') { // 开多, 平仓 SELL
            // 止损(卖): 触发价低于当前价, 向下舍入 (不利于成交)
            finalStopLossTriggerPrice = finalStopLossTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_DOWN);
            // 止盈(卖): 触发价高于当前价, 向上舍入 (不利于成交)
            finalTakeProfitTriggerPrice = finalTakeProfitTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_UP);
        } else { // 开空, 平仓 BUY
            // 止损(买): 触发价高于当前价, 向上舍入 (不利于成交)
            finalStopLossTriggerPrice = finalStopLossTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_UP);
            // 止盈(买): 触发价低于当前价, 向下舍入 (不利于成交)
            finalTakeProfitTriggerPrice = finalTakeProfitTriggerPrice.toDecimalPlaces(pricePrecision, Decimal.ROUND_DOWN);
        }


        debugLog.push(`Final trigger prices (adjusted & rounded) - StopLoss: ${finalStopLossTriggerPrice}, TakeProfit: ${finalTakeProfitTriggerPrice}`);

        // 6. 生成订单ID前缀 (保持不变)
        const orderIdRoot = generateOrderIdRoot();

        // --- 获取数量精度 (重要！需要根据币安API获取或硬编码) ---
        // 这里暂时硬编码 SOLUSDT 的数量精度为 0 (整数)，你需要根据实际情况调整
        const quantityPrecision = 0; // <-- !! 重要：根据交易对调整 !!
        // --- 结束获取精度 ---

        // 7. 构建批量订单 (使用调整后的最终价格, 并应用数量精度)
        const batchOrders = [
            // 市价开仓单
            {
                symbol: symbol.toUpperCase(),
                side: side.toUpperCase(),
                type: 'MARKET',
                quantity: new Decimal(quantity).toDecimalPlaces(quantityPrecision, Decimal.ROUND_DOWN).toString(), // 应用数量精度
                newClientOrderId: `${orderIdRoot}-M`,
            },
            // 止损市价平仓单 - 确保使用 closePosition: true
            {
                symbol: symbol.toUpperCase(),
                side: side.toUpperCase() === 'BUY' ? 'SELL' : 'BUY', // 平仓方向相反
                type: 'STOP_MARKET',
                stopPrice: finalStopLossTriggerPrice.toFixed(pricePrecision), // 使用最终调整和舍入后的价格
                newClientOrderId: `${orderIdRoot}-SL`,
                closePosition: 'true', // 确保平仓
                workingType: 'MARK_PRICE',
            },
            // 止盈市价平仓单 - 确保使用 closePosition: true
            {
                symbol: symbol.toUpperCase(),
                side: side.toUpperCase() === 'BUY' ? 'SELL' : 'BUY', // 平仓方向相反
                type: 'TAKE_PROFIT_MARKET',
                stopPrice: finalTakeProfitTriggerPrice.toFixed(pricePrecision), // 使用最终调整和舍入后的价格
                newClientOrderId: `${orderIdRoot}-TP`,
                closePosition: 'true', // 确保平仓
                workingType: 'MARK_PRICE',
            }
        ];

        // 8. 获取服务器时间 (保持不变)
        const timeRes = await axios.get(`${baseURL}/fapi/v1/time`);
        const timestamp = timeRes.data.serverTime;
        debugLog.push(`服务器时间同步成功: ${timestamp}`);

        // 9. 准备签名参数（严格编码, 保持不变）
        const batchOrdersStr = JSON.stringify(batchOrders, (key, value) => {
            if (typeof value === 'number') return value.toString();
            return value;
        }).replace(/\s+/g, '');

        const signatureParams = {
            batchOrders: batchOrdersStr,
            timestamp,
            recvWindow: 10000
        };

        // 10. 生成规范查询字符串（字母顺序, 保持不变）
        const orderedQuery = Object.keys(signatureParams)
            .sort()
            .map(key => {
                const encodedKey = encodeURIComponent(key);
                const encodedValue = encodeURIComponent(signatureParams[key]);
                return `${encodedKey}=${encodedValue}`;
            })
            .join('&');

        console.log('最终签名参数:', orderedQuery);

        // 11. 生成签名（关键步骤, 保持不变）
        const signature = crypto
            .createHmac('sha256', apiSecret)
            .update(orderedQuery)
            .digest('hex');
        debugLog.push(`生成签名: ${signature}`);

        // 12. 构建最终请求体字符串 (手动拼接签名, 保持不变)
        const requestBody = `${orderedQuery}&signature=${signature}`;
        console.log('发送的请求体:', requestBody);

        // 13. 发送批量订单 (保持不变)
        const response = await axios.post(
            `${baseURL}/fapi/v1/batchOrders`,
            requestBody,
            {
                headers: {
                    'X-MBX-APIKEY': apiKey,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 8000
            }
        );

        // 14. 格式化响应并存储SL/TP订单ID (逻辑微调以更清晰)
        let marketOrderInfo = null;
        let slOrderInfo = null;
        let tpOrderInfo = null;
        const errorsInBatch = []; // 存储批量订单中的错误

        response.data.forEach(o => {
            if (o) {
                if (o.code && o.code !== 200 && o.msg) { // 检查币安返回的错误结构
                     errorsInBatch.push(o);
                } else if (o.clientOrderId) { // 仅处理成功的订单
                     if (o.clientOrderId.endsWith('-M')) marketOrderInfo = o;
                     else if (o.clientOrderId.endsWith('-SL')) slOrderInfo = o;
                     else if (o.clientOrderId.endsWith('-TP')) tpOrderInfo = o;
                }
             }
        });

        const result = {
             market: marketOrderInfo,
             stopLoss: slOrderInfo,
             takeProfit: tpOrderInfo
         };

        // 15. 存储成功的SL/TP订单以进行跟踪 (只有在SL和TP订单都成功时才跟踪)
        if (errorsInBatch.length === 0 && slOrderInfo && tpOrderInfo) { // 确保 SL 和 TP 订单信息都存在
             const trackedSLTPOrders = req.app.locals.trackedSLTPOrders;
             let isHedgeMode = false;
             try {
                 // (保持获取对冲模式的逻辑不变)
                 const posModeTimestamp = Date.now();
                 const posModeParams = { timestamp: posModeTimestamp };
                 const posModeQuery = qs.stringify(posModeParams);
                 const posModeSig = crypto.createHmac('sha256', apiSecret).update(posModeQuery).digest('hex');
                 const modeRes = await axios.get(`${baseURL}/fapi/v1/positionSide/dual`, {
                     headers: { 'X-MBX-APIKEY': apiKey },
                     params: { ...posModeParams, signature: posModeSig }
                 });
                 isHedgeMode = modeRes.data.dualSidePosition;
             } catch (modeError) {
                 console.error("[跟踪] 检查仓位模式时出错:", modeError.message);
             }

             // (保持生成 positionKey 和存储跟踪信息的逻辑不变)
              let actualPositionSide = side.toUpperCase() === 'BUY' ? 'LONG' : 'SHORT';
              let positionKey;
              const orderPositionSide = marketOrderInfo?.positionSide;

              if (isHedgeMode) {
                  if (orderPositionSide && orderPositionSide !== 'BOTH') {
                      positionKey = `${symbol.toUpperCase()}_${orderPositionSide}`;
                  } else {
                      console.warn(`[跟踪] 对冲模式下 ${symbol} 的仓位 Side 不明确或为 'BOTH'。使用请求推断的 Side (${actualPositionSide})。`);
                      positionKey = `${symbol.toUpperCase()}_${actualPositionSide}`;
                  }
              } else {
                  positionKey = `${symbol.toUpperCase()}_${actualPositionSide}`;
              }
              const trackInfo = {
                  slOrderId: slOrderInfo.orderId,
                  tpOrderId: tpOrderInfo.orderId,
                  symbol: symbol.toUpperCase()
              };
              trackedSLTPOrders.set(positionKey, trackInfo);
              console.log(`[跟踪] 添加${positionKey}的SL/TP：`, trackInfo);
              debugLog.push(`跟踪${positionKey}的SL（${slOrderInfo.orderId}）/TP（${tpOrderInfo.orderId}）`);

        } else {
             console.warn('[跟踪] 由于SL/TP订单未全部成功下单，不进行跟踪。批量错误:', JSON.stringify(errorsInBatch, null, 2));
             debugLog.push('由于SL/TP订单未全部成功下单，不进行跟踪。');
        }

        debugLog.push(`请求完成，耗时: ${Date.now() - startTime}ms`);

        // 16. 最终响应 (保持不变)
        return res.json({
            code: 200,
            msg: errorsInBatch.length > 0 ? '部分订单提交失败' : '订单提交成功',
            data: result,
            errors: errorsInBatch.length > 0 ? errorsInBatch : undefined,
            debug: process.env.NODE_ENV === 'development' ? debugLog : undefined
        });

    } catch (error) {
        // 错误处理 (保持不变)
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