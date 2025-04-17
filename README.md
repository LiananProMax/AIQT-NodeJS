---
title: AIQT
language_tabs:
  - shell: Shell
  - http: HTTP
  - javascript: JavaScript
  - ruby: Ruby
  - python: Python
  - php: PHP
  - java: Java
  - go: Go
toc_footers: []
includes: []
search: true
code_clipboard: true
highlight_theme: darkula
headingLevel: 2
generator: "@tarslib/widdershins v4.0.30"

---

# AIQT

Base URLs:

# Authentication

# account

## GET 账户综合信息查询

GET /api/account/summary

## **基本信息**

* **接口名称**: 获取账户综合信息
* **请求方法**: `GET`
* **请求路径**: `/api/account/summary`
* **鉴权方式**: `API-KEY` 签名验证
* **数据格式**: `JSON`

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|symbol|query|string| 否 |交易对标识符，用于过滤持仓和活动订单|
|showZero|query|boolean| 否 |是否显示数量为零的持仓 (传入 "true")|

> 返回示例

> 200 Response

```json
{
  "code": 200,
  "msg": "Success",
  "data": {
    "accountInfo": {
      "totalWalletBalance": 14581.98823184,
      "totalUnrealizedProfit": -0.1654,
      "totalMarginBalance": 14581.82283184,
      "totalPositionInitialMargin": 84.3491,
      "totalOpenOrderInitialMargin": 0,
      "availableBalance": 14497.46533184,
      "maxWithdrawAmount": 14497.46533184,
      "isHedgeMode": false,
      "updateTime": 0
    },
    "balances": [
      {
        "currency": "FDUSD",
        "balance": 0,
        "available": 0,
        "unrealizedPnl": 0
      },
      {
        "currency": "BNB",
        "balance": 0,
        "available": 0,
        "unrealizedPnl": 0
      },
      {
        "currency": "ETH",
        "balance": 0,
        "available": 0,
        "unrealizedPnl": 0
      },
      {
        "currency": "BTC",
        "balance": 0,
        "available": 0,
        "unrealizedPnl": 0
      },
      {
        "currency": "USDT",
        "balance": 14581.98823184,
        "available": 14497.46533184,
        "unrealizedPnl": -0.1654
      },
      {
        "currency": "USDC",
        "balance": 0,
        "available": 0,
        "unrealizedPnl": 0
      }
    ],
    "positions": [
      {
        "symbol": "BTCUSDT",
        "positionSide": "BOTH",
        "direction": "LONG",
        "marginType": "CROSS",
        "leverage": 2,
        "quantity": 0.002,
        "entryPrice": 84431.8,
        "markPrice": 0,
        "liquidationPrice": 41878.17,
        "marginUsed": 84.3491,
        "unrealizedPnl": 0,
        "roe": 0
      }
    ],
    "activeOrders": [
      {
        "orderId": 4343683010,
        "symbol": "BTCUSDT",
        "positionSide": "BOTH",
        "price": 0,
        "origQty": 0,
        "executedQty": 0,
        "status": "NEW",
        "type": "STOP_MARKET",
        "side": "SELL",
        "time": 1744880031424,
        "stopPrice": 80239.6,
        "workingType": "MARK_PRICE"
      },
      {
        "orderId": 4343683008,
        "symbol": "BTCUSDT",
        "positionSide": "BOTH",
        "price": 0,
        "origQty": 0,
        "executedQty": 0,
        "status": "NEW",
        "type": "TAKE_PROFIT_MARKET",
        "side": "SELL",
        "time": 1744880031424,
        "stopPrice": 86996.63,
        "workingType": "MARK_PRICE"
      }
    ]
  }
}
```

```json
{
  "code": 401,
  "msg": "Invalid API key",
  "data": null
}
```

```json
{
  "code": -1022,
  "msg": "Signature for this request is not valid.",
  "data": null
}
```

> 500 Response

