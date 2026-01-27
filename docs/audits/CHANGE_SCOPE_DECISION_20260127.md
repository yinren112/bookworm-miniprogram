# CHANGE_SCOPE_DECISION_20260127

## 命令输出日志

### git status --porcelain
```
 M .gitignore
 M AGENTS.md
 M RELEASE_BLOCKERS.json
 M RELEASE_READINESS_REPORT.md
 M bookworm-backend/prisma/schema.prisma
 M bookworm-backend/prisma/seed.ts
 M bookworm-backend/src/db/views/studyViews.ts
 M bookworm-backend/src/routes/study.ts
 M bookworm-backend/src/routes/studySchemas.ts
 M bookworm-backend/src/services/study/courseService.ts
 M bookworm-backend/src/services/study/importService.ts
 M bookworm-backend/src/tests/study-star.integration.test.ts
 M miniprogram/subpackages/review/pages/flashcard/index.js
 M miniprogram/utils/study-api.js
?? bookworm-backend/prisma/migrations/20260127193000_add_study_course_versioning/
?? bookworm-backend/src/tests/import-cheatsheet-dedup.integration.test.ts
?? bookworm-backend/src/tests/study-card-submit-scoped-by-course.integration.test.ts
?? bookworm-backend/src/tests/study-course-scope-required.integration.test.ts
?? bookworm-backend/src/tests/study-course-versioning.integration.test.ts
?? bookworm-backend/src/tests/study-enrollment-active.integration.test.ts
?? docs/audits/LAUNCH_AUDIT_accounts_courses_study.md
?? docs/audits/LAUNCH_FINAL_GATE_REPORT_20260127.md
?? docs/audits/STOP_REPORT_20260127.md
?? docs/audits/gate_run_20260127_summary.txt
?? docs/release/
?? reports/LAUNCH_FIX_REPORT_integration_f.md
?? scripts/release/
```

### git diff --name-status
```
M	.gitignore
M	AGENTS.md
M	RELEASE_BLOCKERS.json
M	RELEASE_READINESS_REPORT.md
M	bookworm-backend/prisma/schema.prisma
M	bookworm-backend/prisma/seed.ts
M	bookworm-backend/src/db/views/studyViews.ts
M	bookworm-backend/src/routes/study.ts
M	bookworm-backend/src/routes/studySchemas.ts
M	bookworm-backend/src/services/study/courseService.ts
M	bookworm-backend/src/services/study/importService.ts
M	bookworm-backend/src/tests/study-star.integration.test.ts
M	miniprogram/subpackages/review/pages/flashcard/index.js
M	miniprogram/utils/study-api.js
warning: in the working copy of '.gitignore', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'RELEASE_BLOCKERS.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'RELEASE_READINESS_REPORT.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'bookworm-backend/prisma/schema.prisma', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'bookworm-backend/prisma/seed.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'bookworm-backend/src/routes/study.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'bookworm-backend/src/tests/study-star.integration.test.ts', LF will be replaced by CRLF the next time Git touches it
```

### git diff --stat
```
 .gitignore                                         |  34 --
 AGENTS.md                                          |  62 +--
 RELEASE_BLOCKERS.json                              |  20 +-
 RELEASE_READINESS_REPORT.md                        |   8 +-
 bookworm-backend/prisma/schema.prisma              |   3 +
 bookworm-backend/prisma/seed.ts                    |  16 +
 bookworm-backend/src/db/views/studyViews.ts        |  81 +++-
 bookworm-backend/src/routes/study.ts               |  74 ++-
 bookworm-backend/src/routes/studySchemas.ts        |  47 +-
 .../src/services/study/courseService.ts            | 503 ++++++++++++++-------
 .../src/services/study/importService.ts            | 182 +++++---
 .../src/tests/study-star.integration.test.ts       |   7 +-
 .../subpackages/review/pages/flashcard/index.js    |  17 +-
 miniprogram/utils/study-api.js                     |  30 +-
 14 files changed, 677 insertions(+), 407 deletions(-)
warning: in the working copy of '.gitignore', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'RELEASE_BLOCKERS.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'RELEASE_READINESS_REPORT.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'bookworm-backend/prisma/schema.prisma', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'bookworm-backend/prisma/seed.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'bookworm-backend/src/routes/study.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'bookworm-backend/src/tests/study-star.integration.test.ts', LF will be replaced by CRLF the next time Git touches it
```

## 变更边界决策表

