# Bookworm 部署 Runbook（内测版）

> 适用环境：staging / production。发布前请同步最新的 `.env`、证书与域名备案状态。

## 1. 后端部署流程
- **环境变量**：基于 `.env.example` 生成 `.env`，填写 `DATABASE_URL`、`JWT_SECRET`、`WX_APP_ID/SECRET`、`WXPAY_*`（证书路径 `/secrets/wechatpay/apiclient_key.pem`，`WXPAY_ACK_STRICT` 按需开启），保持 `PORT=8080`；生产环境必须通过 Secret Manager 注入，不在镜像或仓库存储明文。
- **镜像构建与启动**：`docker compose -f ops/docker/docker-compose.staging.yml up -d --build`，确保 `postgres`、`nginx`、`app` 三个服务均为 healthy；证书通过 volume 只读挂载。
- **数据库校验**：容器启动后执行 `npm run migrate:dev`（或 `prisma migrate deploy`），再运行 `npm run test:integration` 验证触发器与事务；若使用外部 DB，先执行 `verifyDatabaseConstraints()`（启动日志会输出结果）。
- **作业启动顺序**：服务监听成功后再启动 `startCronJobs`（已在 `src/index.ts` 中自动调用），确认 `cancelExpiredOrders`、`refundProcessor` 定时任务正常写日志。

## 2. 小程序上传流程
- **域名配置**：`miniprogram/config.js` 中 trial/release 已指向 `https://api-staging.lailinkeji.com/api` 与 `https://api.lailinkeji.com/api`，确保两者均完成微信“业务域名”备案并反向代理到后端 8080。
- **打包与预览**：在微信开发者工具导入 `miniprogram/`，确认「详情-本地设置」启用 HTTPS 校验，Preview 使用 trial 域名。
- **体验版/正式版注意事项**：提交前清理调试入口（已移除手动手机号输入/Debug 文案），核对内容页通过 `/pages/webview/index?slug=terms-of-service|privacy-policy` 打开。

## 3. 监控、日志与备份
- **监控入口**：`/metrics` 暴露 Prometheus 指标（订单/库存/支付/作业失败率），Grafana 模板位于 `ops/docker/docker-compose.monitoring.yml`。
- **日志落地**：默认 stdout（推荐由容器编排/sidecar 收集到 APM）；若需本地持久化，在编排层挂载只读/过滤后的日志 volume，确保脱敏路径生效。禁止在容器内写入明文证书或密钥。
- **数据库备份**：Postgres 建议使用物理备份（pg_basebackup）或逻辑备份（pg_dump）每日定时；恢复后先运行 `verifyDatabaseConstraints` 再启动应用。

## 4. 紧急回滚与人工操作
- **回滚代码/配置**：通过镜像版本回滚（保留同一数据库），若涉及迁移需先备份数据再执行 `prisma migrate rollback` 对应版本。
- **人工取消订单**：执行 `cancelExpiredOrders` 作业或在数据库中将订单标记为 `CANCELLED`，同时解除库存预留（`inventory_item.status -> IN_STOCK`）。
- **人工退款流程**：支付回调异常时，`paymentRecord.status=REFUND_REQUIRED`；可手动调用 `refundProcessor`，失败时检查证书、商户号与签名配置。
- **数据导出/注销**：按隐私政策，处理完成后移除 `user.phone_number/openid` 及关联授权记录，保留法规要求的操作日志。
