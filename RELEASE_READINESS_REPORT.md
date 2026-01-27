# RELEASE_READINESS_REPORT.md

## 1. 审计范围与版本信息（commit、目录、命令环境）

- 审计类型：只读发布就绪度审计（未推送/未合并代码；未执行破坏性命令）
- 仓库 commit：`1dd0407d1a2b2f793ac06056a9767ebdd156add6`（见 `artifacts/commit.txt`）
- 工作区状态：见 `artifacts/git_status.txt`（本仓库存在未跟踪文件：`bookworm-backend/scripts/prisma-generate.mjs`）
- 审计范围识别结果：
  - 小程序端：`miniprogram/`（`miniprogram/app.json` 存在且 `__usePrivacyCheck__=true`）
  - 后端：`bookworm-backend/`（存在 `prisma/schema.prisma`、`Dockerfile.prod`、`entrypoint.sh`）
- 关键命令输出：
  - 根目录清单：`artifacts/ls_root.txt`
  - 后端构建/测试：`artifacts/be_npm_ci.txt`、`artifacts/be_lint.txt`、`artifacts/be_test.txt`、`artifacts/be_build.txt`
  - 小程序扫描：`artifacts/mp_*.txt`、`artifacts/mp_scan_meta.json`

## 2. 结论摘要（P0/P1/P2 数量，列最关键 8 条）

- 数量汇总（未关闭）：P0=0，P1=2，P2=0（详见 `RELEASE_BLOCKERS.json`）
- 最关键 8 条：
  1. P0：生产镜像迁移离线可用（Done，见 artifacts/p0_fix_evidence/p0-be-deploy-001_002_evidence.txt）
  2. P0：后端启动入口统一为 dist/src/index.js（Done，见 artifacts/p0_fix_evidence/p0-be-deploy-001_002_evidence.txt）
  3. P0：移除 dev-settings 后门页与内网/IP 文案（Done，见 artifacts/p0_fix_evidence/p0-mp-review-001_rg_dev-settings.txt）
  4. P0：客服入口可用且无占位符（Done，见 artifacts/p0_fix_evidence/p0-mp-cs-001_contact_entry.txt）
  5. P1：订阅消息模板改为后端下发（待微信后台核对模板与类目，Needs WeChat Admin）
  6. P1：协议/隐私内容增加本地兜底（待最终文案，Needs Content Finalization）
  7. P1：/metrics 默认公开（Done：已加 Bearer 鉴权/匿名开关）
  8. P1：访问日志缺 requestId（Done：已回写 x-request-id 并统一日志字段）

## 3. P0 阻碍清单（每条含：现象、证据、影响、Owner、行动建议、涉及路径）

### P0-BE-DEPLOY-001：生产镜像运行期迁移离线可用（Done）

- 现象（修复后）：`entrypoint.sh` 使用本地 Prisma CLI（`./node_modules/.bin/prisma migrate deploy`），且 `prisma` 位于 dependencies，生产镜像无需 npx 在线下载即可执行迁移。
- 证据：
  - `artifacts/p0_fix_evidence/p0-be-deploy-001_002_evidence.txt`
- 影响：P0 已关闭。
- Owner：Ops
- 行动建议：保证“运行期迁移”离线可用（镜像内提供 Prisma CLI 或调整迁移策略），并做一次生产同等的冷启动演练。
- 涉及路径：`bookworm-backend/entrypoint.sh`、`bookworm-backend/Dockerfile.prod`、`bookworm-backend/package.json`

### P0-BE-DEPLOY-002：后端启动入口不一致（已统一，Done）

- 现象（修复后）：`npm start`、`Dockerfile`、`Dockerfile.prod`、`entrypoint.sh` 全部统一为 `dist/src/index.js`。
- 证据：
  - `artifacts/p0_fix_evidence/p0-be-deploy-002_dist_structure.txt`
  - `artifacts/p0_fix_evidence/p0-be-deploy-001_002_evidence.txt`（docker 闸门 + /api/health=200，checks.database=ok）
- 影响：P0 已关闭。
- Owner：Ops
- 行动建议：统一并锁死“唯一启动入口”路径，同时同步 npm start 与 Dockerfile*，并在 CI 增加一个“docker build + 容器启动 + health check”闸门。
- 涉及路径：`bookworm-backend/package.json`、`bookworm-backend/tsconfig.json`、`bookworm-backend/Dockerfile*`、`bookworm-backend/entrypoint.sh`

