// main.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs'); // 使用 qs 处理查询字符串
const { Decimal } = require('decimal.js'); // 引入 Decimal

const app = express();

// --- Decimal.js 配置 ---
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// --- 安全初始化 Decimal 的辅助函数 ---
const safeDecimal = (value, fallback = 0) => {
    try {
        // 检查是否为有效的数字或字符串表示
        if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
            // console.warn(`无效的 Decimal 输入 (${value}), 使用默认值 ${fallback}`);
            return new Decimal(fallback);
        }
        return new Decimal(value);
    } catch (e) {
        console.error(`Decimal 初始化错误，值 "${value}": ${e.message}, 使用默认值 ${fallback}`);
        return new Decimal(fallback);
    }
};


// --- 开始：孤儿订单取消设置 ---
// 内存存储，用于跟踪与仓位关联的SL/TP订单 (可选，主要用于日志或额外逻辑)
// 结构：Map<positionKey（例如，'BTCUSDT_LONG'），{ slOrderId: string, tpOrderId: string, symbol: string }>
const trackedSLTPOrders = new Map();
app.locals.trackedSLTPOrders = trackedSLTPOrders; // 通过app.locals使存储可访问

const POLLING_INTERVAL_MS = 15000; // 每 15 秒检查一次（根据需要调整）
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

// 辅助函数：获取当前仓位风险信息 (获取所有，包括0仓位)
async function getCurrentPositions(config) {
  const timestamp = Date.now();
  const params = { timestamp };
  // 使用 qs 生成排序的查询字符串
  const queryString = qs.stringify(params, { sort: (a, b) => a.localeCompare(b) });
  const signature = crypto.createHmac('sha256', config.apiSecret).update(queryString).digest('hex');
  try {
    const response = await axios.get(`${config.baseURL}/fapi/v2/positionRisk`, {
      headers: { 'X-MBX-APIKEY': config.apiKey },
      params: { ...params, signature },
      timeout: 5000
    });
    return response.data; // 返回所有仓位信息
  } catch (error) {
    console.error('[轮询] 获取仓位风险信息时出错：', error.response?.data || error.message);
    return null; // 表示出错
  }
}

// 辅助函数：获取所有当前挂单（包括条件订单）
async function getAllOpenOrders(config) {
  const timestamp = Date.now();
  const params = { timestamp };
  // 重要：查询所有挂单时，签名需要基于参数（这里只有 timestamp）
  // 使用 URLSearchParams 来确保一致的、排序的查询字符串
  const orderedParams = new URLSearchParams(
    Object.entries(params)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, v.toString()])
  ).toString();

  const signature = crypto
    .createHmac('sha256', config.apiSecret)
    .update(orderedParams)
    .digest('hex');

  // 构建请求 URL
  const requestURL = `${config.baseURL}/fapi/v1/openOrders?${orderedParams}&signature=${signature}`;
  // console.log(`[轮询] 获取所有挂单 URL: ${requestURL}`); // Debugging

  try {
    const response = await axios.get(requestURL, {
      headers: { 'X-MBX-APIKEY': config.apiKey },
      timeout: 5000 // 设置超时
    });
    // console.log(`[轮询] 成功获取 ${response.data.length} 个挂单。`); // Debugging
    return response.data; // 返回所有挂单数组
  } catch (error) {
    console.error('[轮询] 获取所有挂单时出错：', error.response?.data || error.message);
    return null; // 表示出错
  }
}


