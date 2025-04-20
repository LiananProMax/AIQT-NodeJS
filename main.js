require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs');
const { Decimal } = require('decimal.js');

const app = express();

// --- 开始：孤儿订单取消设置 ---
// 内存存储，用于跟踪与仓位关联的SL/TP订单
// 结构：Map<positionKey（例如，'BTCUSDT_LONG'或'BTCUSDT_BOTH'），{ slOrderId: string, tpOrderId: string, symbol: string }>
const trackedSLTPOrders = new Map();
app.locals.trackedSLTPOrders = trackedSLTPOrders; // 通过app.locals使存储可访问
const POLLING_INTERVAL_MS = 10000; // 每15秒检查一次（根据需要调整）
let isPolling = false; // 标记，防止并发轮询运行
// 辅助函数，获取API配置（确保其可访问）
function getBinanceConfigInternal() {
  // 复制或重用现有的getBinanceConfig逻辑
  const useTestnet = process.argv.includes('--testnet');
  return {
    baseURL: useTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com',
    apiKey: useTestnet ? process.env.TESTNET_API_KEY : process.env.API_KEY,
    apiSecret: useTestnet ? process.env.TESTNET_API_SECRET : process.env.API_SECRET
  };
}

// 辅助函数：获取当前仓位
async function getCurrentPositions(config) {
  const timestamp = Date.now();
  const params = { timestamp };
  const queryString = qs.stringify(params, { sort: true });
  const signature = crypto.createHmac('sha256', config.apiSecret).update(queryString).digest('hex');
  try {
    const response = await axios.get(`${config.baseURL}/fapi/v2/positionRisk`, {
      headers: { 'X-MBX-APIKEY': config.apiKey },
      params: { ...params, signature }
    });
    // 如果需要，最初可以过滤掉金额为0的仓位，或稍后处理
    // return response.data.filter(p => new Decimal(p.positionAmt).abs().gt(0));
    return response.data; // 返回所有仓位以与跟踪订单进行对比
  } catch (error) {
    console.error('[轮询] 获取仓位时出错：', error.response?.data || error.message);
    return null; // 表示出错
  }
}

// 辅助函数：取消单个订单
async function cancelSingleOrder(config, symbol, orderId) {
  const timestamp = Date.now();
  const params = {
    symbol: symbol.toUpperCase(),
    orderId: orderId, // 如果API需要，应为数字
    timestamp
  };
  // 确保orderId为整数（基于cancel.js）
  if (typeof params.orderId === 'string' && /^\d+$/.test(params.orderId)) {
    params.orderId = parseInt(params.orderId);
  } else if (typeof params.orderId !== 'number') {
    console.error(`[轮询] 无效的订单ID类型：${orderId}`);
    return false; // 无法取消
  }
  // 使用URLSearchParams以保持与cancel.js的签名一致
  const orderedParams = new URLSearchParams(
    Object.entries(params)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, v.toString()])
  ).toString();
  const signature = crypto.createHmac('sha256', config.apiSecret).update(orderedParams).digest('hex');
  const requestURL = `${config.baseURL}/fapi/v1/order?${orderedParams}&signature=${signature}`;
  try {
    console.log(`[轮询] 尝试取消${symbol}的订单${orderId}`);
    const response = await axios.delete(requestURL, {
      headers: { 'X-MBX-APIKEY': config.apiKey }
    });
    console.log(`[轮询] 成功取消${symbol}的订单${orderId}。状态：${response.data?.status}`);
    return true;
  } catch (error) {
    // 忽略“订单不存在”错误（-2011），因为该订单可能已被成交/取消
    if (error.response?.data?.code === -2011) {
      console.log(`[轮询] ${symbol}的订单${orderId}已成交/取消。`);
      return true; // 视为成功处理
    }
    console.error(`[轮询] 取消${symbol}的订单${orderId}时出错：`, error.response?.data || error.message);
    return false; // 表示取消失败
  }
}

