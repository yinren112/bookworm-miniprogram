# TECH_RELEASE_AUDIT_ACTION_PLAN

**P0**
- 无。

**P1**
- `BACK-SEC-001` 位置: `bookworm-backend/package.json`、`bookworm-backend/package-lock.json`。已完成（2026-02-05）：升级 fastify 到修复版本并回归。验收步骤: `npm audit` 不再报告 fastify 高危，`scripts/release/run_gates.ps1` 全通过。回滚策略: 回退 fastify 版本与锁文件，恢复原依赖并重跑 gate。

**P2**
- `BACK-OPS-002` 位置: `bookworm-backend/src/services/study/reminderService.ts`。已完成（2026-02-05）：axios 调用增加 timeout。验收步骤: 微信上游不可达时任务在超时内返回，下一次 cron 能继续执行。回滚策略: 恢复 timeout 改动并保留日志。
- `FRONT-DATA-001` 位置: `miniprogram/pages/review/index.js`、`miniprogram/utils/cache.js`。已完成（2026-02-05）：缓存键加入 userId 维度。验收步骤: 切换账号后复习首页不再读取旧缓存。回滚策略: 恢复旧缓存键策略。
- `FRONT-OBS-002` 位置: `miniprogram/utils/request.js`、`miniprogram/app.js`。已完成（2026-02-05）：请求失败分支增加统一埋点/上报并限流。验收步骤: 人为制造 500/断网时产生可检索的错误事件。回滚策略: 删除新增埋点逻辑，保持原行为。

**P3**
- `FRONT-PERF-003` 位置: `miniprogram/pages/review/index.js`、`miniprogram/utils/cache.js`。已完成（2026-02-05）：增加 onShow 冷却守卫。验收步骤: 频繁切换 Tab 时网络请求数量显著下降。回滚策略: 删除守卫逻辑。
- `DEPS-DRIFT-004` 位置: `package.json`、`package-lock.json`。已完成（2026-02-05）：锁文件版本对齐。验收步骤: 版本号一致、`npm ci` 可重复。回滚策略: 恢复旧锁文件。
- `DEPS-SEC-005` 位置: `package-lock.json`。已完成（2026-02-05）：根目录 `npm audit` 清零。验收步骤: 根目录 `npm audit` 不再报告 js-yaml 漏洞。回滚策略: 恢复依赖与锁文件。
