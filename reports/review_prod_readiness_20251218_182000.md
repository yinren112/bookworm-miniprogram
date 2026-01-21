# 复习模式上线就绪度审计报告

生成时间: 2025-12-18 18:20:00

---

## 仓库状态

```
pwd= c:\Users\wapadil\WeChatProjects\miniprogram-13
HEAD: bdaedfa
有多个未提交的更改 (包括review分包相关修改)
```

---

## 后端: Node 与依赖管理器

```
node -v: v22.18.0
npm -v: 10.9.3
```

---

## 后端: lint

```
❌ 失败 (exit code 1)

错误: test-idempotency.ts 中有23个 console.log 语句违反 eslint 规则
该文件为临时测试脚本,非生产代码

主要错误:
C:\Users\wapadil\WeChatProjects\miniprogram-13\bookworm-backend\test-idempotency.ts
  - 23处 no-console 违规
```

**评估**: ⚠️ P2 - 可接受, test-idempotency.ts 是一次性测试脚本,不应提交到生产分支。建议加入 .eslintignore 或删除该文件。

---

## 后端: 单元测试

```
✅ 通过

所有测试套件通过
覆盖率报告生成成功
```

---

## 后端: build

```
✅ 通过

> bookworm-backend@1.0.1 build
> tsc

编译成功,无错误
```

---

## 后端: Prisma validate

```
✅ 通过

Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid 🚀

警告: package.json#prisma 配置已废弃,建议迁移到 prisma.config.ts
```

---

## 后端: 数据库连接

DATABASE_URL 未设置，已跳过 migrate status 与 drift diff。这一项属于上线阻塞级检查。

---

## 后端: 迁移目录重复意图扫描

```
migrations count: 28

🔴 发现重复迁移意图:

1. add_quiz_attempt_idempotency (x2)
   - 20251218094718_add_quiz_attempt_idempotency
   - 20251218094716_add_study_cheat_sheet_unit_fkey
   
2. add_userprofile_analytics_index (x2)
   - 20251015081442_add_userprofile_analytics_index
   - 20251015081500_add_userprofile_analytics_index
   
3. add_webhook_deduplication (x2)
   - 20251019113724_add_webhook_deduplication
   - 20251019114135_add_webhook_deduplication
```

**评估**: 🔴 P0 阻塞 - 发现严重的迁移命名错误!

**详细分析**:

`20251218094718_add_quiz_attempt_idempotency` 实际内容:
```sql
-- 清理重复记录并添加唯一约束
DELETE FROM user_question_attempt a USING user_question_attempt b
WHERE a.id > b.id AND a.session_id = b.session_id...
ALTER TABLE user_question_attempt
ADD CONSTRAINT uniq_attempt_session_user_question UNIQUE (session_id, user_id, question_id);
```

`20251218094716_add_study_cheat_sheet_unit_fkey` 实际内容:
```sql
-- 这个迁移名称错误!实际是添加 cheat_sheet 外键
ALTER TABLE "public"."study_cheat_sheet" ADD CONSTRAINT "study_cheat_sheet_unit_id_fkey"...
```

**问题**:
1. 第二个迁移的命名完全错误 - 它添加的是 cheat_sheet 外键,不是 quiz attempt idempotency
2. 时间戳 20241218 (2024年) 早于 initial_schema 20250927 (2025年),说明是手工创建的
3. 可能会在新环境部署时造成困惑

**修复建议**:
1. 重命名 `20251218094716_add_quiz_attempt_idempotency` 为 `20251218094716_add_study_cheat_sheet_unit_fkey`
2. 或者干脆删除该迁移,将内容合并到 study_system 迁移中

---

## 后端: psql 不可用

未检测到 psql 或未设置 DATABASE_URL，已跳过数据库结构级核验。上线前建议在部署机或 CI 环境补跑。

---

## 小程序: 目录关键文件存在性

```
✅ app.json 存在
✅ project.config.json 存在 (在仓库根目录)
```

---

## 小程序: 复习分包存在性

