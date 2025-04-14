const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const qs = require('querystring');
const { Decimal } = require('decimal.js');
const validateSignature = require('../../middleware/signatureValidator');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

router.get('/', validateSignature(), async (req, res) => {
  try {
    const { symbol, showZero = 'false' } = req.query;
    const { baseURL, apiKey, apiSecret } = req.app.get('binanceConfig');

    // 获取账户信息
    const { positions, totalMarginBalance } = await getAccountInfo(apiKey, apiSecret, baseURL);
    
    // 检查持仓模式
    const isHedgeMode = await checkHedgeMode(apiKey, apiSecret, baseURL);

    // 处理持仓数据
    const processed = processPositions(
      positions,
      symbol?.toUpperCase(),
      showZero === 'true',
      isHedgeMode,
      new Decimal(totalMarginBalance)
    );

    res.json({
      code: 200,
      msg: 'Success',
      data: symbol ? processed[0] || null : processed
    });

  } catch (error) {
    handlePositionError(error, res);
  }
});

// 获取账户信息（复用已有逻辑）
async function getAccountInfo(apiKey, apiSecret, baseURL) {
  const timestamp = Date.now();
  const params = { timestamp };
  const queryString = qs.stringify(params, { sort: true });

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');

  const response = await axios.get(`${baseURL}/fapi/v2/account`, {
    headers: { 'X-MBX-APIKEY': apiKey },
    params: { ...params, signature }
  });

  return {
    positions: response.data.positions,
    totalMarginBalance: response.data.totalMarginBalance
  };
}

// 处理持仓数据（精确计算）
function processPositions(positions, symbolFilter, showZero, isHedgeMode, totalMargin) {
    return positions
      .filter(p => {
        // 过滤无效数据
        if (!p || 
            typeof p.positionAmt === 'undefined' ||
            typeof p.entryPrice === 'undefined') {
          console.warn('Skipping invalid position:', p);
          return false;
        }
        
        const matchSymbol = symbolFilter ? p.symbol === symbolFilter : true;
        const hasPosition = new Decimal(p.positionAmt).abs().gt(0);
        return matchSymbol && (showZero || hasPosition);
      })
      .map(p => {
        // 安全初始化方法
        const safeDecimal = (value, fallback = 0) => {
          try {
            return new Decimal(value ?? fallback);
          } catch (e) {
            console.error(`Decimal init error (${value}), using fallback ${fallback}`);
            return new Decimal(fallback);
          }
        };
        const positionAmt = safeDecimal(p.positionAmt);
        const entryPrice = safeDecimal(p.entryPrice);
        const leverage = safeDecimal(p.leverage, 1);
        const markPrice = safeDecimal(p.markPrice);
        // 计算保证金占用
        const marginUsed = calculateMarginUsed(
          p, 
          positionAmt, 
          entryPrice, 
          leverage, 
          totalMargin
        );
        // 计算强平价（添加容错）
        let liqPrice = null;
        try {
          liqPrice = calculateLiquidationPrice(p, positionAmt, entryPrice, leverage);
        } catch (e) {
          console.error('Liquidation price calc error:', e.message);
        }
        return {
          symbol: p.symbol,
          direction: getPositionDirection(positionAmt, isHedgeMode, p.positionSide),
          marginType: p.isolated ? 'ISOLATED' : 'CROSS',
          leverage: leverage.toDP(1).toNumber(),
          quantity: positionAmt.abs().toDP(8).toNumber(),
          entryPrice: entryPrice.toDP(8).toNumber(),
          markPrice: markPrice.toDP(8).toNumber(),
          marginUsed: marginUsed.toDP(4).toNumber(),
          unrealizedPnl: safeDecimal(p.unrealizedProfit).toDP(4).toNumber(),
          liquidationPrice: liqPrice?.toDP(2).toNumber() || null,
          roe: calculateROE(positionAmt, entryPrice, markPrice, marginUsed)
        };
      });
  }

// 复用持仓模式检查
async function checkHedgeMode(apiKey, apiSecret, baseURL) {
  const timestamp = Date.now();
  const params = { timestamp };
  const queryString = qs.stringify(params, { sort: true });

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');

  const response = await axios.get(`${baseURL}/fapi/v1/positionSide/dual`, {
    headers: { 'X-MBX-APIKEY': apiKey },
    params: { ...params, signature }
  });

  return response.data.dualSidePosition;
}

// 统一错误处理
function handlePositionError(error, res) {
  const status = error.response?.status || 500;
  const message = error.response?.data?.msg || error.message;
  res.status(status).json({ 
    code: status,
    msg: message,
    data: null
  });
}

// 计算保证金占用（核心逻辑）
function calculateMarginUsed(pos, amt, entry, leverage, totalMargin) {
  if (pos.isolated) return new Decimal(pos.isolatedWallet);
  
  // 全仓模式：仓位价值 / 杠杆
  const notional = amt.abs().mul(entry);
  return notional.div(leverage).div(totalMargin).mul(totalMargin);
}

// 计算强平价（考虑手续费）
function calculateLiquidationPrice(pos, amt, entry, leverage) {
    if (amt.isZero() || entry.isZero() || leverage.isZero()) {
      return null;
    }
    try {
      const isLong = amt.gt(0);
      const feeRate = 0.0004;
      const rate = isLong 
        ? new Decimal(1).sub(new Decimal(1).div(leverage)).sub(feeRate)
        : new Decimal(1).add(new Decimal(1).div(leverage)).add(feeRate);
      return entry.mul(rate);
    } catch (e) {
      console.error('Liquidation calc error:', e.message);
      return null;
    }
  }

// 确定持仓方向
function getPositionDirection(amt, isHedgeMode, positionSide) {
  return isHedgeMode 
    ? positionSide 
    : amt.gt(0) ? 'LONG' : 'SHORT';
}

// 计算收益率（可选）
function calculateROE(amt, entry, mark, margin) {
  if (margin.isZero()) return 0;
  const valueChange = amt.mul(mark.sub(entry));
  return valueChange.div(margin).mul(100);
}

module.exports = router;
