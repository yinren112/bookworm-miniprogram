# 校园书虫项目技术与结构总览

## 1. 项目结构与技术栈
- **目录布局**：前后端同仓。
  ```
  miniprogram-13/
  ├── miniprogram/         # 微信小程序前端（原生框架）
  ├── bookworm-backend/    # Fastify + Prisma 后端 API
  ├── ops/docker/          # docker-compose（staging/监控）
  ├── tools/               # 压测、监控脚本
  └── docs/                # 架构/运维/QA 文档
  ```
- **前端技术栈**：原生微信小程序（依赖 `project.config.json`，页面位于 `miniprogram/pages/**`，无 Taro/UniApp/Vue/React 痕迹），构建沿用微信开发者工具默认流程，无 Vite/Webpack 配置。
- **后端形态**：独立 Node.js 服务（非云函数），入口 `bookworm-backend/src/index.ts`，提供 REST API。

## 2. 后端框架、路由与部署
- **框架**：Fastify + TypeScript，核心入口 `src/index.ts`，服务构建/启动脚本：
  - `npm run dev`（nodemon + ts-node）
  - `npm run build && npm start`（tsc 编译后运行 `dist/src/index.js`）
- **路由**：`src/routes/` 下包括 `auth`, `users`, `books`, `inventory`, `orders`, `payment`, `sellOrders`, `acquisitions`, `content`, `health` 等，对应 `/api/*` 前缀。
- **部署配置**：
  - 生产镜像：`bookworm-backend/Dockerfile.prod`
  - 本地/测试数据库：`bookworm-backend/docker-compose.yml`（含 `postgres` 、`postgres_test`）
  - Staging 编排：`ops/docker/docker-compose.staging.yml`（Nginx + app + Postgres，挂载微信支付证书）
  - CI：`.github/workflows/ci-lint-scan.yml`（含集成测试步骤）
- **环境变量**：`.env.example`/`.env.test` 提供模板，关键项：`PORT`、`HOST`、`DATABASE_URL`、`JWT_SECRET`、`WX_APP_ID/SECRET`、`WXPAY_MCHID`、`WXPAY_PRIVATE_KEY_PATH`、`WXPAY_CERT_SERIAL_NO`、`WXPAY_API_V3_KEY`、`WXPAY_NOTIFY_URL` 等。

## 3. 数据库依赖与使用方式
- **类型/驱动**：PostgreSQL，使用 Prisma ORM（依赖包 `@prisma/client`、`prisma`）。
- **模型定义**：`bookworm-backend/prisma/schema.prisma` 描述全部表；迁移位于 `prisma/migrations/**`；初始化/种子脚本 `prisma/seed.ts`（含基础书目与 content 记录）。
- **迁移命令**：`npm run migrate:dev`（开发）、`npx prisma migrate deploy`（部署），测试库重置 `npm run db:migrate:test:reset`。
- **本地连接**：`.env` / `.env.test` 的 `DATABASE_URL` 指向本机 Docker Postgres（开发 65432 端口 / 测试 54320），compose 已内置数据库容器。
- **方言特征**：大量使用 PostgreSQL 特性（`pg_advisory_xact_lock`、触发器、CHECK 约束、GIN/pg_trgm 索引），并在应用层处理 Prisma 错误码。

## 4. 业务数据模型概览
- **核心表**（摘自 `schema.prisma`）：
  - `User`：`id`、`openid`、`phone_number`、`role`、`status` 等。
  - `BookMaster` / `BookSku`：书目与版本，`isbn13`、`edition`、`cover_image_url`。
  - `InventoryItem`：每本实体库存，`condition`、`cost`、`selling_price`、`status`（枚举 `IN_STOCK/RESERVED/SOLD/BULK_ACQUISITION/...`）。
  - `Order`：`user_id`、`status`（`PENDING_PAYMENT/PENDING_PICKUP/COMPLETED/CANCELLED` 等）、`total_amount`、`pickup_code`、`paymentExpiresAt`。
  - `OrderItem`：明细，关联 `order_id` 与 `inventory_item_id`。
  - `PendingPaymentOrder`：一人一待支付订单的守卫表（唯一索引 `uniq_order_pending_per_user`）。
  - `PaymentRecord`：支付通知/查单结果，`out_trade_no`、`status`、`transaction_id`、`payer_openid`。
  - `InventoryReservation`：库存预留关系（防超卖），由触发器控制上限。
  - 其他：`WebhookEvent`（支付回调幂等）、`Acquisition`/`OrderSellDetails`（收购流程）、`Content`（富文案页）。
- **库存设计**：实体级库存表，状态枚举，预留通过 `InventoryReservation` + advisory lock；批量收购用 `BULK_ACQUISITION` 状态。
- **订单/支付**：主表 + 明细 + 守卫表 + 支付记录，支付回调写入 `WebhookEvent` 后调用 `PaymentRecord` 状态机，退款标记为 `REFUND_REQUIRED`。

## 5. 小程序接口协议
- **主要 API 路由**（示例）：`/api/auth/login`、`/api/users/me`、`/api/books`、`/api/inventory/available`、`/api/orders` (POST 创建订单)、`/api/orders/:id/pay`、`/api/payment/notify`、`/api/orders/:id/cancel`、`/api/sell-orders`、`/api/content/:slug`。
- **认证与权限**：登录交换 openid → JWT（`auth` 路由）；Fastify 插件 `authenticate` 注入 `userId/openid/role`；部分路由要求 STAFF 角色。
- **响应模式**：Fastify 统一异常处理中使用 `ApiError`，返回 `code/message`；支付回调使用 `paymentErrorClassifier` 统一 WeChat ACK。

## 6. 部署、日志与监控
- **本地启动流程**：
  1) `docker compose up -d postgres`（或 `--profile test up -d postgres_test`）；  
  2) `npm install`（在 `bookworm-backend/`）；  
  3) `npm run migrate:dev`；  
  4) `npm run dev` 启动后端；  
  5) 微信开发者工具导入 `miniprogram/`，`miniprogram/config.js` 将 `develop` 指向 `http://localhost:8080/api`。
- **日志**：Pino 内置结构化日志（`src/index.ts` 中配置脱敏字段），默认输出 stdout；Runbook 建议由编排层收集。
- **监控**：`/metrics` 暴露 Prometheus 指标（订单/支付/作业失败率等），监控 compose 模板位于 `ops/docker/docker-compose.monitoring.yml`。
- **测试**：Vitest 单测 + 集成测试（`npm test` / `npm run test:integration`，后者依赖 Postgres 测试容器）；contract 与服务层测试位于 `bookworm-backend/src/tests/**`。