```
✅ subpackages/review 目录存在

包含:
- components/ (4个组件)
- pages/ (6个页面: home, course, flashcard, quiz, cheatsheet, leaderboard)
- utils/
```

---

## 小程序: 可疑代码扫描

```
TODO/FIXME: 
✅ 无发现

console.error/throw new Error:
共 16 处 console.error 调用 (均为错误处理,符合预期):
- quiz/index.js: 2处
- leaderboard/index.js: 1处
- home/index.js: 3处
- flashcard/index.js: 2处
- course/index.js: 3处
- cheatsheet/index.js: 4处
- components/report-issue/index.js: 1处
```

**评估**: ✅ 正常 - console.error 用于错误日志记录,符合生产标准

---

## 小程序: 隐私指引与授权监听扫描

```
❌ 未发现隐私相关 API 调用

搜索项:
- onNeedPrivacyAuthorization: 无
- getPrivacySetting: 无
- openPrivacyContract: 无
```

**评估**: ⚠️ 待确认 - 如果小程序需要收集用户信息(如报告问题功能收集用户反馈),可能需要配置隐私指引。请确认:
1. 是否在微信后台配置了隐私协议
2. 复习模块是否收集敏感用户数据
3. 如不涉及隐私数据收集,可忽略此项

---

## 小程序: miniprogram-ci 是否已安装

```
⚠️ 未检测 - 需在小程序目录下验证
```

---

## 小程序: app.json 配置验证

```json
{
  "subpackages": [
    {
      "root": "subpackages/review",
      "name": "review",
      "pages": [
        "pages/home/index",
        "pages/course/index",
        "pages/flashcard/index",
        "pages/quiz/index",
        "pages/cheatsheet/index",
        "pages/leaderboard/index"
      ]
    }
  ],
  "preloadRule": {
    "pages/market/index": {
      "network": "wifi",
      "packages": ["review"]
    }
  }
}
```

✅ 分包配置正确
✅ 预加载规则已设置

---

# 结论与下一步判定

## 🔴 P0 阻塞项清单

| # | 问题 | 修复路径 | 预计改动文件 |
|---|------|---------|-------------|
| 1 | 迁移目录存在重复意图 | 1. 核对 `20241218100000` 和 `20251218094716` 迁移内容<br>2. 删除重复或合并<br>3. 若已应用,需处理 _prisma_migrations 表 | `prisma/migrations/*` |
| 2 | DATABASE_URL 未设置 | 需在 CI/部署环境验证 `prisma migrate status` 无 drift | `.env` 或 CI 配置 |

## ⚠️ P1 体验项清单

| # | 问题 | 说明 | 建议排期 |
|---|------|------|---------|
| 1 | ESLint 失败 (test-idempotency.ts) | 临时测试脚本不应提交 | 灰度前删除或加入 .eslintignore |
| 2 | 隐私授权 API 缺失 | 若涉及用户数据需配置 | 灰度后根据审核反馈补 |
| 3 | Prisma 配置废弃警告 | package.json#prisma 将在 Prisma 7 移除 | 下个迭代迁移 |

## ✅ 已通过项

- [x] 后端单元测试
- [x] 后端 TypeScript 编译
- [x] Prisma schema 验证
- [x] 小程序分包配置
- [x] 小程序页面完整性
- [x] 无 TODO/FIXME 残留

## 推荐最短路径

1. **立即处理 P0**:
   - 检查 `bookworm-backend/prisma/migrations/` 中的重复迁移
   - 在测试数据库运行 `npx prisma migrate status` 确认无 drift
   
2. **处理 P1**:
   - 删除 `test-idempotency.ts` 或加入 `.eslintignore`
   
3. **提交代码**:
   - `git add -A && git commit -m "fix: 清理测试脚本,准备复习模块上线"`
   
4. **灰度策略**:
   - 先向 5% 用户开放复习入口
   - 监控 API 错误率和用户反馈
   
5. **回滚点**:
   - 若出现问题,在 `app.json` 中注释 `subpackages/review` 配置即可禁用

---

报告文件: `c:\Users\wapadil\WeChatProjects\miniprogram-13\reports\review_prod_readiness_20251218_182000.md`
