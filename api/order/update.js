// api/order/update.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const validateSignature = require('../../middleware/signatureValidator');
// 时间获取函数（带延迟补偿）
const getServerTime = async (baseURL) => {
    const start = Date.now();
    try {
        const timeRes = await axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 });
        const end = Date.now();
        const latency = Math.round((end - start) / 2);
        return Number(timeRes.data.serverTime) + latency;
    } catch (e) {
        console.error('Failed to get server time:', e.message);
        return Date.now(); // 降级使用本地时间
    }
};
router.patch('/:orderId', validateSignature(), async (req, res) => {
    try {
        const { orderId } = req.params;
        const { symbol, price, quantity, side } = req.body;
        const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');
        // 参数验证
        if (!symbol || !orderId || !side) {
            return res.status(400).json({
                code: 400,
                msg: 'Missing symbol, orderId, or side',
                data: null
            });
        }
        // 获取时间戳（带重试）
        let timestamp;
        for (let i = 0; i < 3; i++) {
            timestamp = await getServerTime(baseURL);
            if (Math.abs(Date.now() - timestamp) < 10000) break; // 时间差在10秒内
            await new Promise(r => setTimeout(r, 500));
        }
        // 获取原订单信息（关键步骤）
        const originalOrder = await getOriginalOrder(orderId, symbol, apiKey, apiSecret, baseURL);
        if (!originalOrder) {
            return res.status(404).json({
                code: 404,
                msg: 'Order not found',
                data: null
            });
        }
        // 构建参数
        const params = {
            symbol: symbol.toUpperCase(),
            orderId: Number(orderId),
            side: originalOrder.side, // 使用原订单的 side
            timestamp: Date.now(),
            recvWindow: 10000, // 设置10秒接收窗口
            ...(price && { price: Number(price).toFixed(2) }),
            ...(quantity && { quantity: Number(quantity).toFixed(8) })
        };
        // 时间有效性检查
        const currentTime = await getServerTime(baseURL);
        if (Math.abs(currentTime - timestamp) > 8000) {
            return res.status(408).json({
                code: 408,
                msg: 'Request timeout, please try again'
            });
        }
        // 生成签名参数
        const orderedParams = new URLSearchParams(
            Object.entries(params)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([k, v]) => [k, v.toString()])
        ).toString();
        const signature = crypto
            .createHmac('sha256', apiSecret)
            .update(orderedParams)
            .digest('hex');
        // 发送请求
        const requestURL = `${baseURL}/fapi/v1/order?${orderedParams}&signature=${signature}`;
        const response = await axios.put(requestURL, null, {
            headers: { 'X-MBX-APIKEY': apiKey },
            timeout: 8000 // 设置8秒超时
        });
        res.json({
            code: 200,
            msg: 'Order updated',
            data: {
                ...response.data,
                positionSide: response.data.positionSide || 'BOTH'
            }
        });
    } catch (error) {
        // 增强错误处理逻辑
        const binanceError = error.response?.data;
        const errorCode = binanceError?.code || 500;
        let errorMsg = binanceError?.msg || error.message;

        // 处理常见错误码
        const errorMapping = {
            '-2010': 'Order would immediately trigger',
            '-2011': 'Order does not exist',
            '-4028': 'Order price out of range'
        };

        res.status(error.response?.status || 500).json({
            code: errorCode,
            msg: errorMapping[errorCode] || errorMsg,
            data: binanceError || null
        });
    }
});

// 辅助函数：获取原订单信息
async function getOriginalOrder(orderId, symbol, apiKey, apiSecret, baseURL) {
    const timestamp = Date.now();
    const params = { symbol, orderId, timestamp };
    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(new URLSearchParams(params).toString())
        .digest('hex');
    try {
        const response = await axios.get(`${baseURL}/fapi/v1/order`, {
            headers: { 'X-MBX-APIKEY': apiKey },
            params: { ...params, signature }
        });
        return {
            ...response.data,
            positionSide: response.data.positionSide || 'BOTH'
        };
    } catch (e) {
        return null;
    }
}

module.exports = router;