// 辅助函数：取消单个订单
async function cancelSingleOrder(config, symbol, orderId) {
  const timestamp = Date.now();
  const params = {
    symbol: symbol.toUpperCase(),
    orderId: orderId, // API 需要数字类型
    timestamp
  };

  // 确保 orderId 为整数（基于 cancel.js 的逻辑）
  if (typeof params.orderId === 'string' && /^\d+$/.test(params.orderId)) {
    params.orderId = parseInt(params.orderId);
  } else if (typeof params.orderId !== 'number') {
    console.error(`[轮询] 无效的订单ID类型，无法取消: ${orderId}`);
    return false; // 无法取消
  }

  // 使用 URLSearchParams 以保持与 cancel.js 的签名一致性
  const orderedParams = new URLSearchParams(
    Object.entries(params)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, v.toString()])
  ).toString();

  const signature = crypto.createHmac('sha256', config.apiSecret).update(orderedParams).digest('hex');
  const requestURL = `${config.baseURL}/fapi/v1/order?${orderedParams}&signature=${signature}`;
  // console.log(`[轮询] 取消订单 URL: ${requestURL}`); // Debugging

  try {
    // console.log(`[轮询] 尝试取消 ${symbol} 的订单 ${orderId}`); // Debugging
    const response = await axios.delete(requestURL, {
      headers: { 'X-MBX-APIKEY': config.apiKey },
      timeout: 5000 // 设置超时
    });
    console.log(`[轮询] 成功取消 ${symbol} 的订单 ${orderId}。状态：${response.data?.status}`);
    return true;
  } catch (error) {
    // 忽略“订单不存在”错误（-2011），因为该订单可能已被成交/手动取消/系统取消
    if (error.response?.data?.code === -2011) {
      console.log(`[轮询] ${symbol} 的订单 ${orderId} 已不存在 (可能已成交或已被取消)。`);
      return true; // 视为成功处理（订单已消失）
    }
    // 忽略“未知订单发送”错误（-2013），这通常也意味着订单不在活动状态
     if (error.response?.data?.code === -2013) {
      console.log(`[轮询] ${symbol} 的订单 ${orderId} 未知或非活动状态。`);
      return true; // 视为成功处理
    }
    console.error(`[轮询] 取消 ${symbol} 的订单 ${orderId} 时出错：`, error.response?.data || error.message);
    return false; // 表示取消失败
  }
}

// 轮询函数逻辑 (修改后)
async function pollAndCancelOrphanedOrders() {
  if (isPolling) {
    return;
  }
  isPolling = true;
  // console.log('[轮询] 检查孤儿条件订单...'); // 更新日志消息

  const config = getBinanceConfigInternal(); // 获取当前配置

  // 1. 并行获取当前所有仓位和所有挂单
  let currentPositions = null;
  let allOpenOrders = null;
  try {
    [currentPositions, allOpenOrders] = await Promise.all([
        getCurrentPositions(config),
        getAllOpenOrders(config)
    ]);
  } catch (fetchError) {
      console.error("[轮询] 获取仓位或挂单时发生初始错误:", fetchError.message);
      isPolling = false;
      return; // 无法获取必要信息，退出本次轮询
  }


  // 检查获取结果
  if (currentPositions === null || allOpenOrders === null) {
    console.error("[轮询] 无法获取当前仓位或所有挂单，跳过检查。");
    isPolling = false;
    return;
  }

  if (allOpenOrders.length === 0) {
    // console.log('[轮询] 没有发现当前挂单。');
    isPolling = false;
    return;
  }

  // 2. 创建当前活动仓位的映射 (只包含有持仓量的)
  const activePositionMap = new Map();
  currentPositions.forEach(p => {
    const positionAmt = safeDecimal(p.positionAmt); // 使用 safeDecimal 处理
    if (!positionAmt.isZero()) { // 只关心实际有持仓的
      // 确定仓位方向 (对冲模式优先使用 positionSide，否则根据数量判断)
      let side = 'NEUTRAL';
      if (p.positionSide && p.positionSide !== 'BOTH') {
          side = p.positionSide; // 来自API (LONG/SHORT)
      } else if (!positionAmt.isZero()) {
          side = positionAmt.gt(0) ? 'LONG' : 'SHORT';
      }
      // 对于持仓量不为0的情况，side 不应为 NEUTRAL
      if (side !== 'NEUTRAL') {
        const key = `${p.symbol}_${side}`;
        activePositionMap.set(key, p);
        // console.log(`[轮询] 添加活动仓位映射: ${key}, Amount: ${positionAmt.toString()}`); // Debugging
      }
    }
  });
  // console.log('[轮询] 活动仓位映射键:', Array.from(activePositionMap.keys())); // Debugging


  // 3. 遍历所有挂单，查找需要取消的条件订单
  const relevantOrderTypes = ['STOP_MARKET', 'TAKE_PROFIT_MARKET', 'STOP', 'TAKE_PROFIT']; // 包含限价止盈止损
  let cancelPromises = [];

  for (const order of allOpenOrders) {
    // 只处理条件订单类型，并且是为平仓设置的 (closePosition: true 或类型本身隐含)
    const isRelevantType = relevantOrderTypes.includes(order.type);
    // 假设这些相关类型都是为了平仓，或者显式标记了 closePosition
    const isClosingOrder = order.closePosition === true || isRelevantType;

    if (isRelevantType && isClosingOrder) {
      // 确定该订单对应的仓位方向
      // 如果订单是 SELL，它用于关闭 LONG 仓位
      // 如果订单是 BUY， 它用于关闭 SHORT 仓位
      const positionSideToClose = order.side === 'SELL' ? 'LONG' : 'SHORT';
      const positionKey = `${order.symbol}_${positionSideToClose}`;

      // console.log(`[轮询] 检查订单: ${order.symbol} ${order.type} ${order.side} (ID: ${order.orderId}), 关联仓位Key: ${positionKey}`); // Debugging

      // 检查对应的活动仓位是否存在于映射中
      if (!activePositionMap.has(positionKey)) {
        // 如果活动仓位映射中没有这个 key，说明该仓位已关闭
        console.log(`[轮询] 发现孤儿订单: ${order.symbol} ${positionSideToClose} (类型: ${order.type}, 方向: ${order.side}, ID: ${order.orderId})，对应仓位已关闭。尝试取消...`);
        // 添加取消任务到 Promise 数组
        cancelPromises.push(cancelSingleOrder(config, order.symbol, order.orderId));
      }
    }
  }

  // 4. 等待所有取消任务完成
  if (cancelPromises.length > 0) {
      console.log(`[轮询] 开始执行 ${cancelPromises.length} 个取消任务...`);
      await Promise.all(cancelPromises);
      console.log(`[轮询] ${cancelPromises.length} 个取消任务执行完毕。`);
  } else {
      // console.log("[轮询] 没有需要取消的孤儿条件订单。");
  }


  // 5. 清理 trackedSLTPOrders 中已不存在的仓位对应的条目 (可选，但推荐)
  //   这一步确保即使取消失败，下次也不会再尝试取消已经被API清理的订单
  const trackedOrdersCopy = new Map(trackedSLTPOrders); // 操作副本
  for (const [positionKey, orderInfo] of trackedOrdersCopy) {
      if (!activePositionMap.has(positionKey)) {
          // 如果跟踪的仓位 key 不在当前的活动仓位中，则从跟踪列表移除
          console.log(`[轮询] 清理跟踪列表：移除已关闭仓位 ${positionKey} 的跟踪信息。`);
          trackedSLTPOrders.delete(positionKey); // 从原始 Map 中删除
      }
  }


  // console.log('[轮询] 检查完成。');
  isPolling = false;
}
// --- 结束：孤儿订单取消设置 ---


