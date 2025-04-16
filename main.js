require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

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
app.use('/api/account', require('./api/account/balance'));
app.use('/api/account', require('./api/account/risk'));

app.use('/api/market', require('./api/market/klines'));
app.use('/api/market', require('./api/market/funding-rate'));

app.use('/api/order/open', require('./api/order/open/market'));
app.use('/api/order/open', require('./api/order/open/limit'));
app.use('/api/order/open', require('./api/order/open/stop'));

app.use('/api/order/close', require('./api/order/close/market'));
app.use('/api/order/close', require('./api/order/close/limit'));
app.use('/api/order/close', require('./api/order/close/conditional'));
app.use('/api/order/active', require('./api/order/active'));
app.use('/api/order', require('./api/order/cancel'));
app.use('/api/order', require('./api/order/update'));

app.use('/api/position', require('./api/position'));
app.use('/api/position', require('./api/position/leverage'));
app.use('/api/position', require('./api/position/margin-mode'));

// 统一错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.response?.status || 500;
  const message = err.response?.data?.msg || 'Internal Server Error';
  res.status(statusCode).json({ code: statusCode, msg: message, data: null });
});

app.listen(process.env.PORT, () => {
  const config = app.get('binanceConfig');
  console.log(`Server running on port ${process.env.PORT}`);
  console.log(`Connected to ${config.baseURL.includes('testnet') ? 'TESTNET' : 'MAINNET'}`);
});