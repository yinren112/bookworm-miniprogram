# 2026-01-27 Course Versioning Release

## 变更摘要

### DB
- `user_course_enrollment` 增加 `is_active`（默认 true），用于保证同 courseKey 仅一条激活报名记录。
- `study_cheat_sheet` 增加 `stable_key`（NOT NULL）并建立唯一索引，用于去重与稳定标识。
- 迁移中对存量 cheatsheet 进行 stable_key 回填并去重。

### API
- `POST /api/study/cards/:contentId/answer` 缺少 `courseKey/courseId` 时返回 400 `COURSE_SCOPE_REQUIRED`。
- `POST /api/study/star` 与 `DELETE /api/study/star` 缺少 `courseKey` 时返回 400 `COURSE_SCOPE_REQUIRED`。
- 发布新版本课程时，旧版本同 `courseKey` 的 `PUBLISHED` 自动归档为 `ARCHIVED`，保证唯一 `PUBLISHED`。
- 课程报名时强制同 `courseKey` 仅一条 `is_active=true`。

### 小程序
- 卡片提交与星标请求补充 `courseKey` 以避免跨课程歧义。

## 发布顺序（先小程序后后端）
1. 小程序发布：确保客户端在卡片提交/星标请求中携带 `courseKey`。
2. 后端发布：开启 course scope 校验与课程版本归档逻辑。

## 回滚策略
- 小程序回滚：可直接回滚，后端兼容携带 `courseKey` 的请求。
- 后端回滚（重点）：
  - 本次迁移将 `study_cheat_sheet.stable_key` 设为 NOT NULL 并加唯一索引。
  - 若回滚到旧后端版本（未写入 stable_key），新增/更新 cheatsheet 可能失败。
  - 建议：避免单独回滚后端；如必须回滚，应先准备兼容补丁（回滚版本补写 stable_key），或保留新后端继续服务。
  - DB 回滚需删除 `stable_key` 列与唯一索引并移除 `is_active` 列，属于高风险操作，不建议在生产执行。

## 已知告警
- 测试环境 WeChat Pay SDK 初始化警告：测试证书缺失导致，不影响线上。
- 集成测试日志出现 node-cron sourcemap 警告与 MaxListeners 警告：为测试环境现象，未影响结果判定。

## 上线观测与回滚触发阈值

### 计数口径（统一定义）
- COURSE_SCOPE_REQUIRED：卡片答题与星标接口缺 courseKey/courseId 触发的 400 错误计数；比例=该错误数 / 同类请求总数。
- publish_archive_old_published_failed：发布新版本时归档旧 PUBLISHED 失败的计数（出现异常或归档后仍存在同 courseKey 多个 PUBLISHED）。
- enrollment_active_conflict：同一用户同 courseKey 出现多条 is_active=true 的计数（写入/校验时发现冲突）。

### 方案 A（仅文档与排障流程，不改代码）
- 观测方式：
  - COURSE_SCOPE_REQUIRED：从 API 错误日志中按 code 统计并与同接口请求量对比。
  - publish_archive_old_published_failed：发布后运行 SQL 校验，发现即记录为 1。
  - enrollment_active_conflict：日常巡检 SQL 校验，发现即记录为 1。
- SQL 校验建议：
  - 多个 PUBLISHED：`SELECT course_key, COUNT(*) FROM study_course WHERE status='PUBLISHED' GROUP BY course_key HAVING COUNT(*) > 1;`
  - 多条激活报名：`SELECT uce.user_id, sc.course_key, COUNT(*) FROM user_course_enrollment uce JOIN study_course sc ON sc.id=uce.course_id WHERE uce.is_active=TRUE GROUP BY uce.user_id, sc.course_key HAVING COUNT(*) > 1;`
- 回滚触发阈值：
  - COURSE_SCOPE_REQUIRED > 3% 且持续 15 分钟：优先回滚小程序版本或全量要求携带 courseKey 的发布。
  - publish_archive_old_published_failed ≥ 1：停止发布并回滚后端至上一个版本。
  - enrollment_active_conflict ≥ 1：停止新报名入口并回滚后端，随后修复数据。

### 方案 B（已执行）
- 指标注册：`bookworm-backend/src/plugins/metrics.ts`
  - `bookworm_course_scope_required_total`
  - `bookworm_course_publish_archive_failed_total`
  - `bookworm_enrollment_active_conflict_total`
- 触发位置：
  - `bookworm-backend/src/routes/study.ts`：抛出 `COURSE_SCOPE_REQUIRED` 时自增。
  - `bookworm-backend/src/services/study/courseService.ts`：
    - 归档旧 PUBLISHED 失败或归档后仍存在多个 PUBLISHED 时自增。
    - enrollCourse 事务内检测到多条 is_active=true 时自增。
