// api/market/klines.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
// 移除 validateSignature 导入，因为公共市场数据通常不需要签名
// const validateSignature = require('../../middleware/signatureValidator');

router.get('/klines', /*移除 validateSignature(),*/ async (req, res) => { // 移除了签名验证
  console.log(`[API /klines] Received request query:`, req.query); // 记录收到的原始请求参数
  try {
    const {
      symbol,
      interval = '1m',
      limit, // 让 limit 可选，后面处理默认值
      startTime,
      endTime
    } = req.query;
    const { baseURL } = req.app.get('binanceConfig'); // 从 app 配置获取 baseURL

    // --- Validation ---
    if (!symbol) {
      return res.status(400).json({
        code: 400,
        msg: 'Symbol parameter is required',
        data: null
      });
    }

    const validIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({
        code: 400,
        msg: `Invalid interval. Valid intervals are: ${validIntervals.join(', ')}`,
        data: null
      });
    }

    let parsedStartTime = null;
    let parsedEndTime = null;
    let requestedLimit = limit; // 保留原始请求的limit

    if (startTime) {
      parsedStartTime = parseInt(startTime, 10);
      if (isNaN(parsedStartTime) || parsedStartTime <= 0) { // 时间戳应为正数
        return res.status(400).json({ code: 400, msg: 'Invalid startTime format. Must be a positive millisecond timestamp.', data: null });
      }
    }

    if (endTime) {
      parsedEndTime = parseInt(endTime, 10);
      if (isNaN(parsedEndTime) || parsedEndTime <= 0) {
        return res.status(400).json({ code: 400, msg: 'Invalid endTime format. Must be a positive millisecond timestamp.', data: null });
      }
    }

    if (parsedStartTime && parsedEndTime && parsedStartTime >= parsedEndTime) {
      return res.status(400).json({ code: 400, msg: 'startTime must be less than endTime.', data: null });
    }

    // --- 调整 Limit 逻辑 ---
    // Binance API: 使用 startTime/endTime 时，limit 最大 1500；否则最大 1000。
    const maxLimit = (parsedStartTime || parsedEndTime) ? 1500 : 1000;
    // 如果提供了时间范围，默认获取最多1500条；否则默认500条。
    const defaultLimit = (parsedStartTime || parsedEndTime) ? 1500 : 500;
    // 解析请求的 limit，如果无效或未提供，则使用默认值
    let parsedLimit = parseInt(requestedLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      parsedLimit = defaultLimit;
    }
    // 确保最终的 limit 不超过 API 允许的最大值
    const finalLimit = Math.min(parsedLimit, maxLimit);


    // --- Build Binance API Parameters ---
    const binanceParams = {
      symbol: symbol.toUpperCase(),
      interval: interval, // 使用验证后的 interval
      limit: finalLimit   // 使用计算和验证后的 finalLimit
    };

    if (parsedStartTime) {
      binanceParams.startTime = parsedStartTime;
    }
    if (parsedEndTime) {
      binanceParams.endTime = parsedEndTime;
    }

    // --- Make API Call to Binance ---
    const targetURL = `${baseURL}/fapi/v1/klines`; // 目标是实际的 Binance API
    console.log(`[API /klines] Forwarding request to Binance API: ${targetURL} with params:`, binanceParams); // 记录将要发送给 Binance 的参数

    const response = await axios.get(targetURL, {
      params: binanceParams // 将参数传递给 axios
    });

    // --- Process Binance Response ---
    // Binance 返回的是数组的数组 [[time, open, high, low, close, ...], ...]
    if (!Array.isArray(response.data)) {
      console.error('[API /klines] Unexpected response format from Binance API:', response.data);
      throw new Error('Received invalid data format from upstream API.');
    }

    const klines = response.data.map(k => {
      // 添加检查，确保 k 是数组且长度足够
      if (!Array.isArray(k) || k.length < 11) {
        console.warn('[API /klines] Skipping invalid kline array structure:', k);
        return null; // 返回 null 以便后续过滤
      }
      try {
        // 确保所有解析都基于正确的索引，并进行 parseFloat
        return {
          time: parseInt(k[0], 10), // Kline open time (timestamp) - 保持 key 为 'time' 以匹配 curl 输出
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]), // Base asset volume
          closeTime: parseInt(k[6], 10), // Kline close time (timestamp)
          quoteVolume: parseFloat(k[7]), // Quote asset volume - 使用正确的 key 'quoteVolume'
          trades: parseInt(k[8], 10), // Number of trades
          takerBaseVolume: parseFloat(k[9]), // Taker buy base asset volume
          takerQuoteVolume: parseFloat(k[10]),// Taker buy quote asset volume
        };
      } catch (parseError) {
        console.error('[API /klines] Error parsing kline data:', parseError, 'Raw kline:', k);
        return null; // 解析错误也标记为 null
      }
    }).filter(k => k !== null); // 过滤掉无效或解析错误的 kline 数据


    // 记录实际从 Binance 获取到的 K 线数量和时间范围（如果非空）
    if (klines.length > 0) {
      const firstKlineTime = klines[0].time;
      const lastKlineTime = klines[klines.length - 1].time;
      console.log(`[API /klines] Received ${klines.length} klines from Binance. Time range: ${new Date(firstKlineTime).toISOString()} to ${new Date(lastKlineTime).toISOString()}`);
    } else {
      console.log(`[API /klines] Received 0 klines from Binance for the requested parameters.`);
    }


    // --- Format Response for Your API Client ---
    res.json({
      code: 200,
      msg: 'Success',
      data: {
        symbol: symbol.toUpperCase(),
        interval,
        // 在响应中包含实际使用的查询参数，便于客户端确认
        requestStartTime: parsedStartTime,
        requestEndTime: parsedEndTime,
        requestLimit: requestedLimit, // 返回原始请求的 limit
        appliedLimit: finalLimit,   // 返回实际应用到 Binance API 的 limit
        klines // The fetched and processed kline data
      }
    });

  } catch (error) {
    // --- Error Handling ---
    console.error("[API /klines] Error fetching klines:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    // 尝试从 Binance 的错误响应中获取 code 和 msg
    const code = error.response?.data?.code || status;
    const message = error.response?.data?.msg || error.message;
    res.status(status).json({
      code: code,
      msg: `Error fetching klines from upstream: ${message}`, // 添加来源信息
      data: null
    });
  }
});

module.exports = router;