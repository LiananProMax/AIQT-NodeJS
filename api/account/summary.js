// api/account/summary.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs'); // Keep using qs for initial calls if preferred, but URLSearchParams for signing GET
const { Decimal } = require('decimal.js');
const validateSignature = require('../../middleware/signatureValidator');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// --- Helper Functions (Moved and Consolidated) ---

// 安全初始化 Decimal
const safeDecimal = (value, fallback = 0) => {
    try {
        if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
            // console.warn(`Invalid Decimal input (${value}), using fallback ${fallback}`);
            return new Decimal(fallback);
        }
        return new Decimal(value);
    } catch (e) {
        console.error(`Decimal init error for value "${value}": ${e.message}, using fallback ${fallback}`);
        return new Decimal(fallback);
    }
};


// 获取账户和持仓模式信息 (合并调用) - Using qs for signing POST/initial style
async function getAccountAndModeInfo(apiKey, apiSecret, baseURL) {
    const timestamp = Date.now();
    const params = { timestamp };
    // 使用 qs 进行一致的序列化和排序 for these specific endpoints if needed
    const queryString = qs.stringify(params, { sort: (a, b) => a.localeCompare(b) });

    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');

    try {
        const [accountResponse, positionModeResponse] = await Promise.all([
            axios.get(`${baseURL}/fapi/v2/account`, {
                headers: { 'X-MBX-APIKEY': apiKey },
                params: { ...params, signature },
                timeout: 5000 // 设置超时
            }),
            axios.get(`${baseURL}/fapi/v1/positionSide/dual`, {
                headers: { 'X-MBX-APIKEY': apiKey },
                params: { ...params, signature },
                timeout: 5000 // 设置超时
            })
        ]);

        return {
            accountData: accountResponse.data,
            isHedgeMode: positionModeResponse.data.dualSidePosition
        };
    } catch (error) {
        console.error("Error fetching account/mode info:", error.response?.data || error.message);
        throw error; // Let the caller handle
    }
}

// 获取活动订单 (Using URLSearchParams for signing GET, consistent with cancel.js)
async function getActiveOrders(symbol, apiKey, apiSecret, baseURL) {
    const timestamp = Date.now();
    const params = { timestamp };
    if (symbol) {
        params.symbol = symbol.toUpperCase();
    }

    const orderedParams = new URLSearchParams(
        Object.entries(params)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => [k, v.toString()])
    ).toString();

    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderedParams)
        .digest('hex');

    const requestURL = `${baseURL}/fapi/v1/openOrders?${orderedParams}&signature=${signature}`;

    try {
        const response = await axios.get(requestURL, {
            headers: { 'X-MBX-APIKEY': apiKey },
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching active orders:", error.response?.data || error.message);
        console.error(`[getActiveOrders] Failed URL: ${requestURL}`);
        throw error;
    }
}

// --- NEW: Helper function for Historical Orders ---
async function getHistoricalOrders(symbol, limit, startTime, endTime, apiKey, apiSecret, baseURL) {
    const timestamp = Date.now();
    const params = { timestamp };
    if (symbol) params.symbol = symbol.toUpperCase();
    // Binance API: limit default 500, max 1000
    if (limit) params.limit = Math.min(Math.max(1, limit), 1000);
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    // Use URLSearchParams for consistent signing of GET requests
    const orderedParams = new URLSearchParams(
        Object.entries(params)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => [k, v.toString()])
    ).toString();

    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderedParams)
        .digest('hex');

    const requestURL = `${baseURL}/fapi/v1/allOrders?${orderedParams}&signature=${signature}`;
    // console.log(`[getHistoricalOrders] Request URL: ${requestURL}`); // Debug

    try {
        const response = await axios.get(requestURL, {
            headers: { 'X-MBX-APIKEY': apiKey },
            timeout: 10000 // Increased timeout for potentially large historical data
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching historical orders:", error.response?.data || error.message);
        console.error(`[getHistoricalOrders] Failed URL: ${requestURL}`);
        throw error; // Re-throw error for main handler
    }
}

// --- NEW: Helper function for Historical Trades (User Trades) ---
async function getHistoricalTrades(symbol, limit, startTime, endTime, apiKey, apiSecret, baseURL) {
    // This endpoint REQUIRES a symbol
    if (!symbol) {
        console.warn("[getHistoricalTrades] Symbol is required for /fapi/v1/userTrades. Skipping fetch.");
        return []; // Return empty array if no symbol is provided
    }

    const timestamp = Date.now();
    const params = {
        symbol: symbol.toUpperCase(),
        timestamp
    };
    // Binance API: limit default 500, max 1000
    if (limit) params.limit = Math.min(Math.max(1, limit), 1000);
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    // Use URLSearchParams for consistent signing of GET requests
    const orderedParams = new URLSearchParams(
        Object.entries(params)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => [k, v.toString()])
    ).toString();

    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderedParams)
        .digest('hex');

    const requestURL = `${baseURL}/fapi/v1/userTrades?${orderedParams}&signature=${signature}`;
    console.log(`[getHistoricalTrades] Request URL: ${requestURL}`); // <-- UNCOMMENTED FOR DEBUGGING

    try {
        const response = await axios.get(requestURL, {
            headers: { 'X-MBX-APIKEY': apiKey },
            timeout: 10000 // Increased timeout
        });
        // Add a check for non-array response, although API should return array
        if (!Array.isArray(response.data)) {
             console.error(`[getHistoricalTrades] Unexpected non-array response for ${symbol}:`, response.data);
             return [];
        }
        return response.data;
    } catch (error) {
        // Log error but maybe return empty array to avoid failing the whole summary if only trades fail
        console.error(`Error fetching historical trades for ${symbol}:`, error.response?.data || error.message);
        console.error(`[getHistoricalTrades] Failed URL (details above): ${requestURL}`); // Reference logged URL
        // Decide whether to throw or return empty:
        // throw error; // Option 1: Fail the whole summary
        return []; // Option 2: Return empty, allow summary to continue partially
    }
}


