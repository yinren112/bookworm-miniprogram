# METRICS_IMPLEMENT_REPORT_20260127

## 变更文件
- bookworm-backend/src/plugins/metrics.ts
- bookworm-backend/src/routes/study.ts
- bookworm-backend/src/services/study/courseService.ts
- docs/release/2026-01-27_course_versioning.md
- docs/audits/CHANGE_SCOPE_DECISION_20260127.md

## 指标名与触发口径
- bookworm_course_scope_required_total
  - 触发：`bookworm-backend/src/routes/study.ts` 中缺 courseKey/courseId 且 requireCourseKey=true 时抛 `COURSE_SCOPE_REQUIRED` 前自增。
- bookworm_course_publish_archive_failed_total
  - 触发：`bookworm-backend/src/services/study/courseService.ts` 中归档旧 PUBLISHED updateMany 抛错，或归档后同 courseKey 的 PUBLISHED 数量仍 > 1 时自增。
- bookworm_enrollment_active_conflict_total
  - 触发：`bookworm-backend/src/services/study/courseService.ts` 的 enrollCourse 事务内发现同 user+courseKey 仍有多条 is_active=true 时自增。

## Gate 脚本回归结果摘要
- 运行脚本：`scripts/release/run_gates.ps1`
- 结果摘要（来自 `docs/audits/gate_run_20260127_summary.txt`）：
  - Gate-1 lint: PASS (4.0s)
  - Gate-2 build: PASS (9.3s)
  - Gate-3 unit tests: PASS (9.5s)
  - Gate-4 integration (standard test DB): PASS (200.0s)
  - Gate-5 migrate deploy: PASS (4.4s)
  - Gate-5 migrate status: PASS (3.0s)
  - Gate-5 integration (empty DB + deploy): PASS (290.6s)