### P0-MP-REVIEW-001：移除 dev-settings 后门页（Done）

- 现象（修复后）：提审/发布包不再包含 dev-settings 页与任何入口，且不再包含内网/IP 文案命中。
- 证据：
  - `artifacts/p0_fix_evidence/p0-mp-review-001_rg_dev-settings.txt`
  - `artifacts/p0_fix_evidence/p0-mp-review-001_no_internal_ip.txt`
- 影响：P0 已关闭。
- Owner：Dev
- 行动建议：发布/提审版本移除该页与入口（或仅 devtools 可访问），同时清理所有内网/IP 文案。
- 涉及路径：`miniprogram/app.json`、`miniprogram/pages/profile/*`

### P0-MP-CS-001：客服入口可用且无占位符（Done）

- 现象（修复后）：Profile 与客服页提供官方客服入口（open-type/openType=contact），不再展示客服微信号占位符。
- 证据：
  - `artifacts/p0_fix_evidence/p0-mp-cs-001_contact_entry.txt`
- 影响：P0 已关闭。
- Owner：Dev
- 行动建议：替换为真实客服渠道，并准备审核说明中的“客服入口/处理时效”描述。
- 涉及路径：`miniprogram/pages/profile/*`、`miniprogram/pages/customer-service/*`

## 4. P1 风险清单（同上）

### P1-BE-OBS-001：访问日志缺 requestId，端到端排障能力不足（Done）

- 现状（修复后）：后端回写 `x-request-id`，访问日志与错误日志统一输出 requestId；小程序请求统一发送 `X-Request-ID`。
- Owner：Dev

### P1-BE-SEC-001：/metrics 默认公开暴露（Done）

- 现状（修复后）：`/metrics` 默认要求 `Authorization: Bearer <METRICS_AUTH_TOKEN>`（可通过 `METRICS_ALLOW_ANONYMOUS=true` 配合网络层隔离）。
- 证据：
  - `artifacts/p1p2_fix_evidence/P1-BE-SEC-001_metrics_no_token.txt`
  - `artifacts/p1p2_fix_evidence/P1-BE-SEC-001_metrics_with_token.txt`
  - `artifacts/p1p2_fix_evidence/P1-BE-SEC-001_acceptance.txt`
- Owner：Ops

### P1-MP-SUBSCRIBE-001：订阅消息模板改为后端下发（Done）

- 现状（修复后）：前端通过 `/api/study/reminders/config` 获取 templateId；后端由 `STUDY_REMINDER_TEMPLATE_ID` 注入固定模板 ID；订阅与发送字段映射已对齐模板要求。
- 证据：
  - `artifacts/p1mp_subscribe_evidence/E1_backend_config.txt`
  - `artifacts/p1mp_subscribe_evidence/E2_miniprogram_subscribe_steps.md`
  - `artifacts/p1mp_subscribe_evidence/E3_backend_payload_mapping.md`
- Owner：WeChatAdmin

### P1-MP-CONTENT-001：协议/隐私最终文案与落库机制已完成（Done）

- 现状（修复后）：后端启动链路在 production/staging 自动 upsert 协议/隐私内容；小程序本地兜底已同步最终文案，后端不可用时仍可展示。
- 证据：
  - `artifacts/p1mp_content_evidence/E1_ensure_script_run.txt`
  - `artifacts/p1mp_content_evidence/E2_curl_content.txt`
  - `artifacts/p1mp_content_evidence/E3_miniprogram_fallback_steps.md`
- Owner：Ops

## 5. P2 建议清单（同上）

### P2-BE-CONFIG-001：生产配置校验逻辑去重（Done）

- 现状（修复后）：仅保留 `src/config.ts` 的生产校验逻辑。
- 证据：
  - `artifacts/p1p2_fix_evidence/P2-BE-CONFIG-001_dedup_rg.txt`
  - `artifacts/p1p2_fix_evidence/P2-BE-CONFIG-001_prod_validation_output.txt`
  - `artifacts/p1p2_fix_evidence/P2-BE-CONFIG-001_acceptance.txt`

### P2-MP-TERMS-001：用户拒绝协议仅 toast 提示，不阻断继续使用（Done）