// --- 环境变量检查 ---
const requiredEnv = ['API_KEY', 'API_SECRET', 'TESTNET_API_KEY', 'TESTNET_API_SECRET', 'PORT'];
for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.error(`缺少环境变量: ${env}`);
    process.exit(1);
  }
}


// --- 获取全局配置 ---
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

// --- 全局中间件 ---
app.use(cors());
app.use(express.json()); // 用于解析 JSON 请求体

// --- 路由注册 ---
// 注意：确保这里的路径与你的文件结构匹配
// Account routes
app.use('/api/account', require('./api/account/summary'));

// Market routes
app.use('/api/market', require('./api/market/klines'));
app.use('/api/market', require('./api/market/funding-rate'));

// Order routes
app.use('/api/order/open', require('./api/order/open/market'));
app.use('/api/order/close', require('./api/order/close/market'));
app.use('/api/order', require('./api/order/cancel'));
app.use('/api/order', require('./api/order/update'));

// Position routes
app.use('/api/position', require('./api/position/leverage'));
app.use('/api/position', require('./api/position/margin-mode'));


// --- 统一错误处理中间件 ---
app.use((err, req, res, next) => {
  console.error("全局错误处理:", err.stack); // 打印完整的错误堆栈
  const statusCode = err.response?.status || err.status || 500; // 优先使用响应状态码或自定义状态码
  const message = err.response?.data?.msg || err.message || '服务器内部错误'; // 优先使用币安错误信息
  const code = err.response?.data?.code || statusCode; // 优先使用币安错误代码
  res.status(statusCode).json({ code: code, msg: message, data: null });
});

// --- 启动服务器和轮询 ---
const PORT = process.env.PORT || 3000; // 使用环境变量或默认端口
app.listen(PORT, () => {
  const config = app.get('binanceConfig');
  console.log(`API 服务器运行在端口 ${PORT}`);
  console.log(`连接到: ${config.baseURL.includes('testnet') ? '币安测试网 (Testnet)' : '币安主网 (Mainnet)'}`);

  // 服务器启动后开始轮询
  console.log(`[轮询] 每隔 ${POLLING_INTERVAL_MS / 1000} 秒检查一次孤儿条件订单。`);
  setInterval(pollAndCancelOrphanedOrders, POLLING_INTERVAL_MS);

  // 可选：启动时立即运行一次检查
  console.log('[轮询] 启动时立即执行一次检查...');
  pollAndCancelOrphanedOrders();
});