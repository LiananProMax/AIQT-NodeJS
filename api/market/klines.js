// api/market/klines.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const validateSignature = require('../../middleware/signatureValidator'); // Keep if needed, though public endpoints usually don't require signature

router.get('/klines', validateSignature(), async (req, res) => { // Consider removing validateSignature if not strictly needed for public market data
  try {
    const {
      symbol,
      interval = '1m',
      limit = 500, // Default limit if no time range specified, or max candles within range
      startTime,   // New parameter: Start time in milliseconds
      endTime       // New parameter: End time in milliseconds
    } = req.query;
    const { baseURL } = req.app.get('binanceConfig');

    // --- Validation ---
    if (!symbol) {
      return res.status(400).json({
        code: 400,
        msg: 'Symbol parameter is required',
        data: null
      });
    }

    // Optional: Add more robust interval validation if desired
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

    if (startTime) {
      parsedStartTime = parseInt(startTime, 10);
      if (isNaN(parsedStartTime)) {
        return res.status(400).json({ code: 400, msg: 'Invalid startTime format. Must be a millisecond timestamp.', data: null });
      }
    }

    if (endTime) {
      parsedEndTime = parseInt(endTime, 10);
      if (isNaN(parsedEndTime)) {
        return res.status(400).json({ code: 400, msg: 'Invalid endTime format. Must be a millisecond timestamp.', data: null });
      }
    }

    if (parsedStartTime && parsedEndTime && parsedStartTime >= parsedEndTime) {
      return res.status(400).json({ code: 400, msg: 'startTime must be less than endTime.', data: null });
    }

    // Binance API limit is 1500 for klines if startTime/endTime are used
    // If only limit is used without time range, it's often lower (check docs, but 1000 is safe)
    const maxLimit = (parsedStartTime || parsedEndTime) ? 1500 : 1000;
    const finalLimit = Math.min(parseInt(limit, 10) || 500, maxLimit); // Ensure limit is a number and within bounds


    // --- Build Binance API Parameters ---
    const binanceParams = {
      symbol: symbol.toUpperCase(),
      interval,
      limit: finalLimit
    };

    if (parsedStartTime) {
      binanceParams.startTime = parsedStartTime;
    }
    if (parsedEndTime) {
      binanceParams.endTime = parsedEndTime;
    }

    // --- Make API Call ---
    console.log(`Workspaceing klines with params: ${JSON.stringify(binanceParams)}`); // Log params for debugging
    const response = await axios.get(`${baseURL}/fapi/v1/klines`, {
      params: binanceParams
    });

    // --- Process Response (No change needed here) ---
    const klines = response.data.map(k => ({
      time: k[0],               // Kline open time (timestamp)
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]), // Base asset volume
      closeTime: k[6],          // Kline close time (timestamp)
      quoteVolume: parseFloat(k[7]), // Quote asset volume
      trades: k[8],             // Number of trades
      takerBaseVolume: parseFloat(k[9]), // Taker buy base asset volume
      takerQuoteVolume: parseFloat(k[10]),// Taker buy quote asset volume
      // k[11] - Ignore field
    }));

    res.json({
      code: 200,
      msg: 'Success',
      data: {
        symbol: symbol.toUpperCase(),
        interval,
        startTime: parsedStartTime, // Include requested times in response for clarity
        endTime: parsedEndTime,
        limit: finalLimit,
        klines // The fetched kline data
      }
    });

  } catch (error) {
    // --- Error Handling (Improved) ---
    console.error("Error fetching klines:", error.response?.data || error.message); // Log the detailed error
    const status = error.response?.status || 500;
    const code = error.response?.data?.code || status; // Use Binance code if available
    const message = error.response?.data?.msg || error.message; // Use Binance message if available
    res.status(status).json({
      code: code,
      msg: message,
      data: null
    });
  }
});

module.exports = router;