- 现状（修复后）：全局 Page onShow guard 强制拦截未同意用户；协议页提供同意落盘与拒绝退出路径。
- 证据：
  - `artifacts/terms_blocking_evidence/E1_blocking_steps.md`
  - `artifacts/terms_blocking_evidence/E2_reject_exit.md`
  - `artifacts/terms_blocking_evidence/E3_accept_storage.md`
  - `artifacts/terms_blocking_evidence/E4_rg_guard.txt`

### P2-MP-URL-001：trial/release 强制 https（Done）

- 现状（修复后）：trial/release 环境非 https 直接拒绝；仅 develop/devtools 允许 http。
- 证据：
  - `artifacts/p1p2_fix_evidence/P2-MP-URL-001_verify_https_policy.txt`
  - `artifacts/p1p2_fix_evidence/P2-MP-URL-001_rg_config_urls.txt`

## 6. 小程序端审计结果（域名/隐私/敏感能力/弱网处理）

### 6.1 网络域名与开发态残留

- 代码侧实际域名候选（见 `artifacts/mp_urls.txt`）：
  - `http://localhost:8080/api`（develop + devtools）
  - `https://api-staging.lailinkeji.com/api`（trial）
  - `https://api.lailinkeji.com/api`（release）
- 内网/IP/localhost 结论：
  - 已移除 dev-settings 页面与内网/IP 文案命中（证据：`artifacts/p0_fix_evidence/p0-mp-review-001_no_internal_ip.txt`）
- URL 拼接与非法字符硬拒绝：
  - `miniprogram/utils/request.js:75-85` 对全角冒号/引号/空格等做 INVALID_URL 拒绝（这是对真机 ERR_INVALID_URL 的正确防线）

### 6.2 隐私合规与用户同意 gating

- 已启用微信隐私检查：`miniprogram/app.json:2 __usePrivacyCheck__=true`
- 代码侧隐私兜底链路：
  - `miniprogram/utils/privacy.js:65-80` 注册 `wx.onNeedPrivacyAuthorization`
  - `miniprogram/pages/profile/index.js:79-83` 在 getPhoneNumber 前显式调用 `ensurePrivacyAuthorized`
- 缺口（需要人工确认/后台配置）：见 `artifacts/wechat_admin_checklist.md`

### 6.3 敏感能力与审核敏感点

- 敏感调用点汇总：见 `artifacts/mp_sensitive_apis.txt`（核心包括 getPhoneNumber / requestSubscribeMessage / downloadFile+openDocument / saveImageToPhotosAlbum / scanCode）
- getPhoneNumber：
  - UI 在 `REVIEW_ONLY_MODE` 下隐藏（`miniprogram/pages/profile/index.wxml:10-18`），但代码仍存在，需要准备后台能力/额度/审核说明。
- 订阅消息：
  - 模板 ID 后端下发：`bookworm-backend/src/routes/study.ts`
  - 失败降级：缺失模板时 UI 提示“未配置模板”且不中断主流程

### 6.4 小程序不兼容 API 风险（运行期崩溃）

- 扫描命中（`artifacts/mp_web_api_hits.txt`）均为注释/说明性文本或通用函数名，不构成真实运行期 Web-only API 使用证据。

### 6.5 核心链路错误处理与弱网降级（静态走查）

- 请求封装：`miniprogram/utils/request.js`
  - 默认超时：8000ms（`timeout = 8000`）
  - 重试：仅 GET/HEAD + 网络错误或 5xx（指数退避 100/300/900ms）
  - 错误结构：补 `requestId/statusCode/url`，便于上层展示与排障
- 401/登录链路：`miniprogram/utils/api.js` + `miniprogram/utils/auth-guard.js`
  - 401 清 token 后仅重试一次，避免死循环（`api.js:36-42`）
  - 并发登录用单例 Promise 去重（`auth-guard.js:7-110`）

## 7. 后端部署审计结果（env 清单/health/迁移/回滚与观测）

### 7.1 基本命令可用性（只读验证）

- `npm ci` / `npm run lint` / `npm test` / `npm run build` 均返回 exit code 0（详见 `artifacts/p1p2_fix_evidence/P1-BE-SEC-001_acceptance.txt`）

### 7.2 生产环境变量清单（从 config schema 反推）