| 文件 | 变更类型(新增/修改) | 是否与课程版本/课程scope/cheatsheet去重直接相关 | 处理动作(KEEP/SPLIT/REVERT) | 理由(一句话) | 精确命令 |
| --- | --- | --- | --- | --- | --- |
| .gitignore | 修改 | 否 | REVERT | 与课程逻辑无关的忽略规则调整。 | `git restore .gitignore` |
| AGENTS.md | 修改 | 否 | REVERT | 说明文档格式变动与本次范围无关。 | `git restore AGENTS.md` |
| RELEASE_BLOCKERS.json | 修改 | 否 | REVERT | 发布阻塞状态更新不在本次课程一致性范围。 | `git restore RELEASE_BLOCKERS.json` |
| RELEASE_READINESS_REPORT.md | 修改 | 否 | REVERT | 发布准备报告更新不在本次课程一致性范围。 | `git restore RELEASE_READINESS_REPORT.md` |
| docs/audits/LAUNCH_AUDIT_accounts_courses_study.md | 新增 | 否 | REVERT | 审计草稿文件非本次提交范围。 | `git clean -f -- docs/audits/LAUNCH_AUDIT_accounts_courses_study.md` |
| docs/audits/LAUNCH_FINAL_GATE_REPORT_20260127.md | 新增 | 否 | REVERT | 闸门审计报告非本次提交范围。 | `git clean -f -- docs/audits/LAUNCH_FINAL_GATE_REPORT_20260127.md` |
| docs/audits/STOP_REPORT_20260127.md | 新增 | 否 | REVERT | 中止说明文件非本次提交范围。 | `git clean -f -- docs/audits/STOP_REPORT_20260127.md` |
| docs/audits/gate_run_20260127_summary.txt | 新增 | 否 | REVERT | 闸门摘要文件非本次提交范围。 | `git clean -f -- docs/audits/gate_run_20260127_summary.txt` |
| reports/LAUNCH_FIX_REPORT_integration_f.md | 新增 | 否 | REVERT | 报告文件非本次提交范围。 | `git clean -f -- reports/LAUNCH_FIX_REPORT_integration_f.md` |
| scripts/release/run_gates.ps1 | 新增 | 否 | SPLIT | 发布流程脚本不属于课程逻辑主提交。 | `git add -p scripts/release/run_gates.ps1` |
| docs/release/2026-01-27_course_versioning.md | 新增/修改 | 否 | SPLIT | 发布说明属于交付文档，需单独提交。 | `git add -p docs/release/2026-01-27_course_versioning.md` |
| docs/audits/CHANGE_SCOPE_DECISION_20260127.md | 新增 | 否 | SPLIT | 变更边界决策文档需单独提交。 | `git add -p docs/audits/CHANGE_SCOPE_DECISION_20260127.md` |
| bookworm-backend/src/plugins/metrics.ts | 修改 | 否 | KEEP | 上线观测必要的指标注册。 | `git add bookworm-backend/src/plugins/metrics.ts` |

## 提交拆分建议（最多 2 个提交）

### commit-1：课程版本一致性（后端 + 小程序 + 测试 + 迁移）
- bookworm-backend/prisma/schema.prisma
- bookworm-backend/prisma/migrations/20260127193000_add_study_course_versioning/
- bookworm-backend/prisma/seed.ts
- bookworm-backend/src/db/views/studyViews.ts
- bookworm-backend/src/routes/study.ts
- bookworm-backend/src/routes/studySchemas.ts
- bookworm-backend/src/services/study/courseService.ts
- bookworm-backend/src/services/study/importService.ts
- bookworm-backend/src/tests/study-star.integration.test.ts
- bookworm-backend/src/tests/import-cheatsheet-dedup.integration.test.ts
- bookworm-backend/src/tests/study-card-submit-scoped-by-course.integration.test.ts
- bookworm-backend/src/tests/study-course-scope-required.integration.test.ts
- bookworm-backend/src/tests/study-course-versioning.integration.test.ts
- bookworm-backend/src/tests/study-enrollment-active.integration.test.ts
- miniprogram/subpackages/review/pages/flashcard/index.js
- miniprogram/utils/study-api.js

### commit-2：文档与发布流程（仅在保留时提交）
- docs/release/2026-01-27_course_versioning.md
- docs/audits/CHANGE_SCOPE_DECISION_20260127.md
- scripts/release/run_gates.ps1
