require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// 全局中间件
app.use(cors());
app.use(express.json());

// 路由注册
app.use('/api/account', require('./api/account/balance'));
app.use('/api/account', require('./api/account/risk'));
app.use('/api/market', require('./api/market/klines'));
app.use('/api/market', require('./api/market/funding-rate'));

// 统一错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    code: 500,
    msg: 'Internal Server Error',
    data: null 
  });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