#### 生产必需（NODE_ENV=production 或 staging）
- DATABASE_URL：数据库连接（缺失：启动失败；`bookworm-backend/src/config.ts:132-136`）
- JWT_SECRET：JWT 签名密钥（缺失/弱口令：启动失败；`bookworm-backend/src/config.ts:125-130`）
- WX_APP_ID / WX_APP_SECRET：微信登录（缺失：启动失败；`bookworm-backend/src/config.ts:137-155`）
- HOST：生产需可达地址（缺失/127.0.0.1：启动失败；`bookworm-backend/src/config.ts:187-190`）
- CORS_ORIGIN：生产必须显式配置（缺失：启动失败；`bookworm-backend/src/config.ts:192-195`）

#### production 额外必需（支付开启条件）
- WXPAY_MCHID / WXPAY_PRIVATE_KEY_PATH / WXPAY_CERT_SERIAL_NO / WXPAY_API_V3_KEY / WXPAY_NOTIFY_URL（缺失：启动失败；`bookworm-backend/src/config.ts:157-178`）

#### 可选/有默认值（生产缺失不应导致启动失败）
- LOG_LEVEL、JWT_EXPIRES_IN、TANSHU_API_KEY、各类 cron/限流/业务常量等（见 `bookworm-backend/src/config.ts:11-82`）

#### 静态扫描证据
- env 使用点：`artifacts/be_env_usage.txt`
- env 关键词命中：`artifacts/be_env_keywords.txt`

### 7.3 健康检查与启动路径

- Health URL：`GET /api/health`
- 依赖检查：数据库 `SELECT 1`
- 返回码：
  - 成功：200 `{ status: "ok", checks: { database: "ok" } }`
  - 失败：503 `{ status: "error", checks: { database: "failed" } }`
- 证据：`bookworm-backend/src/routes/health.ts:7-33`

### 7.4 迁移与部署一致性

- 生产迁移入口：`bookworm-backend/entrypoint.sh:4 npx prisma migrate deploy`
- 镜像构建：`bookworm-backend/Dockerfile.prod`（编译产物与 entrypoint 需要进一步统一，见 P0-BE-DEPLOY-002）
- 建议：将“迁移链可用性验证”固化为发布闸门（当前仓库已存在相关 CI 经验文档）

### 7.5 回滚点与可观测性（最低限）

- 回滚最小单元：
  - Prisma migrations：`bookworm-backend/prisma/migrations/`（以目录为单位）
  - Docker 镜像 tag：建议以 commit/tag 固定可回滚版本
- 错误日志落盘（JSONL）：
  - `bookworm-backend/src/index.ts:107-145`（包含 timestamp、url、requestId、userId、params/query/body、stack）
- /metrics 暴露：见 P1-BE-SEC-001

## 8. 微信后台待人工确认清单（按项勾选）

- 详见：`artifacts/wechat_admin_checklist.md`

## 9. 端到端最小验证方案（可执行步骤 + 通过标准）

### 9.1 后端（本地/CI 可执行）

1. `cd bookworm-backend`
2. `npm ci`
3. `npm run build`
4. 启动（注意当前 start 脚本路径存在 P0 分叉）：
   - 若按 Dockerfile.prod/entrypoint 路径：`node dist/src/index.js`
5. 验证 health：
   - `GET http://localhost:8080/api/health` 期望 `200` 且 `checks.database=ok`

通过标准：
- health 返回 200 且包含数据库检查 ok
- 任意请求失败时，后端日志可定位到 requestId（修复 P1-BE-OBS-001 后要求更强）

### 9.2 小程序（需本地/人工在微信开发者工具与真机执行）

真机检查点（复习主链路）：
1. 启动小程序（release 环境配置正确的 request 域名）
2. 进入“复习”Tab：加载 dashboard/courses（无白屏、无长时间 loading）
3. 进入课程：完成一次闪卡/测验并提交
4. 查看统计更新（热力图/周榜/学习记录）
5. 打开急救包：验证 downloadFile+openDocument 和 saveImageToPhotosAlbum 的权限引导与失败提示
6. 点击“复习提醒设置”：订阅消息能弹出系统授权并有明确成功/失败提示

弱网验证：
- 断网/超时：应提示“网络请求失败”，并有可重试入口（至少重新进入页面或点击重试按钮）

## 10. 附录：扫描输出索引（artifacts/ 下文件列表）

- `artifacts/INDEX.txt`（自动生成文件清单）
