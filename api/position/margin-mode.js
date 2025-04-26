// api/position/margin-mode.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const validateSignature = require('../../middleware/signatureValidator');
router.post('/margin-mode', validateSignature(), async (req, res) => {
    try {
        const { symbol, marginType } = req.body;
        const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');
        // 参数验证
        if (!symbol || !marginType) {
            return res.status(400).json({ /* ... */ });
        }
        const validTypes = ['ISOLATED', 'CROSSED'];
        if (!validTypes.includes(marginType.toUpperCase())) {
            return res.status(400).json({ /* ... */ });
        }
        // 获取服务器时间
        const timeRes = await axios.get(`${baseURL}/fapi/v1/time`, { timeout: 2000 });
        const timestamp = Number(timeRes.data.serverTime);
        // 构建签名参数
        const params = {
            symbol: symbol.toUpperCase(),
            marginType: marginType.toUpperCase(),
            timestamp
        };
        // 生成有序查询字符串
        const orderedParams = new URLSearchParams(
            Object.entries(params)
                .sort()
                .map(([k, v]) => [k, v.toString()])
        ).toString();
        // 生成签名
        const signature = crypto
            .createHmac('sha256', apiSecret)
            .update(orderedParams)
            .digest('hex');
        // 构建最终请求URL
        const requestURL = `${baseURL}/fapi/v1/marginType?${orderedParams}&signature=${signature}`;
        // 发送请求
        const response = await axios.post(requestURL, null, {
            headers: { 'X-MBX-APIKEY': apiKey }
        });
        res.json({
            code: 200,
            msg: 'Margin mode updated',
            data: {
                symbol: response.data.symbol,
                marginType: response.data.marginType,
                success: response.data.code === 200
            }
        });
    } catch (error) {
        const binanceError = error.response?.data;
        let status = 500;
        let message = binanceError?.msg || error.message;

        // 处理持仓冲突错误
        if (binanceError?.code === -3000) {
            status = 409;
            message = 'Cannot change margin mode with open positions/orders';
        }

        res.status(status).json({
            code: binanceError?.code || 500,
            msg: message,
            data: null
        });
    }
});

module.exports = router;