// --- NEW: Helper function for Income History ---
async function getIncomeHistory(symbol, incomeType, limit, startTime, endTime, apiKey, apiSecret, baseURL) {
    const timestamp = Date.now();
    const params = { timestamp };
    if (symbol) params.symbol = symbol.toUpperCase();
    if (incomeType) params.incomeType = incomeType; // e.g., FUNDING_FEE, COMMISSION
    // Binance API: limit default 100, max 1000
    if (limit) params.limit = Math.min(Math.max(1, limit), 1000);
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    // Use URLSearchParams for consistent signing of GET requests
    const orderedParams = new URLSearchParams(
        Object.entries(params)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => [k, v.toString()])
    ).toString();

    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderedParams)
        .digest('hex');

    const requestURL = `${baseURL}/fapi/v1/income?${orderedParams}&signature=${signature}`;
    // console.log(`[getIncomeHistory] Request URL: ${requestURL}`); // Debug

    try {
        const response = await axios.get(requestURL, {
            headers: { 'X-MBX-APIKEY': apiKey },
            timeout: 10000 // Increased timeout
        });
         // Add a check for non-array response
        if (!Array.isArray(response.data)) {
             console.error(`[getIncomeHistory] Unexpected non-array response:`, response.data);
             return [];
        }
        return response.data;
    } catch (error) {
        console.error("Error fetching income history:", error.response?.data || error.message);
        console.error(`[getIncomeHistory] Failed URL: ${requestURL}`);
        throw error; // Re-throw error for main handler
    }
}


