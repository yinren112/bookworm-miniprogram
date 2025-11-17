# Bookworm 部署进度与后续待办

> 更新日期：2025-11-15  
> 说明：该文档用于跟踪当前完成的能力、缺失项以及后续排期。配合 `DEPLOYMENT_READINESS.md` 使用：前者给出“做到了哪一步 + 下一步计划”，后者保留完整审查细节。

## ✅ 已完成的关键工作

- **后端闭环能力可运行**  
  - 订单、库存、支付、收购、内容等模块已拆分至 `src/services/**`，由 `src/routes/**` 暴露 REST 接口。  
  - 订单写路径内置 `pg_advisory_xact_lock`、库存原子状态流转（`IN_STOCK → RESERVED → SOLD`），并通过 `pending_payment_order` 守卫表限制“单用户待支付订单”。  
  - 支付流程包含金额一致性校验、WeChat JSAPI 下单、Webhook 主动查单、退款流程（`src/jobs/refundProcessor.ts`）。

- **小程序端到端体验具备**  
  - `pages/market`→`pages/book-detail`→`pages/order-confirm`→`pages/orders` 完整链路已打通，复用了统一 API (`miniprogram/utils/api.js`) 与登录守卫 (`auth-guard.js`)。  
  - 公共工具（缓存、图片代理、UI 错误提示、支付封装）已沉淀在 `miniprogram/utils/**` 并被页面引用。

- **数据库“法律化”落地**  
  - `prisma/migrations/20250930135002_restore_native_db_rules/` 恢复了守卫表、触发器、唯一索引；`src/utils/dbVerifier.ts` 在进程启动时检查 `pending_payment_order`、`inventory_reservation_enforce_cap` 等关键约束。  
  - `inventoryReservation` + 触发器共同执行“单用户保留数量”限制，避免应用层遗忘检查。

- **安全与观测基线**  
  - 支付通知链路由 `validatePaymentSchema → checkIdempotency → decrypt → processPaymentNotification` 组成，涵盖验签、去重、分级响应。  
  - `/metrics` 暴露 Prometheus 指标（订单/支付/库存/事务重试），`ops/docker/docker-compose.monitoring.yml` 提供 Prometheus+Grafana 模板。  
  - `src/jobs.ts` 定义的自动取消/库存统计/退款处理均加锁执行，适配多实例部署。

## ⚠️ 待办与风险（按优先级）

### P0（阻塞部署）

1. **Postgres 初始化脚本挂载无效**  
   - 现状：`bookworm-backend/docker-compose.yml:19` 将 `./init.sql` 目录当作文件挂载，容器启动阶段不会执行任何 SQL。  
   - 风险：pg_trgm 扩展等初始化语句缺失，线上索引/函数可能不可用。  
   - 行动：创建真正的 `bookworm-backend/init.sql` 文件（写入 `CREATE EXTENSION IF NOT EXISTS pg_trgm;` 等），或移除该挂载。  
   - Owner：后端基础设施。目标在 11/17 前关闭。
   - ✅ 2025-11-16：已创建 `bookworm-backend/init.sql` 并写入 `CREATE EXTENSION IF NOT EXISTS pg_trgm;`，docker-compose 启动时会自动执行初始化。

2. **端口配置不一致**  
   - 现状：`.env.example` 默认为 3000，`src/config.ts`/`Dockerfile.prod`/小程序等使用 8080。  
   - 风险：新人按照模板启动后端，端口与前端不一致导致“服务不可用”。  
   - 行动：统一 `.env.example`、README、`ops/docker` 文档为 8080，确保开发/部署指令一致。  
   - Owner：后端（文档 + 环境模板）。
   - ✅ 2025-11-16：`.env.example`、`bookworm-backend/Dockerfile`、顶层 README 及推荐配置已全部切换到 8080，并同步 features 文档示例。

