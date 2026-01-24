# 页面清单（Duolingo 风格迁移）

说明：本清单以 [app.json](file:///c:/Users/wapadil/WeChatProjects/miniprogram-13/miniprogram/app.json) 注册为“可达路由法律”。未注册页面默认不可达，仅做遗留标记（不纳入主链路验收）。

## P0（高频交互，先做）

| 路由 | 用途 | 高频交互 | 含列表 | 优先级 |
|---|---|---:|---:|---|
| /pages/review/index | 复习首页（Dashboard + 入口 CTA） | 是 | 否 | P0 |
| /subpackages/review/pages/flashcard/index | 闪卡会话（翻面/评分/继续） | 是 | 否 | P0 |
| /subpackages/review/pages/quiz/index | 测验会话（选项作答/判题/继续） | 是 | 否 | P0 |

## P1（中频交互/列表）

| 路由 | 用途 | 高频交互 | 含列表 | 优先级 |
|---|---|---:|---:|---|
| /subpackages/review/pages/course/index | 课程详情与管理（注册/章节入口/考试日期） | 中 | 可能 | P1 |
| /subpackages/review/pages/cheatsheet/index | 急救包/资料（资源列表/预览） | 中 | 是 | P1 |
| /subpackages/review/pages/leaderboard/index | 周榜（排行列表） | 中 | 是 | P1 |
| /subpackages/review/pages/activity-history/index | 学习记录（35 天历史列表） | 中 | 是 | P1 |
| /subpackages/review/pages/session-complete/index | 结算页（统计/继续/订阅提醒） | 中 | 否 | P1 |

## P2（低频信息页）

| 路由 | 用途 | 高频交互 | 含列表 | 优先级 |
|---|---|---:|---:|---|
| /pages/profile/index | 我的（信息/入口/设置聚合） | 否 | 可能 | P2 |
| /pages/webview/index | 内容 WebView（条款/隐私等） | 否 | 否 | P2 |
| /pages/customer-service/index | 客服/帮助（复制微信） | 否 | 否 | P2 |
| /pages/dev-settings/index | 开发设置（DEV_API_BASE_URL） | 否 | 否 | P2 |

## 遗留（未注册不可达，默认不验收）

| 目录（存在实现） | 备注 |
|---|---|
| /pages/market/index | 交易库存列表（典型列表页），未注册 |
| /pages/book-detail/index | 商品详情/购买，未注册 |
| /pages/order-confirm/index | 下单确认/支付，未注册 |
| /pages/orders/index | 订单列表，未注册 |
| /pages/order-detail/index | 订单详情，未注册 |
| /pages/acquisition-scan/index | 员工收购扫码，未注册 |
| /pages/review-entry/index | 跳板页，未注册 |