// 处理持仓数据 (结合 risk 和 position 的逻辑) - No changes needed here
function processPositions(positions, symbolFilter, showZero, isHedgeMode, totalMarginBalance) {
    const totalMargin = safeDecimal(totalMarginBalance);

    return positions
        .filter(p => {
            // Basic validity check
            if (!p || typeof p.symbol === 'undefined' || typeof p.positionAmt === 'undefined' || typeof p.entryPrice === 'undefined') {
                // console.warn('Skipping potentially invalid position data:', p);
                return false;
            }
            const matchSymbol = symbolFilter ? p.symbol.toUpperCase() === symbolFilter.toUpperCase() : true;
            const positionAmtDecimal = !isNaN(Number(p.positionAmt)) ? safeDecimal(p.positionAmt) : safeDecimal(0);
            const hasPosition = positionAmtDecimal.abs().gt(0);
            return matchSymbol && (showZero || hasPosition);
        })
        .map(p => {
            const positionAmt = safeDecimal(p.positionAmt);
            const entryPrice = safeDecimal(p.entryPrice);
            const markPrice = safeDecimal(p.markPrice);
            const leverage = safeDecimal(p.leverage, 1);
            const isolatedWallet = safeDecimal(p.isolatedWallet);
            const unrealizedProfit = safeDecimal(p.unRealizedProfit);

            // Determine direction
            let direction = 'NEUTRAL';
            if (isHedgeMode) {
                direction = p.positionSide || 'BOTH';
                if (direction === 'BOTH' && !positionAmt.isZero()) {
                    direction = positionAmt.gt(0) ? 'LONG' : 'SHORT';
                }
            } else if (!positionAmt.isZero()) {
                direction = positionAmt.gt(0) ? 'LONG' : 'SHORT';
            }

            // Calculate margin used
            let marginUsed = new Decimal(0);
            if (p.isolated) {
                marginUsed = isolatedWallet;
            } else if (!leverage.isZero() && totalMargin.gt(0)) {
                marginUsed = safeDecimal(p.initialMargin); // Prefer API's initialMargin for CROSS
                if (marginUsed.isZero() && !entryPrice.isZero()) { // Fallback calculation
                    const notional = positionAmt.abs().mul(entryPrice);
                    if (!leverage.isZero()) { // Avoid division by zero
                        marginUsed = notional.div(leverage);
                    }
                }
            }


            // Calculate liquidation price (approximate)
            let liquidationPrice = null;
             // Use API provided liquidation price if available and non-zero, otherwise calculate
            const apiLiqPrice = safeDecimal(p.liquidationPrice);
            if (!apiLiqPrice.isZero()) {
                 liquidationPrice = apiLiqPrice;
            } else if (!positionAmt.isZero() && !entryPrice.isZero() && !leverage.isZero()) {
                // Approximate calculation (consult Binance docs for exact formula)
                const maintenanceMarginRate = new Decimal(p.maintMarginRatio || 0.004); // Use API ratio if present, else approx.

                try {
                    if (p.isolated) {
                         // Isolated Liq Price: More complex, involves isolated wallet balance and maint margin.
                         // Simplified approximation based on leverage and maint rate:
                         const adjustmentFactor = new Decimal(1).div(leverage).add(maintenanceMarginRate);
                         if (positionAmt.gt(0)) { // LONG
                             liquidationPrice = entryPrice.mul(new Decimal(1).sub(adjustmentFactor));
                         } else { // SHORT
                             liquidationPrice = entryPrice.mul(new Decimal(1).add(adjustmentFactor));
                         }
                    } else {
                         // Cross Liq Price: Extremely complex, depends on entire account.
                         // API value (already checked) is best. Fallback is highly approximate.
                         const adjustmentFactor = new Decimal(1).div(leverage).add(maintenanceMarginRate);
                          if (positionAmt.gt(0)) { // LONG
                             liquidationPrice = entryPrice.mul(new Decimal(1).sub(adjustmentFactor));
                         } else { // SHORT
                             liquidationPrice = entryPrice.mul(new Decimal(1).add(adjustmentFactor));
                         }
                         // console.warn(`Using approximate CROSS liquidation price for ${p.symbol}`);
                    }
                     // Ensure liq price is not negative
                     if (liquidationPrice && liquidationPrice.lt(0)) {
                         liquidationPrice = new Decimal(0);
                     }

                } catch (e) {
                    console.error(`Liquidation price calc error for ${p.symbol}:`, e.message);
                }
            }


            // Calculate ROE
            let roe = new Decimal(0);
            if (!marginUsed.isZero()) {
                roe = unrealizedProfit.div(marginUsed).mul(100);
            }

            // Formatting functions
            const format = (num, decimals) =>
                num instanceof Decimal ? num.toDecimalPlaces(decimals).toNumber() : null;
            // Dynamic precision for prices based on entry price's decimal places, min 2
             let priceDP = 2;
             try {
                priceDP = Math.max(2, entryPrice.dp() || 2);
             } catch (e) { /* ignore potential errors from dp() */ }

            const formatPrice = (num) => format(num, priceDP);
            const formatQty = (num) => format(num, 8); // Adjust precision as needed
            const formatPercent = (num) => format(num, 2);
            const formatCurrency = (num) => format(num, 4);

            return {
                symbol: p.symbol,
                positionSide: p.positionSide || 'BOTH',
                direction: direction,
                marginType: p.isolated ? 'ISOLATED' : 'CROSS',
                leverage: format(leverage, 1),
                quantity: formatQty(positionAmt.abs()),
                entryPrice: formatPrice(entryPrice),
                markPrice: formatPrice(markPrice),
                liquidationPrice: formatPrice(liquidationPrice),
                marginUsed: formatCurrency(marginUsed),
                unrealizedPnl: formatCurrency(unrealizedProfit),
                roe: formatPercent(roe)
            };
        });
}