3. **小程序生产/预发布 API 域名仍为占位符**  
   - 现状：`miniprogram/config.js` 中 `trial`/`release` 仍为 `https://staging.bookworm.com/api`、`https://api.bookworm.com/api`。  
   - 风险：体验版/正式版无法访问真实后端，通过不了微信审核。  
   - 行动：在发布前写入真实域名并同步备案/业务域名白名单。需要产品/运维确认域名与 HTTPS 证书。  
   - Owner：前端 + 运维。
   - ✅ 2025-11-16：trial → `https://api-staging.lailinkeji.com/api`，release → `https://api.lailinkeji.com/api`，证书 (Let's Encrypt) 与反向代理已就绪；需在微信后台登记业务域名并验证。

4. **集成测试无法运行**  
   - 现状：`npm run test:integration` 连接不上 `localhost:54320`，因为 Postgres 测试容器未启动；CI 也未提供默认环境。  
   - 风险：无法验证触发器/事务逻辑，支付与库存风险无法提前发现。  
   - 行动：  
     1. 在 README/文档写明：先 `docker compose --profile test up -d postgres_test` 或使用 `run-integration-tests.ps1`。  
     2. 评估恢复 `globalSetup.testcontainers.ts`（Testcontainers 自启数据库），并在 CI 中启用 Azul OpenJDK + Docker-in-Docker。  
   - Owner：后端基础设施。
   - ✅ 2025-11-16：顶层 README 与 `bookworm-backend/README.md` 已加入“先 `docker compose --profile test up -d postgres_test`”指引，`run-integration-tests.ps1` 也会自动拉起容器；Testcontainers/CI 自动化仍待恢复。

### P1（进入内测前必须完成）

1. **订单/支付覆盖率低 + 测试失败未修复**  
   - 覆盖率：`npm test` 行覆盖仅 11.95%，尤其 `src/services/orders/**`、`src/services/orderService.ts` 仍 0%。  
   - 已知失败：`src/tests/services/create.integration.test.ts` 在删除 `pending_payment_order` 时失败（触发器已自动删除，不应再 `delete`），尚未处理。  
   - 行动：  
     - 修正测试逻辑（例如将 `delete` 改为 `deleteMany` 或直接依赖触发器结果），确保所有集成测试可在本地跑通。  
     - 新增支付通知、金额校验、Webhook 幂等的测试用例，确保 `paymentErrorClassifier` 逻辑被覆盖。  
     - 将 `npm run test:integration` 纳入 CI 必跑项。  
   - Owner：后端订单/支付小组。
   - ✅ 2025-11-16：修复 create.integration 触发器删除错误，新增支付通知幂等/重试用例并跑通 `npm run test:integration`，CI 加入集成测试步骤。

2. **微信支付证书与配置落地方案缺失**  
   - `Dockerfile.prod` / compose 没有挂载证书；`.env.*` 只留空字段；`WXPAY_ACK_STRICT` 等安全开关未写明。  
   - 行动：  
     - 定义证书路径（推荐 `secrets/wechatpay/apiclient_key.pem` 只读挂载），并在 `ops/docker/docker-compose.staging.yml` 增加 volumes。  
     - 更新 `DEPLOYMENT_READINESS.md`/新 Runbook，覆盖证书申请、部署、权限、轮换策略。  
     - 在配置校验中加入路径存在性检查，避免生产起不来才发现缺证书。  
   - Owner：后端 + 运维。
   - ✅ 2025-11-16：staging compose 挂载证书并声明 WXPAY_* & ACK_STRICT，config 校验增加私钥路径存在性，Runbook 补充证书与部署说明。

3. **小程序文案/调试 UI 未清理**  
   - 多处仍显示乱码（例如 `miniprogram/pages/profile/index.js:10`）、Unicode 转义或 “占位” 文案；`profile` 页面还有 Debug 信息/手动输入手机号按钮。  
   - 行动：  
     - 搜索 `\u`、`Debug`、`手动输入手机号` 等关键字，清理上线版本不需要的模块。  
     - `App.showTerms()` 需要替换为真实协议内容，或跳转到 content 页面。  
     - 建议引入简单的文案常量或 JSON，避免编码问题再现。  
   - Owner：前端。
   - ✅ 2025-11-16：移除 Profile 手动手机号/Debug 文案，terms 入口跳转内容页，协议提示文案改为中文常量。

4. **内容数据缺失**  
   - `pages/webview/index` 需要后端 `/api/content/:slug` 返回富文本，但 `prisma/seed.ts`/运维脚本中没有 `terms-of-service`、`privacy-policy` 等记录。  
   - 行动：  
     - 在种子/迁移脚本中写入基础内容；或提供后台管理界面/脚本让运营可更新。  
     - 在 README 中提醒：如果 content 表为空，需要先执行种子或导入 SQL。  
   - Owner：后端/运维。
   - ✅ 2025-11-16：种子脚本写入 terms-of-service / privacy-policy，README 提醒 seed 会补齐内容。

5. **部署 Runbook 缺失**  
   - README 仅覆盖本地开发，部署流程、监控、回滚、日志收集、数据库备份均无文档。  
   - 行动：新增 `docs/DEPLOYMENT_RUNBOOK.md`，内容至少包含：  
     1. 后端部署流程（环境变量、镜像构建、`verifyDatabaseConstraints` 执行顺序、`startCronJobs` 依赖）。  
     2. 小程序上传流程（域名配置、体验版/发布版注意事项、常见审核问题）。  
     3. 监控/日志/备份策略（Prometheus、Grafana、日志落地、Postgres 备份与恢复）。  
     4. 紧急回滚和人工操作（手动取消订单、退款流程）。  
   - Owner：后端 + 运维 + PM。
   - ✅ 2025-11-16：新增 `docs/DEPLOYMENT_RUNBOOK.md`，覆盖环境变量、证书挂载、监控/回滚与手工操作。

### P2（上线前建议完成）

1. **压测结果缺失**：`tools/load-testing` 提供 k6 脚本，但没有任何运行记录；建议至少输出一次（目标 10 VU / 30s）并记录性能指标。  
   - ✅ 2025-11-16：新增 `tools/load-testing/health-smoke.js` 并在本地 10 VU / 30s 压测 `/api/health`，记录结果于 `tools/load-testing/RESULTS.md`（41,421 次请求，0 失败，p95=10.87ms）。
2. **人工验证记录**：小程序上线需要准备“人工验证说明 + 截图”，目前缺失。建议在 `docs/QA_CHECKLIST.md` 中列出机型/账号/截图链接。  
   - ✅ 2025-11-16：新增 `docs/QA_CHECKLIST.md`，覆盖设备/账号、核心流程、异常场景与记录格式。
3. **日志落地策略**：需决定是通过 stdout 收集再入 APM，还是在 Docker Compose 中挂载 volume。现阶段 README 无任何说明。  
   - ✅ 2025-11-16：Runbook 补充日志策略（默认 stdout，需持久化时在编排层挂载脱敏日志 volume）。
4. **短期配置管理**：`.env` 与 `.env.test` 中还有占位 Secret（`default-secret-for-dev`、`test-jwt-secret`），上线前需由 Secret Manager 托管，并在 CI 中替换。  
   - ✅ 2025-11-16：在 Runbook 中声明上线必须由 Secret Manager 注入 JWT/支付密钥，模板中的占位仅限本地。

## 下一步计划 / Owner Mapping

| 任务 | Owner | 截止时间 | 备注 |
| --- | --- | --- | --- |
| 修复 `init.sql` 挂载 / 端口统一 | @backend-infra | 11/17 | ✅ 2025-11-16 `init.sql` + 8080 + README 已完成 |
| 填写真实 API 域名、备案、体验版配置 | @frontend + @ops | 11/20 | 需产品确认域名 |
| 恢复集成测试可运行（含 CI） | @backend-infra | 11/20 | README/脚本已引导，本阶段推进 Testcontainers/CI |
| 扩充订单/支付测试并修复现有失败 | @orders + @payments | 11/22 | 交付运行截图 |
| 微信支付证书管理方案 | @payments + @ops | 11/25 | 文档 + 配置校验 |
| 清理前端文案、补充 content 数据 | @frontend + @backend | 11/18 | 包含 ToS 内容 |
| 新增 Deployment Runbook | @ops + @backend | 11/23 | 与 README 联动 |

> 若 owner 认领后发现信息不足，请在群内同步，避免任务悬空。

## 未完成计划（需在文档中持续跟踪）

- **自动化验收**：CI 尚未串联 lint → unit test → integration test → 构建 → artifact upload，后续需要建立 GitHub Actions / GitLab CI pipeline 并在文档中记录。
- **滚动升级策略**：当前仅有单机 Compose 模板，没有描述如何在 Kubernetes 或多节点场景滚动升级；后续 Runbook 需覆盖“灰度/回滚/状态检查”。
- **监控告警**：Prometheus/Grafana 虽有模板，但没有告警规则；需定义订单失败率、支付通知失败、库存不足等告警，并写入运维手册。
- **数据备份与演练**：README 未提及 Postgres 备份计划，需要在 Runbook 中记录“每日备份 → 恢复演练 → 验证步骤”。
- **法律与合规**：小程序 ToS/Privacy Policy 还未与法务确认，后续需要在文档中记录审批状态与版本号。
- **Staging 组合挂载缺失**：`ops/docker/docker-compose.staging.yml` 仍未配置 WeChat Pay 证书 volume 与 `WXPAY_*` 环境变量，示例 compose 按照现状无法通过 `src/index.ts` 的证书检查。
- **监控脚本无效**：`tools/monitoring/test_metrics.sh` 在开发环境始终命中同一 mock openid，无法验证 gauge 变化；`update_user_metrics.js` 未加载 `.env` 且默认请求本地 8080，执行流程需补足。
- **运维文档乱码**：`DEPLOYMENT_READINESS.md` 与 `docs/operations/CI_NOTES.md` 等关键 Runbook 因编码错误难以阅读，修复编码后方能继续维护。

---  
如有新的风险或进展，请同步更新本文件与 `DEPLOYMENT_READINESS.md`，确保所有人对当前状态有一致认知。紧急事项优先在 P0/P1 区域维护，并更新 owner/截止时间。完成项请移至“✅ 已完成”或另建 CHANGELOG。closed loop.
