以下是为币安U本位合约交易系统需要实现的完整操作清单，涵盖交易操作、订单管理、持仓管理、账户相关和市场数据的规划，可基于此设计API接口：

---

### **一、交易操作**
1. **开仓**
   - **市价开仓**
     `POST /api/order/open/market`
     ```json
     {
       "symbol": "BTCUSDT",
       "side": "BUY/SELL",
       "quantity": 0.01,
       "reduceOnly": false,
       "timeInForce": "GTC/IOC/FOK/GTX"
     }
     ```
   - **限价开仓**
     `POST /api/order/open/limit`
     ```json
     {
       "symbol": "BTCUSDT",
       "side": "BUY/SELL",
       "price": 42000,
       "quantity": 0.01,
       "takeProfit": 45000,
       "stopLoss": 40000
     }
     ```
   - **条件单开仓**
     `POST /api/order/open/stop`
     ```json
     {
       "symbol": "BTCUSDT",
       "side": "BUY/SELL",
       "type": "STOP_MARKET/STOP_LIMIT",
       "stopPrice": 42500,
       "triggerType": "PRICE/MARK_PRICE"
     }
     ```

2. **平仓**
   - **市价平仓**
     `POST /api/order/close/market`
     ```json
     {
       "symbol": "BTCUSDT",
       "positionSide": "LONG/SHORT"
     }
     ```
   - **限价平仓**
     `POST /api/order/close/limit`
     ```json
     {
       "symbol": "BTCUSDT",
       "price": 43000,
       "quantity": 0.01
     }
     ```
   - **条件单平仓**
     `POST /api/order/close/conditional`
     ```json
     {
       "symbol": "BTCUSDT",
       "type": "TAKE_PROFIT/STOP_LOSS",
       "triggerPrice": 44000
     }
     ```