// --- Main Route ---

router.get('/summary', validateSignature(), async (req, res) => {
    try {
        // Add history parameters with defaults
        const { symbol, showZero = 'false', historyLimit = 500, historyDays = 7 } = req.query;
        const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

        // Calculate historical time range
        const endTime = Date.now();
        const startTime = endTime - (parseInt(historyDays, 10) * 24 * 60 * 60 * 1000);
        const parsedLimit = parseInt(historyLimit, 10);

        // 1. Fetch all data concurrently
        let accountData, isHedgeMode, activeOrdersRaw, historicalOrdersRaw, historicalTradesRaw = [], incomeHistoryRaw;

        try {
            const promises = [
                getAccountAndModeInfo(apiKey, apiSecret, baseURL),
                getActiveOrders(symbol, apiKey, apiSecret, baseURL),
                getHistoricalOrders(symbol, parsedLimit, startTime, endTime, apiKey, apiSecret, baseURL),
                getIncomeHistory(symbol, null, parsedLimit, startTime, endTime, apiKey, apiSecret, baseURL) // incomeType=null fetches all types
            ];

            let tradesPromiseIndex = -1; // Keep track of the trades promise index if added

            // Conditionally add trades fetch if symbol is provided
            if (symbol) {
                promises.push(getHistoricalTrades(symbol, parsedLimit, startTime, endTime, apiKey, apiSecret, baseURL));
                tradesPromiseIndex = promises.length - 1; // Index of the trades promise
            }

            const results = await Promise.all(promises);

            // Carefully destructure results based on conditional push
            accountData = results[0].accountData;
            isHedgeMode = results[0].isHedgeMode;
            activeOrdersRaw = Array.isArray(results[1]) ? results[1] : []; // Ensure array
            historicalOrdersRaw = Array.isArray(results[2]) ? results[2] : []; // Ensure array
            incomeHistoryRaw = Array.isArray(results[3]) ? results[3] : []; // Ensure array

            if (tradesPromiseIndex !== -1 && results.length > tradesPromiseIndex) {
                // Check if trades promise was added and resolved
                historicalTradesRaw = Array.isArray(results[tradesPromiseIndex]) ? results[tradesPromiseIndex] : []; // Use default empty array if fetch failed but didn't throw/returned non-array
            }

            // ** ADDED DEBUGGING **
            if (symbol && historicalTradesRaw.length === 0) {
                console.warn(`[Summary Route] Fetch for historical trades of symbol '${symbol}' was attempted but resulted in an empty array. Check previous logs for potential API errors in getHistoricalTrades.`);
            }
             // ** END DEBUGGING **


        } catch (error) {
            // Handle errors during the initial parallel fetch
            const status = error.response?.status || 500;
            const message = error.response?.data?.msg || error.message;
            console.error("Error during initial data fetch:", message); // Log the specific error
            return res.status(status).json({
                code: error.response?.data?.code || status,
                msg: `Failed to fetch initial data: ${message}`,
                data: null
            });
        }


        // 2. Process Balances
        const balances = (accountData?.assets || []).map(a => ({ // Add safety check for assets
            currency: a.asset,
            balance: safeDecimal(a.walletBalance).toNumber(),
            available: safeDecimal(a.availableBalance).toNumber(),
            unrealizedPnl: safeDecimal(a.unrealizedProfit).toNumber()
        }));

        // 3. Process Positions
        const positions = processPositions(
            accountData?.positions || [], // Add safety check for positions
            symbol,
            showZero === 'true',
            isHedgeMode,
            accountData?.totalMarginBalance // Pass potentially undefined
        );

        // 4. Process Active Orders
        const activeOrders = activeOrdersRaw.map(order => ({
            orderId: order.orderId,
            symbol: order.symbol,
            positionSide: order.positionSide || 'BOTH',
            price: safeDecimal(order.price).toNumber(),
            origQty: safeDecimal(order.origQty).toNumber(),
            executedQty: safeDecimal(order.executedQty).toNumber(),
            status: order.status,
            type: order.type,
            side: order.side,
            time: order.time,
            stopPrice: safeDecimal(order.stopPrice).toNumber(),
            workingType: order.workingType
        }));

        // 5. Process Historical Orders
        const historicalOrders = historicalOrdersRaw.map(order => ({
            orderId: order.orderId,
            symbol: order.symbol,
            positionSide: order.positionSide || 'BOTH',
            price: safeDecimal(order.price).toNumber(),
            origQty: safeDecimal(order.origQty).toNumber(),
            executedQty: safeDecimal(order.executedQty).toNumber(),
            avgPrice: safeDecimal(order.avgPrice).toNumber(),
            status: order.status,
            type: order.type,
            side: order.side,
            time: order.time,
            updateTime: order.updateTime,
            stopPrice: safeDecimal(order.stopPrice).toNumber(),
            workingType: order.workingType,
            reduceOnly: order.reduceOnly
        }));

        // 6. Process Historical Trades
        const historicalTrades = historicalTradesRaw.map(trade => ({
            id: trade.id,
            symbol: trade.symbol,
            orderId: trade.orderId,
            price: safeDecimal(trade.price).toNumber(),
            qty: safeDecimal(trade.qty).toNumber(),
            quoteQty: safeDecimal(trade.quoteQty).toNumber(),
            commission: safeDecimal(trade.commission).toNumber(),
            commissionAsset: trade.commissionAsset,
            realizedPnl: safeDecimal(trade.realizedPnl).toNumber(),
            side: trade.side,
            positionSide: trade.positionSide || 'BOTH',
            maker: trade.maker,
            time: trade.time
        }));

        // 7. Process Income History
        const incomeHistory = incomeHistoryRaw.map(item => ({
            symbol: item.symbol || null,
            incomeType: item.incomeType,
            income: safeDecimal(item.income).toNumber(),
            asset: item.asset,
            info: item.info,
            time: item.time,
            tranId: item.tranId,
            tradeId: item.tradeId || null // Add tradeId if available
        }));


        // 8. Build General Account Info
        const generalInfo = {
            totalWalletBalance: safeDecimal(accountData?.totalWalletBalance).toNumber(),
            totalUnrealizedProfit: safeDecimal(accountData?.totalUnrealizedProfit).toNumber(),
            totalMarginBalance: safeDecimal(accountData?.totalMarginBalance).toNumber(),
            totalPositionInitialMargin: safeDecimal(accountData?.totalPositionInitialMargin).toNumber(),
            totalOpenOrderInitialMargin: safeDecimal(accountData?.totalOpenOrderInitialMargin).toNumber(),
            availableBalance: safeDecimal(accountData?.availableBalance).toNumber(),
            maxWithdrawAmount: safeDecimal(accountData?.maxWithdrawAmount).toNumber(),
            isHedgeMode: isHedgeMode,
            updateTime: accountData?.updateTime
        };


        // 9. Combine Response
        res.json({
            code: 200,
            msg: 'Success',
            data: {
                accountInfo: generalInfo,
                balances: balances,
                // If specific symbol requested, return only that position object or null (or empty array if showZero=true and no position)
                positions: symbol
                    ? (positions.length > 0 ? positions[0] : null) // Return first (should be only) item if found, else null
                    : positions, // Return all positions if no symbol filter
                activeOrders: activeOrders,
                // Add historical data
                historicalOrders: historicalOrders,
                historicalTrades: historicalTrades, // Will be empty if no symbol was provided or fetch failed
                incomeHistory: incomeHistory
            }
        });

    } catch (error) {
        // Catch any other errors during processing/formatting
        console.error("Error in /summary endpoint processing:", error);
        const status = error.response?.status || 500; // Reuse status code if available
        const message = error.response?.data?.msg || error.message; // Reuse message if available
        res.status(status).json({
            code: error.response?.data?.code || status, // Reuse code if available
            msg: message,
            data: null
        });
    }
});

module.exports = router;