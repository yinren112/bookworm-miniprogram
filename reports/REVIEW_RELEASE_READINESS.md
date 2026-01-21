# 复习模式上线就绪度报告（发布可复制性 & 门禁）

生成时间：2025-12-18  
范围：`bookworm-backend/`（后端 + Prisma 迁移），`miniprogram/`（小程序复习分包 + 发布链路）

## 结论摘要（P0/P1/P2）

### P0（必须清零才可提审/上线）
- P0：已清零（见第 1/4/5 节的命令证据与修复记录）。

### P1（上线前建议完成）
- P1-1：`miniprogram-ci` 已补齐文档口径，但缺少上传密钥、IP 白名单与一次真实预览/上传的证据。

### P2（非阻塞但需留痕）
- P2-1：PowerShell 启动 Profile 导致 `Set-ExecutionPolicy` 报错噪音（不影响业务，但影响命令证据可读性）。

## 1. 可复制发布（Prisma 迁移演练）

### 1.1 空库迁移演练：`prisma migrate deploy`
- 命令：
  - `cd bookworm-backend`
  - `DATABASE_URL=postgresql://postgres:password@localhost:5432/bookworm_migrate_smoke_20251218?schema=public node ./node_modules/prisma/build/index.js migrate deploy`
- 证据（输出摘要）：
  - `28 migrations found in prisma/migrations`
  - `All migrations have been successfully applied.`

### 1.2 迁移状态：`prisma migrate status`
- 命令：
  - `cd bookworm-backend`
  - `DATABASE_URL=postgresql://postgres:password@localhost:5432/bookworm_migrate_smoke_20251218?schema=public node ./node_modules/prisma/build/index.js migrate status`
- 证据（输出摘要）：
  - `Database schema is up to date!`

### 1.3 Schema 漂移：`prisma migrate diff --from-migrations --to-schema-datamodel`
- 命令：
  - `cd bookworm-backend`
  - `SHADOW_DATABASE_URL=postgresql://postgres:password@localhost:5432/bookworm_shadow_smoke_20251218?schema=public node ./node_modules/prisma/build/index.js migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $SHADOW_DATABASE_URL`
- 证据（输出摘要）：
  - `No difference detected.`

## 2. 迁移异常清单（基于仓库静态扫描）

### 2.1 历史异常修复记录（路线 A：允许重置开发库）
- 已将“早于基线的复习迁移”重命名并移到 `add_study_system` 之后，避免空库 `migrate deploy` 首发失败：
  - `20241218100000_add_quiz_attempt_idempotency` → `20251218094718_add_quiz_attempt_idempotency`
  - `20241218100001_add_course_stats_triggers` → `20251218094717_add_course_stats_triggers`
- 已将“目录名与 SQL 内容不一致”的迁移重命名为真实语义，避免误导与热修对齐混乱：
  - `20251218094716_add_quiz_attempt_idempotency` → `20251218094716_add_study_cheat_sheet_unit_fkey`

### 2.2 目录名与 SQL 内容不一致
- 已修复（见 2.1）。

### 2.3 重复迁移目录（含空迁移）
- `bookworm-backend/prisma/migrations/20251015081442_add_userprofile_analytics_index` 与 `20251015081500_add_userprofile_analytics_index`：后者为空迁移。
- `bookworm-backend/prisma/migrations/20251019113724_add_webhook_deduplication` 与 `20251019114135_add_webhook_deduplication`：后者为空迁移。

## 3. 关键约束与触发器存在性（目标态）

### 3.1 幂等唯一约束（复习答题）
- 目标：`user_question_attempt` 上存在唯一约束/唯一索引（`session_id, user_id, question_id`）。
- 证据采集（空库迁移后执行）：
  - `\d user_question_attempt` 显示 `UNIQUE CONSTRAINT, btree (session_id, user_id, question_id)`
  - `pg_constraint` 查询返回 `uniq_attempt_session_user_question | UNIQUE (session_id, user_id, question_id)`

### 3.2 课程统计触发器（total_cards/total_questions）
- 目标：`study_card` / `study_question` 的 INSERT/DELETE 触发器能够维护 `study_course.total_cards/total_questions`。
- 证据采集（空库迁移后执行）：
  - `pg_trigger` 查询返回：`trg_study_card_count`、`trg_study_question_count`

## 4. 后端质量门禁（CI 硬门禁）

### 4.1 ESLint
- 命令：`cd bookworm-backend && npm run lint`
- 证据（输出摘要）：
  - `node ./node_modules/eslint/bin/eslint.js .` 退出码为 0（仅存在 Node ESM 解析告警，不影响门禁）

### 4.2 单测
- 命令：`cd bookworm-backend && node ./node_modules/vitest/vitest.mjs run --coverage`
- 证据（输出摘要）：
  - `Test Files 8 passed`
  - `Tests 116 passed`

### 4.3 Build
- 命令：`cd bookworm-backend && node ./node_modules/typescript/bin/tsc`
- 证据（输出摘要）：
  - `tsc` 退出码为 0

## 5. 小程序发布门禁

### 5.1 隐私保护指引判定（微信侧）
- 事实扫描（仓库）：
  - 存在 `open-type="getPhoneNumber"`（`miniprogram/pages/profile/index.wxml`），属于敏感能力入口。
  - 已在 `miniprogram/app.json` 声明 `requiredPrivateInfos: ["getPhoneNumber"]`。
  - 已接入隐私指引兜底链路（`miniprogram/utils/privacy.js`），在 `miniprogram/app.js` 启用 `wx.onNeedPrivacyAuthorization`，并通过 `getPrivacySetting` 判定后引导 `openPrivacyContract`。
- 结论：
  - 需要接入（因为存在手机号授权入口且属于隐私敏感能力）。
  - 运行时是否触发 `needAuthorization` 取决于微信后台“隐私保护指引”配置与版本灰度；代码侧已按标准链路兜底。

### 5.2 miniprogram-ci 发布链路
- 文档：`docs/RELEASE_MINIPROGRAM_CI.md`
- 结论：P1（缺少上传密钥与白名单证据，仓库内已补齐可重复执行的命令口径与参数约定）

### 5.3 前端临时代码扫描
- 扫描：`rg -n "TODO|FIXME" -S miniprogram`
- 证据（输出摘要）：无匹配（`rg` 退出码为 1）

## 6. 决策记录（迁移修复路线）

默认路线：A（重建/整理迁移历史，以空库 deploy 为唯一裁判）。  
切换到路线 B（热修对齐）的条件：发现已有必须兼容的线上库，且 `_prisma_migrations` 历史不可重写。

证据（仓库侧）：未发现“已有生产库不可重置”的硬证据；本次修复采用“重命名迁移目录”的方式，等价于要求开发/测试环境通过重置或 `migrate resolve` 重新对齐。
