# 复习模块（注册页面即法律）修复计划（仅计划，不含实现）

## 范围与边界

### 仅纳入“可达路由”（注册页面）
- 主包 pages（`miniprogram/app.json`）：
  - `pages/review/index`
  - `pages/profile/index`
  - `pages/terms/index`
  - `pages/webview/index`
  - `pages/customer-service/index`
- review 分包 pages（`miniprogram/app.json`）：
  - `subpackages/review/pages/course/index`
  - `subpackages/review/pages/flashcard/index`
  - `subpackages/review/pages/quiz/index`
  - `subpackages/review/pages/cheatsheet/index`
  - `subpackages/review/pages/cheatsheet-note/index`
  - `subpackages/review/pages/leaderboard/index`
  - `subpackages/review/pages/session-complete/index`
  - `subpackages/review/pages/activity-history/index`

### 明确不做（强约束）
- 不处理任何二手书交易相关页面/接口（即使仓库里有实现但未注册/被复习模式隐藏）。
- 不做“顺手重构”、不引入新框架/新抽象；每一行变更都必须可追溯到本计划中的某一条问题。

## 已识别问题清单（只列注册页面相关）

### P0：复习首页 Dashboard 缓存 key 缺关键维度（课程/环境串线）
- 现象
  - `pages/review/index` 中 courses 的缓存 key 包含 `apiBaseUrl`，但 dashboard key 不包含 `apiBaseUrl` 也不包含 `courseKey`。
  - 在开发者工具切换后端环境、或用户切换课程时，dashboard 会被错误复用。
- 风险
  - 展示错课程/错环境数据（属于“数据错误”，不是 UI 小瑕疵）。

### P0：日期 weekday 解析策略不一致（同一语义两套实现）
- 现象
  - `pages/review/index` 用 `new Date(ymd)` 推 weekday。
  - `subpackages/review/pages/activity-history/index` 用 `Date.UTC + +8` 推 weekday。
  - 后端约定 `YYYY-MM-DD`（date-only），前端不能用“带时区的 Date 解析”来碰运气。
- 风险
  - 周几标注错位；这类问题会随机出现在不同设备/系统区域设置上，属于难排查的隐式假设。

### P1：Devtools 模式下“课程列表允许未发布”，但 Dashboard/课程详情默认只看已发布（语义分裂）
- 现象
  - 前端在 devtools 下允许 `includeUnpublished` 拉到未发布课程列表。
  - 后端 dashboard 在指定 `courseKey` 时仍按 published-only 解析课程，找不到就 404。
- 风险
  - devtools 下体验不稳定：列表能看到，点进去/看面板却报错；测试与真实发布口径混淆。

### P2：后端 `routes/study.ts` 过长，导致“可审计性/可外科修改性”下降
- 现象
  - 同一文件堆叠多个 Phase（courses/cards/quiz/cheatsheet/streak/activity/dashboard/reminder/admin import）。
- 风险
  - 未来修复任何一个注册页面相关接口时，更易引入回归；审查成本高。

## 修复原则（Karpathy 风格）

### 1) 先定“可验证目标”，再写代码
- 每个修复点必须给出：复现条件、预期行为、验收标准、对应测试（单测/集成测试/手工步骤三选一或组合）。
- 不接受“看起来更合理”这种验收方式。

### 2) 最小改动
- 优先修复数据契约与缓存主键，避免引入新抽象层。
- 如需新增工具函数，必须证明“复用至少 2 个调用点”且能减少分支与重复逻辑，否则不加。

### 3) 外科手术式范围控制
- 仅触碰注册页面及其直接依赖的复习 API（`miniprogram/utils/study-api.js`）与后端 `/api/study/*` 路由/服务。
- 任何与交易/支付/库存相关的改动都视为越界。

## 实施计划（按优先级）

### 计划 A（P0）：修复 Dashboard 缓存 key（课程/环境隔离）

### 目标
- `pages/review/index` 的 dashboard 缓存必须同时区分：
  - `courseKey`（或“未选择课程”的空值）
  - `includeUnpublished`（devtools 与发布口径）
  - `apiBaseUrl`（多环境隔离）

### 改动建议（最小）
- 仅调整 dashboard 的 key 生成方式；不改 `swrFetch` 的整体行为。
- key 格式与 courses 对齐：明确包含环境与口径字段，避免今后再漂移。