3. **订单类型**
   - **OCO订单**
     `POST /api/order/oco`
     ```json
     {
       "orders": [
         {"type": "LIMIT", "price": 42500},
         {"type": "STOP_MARKET", "stopPrice": 41500}
       ],
       "correlationId": "oco-123"
     }

4. **批量操作**
   - **批量下单**
     `POST /api/order/batch`
     ```json
     {
       "orders": [
         {"type": "LIMIT", "price": 42000},
         {"type": "STOP_LIMIT", "stopPrice": 41000}
       ],
       "executionMode": "ATOMIC/BEST_EFFORT"
     }
     ```

---

### **二、订单管理**
1. **查询活动订单**
   `GET /api/order/active`
   ```json
   {
     "symbol": "BTCUSDT",
     "status": "NEW/PARTIALLY_FILLED"
   }
   ```

2. **修改未成交订单**
   `PATCH /api/order/{orderId}`
   ```json
   {
     "price": 42200,
     "quantity": 0.02
   }
   ```

3. **撤销单个订单**
   `DELETE /api/order/{orderId}`

4. **撤销全部订单**
   `DELETE /api/order/all`
   ```json
   {
     "symbol": "BTCUSDT"
   }
   ```

5. **查询订单状态**
   `GET /api/order/{orderId}/status`

---

### **三、持仓管理**
1. **查询当前持仓**
   `GET /api/position`
   ```json
   {
     "symbol": "BTCUSDT",
     "marginMode": "CROSS/ISOLATED"
   }
   ```

2. **调整保证金模式**
   `POST /api/position/margin/mode`
   ```json
   {
     "symbol": "BTCUSDT",
     "mode": "CROSS/ISOLATED"
   }
   ```

3. **调整持仓杠杆**
   `POST /api/position/leverage`
   ```json
   {
     "symbol": "BTCUSDT",
     "leverage": 100
   }
   ```

4. **自动追加保证金**
   `POST /api/position/margin/auto-add`
   ```json
   {
     "symbol": "BTCUSDT",
     "threshold": 0.1
   }
   ```

---

### **四、账户相关**
1. **查询账户余额**
   `GET /api/account/balance`
   ```json
   {
     "currency": "USDT"
   }
   ```

2. **查询风险指标**
   `GET /api/account/risk`
   ```json
   {
     "marginLevel": 0.85,
     "liquidationPrice": 41000
   }
   ```

---

### **五、市场数据接口**
1. **历史K线数据**
   `GET /api/market/klines`
   ```json
   {
     "symbol": "BTCUSDT",
     "interval": "1m",
     "limit": 1000
   }
   ```

3. **资金费率查询**
   `GET /api/market/funding-rate`
   ```json
   {
     "symbol": "BTCUSDT"
   }
   ```

---

基于核心功能依赖性和交易流程的逻辑顺序，以下是接口实现的优先级建议：

---

### **优先级评估（由高到低）**

#### **1. 账户相关接口（必需性：★★★★★）**
- **`GET /api/account/balance`**
  用户必须首先确认可用资金才能进行任何交易。
- **`GET /api/account/risk`**
  实时监控保证金水平和强平价格是风险管理的核心。

#### **2. 市场数据接口（必需性：★★★★★）**
- **`GET /api/market/klines`**
  交易决策依赖历史K线数据，需优先实现。
- **`GET /api/market/funding-rate`**
  U本位合约的资金费率直接影响持仓成本。

#### **3. 持仓管理基础配置（必需性：★★★★☆）**
- **`POST /api/position/leverage`**
  开仓前需设置杠杆倍数（例如默认杠杆可能不适用）。
- **`POST /api/position/margin/mode`**
  用户需明确选择全仓或逐仓模式，直接影响风险敞口。

#### **4. 基础交易操作（必需性：★★★★★）**
- **市价单**
  `POST /api/order/open/market`（开仓）
  `POST /api/order/close/market`（平仓）
  快速执行订单，满足即时交易需求。
- **限价单**
  `POST /api/order/open/limit`（开仓）
  `POST /api/order/close/limit`（平仓）
  精准控制价格，用户常用核心功能。

#### **5. 订单管理（必需性：★★★★☆）**
- **`GET /api/order/active`**
  实时跟踪未成交订单。
- **`DELETE /api/order/{orderId}`**
  快速撤销错误或过时订单，降低风险。
- **`PATCH /api/order/{orderId}`**
  动态调整订单参数（如价格和数量）。

#### **6. 持仓状态查询（必需性：★★★☆☆）**
- **`GET /api/position`**
  实时查看当前持仓方向和保证金占用。

#### **7. 高级订单类型（必需性：★★★☆☆）**
- **条件单**
  `POST /api/order/open/stop`（开仓）
  `POST /api/order/close/conditional`（平仓）
  实现止损止盈，进阶风险管理。
- **OCO订单**
  `POST /api/order/oco`
  组合订单降低手动操作频率。

#### **8. 批量操作与自动化（必需性：★★☆☆☆）**
- **`POST /api/order/batch`**
  适合机构用户批量交易。
- **`POST /api/position/margin/auto-add`**
  优化保证金使用效率，但需先完善基础风控。

---

### **开发顺序建议**
1. **第一阶段：账户与市场数据**
   实现账户余额、风险指标、K线和资金费率接口，为用户提供交易前的必要信息。

2. **第二阶段：持仓配置与基础交易**
   完成杠杆和保证金模式设置，随后开发市价单和限价单的开仓/平仓功能。

3. **第三阶段：订单管理与持仓查询**
   确保用户能监控和调整未成交订单，并查看当前持仓状态。

4. **第四阶段：高级功能迭代**
   逐步加入条件单、OCO等复杂逻辑，最后实现批量操作和自动化工具。

---

### **核心逻辑**
- **基础功能优先**：账户、市场数据和基础交易是系统的骨架，需优先搭建。
- **风险管理前置**：杠杆和保证金模式直接影响交易规则，需在开仓前完成。
- **用户体验递进**：先满足下单和撤单的刚需，再通过高级功能提升效率。

通过这一顺序，可快速上线最小可行产品（MVP），同时确保关键风险控制功能就位。

---

## 项目结构：

```
.
├── main.js
├── .env
├── api
│   ├── account
│   │   ├── balance.js
│   │   └── risk.js
│   ├── market
│   │   ├── funding-rate.js
│   │   └── klines.js
│   └── order
│       ├── close
│       │   └── market.js
│       └── open
│           └── market.js
```