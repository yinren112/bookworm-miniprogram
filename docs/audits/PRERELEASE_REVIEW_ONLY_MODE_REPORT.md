# PRERELEASE REVIEW-ONLY MODE REPORT

日期：2026-02-03

## 改动点
- 新增 `APP_MODE`（`full|review`）与派生字段 `appMode`/`paymentEnabled`。
- production 校验：`APP_MODE=review` 时跳过 WXPAY_* 必填校验；`APP_MODE=full` 维持原校验。
- review 模式裁剪路由：仅保留 `/api/health`、`/api/auth/login`、`/api/users/me`、`/api/study/*`、`/metrics`。
- review 模式禁用支付/电商相关定时任务（订单过期清理、库存指标、退款处理）。

## 如何配置 review-only
- 生产环境设置：
  - `NODE_ENV=production`
  - `APP_MODE=review`
- 仍需满足的生产必填项：`JWT_SECRET`、`WX_APP_ID`、`WX_APP_SECRET`、`DATABASE_URL`、`HOST`、`CORS_ORIGIN`、`METRICS_AUTH_TOKEN`。
- review 模式不要求 `WXPAY_*`，且支付/电商路由与任务不会启用。

## 路由裁剪说明（review 模式）
- 保留：`/api/health`、`/api/auth/login`、`/api/users/me`、`/api/study/*`、`/metrics`。
- 不注册：`/api/orders/*`、`/api/payment/*`、`/api/inventory/*`、`/api/books/*`、`/api/acquisitions/*`、`/api/sell-orders/*`、`/api/content/*`。

## 测试结果
- 2026-02-03（本地）
  - `cd bookworm-backend && npm test`：通过（21/21 files，165 tests）。
  - `cd bookworm-backend && npm run lint`：通过（ESM 警告）。
  - `cd bookworm-backend && npm run build`：通过（Prisma deprecation 警告）。

## 备注
- 新增测试：
  - config 校验：review 模式下允许缺失 WXPAY_*；full 模式缺失仍拒绝启动。
  - 路由裁剪：review 模式下 /api/study/* 存在，/api/orders/create 与 /api/payment/notify 为 404。
