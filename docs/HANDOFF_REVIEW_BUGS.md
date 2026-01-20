# 复习模块交接文档（刷题全绿 + 背卡500）

## 背景与目标
- 目标：定位并修复复习模块两个关键问题：背卡反馈 500、刷题页全部选项标绿。
- ~~当前优先级：刷题全绿仍未解决；背卡 500 已有根因与修复手段。~~
- ✅ **2026-01-21 已全部修复**：刷题全绿（optionStates 替代 indexOf）、背卡 500（Prisma 迁移同步）

## 当前状态（结论）
- 刷题请求 `/api/study/quiz/answer` 返回数据正常：
  - `correctOptionIndices` 为数组（示例 `[1]`）
  - `correctAnswer` 与 `options_json` 文本一致
- 前端控制台 `QUIZ_UI_DEBUG` 显示 `correctIndices: [1]`，但 UI 仍“全绿”。
- 背卡 500：已定位为数据库缺列 `user_card_state.last_session_id`（P2022）。

## 已做的关键变更
- `bookworm-backend/src/index.ts`：新增错误落盘日志 `bookworm-backend/logs/server-errors.log`（JSONL）。
- `bookworm-backend/src/services/study/quizService.ts`：
  - 新增 `correctOptionIndices` 计算并返回。
  - 幂等返回路径补齐 `correctOptionIndices`。
  - `QUIZ_DEBUG=true` 时输出题目调试日志。
- `bookworm-backend/src/routes/studySchemas.ts`：新增 `correctOptionIndices` 字段。
- `miniprogram/subpackages/review/pages/quiz/index.js`：
  - 优先使用后端 `correctOptionIndices`，并做索引归一化。
  - 新增 `QUIZ_UI_DEBUG` 控制台日志（非 release 环境）。
- `CLAUDE.md`、`AGENTS.md`：新增复习模式指引与 SOP。

## 复现方式
1. 小程序进入刷题页面，作答任意题目。
2. 观察：UI 所有选项显示绿色勾（全绿）。
3. 后端启用调试：
   - `QUIZ_DEBUG=true npm run dev`
4. 前端控制台查看 `[QUIZ_UI_DEBUG]`。

## 关键日志（示例）
### 后端 QUIZ_DEBUG
```
[QUIZ_DEBUG] Question ID: 1
[QUIZ_DEBUG] question.questionType: SINGLE_CHOICE
[QUIZ_DEBUG] question.answerJson: B.1
[QUIZ_DEBUG] question.optionsJson: ['A.0','B.1','C.$\\infty$','D.不存在']
[QUIZ_DEBUG] chosenAnswer: B.1
[QUIZ_DEBUG] isCorrect: true
```

### 前端 QUIZ_UI_DEBUG
```
result.correctOptionIndices: [1]
localIndices: [1]
correctIndices: [1]
```

### 数据库核对
```
SELECT id, question_type, options_json, answer_json
FROM study_question
WHERE id = 1;
```
结果：`answer_json` 与 `options_json` 选项文本一致。

## 背卡 500 根因与修复
- 错误日志：`bookworm-backend/logs/server-errors.log`。
- 根因：`user_card_state.last_session_id` 列缺失（Prisma P2022）。
- 修复 SQL（临时兜底）：
```
ALTER TABLE "user_card_state" ADD COLUMN IF NOT EXISTS "last_session_id" VARCHAR(36);
```
- 建议：补充正式迁移，避免环境漂移。

## 未解决问题（刷题全绿）
已确认数据与计算逻辑正常，但 UI 仍全绿，疑似模板表达式或渲染层问题。

### 建议排查方向（从简单到复杂）
1. 确认是否加载了旧包：
   - 清理微信开发者工具缓存并重新编译。
2. 在 `setData` 后打印 `this.data.correctIndices`，确认渲染前数据未被覆盖。
3. 绕开 WXML `indexOf` 逻辑：
   - 在 JS 里预先生成 `optionStates` 数组（每个选项 `isCorrect/isWrong/isSelected`）。
   - WXML 只渲染 `item.isCorrect`，避免表达式歧义。

## 题库源文件位置
- 仓库内未发现课程包文件（`manifest.json/units.json/questions/*.gift/cards/*.tsv`）。
- 导入规范在 `bookworm-backend/src/services/study/importService.ts`。
- 若题库在外部目录，需向运维索取路径。

## 待办清单
- 刷题页“全绿”问题修复（优先）。
- 补充 `last_session_id` 正式迁移。
- 若题库修复需要重新导入：先确认实际题库文件位置。

## 相关文件索引
- `miniprogram/subpackages/review/pages/quiz/index.js`
- `miniprogram/subpackages/review/pages/quiz/index.wxml`
- `bookworm-backend/src/services/study/quizService.ts`
- `bookworm-backend/src/routes/studySchemas.ts`
- `bookworm-backend/src/index.ts`
- `bookworm-backend/logs/server-errors.log`
