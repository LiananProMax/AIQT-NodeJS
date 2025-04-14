// api/position/leverage.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('querystring');
const validateSignature = require('../../middleware/signatureValidator');
router.post('/leverage', validateSignature(), async (req, res) => {
    try {
        const { symbol, leverage } = req.body;
        const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');
        // 参数验证
        if (!symbol || leverage === undefined) {
            return res.status(400).json({
                code: 400,
                msg: 'Missing required parameters: symbol, leverage',
                data: null
            });
        }
        if (isNaN(leverage) || leverage < 1 || leverage > 125) {
            return res.status(400).json({
                code: 400,
                msg: 'Invalid leverage (1-125 allowed)',
                data: null
            });
        }
        // 获取服务器时间（添加错误处理）
        let timestamp;
        try {
            const timeRes = await axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 });
            timestamp = timeRes.data.serverTime;
            console.log('Server timestamp:', timestamp);
        } catch (timeError) {
            return res.status(500).json({
                code: -1001,
                msg: 'Failed to get server time',
                data: { error: timeError.message }
            });
        }
        // 修复点：确保包含timestamp参数
        const params = {
            symbol: symbol.toUpperCase(),
            leverage: Number(leverage), // 明确转换为数字
            timestamp: Number(timestamp) // 明确转换为数字
        };
        // 调试：检查参数类型
        console.log('Parameter Types:', {
            symbol: typeof params.symbol,
            leverage: typeof params.leverage,
            timestamp: typeof params.timestamp
        });
        // 生成签名
        // 统一使用严格字母排序
        const orderedParams = new URLSearchParams(
            Object.entries(params).sort((a, b) => a[0].localeCompare(b[0]))
        ).toString();
        const signature = crypto
            .createHmac('sha256', apiSecret)
            .update(orderedParams)
            .digest('hex');
        console.log('Final Query String:', orderedParams);
        console.log('Generated Signature:', signature);
        // 生成完整查询字符串（包含签名）
        const queryWithSignature = `${orderedParams}&signature=${signature}`;
        // 发送请求
        const response = await axios.post(
            `${baseURL}/fapi/v1/leverage?${queryWithSignature}`, // ✅ 直接使用完整查询字符串
            null,
            { headers: { 'X-MBX-APIKEY': apiKey } }
        );
        res.json({
            code: 200,
            msg: 'Leverage updated',
            data: {
                symbol: response.data.symbol,
                leverage: response.data.leverage,
                maxQty: response.data.maxNotionalValue
            }
        });
    } catch (error) {
        const binanceError = error.response?.data;
        let message = binanceError?.msg || error.message;

        // 处理币安特定错误码
        if (binanceError?.code === -4008) {
            message = `Unsupported leverage for ${req.body.symbol}`;
        }

        res.status(error.response?.status || 500).json({
            code: binanceError?.code || 500,
            msg: message,
            data: null
        });
    }
});

module.exports = router;
