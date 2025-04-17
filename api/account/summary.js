// api/account/summary.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs'); // 使用 qs 替代 querystring 以获得更一致的排序
const { Decimal } = require('decimal.js');
const validateSignature = require('../../middleware/signatureValidator');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// --- Helper Functions (Moved and Consolidated) ---

// 安全初始化 Decimal
const safeDecimal = (value, fallback = 0) => {
    try {
        // 检查是否为有效的数字或字符串表示
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


// 获取账户和持仓模式信息 (合并调用)
async function getAccountAndModeInfo(apiKey, apiSecret, baseURL) {
    const timestamp = Date.now();
    const params = { timestamp };
    // 使用 qs 进行一致的序列化和排序
    const queryString = qs.stringify(params, { sort: (a, b) => a.localeCompare(b) });

    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');

    try {
        // 并行获取账户信息和持仓模式
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
        // 抛出错误，让上层处理
        throw error;
    }
}

// 获取活动订单 (Revised to match cancel.js signature/URL pattern)
async function getActiveOrders(symbol, apiKey, apiSecret, baseURL) {
    const timestamp = Date.now(); // 继续使用 Date.now()，如果还有问题再考虑服务器时间
    const params = { timestamp };
    if (symbol) {
        params.symbol = symbol.toUpperCase();
    }

    // 1. 使用 URLSearchParams 生成规范化、排序的查询字符串 (与 cancel.js 模式一致)
    //    确保所有值都转换为字符串，并按 key 的字母顺序排序
    const orderedParams = new URLSearchParams(
        Object.entries(params)
            .sort((a, b) => a[0].localeCompare(b[0])) // 按 key 字母排序
            .map(([k, v]) => [k, v.toString()])      // 确保所有值都是字符串
    ).toString();

    // 2. 基于这个精确的字符串生成签名
    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(orderedParams) // 对 URLSearchParams 生成的字符串进行签名
        .digest('hex');

    // 3. 手动构建完整的请求 URL，将签名作为最后一个参数附加
    const requestURL = `${baseURL}/fapi/v1/openOrders?${orderedParams}&signature=${signature}`;

    // --- 调试日志 (可选，用于验证生成的URL和签名) ---
    // console.log(`[getActiveOrders] Base Params: ${JSON.stringify(params)}`);
    // console.log(`[getActiveOrders] Ordered Query String for Signature: ${orderedParams}`);
    // console.log(`[getActiveOrders] Generated Signature: ${signature}`);
    // console.log(`[getActiveOrders] Request URL: ${requestURL}`);
    // --- 结束调试日志 ---

    try {
        // 4. 发送 GET 请求，直接使用完整构建的 URL，不传递 params 对象给 axios
        const response = await axios.get(requestURL, { // 直接使用 URL
            headers: { 'X-MBX-APIKEY': apiKey },
            // 不需要 params 字段，因为所有参数已在 requestURL 中
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        // 增强错误日志，包含请求的 URL
        console.error("Error fetching active orders:", error.response?.data || error.message);
        console.error(`[getActiveOrders] Failed URL: ${requestURL}`); // 打印失败的 URL
        // 重新抛出错误，让上层函数处理
        throw error;
    }
}


// 处理持仓数据 (结合 risk 和 position 的逻辑)
function processPositions(positions, symbolFilter, showZero, isHedgeMode, totalMarginBalance) {
    const totalMargin = safeDecimal(totalMarginBalance); // 确保 totalMarginBalance 是 Decimal

    return positions
        .filter(p => {
            // 基本有效性检查
            if (!p || typeof p.symbol === 'undefined' || typeof p.positionAmt === 'undefined' || typeof p.entryPrice === 'undefined') {
                // console.warn('Skipping potentially invalid position data:', p);
                return false;
            }
            const matchSymbol = symbolFilter ? p.symbol.toUpperCase() === symbolFilter.toUpperCase() : true;
            // 只有当 positionAmt 可解析为数字时才创建 Decimal
            const positionAmtDecimal = !isNaN(Number(p.positionAmt)) ? safeDecimal(p.positionAmt) : safeDecimal(0);
            const hasPosition = positionAmtDecimal.abs().gt(0);
            return matchSymbol && (showZero || hasPosition);
        })
        .map(p => {
            const positionAmt = safeDecimal(p.positionAmt);
            const entryPrice = safeDecimal(p.entryPrice);
            const markPrice = safeDecimal(p.markPrice);
            const leverage = safeDecimal(p.leverage, 1); // Default leverage to 1 if missing
            const isolatedWallet = safeDecimal(p.isolatedWallet);
            const unrealizedProfit = safeDecimal(p.unRealizedProfit); // 注意：API字段大小写可能不同

            // 确定方向
            let direction = 'NEUTRAL'; // Default
            if (isHedgeMode) {
                direction = p.positionSide || 'BOTH'; // Use API provided side
                if (direction === 'BOTH' && !positionAmt.isZero()) {
                    // If hedge mode but side is BOTH and has amount, infer from amount
                    direction = positionAmt.gt(0) ? 'LONG' : 'SHORT';
                }
            } else if (!positionAmt.isZero()) {
                direction = positionAmt.gt(0) ? 'LONG' : 'SHORT';
            }


            // 计算保证金占用 (Cross vs Isolated)
            let marginUsed = new Decimal(0);
            if (p.isolated) {
                marginUsed = isolatedWallet;
            } else if (!leverage.isZero() && totalMargin.gt(0)) {
                // 全仓：名义价值 / 杠杆 (Binance's definition might vary slightly)
                // Using initialMargin as reported by API is often more reliable for CROSS
                marginUsed = safeDecimal(p.initialMargin);
                // Fallback calculation if initialMargin is zero/missing
                if (marginUsed.isZero() && !entryPrice.isZero()) {
                    const notional = positionAmt.abs().mul(entryPrice);
                    marginUsed = notional.div(leverage);
                }
            }


            // 计算强平价 (来自 risk.js 的逻辑，考虑手续费)
            let liquidationPrice = null;
            if (!positionAmt.isZero() && !entryPrice.isZero() && !leverage.isZero()) {
                // 使用 0.004 (0.4%) 作为维持保证金率的近似值 - 注意：这可能因资产和层级而异！
                // 对于更精确的计算，需要查询维持保证金率表。
                const maintenanceMarginRate = new Decimal(0.004); // Approximate

                try {
                    if (p.isolated) {
                        // 隔离模式强平价: EntryPrice - (IsolatedWallet / PositionAmt) for LONG
                        // EntryPrice + (IsolatedWallet / PositionAmt) for SHORT (simplified)
                        // More accurate: LiqPrice = EntryPrice * (1 +/- (InitialMargin + MaintenanceMargin) / InitialMargin)
                        // Let's use the simpler formula from risk.js as an approximation
                        const rate = positionAmt.gt(0)
                            ? new Decimal(1).sub(new Decimal(1).div(leverage)).sub(maintenanceMarginRate) // Long liq price calc adjustment
                            : new Decimal(1).add(new Decimal(1).div(leverage)).add(maintenanceMarginRate); // Short liq price calc adjustment
                        liquidationPrice = entryPrice.mul(rate);

                    } else {
                        // 全仓模式强平价计算更复杂，依赖于总账户余额、其他仓位等。
                        // API 返回的 `liquidationPrice` 字段通常是最佳来源（如果可用且准确）。
                        // 如果 API 返回的 p.liquidationPrice 可用且不为0，则优先使用它。
                        const apiLiqPrice = safeDecimal(p.liquidationPrice);
                        if (!apiLiqPrice.isZero()) {
                            liquidationPrice = apiLiqPrice;
                        } else {
                            // 作为后备，使用简化的基于杠杆的计算（准确性较低）
                            const rate = positionAmt.gt(0)
                                ? new Decimal(1).sub(new Decimal(1).div(leverage)).sub(maintenanceMarginRate)
                                : new Decimal(1).add(new Decimal(1).div(leverage)).add(maintenanceMarginRate);
                            liquidationPrice = entryPrice.mul(rate);
                        }

                    }
                } catch (e) {
                    console.error(`Liquidation price calc error for ${p.symbol}:`, e.message);
                }

            }

            // 计算 ROE
            let roe = new Decimal(0);
            if (!marginUsed.isZero()) {
                // 使用 API 返回的未实现盈亏计算 ROE
                roe = unrealizedProfit.div(marginUsed).mul(100);
            }

            // 格式化函数
            const format = (num, decimals) =>
                num instanceof Decimal ? num.toDecimalPlaces(decimals).toNumber() : null;
            const formatPrice = (num) => format(num, Math.max(2, entryPrice.dp())); // 动态精度
            const formatQty = (num) => format(num, 8); // 通常数量精度较高
            const formatPercent = (num) => format(num, 2); // ROE 百分比
            const formatCurrency = (num) => format(num, 4); // 保证金和盈亏

            return {
                symbol: p.symbol,
                positionSide: p.positionSide || 'BOTH', // 来自API
                direction: direction, // 'LONG', 'SHORT', 'BOTH', 'NEUTRAL'
                marginType: p.isolated ? 'ISOLATED' : 'CROSS',
                leverage: format(leverage, 1),
                quantity: formatQty(positionAmt.abs()),
                entryPrice: formatPrice(entryPrice),
                markPrice: formatPrice(markPrice),
                liquidationPrice: formatPrice(liquidationPrice), // 使用计算出的价格
                marginUsed: formatCurrency(marginUsed), // 实际使用的保证金
                unrealizedPnl: formatCurrency(unrealizedProfit), // 来自 API
                roe: formatPercent(roe) // %
            };
        });
}

// --- Main Route ---

router.get('/summary', validateSignature(), async (req, res) => {
    try {
        const { symbol, showZero = 'false' } = req.query;
        const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

        // 1. 并行获取账户信息、持仓模式和活动订单
        let accountData, isHedgeMode, activeOrdersRaw;
        try {
            const results = await Promise.all([
                getAccountAndModeInfo(apiKey, apiSecret, baseURL),
                getActiveOrders(symbol, apiKey, apiSecret, baseURL) // 传递 symbol
            ]);
            accountData = results[0].accountData;
            isHedgeMode = results[0].isHedgeMode;
            activeOrdersRaw = results[1];
        } catch (error) {
            // 如果任何一个初始请求失败，则返回错误
            const status = error.response?.status || 500;
            const message = error.response?.data?.msg || error.message;
            return res.status(status).json({
                code: error.response?.data?.code || status,
                msg: `Failed to fetch initial data: ${message}`,
                data: null
            });
        }


        // 2. 处理余额
        const balances = accountData.assets.map(a => ({
            currency: a.asset,
            balance: safeDecimal(a.walletBalance).toNumber(),
            available: safeDecimal(a.availableBalance).toNumber(),
            unrealizedPnl: safeDecimal(a.unrealizedProfit).toNumber() // 添加资产维度的未实现盈亏
        }));

        // 3. 处理持仓 (使用 accountData 中的 positions)
        const positions = processPositions(
            accountData.positions,
            symbol, // 传递 symbol 过滤器
            showZero === 'true',
            isHedgeMode,
            accountData.totalMarginBalance // 传递总保证金余额
        );

        // 4. 处理活动订单 (格式化)
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
            stopPrice: safeDecimal(order.stopPrice).toNumber(), // 添加止损价
            workingType: order.workingType // 添加工作类型
        }));

        // 5. 构建通用账户信息
        const generalInfo = {
            totalWalletBalance: safeDecimal(accountData.totalWalletBalance).toNumber(),
            totalUnrealizedProfit: safeDecimal(accountData.totalUnrealizedProfit).toNumber(),
            totalMarginBalance: safeDecimal(accountData.totalMarginBalance).toNumber(),
            totalPositionInitialMargin: safeDecimal(accountData.totalPositionInitialMargin).toNumber(),
            totalOpenOrderInitialMargin: safeDecimal(accountData.totalOpenOrderInitialMargin).toNumber(),
            availableBalance: safeDecimal(accountData.availableBalance).toNumber(), // 可用作保证金的余额
            maxWithdrawAmount: safeDecimal(accountData.maxWithdrawAmount).toNumber(),
            isHedgeMode: isHedgeMode,
            updateTime: accountData.updateTime // 账户信息的更新时间
        };


        // 6. 组合响应
        res.json({
            code: 200,
            msg: 'Success',
            data: {
                accountInfo: generalInfo,
                balances: balances,
                positions: symbol ? (positions[0] || null) : positions, // 如果请求了特定 symbol，只返回那一个或 null
                activeOrders: activeOrders // 已根据 symbol 过滤（如果在请求中提供了）
            }
        });

    } catch (error) {
        // 捕获在处理或格式化过程中可能发生的任何其他错误
        console.error("Error in /summary endpoint:", error);
        const status = error.response?.status || 500;
        const message = error.response?.data?.msg || error.message;
        res.status(status).json({
            code: error.response?.data?.code || status,
            msg: message,
            data: null
        });
    }
});

module.exports = router;