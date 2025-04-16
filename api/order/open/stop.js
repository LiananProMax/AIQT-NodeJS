const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { Decimal } = require('decimal.js');
const validateSignature = require('../../../middleware/signatureValidator');

// 复用已有工具函数
const {
    getServerTimeWithRetry,
    checkPositionMode,
    generateSignature
} = require('../open/limit');

router.post('/stop', validateSignature(), async (req, res) => {
    try {
        const { symbol, side, quantity, stopPrice, limitPrice, positionSide } = req.body;
        const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

        // 参数验证
        if (!symbol || !side || !stopPrice) {
            return res.status(400).json({
                code: 400,
                msg: 'Missing required parameters: symbol, side, stopPrice',
                data: null
            });
        }

        // 获取服务器时间
        const timestamp = await getServerTimeWithRetry(baseURL);

        // 获取当前价格
        const ticker = await axios.get(`${baseURL}/fapi/v1/ticker/price`, {
            params: { symbol: symbol.toUpperCase() }
        });
        const currentPrice = new Decimal(ticker.data.price);

        // 验证止损价格逻辑
        const stopPriceDec = new Decimal(stopPrice);
        const priceCheck = validateStopPrice(side, currentPrice, stopPriceDec);
        if (!priceCheck.valid) {
            return res.status(400).json({
                code: 400,
                msg: priceCheck.reason,
                data: { currentPrice: currentPrice.toNumber() }
            });
        }

        // 检查持仓模式
        const isHedgeMode = await checkPositionMode(apiKey, apiSecret, baseURL);
        if (isHedgeMode && !positionSide) {
            return res.status(400).json({
                code: -4061,
                msg: 'Position side required in hedge mode'
            });
        }

        // 构建订单参数
        const orderType = limitPrice ? 'STOP' : 'STOP_MARKET';
        const params = {
            symbol: symbol.toUpperCase(),
            side: side.toUpperCase(),
            type: orderType,
            stopPrice: Number(stopPrice).toFixed(2), // 明确转换为数字并保留2位小数
            timestamp: Number(timestamp), // 确保为数字类型
            recvWindow: 10000,
            ...(quantity && { quantity: Number(quantity).toFixed(8) }), // 转换为数字并保留8位小数
            ...(limitPrice && { price: Number(limitPrice).toFixed(2) }),
            ...(isHedgeMode && { positionSide: positionSide.toUpperCase() })
        };

        // 清理undefined参数
        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
        // 生成签名
        const orderedParams = Object.keys(params)
            .sort()
            .map(key => `${key}=${encodeURIComponent(params[key].toString())}`)
            .join('&');

        const signature = crypto
            .createHmac('sha256', apiSecret)
            .update(orderedParams)
            .digest('hex');

        // 发送请求
        const response = await axios.post(
            `${baseURL}/fapi/v1/order`,
            `${orderedParams}&signature=${signature}`,
            { headers: { 'X-MBX-APIKEY': apiKey } }
        );

        res.json({
            code: 200,
            msg: 'Stop order placed',
            data: formatStopOrderResponse(response.data)
        });

    } catch (error) {
        handleStopOrderError(error, res);
    }
});

// 辅助函数：验证止损价格逻辑
function validateStopPrice(side, currentPrice, stopPrice) {
    const isBuy = side.toUpperCase() === 'BUY';
    const priceDiff = stopPrice.comparedTo(currentPrice);

    return {
        valid: isBuy ? priceDiff > 0 : priceDiff < 0,
        reason: isBuy
            ? 'Stop price must be above current price for buy orders'
            : 'Stop price must be below current price for sell orders'
    };
}

// 格式化响应
function formatStopOrderResponse(data) {
    return {
        orderId: data.orderId,
        symbol: data.symbol,
        type: data.type,
        stopPrice: parseFloat(data.stopPrice),
        executedQty: parseFloat(data.executedQty),
        status: data.status,
        updateTime: data.updateTime
    };
}

// 错误处理
function handleStopOrderError(error, res) {
    const binanceError = error.response?.data;
    const status = error.response?.status || 500;
    const errorCode = binanceError?.code || status;

    const errorMessages = {
        '-2021': 'Invalid stop price trigger condition',
        '-2010': 'Stop price would trigger immediately',
        '-4300': 'Invalid order type for current position'
    };

    res.status(status).json({
        code: errorCode,
        msg: errorMessages[errorCode] || binanceError?.msg || error.message,
        data: binanceError || null
    });
}

module.exports = router;