// 轮询函数逻辑
async function pollAndCancelOrphanedOrders() {
  if (isPolling) {
    // console.log('[轮询] 上一个轮询仍在运行，跳过。');
    return;
  }
  isPolling = true;
  // console.log('[轮询] 检查孤儿SL/TP订单...');
  const config = getBinanceConfigInternal(); // 获取当前配置
  const trackedOrdersCopy = new Map(trackedSLTPOrders); // 使用副本进行操作
  if (trackedOrdersCopy.size === 0) {
    // console.log('[轮询] 没有跟踪的SL/TP订单。');
    isPolling = false;
    return;
  }
  const currentPositions = await getCurrentPositions(config);
  if (currentPositions === null) {
    console.error("[轮询] 无法获取当前仓位，跳过检查。");
    isPolling = false;
    return; // 如果无法获取仓位，则跳过检查
  }
  // 创建一个映射，用于快速查找当前仓位
  const positionMap = new Map();
  currentPositions.forEach(p => {
    // 对冲模式使用positionSide，单向模式使用金额确定side
    const positionSide = p.positionSide !== 'BOTH' ? p.positionSide : (new Decimal(p.positionAmt).gt(0) ? 'LONG' : (new Decimal(p.positionAmt).lt(0) ? 'SHORT' : 'BOTH'));
    // 处理金额为0的情况，side可能是BOTH或上一次持有的side
    const finalPositionSide = (positionSide === 'BOTH' && new Decimal(p.positionAmt).isZero()) ? 'NEUTRAL' : positionSide; // 如果金额为0且side为BOTH，使用NEUTRAL
    const key = `${p.symbol}_${finalPositionSide}`;
    positionMap.set(key, p);
  });
  // console.log('[轮询] 当前仓位映射键：', Array.from(positionMap.keys()));
  // console.log('[轮询] 跟踪订单键：', Array.from(trackedOrdersCopy.keys()));
  for (const [positionKey, orderInfo] of trackedOrdersCopy) {
    const currentPosition = positionMap.get(positionKey);
    const isPositionClosed = !currentPosition || new Decimal(currentPosition.positionAmt).isZero();
    // console.log(`[轮询] 检查${positionKey}：跟踪：是，当前仓位：${currentPosition ? currentPosition.positionAmt : '未找到'}，关闭：${isPositionClosed}`);
    if (isPositionClosed) {
      console.log(`[轮询] 仓位${positionKey}已关闭。发现孤儿订单SL：${orderInfo.slOrderId}，TP：${orderInfo.tpOrderId}。`);
      let slCancelled = false;
      let tpCancelled = false;
      // 取消SL
      if (orderInfo.slOrderId) {
        slCancelled = await cancelSingleOrder(config, orderInfo.symbol, orderInfo.slOrderId);
      } else {
        slCancelled = true; // 没有跟踪SL订单
      }
      // 取消TP
      if (orderInfo.tpOrderId) {
        tpCancelled = await cancelSingleOrder(config, orderInfo.symbol, orderInfo.tpOrderId);
      } else {
        tpCancelled = true; // 没有跟踪TP订单
      }
      // 如果两个取消都成功（或不需要），从跟踪中移除
      if (slCancelled && tpCancelled) {
        console.log(`[轮询] 成功处理${positionKey}的孤儿订单。从跟踪中移除。`);
        trackedSLTPOrders.delete(positionKey); // 从原始映射中移除
      } else {
        console.warn(`[轮询] 未能取消${positionKey}的一个或两个孤儿订单。将在下次轮询时重试。`);
        // 保留在映射中以重试取消
      }
    }
  }
  // console.log('[轮询] 检查完成。');
  isPolling = false;
}
// --- 结束：孤儿订单取消设置 ---

const requiredEnv = ['API_KEY', 'API_SECRET', 'TESTNET_API_KEY', 'TESTNET_API_SECRET', 'PORT'];
for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.error(`Missing environment variable: ${env}`);
    process.exit(1);
  }
}


// 获取网络配置
function getBinanceConfig() {
  const useTestnet = process.argv.includes('--testnet');
  const config = {
    baseURL: useTestnet
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com',
    apiKey: useTestnet
      ? process.env.TESTNET_API_KEY
      : process.env.API_KEY,
    apiSecret: useTestnet
      ? process.env.TESTNET_API_SECRET
      : process.env.API_SECRET
  };

  return config;
}

// 存储全局配置
app.set('binanceConfig', getBinanceConfig());

// 全局中间件
app.use(cors());
app.use(express.json());

// 路由注册
// app.use('/api/account', require('./api/account/balance'));
// app.use('/api/account', require('./api/account/risk'));
app.use('/api/account', require('./api/account/summary'));

app.use('/api/market', require('./api/market/klines'));
app.use('/api/market', require('./api/market/funding-rate'));

app.use('/api/order/open', require('./api/order/open/market'));
// app.use('/api/order/open', require('./api/order/open/limit'));
// app.use('/api/order/open', require('./api/order/open/stop'));

app.use('/api/order/close', require('./api/order/close/market'));
// app.use('/api/order/close', require('./api/order/close/limit'));
// app.use('/api/order/close', require('./api/order/close/conditional'));
// app.use('/api/order/active', require('./api/order/active'));
app.use('/api/order', require('./api/order/cancel'));
app.use('/api/order', require('./api/order/update'));

// app.use('/api/position', require('./api/position'));
app.use('/api/position', require('./api/position/leverage'));
app.use('/api/position', require('./api/position/margin-mode'));

// 统一错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.response?.status || 500;
  const message = err.response?.data?.msg || 'Internal Server Error';
  res.status(statusCode).json({ code: statusCode, msg: message, data: null });
});

// 启动服务器和轮询
app.listen(process.env.PORT, () => {
  const config = app.get('binanceConfig');
  console.log(`服务器运行在端口${process.env.PORT}`);
  console.log(`连接到${config.baseURL.includes('testnet') ? 'TESTNET' : 'MAINNET'}`);
  // 服务器启动后开始轮询
  console.log(`[轮询] 每${POLLING_INTERVAL_MS / 1000}秒检查孤儿订单。`);
  setInterval(pollAndCancelOrphanedOrders, POLLING_INTERVAL_MS);
  // 可选：启动时立即运行一次
  pollAndCancelOrphanedOrders();
});