### 验收标准
- 在 devtools 切换 `apiBaseUrl` 后：
  - dashboard 不会展示旧环境的数据（可通过制造两套不同的数据来验证）。
- 在同一环境切换 `selectedCourseKey` 后：
  - dashboard 的 `currentCourse` 与 `due*` 数值必须跟随变化，不得读旧缓存。

### 验证手段（至少一种）
- 小程序手工验证步骤（开发者工具）：
  1. 环境 A 选课程 X，进入复习首页，记录 dashboard 的 `currentCourse.title` 与 `dueCardCount`。
  2. 切换到环境 B（不同 baseUrl，数据不同），重新进入复习首页。
  3. 断言：展示的数据来自环境 B，而不是 A 的缓存残留。
- 可选自动化（如未来补齐）：在小程序侧增加一个“key 生成纯函数”的单元测试（如果当前测试体系允许）。

### 计划 B（P0）：统一 `YYYY-MM-DD` weekday 计算（去掉隐式时区假设）

### 目标
- 前端所有注册页面对 `YYYY-MM-DD` 的 weekday 计算必须一致，并明确以“北京日期语义”或“UTC date-only 语义”计算（两者选其一，且必须统一）。

### 决策（需要明确但不做无谓扩展）
- 推荐以“北京日期语义”作为产品语义（复习/热力图与学习日历通常按中国本地日界线），原因：
  - 后端目前就使用 `getBeijingNow()` 做活动统计日界线。

### 改动建议（最小）
- 提供一个 `ymdToWeekdayLabel(ymd)` 的工具函数（仅当复用 ≥2）：
  - 复用点至少包含：`pages/review/index` 与 `subpackages/review/pages/activity-history/index`。
- 删除/替换掉 `new Date(ymd)` 这类不稳定解析。

### 验收标准
- 对同一 `YYYY-MM-DD`，复习首页与学习记录页显示的 weekday 必须一致。
- 在不同时区模拟（或至少通过构造 Date.UTC 逻辑）仍能得到一致结果。

### 验证手段
- 最低限度：在两个页面加入同一组已知日期（例如周一/周日）的断言式渲染对照（通过手工页面检查即可）。
- 可选自动化：抽出纯函数后做单测（输入 `"2026-01-26"` 这类已知 weekday 的日期，断言输出）。

### 计划 C（P1）：Devtools “未发布课程”口径与 Dashboard/详情口径对齐

### 目标
- devtools 模式下，课程列表、课程详情、dashboard 对同一个 `courseKey` 的行为一致：
  - 要么全部允许未发布（仅 devtools）
  - 要么全部禁止未发布（devtools 也统一禁止）

### 最小化方案（推荐）
- 前端 devtools 下展示未发布课程可以保留，但点击/进入时必须明确标识其口径：
  - 选项 1（推荐）：dashboard 支持一个 `includeUnpublished=true` 的 query（仅 devtools 可用，后端强约束只在 devtools 或 STAFF 下生效）。
  - 选项 2：前端在 devtools 下拿到未发布课程时，进入 dashboard/详情前自动降级到“已发布可用版本”或直接提示“不支持未发布课程的 dashboard”。

### 验收标准
- devtools 下，用户从课程列表进入课程详情/复习首页，不得出现“列表可见但进入 404”的割裂。

### 验证手段
- 后端集成测试（优先）：
  - 构造未发布课程，验证在 devtools 授权条件下 dashboard/详情的行为符合预期。
- 小程序手工验证（最低限度）：
  - 在 devtools 下选择一个未发布课程，流程闭环可达且反馈明确。

### 观察项（不在本轮实施）：`routes/study.ts` 过长

### 说明
- 该问题属于“可维护性风险”，与当前注册页面问题不构成直接修复关系。
- 为遵守“只做与问题对应的最小改动”，本轮不实施，仅记录为后续单独立项。

### 后续若单独立项的基本原则
- 不引入新框架/路由注册机制；保持 `fastify.register(studyRoutes)` 的入口不变。
- 只做“文件拆分 + 纯搬运”，不顺手重写逻辑与 schema。

## 交付物清单
- 本计划文件（当前文件）。
- 修复实现后应新增/补齐的验证项清单（在实际实现 PR/变更中落地，不在本文件中写代码）。
