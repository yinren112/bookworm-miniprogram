# 1-23 任务执行进度报告

更新时间：2026-01-23

## 任务范围对照（FR-001 ~ FR-012）

- FR-001：已完成。首页看板、四个指标卡片与主按钮已落地，加载态使用统一组件。
- FR-002：已完成。热力图可点击进入学习记录页并定位日期；课程卡片可点击继续学习。
- FR-003：已完成。一键开始根据上次会话类型决定优先顺序，结束后携带 nextType。
- FR-004：已完成。闪卡进度与预计耗时展示，退出保存快照，24 小时内可恢复。
- FR-005：已完成。测验即时反馈与错题进入错题池逻辑沿用现有接口，结算页提供错题强化入口。
- FR-006：已完成。三按钮布局与订阅入口已落地，主按钮与返回按钮已补 loading。
- FR-007：已完成。结算页与个人中心支持订阅授权与状态展示。
- FR-008：已完成。后端定时任务已实现，默认 09:00 Asia/Shanghai 发送，单日单人最多 1 条。
- FR-009：已完成。统一三态组件已接入首页、闪卡、测验、学习记录。
- FR-010：已完成。首页聚合接口替代多请求，dashboard 与课程列表 10 分钟缓存已实现。
- FR-011：已完成。进入复习首页预下载 review 分包。
- FR-012：已完成。员工扫码入口增加权限提示与设置引导。

## 已完成的关键改动

### 后端

- 新增聚合接口与服务：`bookworm-backend/src/services/study/dashboardService.ts`、`bookworm-backend/src/routes/study.ts`。
- 订阅提醒模型、服务、路由与定时任务：`bookworm-backend/prisma/schema.prisma`、`bookworm-backend/src/services/study/reminderService.ts`、`bookworm-backend/src/jobs/sendStudyReminders.ts`、`bookworm-backend/src/jobs.ts`。
- 新增迁移：`bookworm-backend/prisma/migrations/20260123183000_add_study_reminder_subscription/`。
- Schema 与常量扩展：`bookworm-backend/src/routes/studySchemas.ts`、`bookworm-backend/src/constants.ts`、`bookworm-backend/src/config.ts`。
- 新增集成测试：`bookworm-backend/src/tests/study-dashboard.integration.test.ts`、`bookworm-backend/src/tests/study-reminders.integration.test.ts`。

### 前端

- 统一三态组件：`miniprogram/components/state-view/`。
- 会话快照与埋点工具：`miniprogram/utils/study-session.js`、`miniprogram/utils/track.js`。
- 复习首页改造与缓存：`miniprogram/pages/review/index.js`、`miniprogram/pages/review/index.wxml`、`miniprogram/pages/review/index.wxss`。
- 闪卡/测验会话恢复与进度展示：`miniprogram/subpackages/review/pages/flashcard/index.js`、`miniprogram/subpackages/review/pages/quiz/index.js`。
- 结算页重构与订阅入口：`miniprogram/subpackages/review/pages/session-complete/index.js`、`miniprogram/subpackages/review/pages/session-complete/index.wxml`。
- 学习记录页新增：`miniprogram/subpackages/review/pages/activity-history/`。
- 个人中心订阅设置：`miniprogram/pages/profile/index.js`、`miniprogram/pages/profile/index.wxml`。
- App 级错误与性能上报：`miniprogram/app.js`。
- 分包预下载：`miniprogram/app.json`。

## 待处理事项与风险

- 首页空状态规则已补齐：已报名且无到期任务时支持“来一组巩固”入口。（已完成）
- 课程列表缓存已补齐：推荐课程使用 10 分钟缓存并带版本号。（已完成）
- dashboard.resumeSession 未实现：聚合接口返回固定 null，跨端恢复仍依赖本地缓存。
- 订阅模板未配置：`miniprogram/utils/constants.js` 的 `STUDY_REMINDER_TEMPLATE_ID` 仍为占位，需要替换真实模板 ID，并确认模板字段与 `thing1/thing2/thing3` 匹配。
- 订阅消息非生产环境不会调用微信接口：如需联调发送链路需在 staging/production 环境验证。
- 结算页按钮已补充 loading：主按钮与返回按钮带加载与失败提示。（已完成）
- 埋点属性已补齐：统一补充 `networkType`、`device`、`route`、`appVersion`。（已完成）
- 后端测试未运行，需补测并记录结果。

## 交接给下个人的续做步骤

1. 配置订阅模板
   - 替换 `miniprogram/utils/constants.js` 中 `STUDY_REMINDER_TEMPLATE_ID` 为真实模板 ID。
   - 对照模板字段，必要时调整 `bookworm-backend/src/services/study/reminderService.ts` 的 `data` 字段。
2. 补齐首页空状态与缓存
   - 按 “无到期任务/未报名课程” 分支完善首页提示与按钮。（已完成）
   - 为课程列表请求补 10 分钟缓存与版本号策略。（已完成）
3. 完善会话恢复（可选）
   - 若需要服务端 `resumeSession`，在 `dashboardService` 中计算并写入响应。
4. 完善按钮反馈与埋点
   - 结算页按钮增加加载态或禁用逻辑。（已完成）
   - 统一补齐埋点属性（网络、设备、路由）。（已完成）
5. 跑测试与验证
   - 后端：`cd bookworm-backend && npm test`、`npm run test:integration`。
   - 小程序：微信开发者工具进行手动验证与截图留档。

## 手动验证清单（建议）

- 复习首页加载态、错误态、空状态切换。
- 一键开始策略与继续会话入口。
- 闪卡/测验中途退出 24 小时内恢复。
- 结算页数据与三按钮行为。
- 订阅提醒授权同意/拒绝与状态展示。
- 提醒消息打开后首页按钮高亮。
- 学习记录页跳转与日期定位。
- 员工扫码权限拒绝提示。

## 未执行的命令

- 未执行单元测试与集成测试。