```json
{
  "code": 500,
  "// 或具体的 Binance 错误码 \"msg\"": "Failed to fetch initial data: <具体错误信息>",
  "// 可能包含来自 Binance 的消息 \"data\"": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|none|Inline|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» accountInfo|object|true|none||账户的通用概览信息|
|»»» totalWalletBalance|number|true|none||总钱包余额（所有资产以计价货币计算的总和）|
|»»» totalUnrealizedProfit|number|true|none||所有持仓的总未实现盈亏|
|»»» totalMarginBalance|number|true|none||总保证金余额 (WalletBalance + UnrealizedPNL)|
|»»» totalPositionInitialMargin|number|true|none||所有持仓占用的总初始保证金|
|»»» totalOpenOrderInitialMargin|number|true|none||所有挂单占用的总初始保证金|
|»»» availableBalance|number|true|none||可用于开仓或划转的余额|
|»»» maxWithdrawAmount|number|true|none||最大可提现金额|
|»»» isHedgeMode|boolean|true|none||账户是否为对冲模式|
|»»» updateTime|number|true|none||账户信息更新时的 Unix 时间戳 (毫秒)|
|»» balances|[object]|true|none||各资产的余额信息列表|
|»»» currency|string|true|none||资产（币种）代码，例如 "USDT"|
|»»» balance|number|true|none||该资产的总余额（含冻结/占用）|
|»»» available|number|true|none||该资产的可用余额|
|»»» unrealizedPnl|number|true|none||该资产相关的持仓的未实现盈亏|
|»» positions|[object]|true|none||当前持仓信息列表|
|»»» symbol|string|false|none||交易对标识符，例如 "BTCUSDT"|
|»»» positionSide|string|false|none||持仓方向 (来自 API: 'BOTH', 'LONG', 'SHORT')|
|»»» direction|string|false|none||计算得出的持仓方向 ('LONG', 'SHORT', 'NEUTRAL')|
|»»» marginType|string|false|none||保证金模式 ('ISOLATED', 'CROSS')|
|»»» leverage|integer|false|none||当前杠杆倍数|
|»»» quantity|number|false|none||持仓数量 (始终为正数)|
|»»» entryPrice|number|false|none||开仓均价|
|»»» markPrice|integer|false|none||当前标记价格|
|»»» liquidationPrice|number|false|none||预估强平价格 (全仓模式下为估算值，隔离模式下相对准确)|
|»»» marginUsed|number|false|none||当前持仓使用的保证金 (隔离模式下为隔离保证金，全仓模式下为估算值)|
|»»» unrealizedPnl|integer|false|none||未实现盈亏|
|»»» roe|integer|false|none||回报率（Return on Equity），百分比形式 (%)|
|»» activeOrders|[object]|true|none||当前活动（挂单）订单列表|
|»»» orderId|integer|true|none||订单系统 ID|
|»»» symbol|string|true|none||交易对标识符|
|»»» positionSide|string|true|none||单关联的持仓方向 ('BOTH', 'LONG', 'SHORT')|
|»»» price|number|true|none||委托价格 (市价单为 0)|
|»»» origQty|number|true|none||原始委托数量|
|»»» executedQty|number|true|none||已成交数量|
|»»» status|string|true|none||订单状态 (e.g., 'NEW', 'PARTIALLY_FILLED')|
|»»» type|string|true|none||订单类型 (e.g., 'LIMIT', 'MARKET', 'STOP')|
|»»» side|string|true|none||订单方向 ('BUY', 'SELL')|
|»»» time|string|true|none||订单创建时间戳 (毫秒)|
|»»» stopPrice|number|true|none||none|
|»»» workingType|string|true|none||none|

状态码 **401**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

状态码 **500**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||或具体的 Binance 错误码|
|» msg|string|true|none||可能包含来自 Binance 的消息|
|» data|null|true|none||none|

# market

## GET K线历史数据

GET /api/market/klines

# **K线历史数据**

## **基本信息**
- **接口名称**: 获取K线数据
- **请求方法**: `GET`
- **请求路径**: `/api/market/klines`
- **鉴权方式**: `API-KEY`签名验证
- **数据格式**: `JSON`

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|symbol|query|string| 是 |交易对符号（基础币+报价币）|
|interval|query|string| 否 |K线间隔（支持标准Binance间隔）|
|limit|query|number| 否 |返回数据条数（最大值1000）|

> 返回示例

> 200 Response

```json
{
  "code": 200,
  "msg": "Success",
  "data": {
    "symbol": "BTCUSDT",
    "interval": "1h",
    "klines": [
      {
        "time": 1672502400000,
        "open": 16500.5,
        "high": 16580.2,
        "low": 16490.1,
        "close": 16575.3,
        "volume": 1250.42,
        "closeTime": 1672505999999,
        "quoteVolume": 20695642.58
      }
    ]
  }
}
```

> 400 Response

```json
{
  "code": 400,
  "msg": "Invalid interval.",
  "data": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» symbol|string|true|none||none|
|»» interval|string|true|none||none|
|»» klines|[object]|true|none||none|
|»»» time|integer|false|none||K线开盘时间（毫秒）|
|»»» open|number|false|none||开盘价|
|»»» high|number|false|none||最高价|
|»»» low|number|false|none||最低价|
|»»» close|number|false|none||收盘价|
|»»» volume|number|false|none||基础币成交量|
|»»» closeTime|integer|false|none||K线收盘时间（毫秒）|
|»»» quoteVolume|number|false|none||报价币成交量|

状态码 **400**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

## GET 资金费率查询

GET /api/market/funding-rate

# **资金费率查询**

## **基本信息**
- **接口名称**: 获取资金费率信息
- **请求方法**: `GET`
- **请求路径**: `/api/market/funding-rate`
- **鉴权方式**: `API-KEY`签名验证
- **数据格式**: `JSON`

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|symbol|query|string| 是 |查询的交易对|
|limit|query|integer| 否 |返回的历史记录数量（1-1000）|

> 返回示例

```json
{
  "code": 200,
  "msg": "Success",
  "data": {
    "symbol": "BTCUSDT",
    "currentRate": {
      "rate": 0.00012,
      "time": 1620000000000,
      "nextFundingTime": 1620003600000
    }
  }
}
```

```json
{
  "code": 200,
  "msg": "Success",
  "data": {
    "symbol": "BTCUSDT",
    "currentRate": {
      "rate": 0.00005802,
      "time": 1744475854000,
      "nextFundingTime": 1744502400000
    },
    "historyRates": [
      {
        "rate": 0.00003654,
        "time": 1744416000000,
        "realized": 3.654e-9
      },
      {
        "rate": 0.0000564,
        "time": 1744444800001,
        "realized": 5.64e-9
      },
      {
        "rate": 0.00005388,
        "time": 1744473600000,
        "realized": 5.388e-9
      }
    ]
  }
}
```

```json
{
  "code": 400,
  "msg": "Symbol parameter is required",
  "data": null
}
```

```json
{
  "code": 400,
  "msg": "Invalid symbol",
  "data": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» symbol|string|true|none||查询的交易对|
|»» currentRate|object|true|none||当前资金费率信息|
|»»» rate|number|true|none||费率值（正值表示多头支付空头，负值相反）|
|»»» time|integer|true|none||当前费率计算时间戳|
|»»» nextFundingTime|integer|true|none||下次资金结算时间戳|

状态码 **400**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

# order

## DELETE 取消订单

DELETE /api/order/{orderId}

## **基本信息**
- **接口名称**: 撤销指定订单
- **请求方法**: `DELETE`
- **请求路径**: `/api/order/{orderId}`
- **鉴权方式**: `API-KEY`签名验证
- **数据格式**: `JSON`

> Body 请求参数

```json
{}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|orderId|path|integer| 是 |订单ID|
|symbol|query|string| 是 |交易对名称|
|body|body|object| 否 |none|

> 返回示例

> 200 Response

```json
{
  "code": 200,
  "msg": "Order canceled",
  "data": {
    "orderId": 4330366753,
    "status": "CANCELED"
  }
}
```

> 404 Response

```json
{
  "code": 404,
  "msg": "Order does not exist",
  "data": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» orderId|integer|true|none||none|
|»» status|string|true|none||none|

状态码 **404**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

## PATCH 修改订单

PATCH /api/order/{orderId}

## **基本信息**
- **接口名称**: 更新订单参数
- **请求方法**: `PATCH`
- **请求路径**: `/api/order/{orderId}`
- **鉴权方式**: `API-KEY`签名验证
- **数据格式**: `JSON`

> Body 请求参数

```json
{
  "symbol": "BTCUSDT",
  "price": 41500,
  "quantity": 0.15
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|orderId|path|integer| 是 |订单ID|
|body|body|object| 否 |none|
|» symbol|body|string| 是 |交易对名称|
|» price|body|number| 是 |新价格 (限价单必填)|
|» quantity|body|number| 是 |新数量|
|» side|body|string| 是 |原订单方向|

> 返回示例

> 200 Response

```json
{
  "code": 200,
  "msg": "Order updated",
  "data": {
    "orderId": 4330503873,
    "symbol": "BTCUSDT",
    "status": "NEW",
    "clientOrderId": "web_9sHDXuo5nvX7gZ0aqR5Z",
    "price": "87000.10",
    "avgPrice": "0.00",
    "origQty": "0.030",
    "executedQty": "0.000",
    "cumQty": "0.000",
    "cumQuote": "0.00000",
    "timeInForce": "GTC",
    "type": "LIMIT",
    "reduceOnly": false,
    "closePosition": false,
    "side": "SELL",
    "positionSide": "BOTH",
    "stopPrice": "0.00",
    "workingType": "CONTRACT_PRICE",
    "priceProtect": false,
    "origType": "LIMIT",
    "priceMatch": "NONE",
    "selfTradePreventionMode": "EXPIRE_MAKER",
    "goodTillDate": 0,
    "updateTime": 1744554489753
  }
}
```

```json
{
  "code": 400,
  "msg": "Missing symbol, orderId, or side",
  "data": null
}
```

```json
{
  "code": -4028,
  "msg": "Order price out of range",
  "data": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» orderId|integer|true|none||none|
|»» symbol|string|true|none||none|
|»» status|string|true|none||none|
|»» clientOrderId|string|true|none||none|
|»» price|string|true|none||none|
|»» avgPrice|string|true|none||none|
|»» origQty|string|true|none||none|
|»» executedQty|string|true|none||none|
|»» cumQty|string|true|none||none|
|»» cumQuote|string|true|none||none|
|»» timeInForce|string|true|none||none|
|»» type|string|true|none||none|
|»» reduceOnly|boolean|true|none||none|
|»» closePosition|boolean|true|none||none|
|»» side|string|true|none||none|
|»» positionSide|string|true|none||none|
|»» stopPrice|string|true|none||none|
|»» workingType|string|true|none||none|
|»» priceProtect|boolean|true|none||none|
|»» origType|string|true|none||none|
|»» priceMatch|string|true|none||none|
|»» selfTradePreventionMode|string|true|none||none|
|»» goodTillDate|integer|true|none||none|
|»» updateTime|integer|true|none||none|

状态码 **400**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

# order/open

## POST 市价开仓

POST /api/order/open/market

# **市价开仓**

## **基本信息**
- **接口名称**: 市价开仓
- **请求方法**: `POST`
- **请求路径**: `/api/order/open/market`
- **鉴权方式**: `API-KEY`签名验证
- **数据格式**: `JSON`

> Body 请求参数

```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": 0.001,
  "reduceOnly": false
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|body|body|object| 否 |none|
|» symbol|body|string| 是 |交易对符号|
|» side|body|string| 是 |买卖方向 (BUY/SELL)|
|» quantity|body|number| 是 |下单数量（精度4位小数）|
|» reduceOnly|body|boolean| 否 |是否只减仓（true=仅平仓，false=可开仓）|
|» stopLoss|body|string| 是 |止损|
|» takeProfit|body|string| 是 |止盈|

> 返回示例

> 200 Response

```json
{
  "code": 200,
  "msg": "订单提交成功",
  "data": {
    "market": {
      "orderId": 4343683009,
      "symbol": "BTCUSDT",
      "status": "NEW",
      "clientOrderId": "x-1744880030311-ifu8r-M",
      "price": "0.00",
      "avgPrice": "0.00",
      "origQty": "0.002",
      "executedQty": "0.000",
      "cumQty": "0.000",
      "cumQuote": "0.00000",
      "timeInForce": "GTC",
      "type": "MARKET",
      "reduceOnly": false,
      "closePosition": false,
      "side": "BUY",
      "positionSide": "BOTH",
      "stopPrice": "0.00",
      "workingType": "CONTRACT_PRICE",
      "priceProtect": false,
      "origType": "MARKET",
      "priceMatch": "NONE",
      "selfTradePreventionMode": "EXPIRE_MAKER",
      "goodTillDate": 0,
      "updateTime": 1744880031424
    },
    "stopLoss": {
      "orderId": 4343683010,
      "symbol": "BTCUSDT",
      "status": "NEW",
      "clientOrderId": "x-1744880030311-ifu8r-SL",
      "price": "0.00",
      "avgPrice": "0.00",
      "origQty": "0.000",
      "executedQty": "0.000",
      "cumQty": "0.000",
      "cumQuote": "0.00000",
      "timeInForce": "GTC",
      "type": "STOP_MARKET",
      "reduceOnly": true,
      "closePosition": true,
      "side": "SELL",
      "positionSide": "BOTH",
      "stopPrice": "80239.60",
      "workingType": "MARK_PRICE",
      "priceProtect": false,
      "origType": "STOP_MARKET",
      "priceMatch": "NONE",
      "selfTradePreventionMode": "EXPIRE_MAKER",
      "goodTillDate": 0,
      "updateTime": 1744880031424
    },
    "takeProfit": {
      "orderId": 4343683008,
      "symbol": "BTCUSDT",
      "status": "NEW",
      "clientOrderId": "x-1744880030311-ifu8r-TP",
      "price": "0.00",
      "avgPrice": "0.00",
      "origQty": "0.000",
      "executedQty": "0.000",
      "cumQty": "0.000",
      "cumQuote": "0.00000",
      "timeInForce": "GTC",
      "type": "TAKE_PROFIT_MARKET",
      "reduceOnly": true,
      "closePosition": true,
      "side": "SELL",
      "positionSide": "BOTH",
      "stopPrice": "86996.63",
      "workingType": "MARK_PRICE",
      "priceProtect": false,
      "origType": "TAKE_PROFIT_MARKET",
      "priceMatch": "NONE",
      "selfTradePreventionMode": "EXPIRE_MAKER",
      "goodTillDate": 0,
      "updateTime": 1744880031424
    }
  }
}
```

> 400 Response

```json
{
  "code": 0,
  "msg": "string",
  "data": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|none|Inline|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» market|object|true|none||none|
|»»» orderId|integer|true|none||none|
|»»» symbol|string|true|none||none|
|»»» status|string|true|none||none|
|»»» clientOrderId|string|true|none||none|
|»»» price|string|true|none||none|
|»»» avgPrice|string|true|none||none|
|»»» origQty|string|true|none||none|
|»»» executedQty|string|true|none||none|
|»»» cumQty|string|true|none||none|
|»»» cumQuote|string|true|none||none|
|»»» timeInForce|string|true|none||none|
|»»» type|string|true|none||none|
|»»» reduceOnly|boolean|true|none||none|
|»»» closePosition|boolean|true|none||none|
|»»» side|string|true|none||none|
|»»» positionSide|string|true|none||none|
|»»» stopPrice|string|true|none||none|
|»»» workingType|string|true|none||none|
|»»» priceProtect|boolean|true|none||none|
|»»» origType|string|true|none||none|
|»»» priceMatch|string|true|none||none|
|»»» selfTradePreventionMode|string|true|none||none|
|»»» goodTillDate|integer|true|none||none|
|»»» updateTime|integer|true|none||none|
|»» stopLoss|object|true|none||none|
|»»» orderId|integer|true|none||none|
|»»» symbol|string|true|none||none|
|»»» status|string|true|none||none|
|»»» clientOrderId|string|true|none||none|
|»»» price|string|true|none||none|
|»»» avgPrice|string|true|none||none|
|»»» origQty|string|true|none||none|
|»»» executedQty|string|true|none||none|
|»»» cumQty|string|true|none||none|
|»»» cumQuote|string|true|none||none|
|»»» timeInForce|string|true|none||none|
|»»» type|string|true|none||none|
|»»» reduceOnly|boolean|true|none||none|
|»»» closePosition|boolean|true|none||none|
|»»» side|string|true|none||none|
|»»» positionSide|string|true|none||none|
|»»» stopPrice|string|true|none||none|
|»»» workingType|string|true|none||none|
|»»» priceProtect|boolean|true|none||none|
|»»» origType|string|true|none||none|
|»»» priceMatch|string|true|none||none|
|»»» selfTradePreventionMode|string|true|none||none|
|»»» goodTillDate|integer|true|none||none|
|»»» updateTime|integer|true|none||none|
|»» takeProfit|object|true|none||none|
|»»» orderId|integer|true|none||none|
|»»» symbol|string|true|none||none|
|»»» status|string|true|none||none|
|»»» clientOrderId|string|true|none||none|
|»»» price|string|true|none||none|
|»»» avgPrice|string|true|none||none|
|»»» origQty|string|true|none||none|
|»»» executedQty|string|true|none||none|
|»»» cumQty|string|true|none||none|
|»»» cumQuote|string|true|none||none|
|»»» timeInForce|string|true|none||none|
|»»» type|string|true|none||none|
|»»» reduceOnly|boolean|true|none||none|
|»»» closePosition|boolean|true|none||none|
|»»» side|string|true|none||none|
|»»» positionSide|string|true|none||none|
|»»» stopPrice|string|true|none||none|
|»»» workingType|string|true|none||none|
|»»» priceProtect|boolean|true|none||none|
|»»» origType|string|true|none||none|
|»»» priceMatch|string|true|none||none|
|»»» selfTradePreventionMode|string|true|none||none|
|»»» goodTillDate|integer|true|none||none|
|»»» updateTime|integer|true|none||none|

状态码 **400**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

状态码 **401**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

# order/close

## POST 市价平仓

POST /api/order/close/market

# **市价平仓**

## **基本信息**
- **接口名称**: 市价平仓
- **请求方法**: `POST`
- **请求路径**: `/api/order/close/market`
- **鉴权方式**: `API-KEY`签名验证
- **数据格式**: `JSON`

> Body 请求参数

```json
{
  "symbol": "BTCUSDT",
  "positionSide": "LONG"
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|body|body|object| 否 |none|
|» symbol|body|string| 是 |交易对符号|
|» positionSide|body|string| 是 |持仓方向 (LONG/SHORT)|
|» quantity|body|number| 否 |平仓数量（不传时平全仓）|

> 返回示例

> 200 Response

```json
{
  "code": 0,
  "msg": "string",
  "data": {
    "orderId": 0,
    "symbol": "string",
    "status": "string",
    "clientOrderId": "string",
    "price": "string",
    "avgPrice": "string",
    "origQty": "string",
    "executedQty": "string",
    "cumQty": "string",
    "cumQuote": "string",
    "timeInForce": "string",
    "type": "string",
    "reduceOnly": true,
    "closePosition": true,
    "side": "string",
    "positionSide": "string",
    "stopPrice": "string",
    "workingType": "string",
    "priceProtect": true,
    "origType": "string",
    "priceMatch": "string",
    "selfTradePreventionMode": "string",
    "goodTillDate": 0,
    "updateTime": 0,
    "mode": "string",
    "executedPrice": 0,
    "slippage": "string",
    "remainingPosition": "string",
    "positionClosed": true
  }
}
```

```json
{
  "code": 400,
  "msg": "No active position found",
  "data": {
    "symbol": "BTCUSDT",
    "positionSide": "LONG",
    "mode": "ONE-WAY"
  }
}
```

```json
{
  "code": 400,
  "msg": "Missing required parameters",
  "data": {
    "required": [
      "symbol",
      "positionSide"
    ]
  }
}
```

```json
{
  "code": 400,
  "msg": "Quantity exceeds position (max: 0.5)",
  "data": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» orderId|integer|true|none||none|
|»» symbol|string|true|none||none|
|»» status|string|true|none||none|
|»» clientOrderId|string|true|none||none|
|»» price|string|true|none||none|
|»» avgPrice|string|true|none||none|
|»» origQty|string|true|none||none|
|»» executedQty|string|true|none||none|
|»» cumQty|string|true|none||none|
|»» cumQuote|string|true|none||none|
|»» timeInForce|string|true|none||none|
|»» type|string|true|none||none|
|»» reduceOnly|boolean|true|none||none|
|»» closePosition|boolean|true|none||none|
|»» side|string|true|none||none|
|»» positionSide|string|true|none||none|
|»» stopPrice|string|true|none||none|
|»» workingType|string|true|none||none|
|»» priceProtect|boolean|true|none||none|
|»» origType|string|true|none||none|
|»» priceMatch|string|true|none||none|
|»» selfTradePreventionMode|string|true|none||none|
|»» goodTillDate|integer|true|none||none|
|»» updateTime|integer|true|none||none|
|»» mode|string|true|none||none|
|»» executedPrice|number|true|none||none|
|»» slippage|string|true|none||none|
|»» remainingPosition|string|true|none||none|
|»» positionClosed|boolean|true|none||none|

状态码 **400**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» required|[string]|true|none||none|

# position

## POST 调整杠杆倍数

POST /api/position/leverage

## **基本信息**
- **接口名称**: 调整合约杠杆倍数
- **请求方法**: `POST`
- **请求路径**: `/api/position/leverage`
- **鉴权方式**: `API-KEY`签名验证
- **数据格式**: `JSON`

> Body 请求参数

```json
{
  "symbol": "BTCUSDT",
  "leverage": 20
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|body|body|object| 否 |none|
|» symbol|body|string| 是 |合约交易对|
|» leverage|body|integer| 是 |杠杆倍数 (1-125)|

> 返回示例

> 200 Response

```json
{
  "code": 200,
  "msg": "Leverage updated",
  "data": {
    "symbol": "BTCUSDT",
    "leverage": 2,
    "maxQty": "300000000"
  }
}
```

```json
{
  "code": 400,
  "msg": "Missing required parameters: symbol, leverage",
  "data": null
}
```

```json
{
  "code": 400,
  "msg": "Invalid leverage (1-125 allowed)",
  "data": null
}
```

```json
{
  "code": -4008,
  "msg": "Unsupported leverage for BTCUSDT",
  "data": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» symbol|string|true|none||合约交易对|
|»» leverage|integer|true|none||调整后的杠杆倍数|
|»» maxQty|string|true|none||当前杠杆下的最大可开仓数量|

状态码 **400**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

## POST 设置保证金模式

POST /api/position/margin-mode

## **基本信息**
- **接口名称**: 设置合约保证金模式
- **请求方法**: `POST`
- **请求路径**: `/api/position/margin-mode`
- **鉴权方式**: `API-KEY`签名验证
- **数据格式**: `JSON`

> Body 请求参数

```json
{
  "symbol": "BTCUSDT",
  "marginType": "ISOLATED"
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|body|body|object| 否 |none|
|» symbol|body|string| 是 |合约交易对|
|» marginType|body|string| 是 |保证金模式：ISOLATED（逐仓）/ CROSSED（全仓）|

> 返回示例

> 200 Response

```json
{
  "code": 200,
  "msg": "Margin mode updated",
  "data": {
    "symbol": "BTCUSDT",
    "marginType": "ISOLATED",
    "success": true
  }
}
```

```json
{
  "code": 400,
  "msg": "Missing required parameters: symbol, marginType",
  "data": null
}
```

```json
{
  "code": 400,
  "msg": "Invalid marginType (ISOLATED/CROSSED)",
  "data": null
}
```

```json
{
  "code": -3000,
  "msg": "Cannot change margin mode with open positions/orders",
  "data": null
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|none|Inline|

### 返回数据结构

状态码 **200**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|object|true|none||none|
|»» symbol|string|true|none||合约交易对|
|»» marginType|string|true|none||设置后的保证金模式|
|»» success|boolean|true|none||是否成功变更保证金模式|

状态码 **400**

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|» code|integer|true|none||none|
|» msg|string|true|none||none|
|» data|null|true|none||none|

# 数据模型

