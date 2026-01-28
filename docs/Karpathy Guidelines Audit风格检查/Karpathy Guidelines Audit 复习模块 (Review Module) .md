# Karpathy Guidelines Audit: 复习模块 (Review Module) - 最终修订版

**日期**: 2026-01-28
**范围**: 
- 前端: `miniprogram/pages/review/index.js`, `utils/study-api.js`
- 后端: `bookworm-backend/src/routes/study.ts`, `services/study/courses.ts`

## 执行摘要
经过二次“全新视角”的深度审查，不仅确认了之前的发现，还挖掘出了更深层的**架构脆弱性**。目前代码库中存在**依赖字符串匹配进行流程控制**的严重反模式，以及**课程版本锁死**的隐形业务风险。虽然系统功能正常，但维护成本和潜在故障风险正在累积。

---

## 1. 谋定而后动 (Think Before Coding)
**"不假设，不隐藏困惑，摆出权衡"**

### 核心发现 (Critical Findings)
- **脆弱的错误处理 (基于字符串匹配)**: 
  - *现象*: `enrollCourse` 服务抛出带有魔法字符串（如 `"COURSE_NOT_FOUND"`）的通用 `Error`。在路由层 `study.ts` 中，使用 `if (error.message === "COURSE_NOT_FOUND")` 来捕获并转换为 404。
  - *违反*: 这种做法极为脆弱。任何对服务层错误信息的微调（如修正拼写、为了日志增加上下文）都会**静默地破坏** API 接口，导致原本应返回 404/400 的请求变成 500 服务器错误。这是典型的“隐式契约”。
  - *位置*: `src/routes/study.ts` (Lines 328-333) vs `src/services/study/courseService.ts` (Lines 299, 303)。

- **版本“逻辑锁” (Logic Lock)**: 
  - *现象*: `getCourseByKey` 优先返回用户*已注册*的版本，而非*最新发布*的版本。然而，`StudyDashboard` 数据结构**完全未暴露** `upgradeAvailable` 或 `latestContentVersion` 字段给前端。
  - *后果*: 当修复严重内容错误的新版本 (v2) 发布后，老用户在面板上**完全无法感知**。他们点击“开始学习”时，系统默默地加载旧版本内容。这导致用户被锁定在有问题的旧版本中，且没有 UI 路径进行升级。
  - *位置*: `dashboardService.ts` (StudyDashboard interface) vs `courseService.ts` 的逻辑分支。

### 建议
- **类型安全**: 立即停止抛出 `new Error("STRING")`。引入领域错误类（如 `class CourseNotFoundError extends DomainError`），并在路由层通过 `instanceof` 捕获。
- **暴露状态**: 修改 `StudyDashboard` DTO，增加 `upgradeAvailable: boolean` 字段，以便前端能提示用户“存在新版本”。

## 2. 简洁第一 (Simplicity First)
**"用最少的代码解决问题"**

### 验证发现
- **路由上帝对象**: `src/routes/study.ts` 确实达到了 **1343 行**。它不是一个简单的路由文件，而是将 7 个不同领域（测验、反馈、看板等）的控制器逻辑强行捆绑。这增加了合并冲突的概率，也让代码导航变得极度困难。
- **领域逻辑泄露**: `resolveCourseIds` (study.ts Lines 154-189) 是核心的“用户权限范围解析”逻辑，却被写成了一个路由内部的闭包函数。这导致其他 Service 无法复用此逻辑，只能重复编写。

### 建议
- **拆分与移动**: 立即拆解 `study.ts`。将 `resolveCourseIds` 提取到 `UserService` 或专门的 `ScopeService` 中。

## 3. 外科手术式修改 (Surgical Changes)
**"只动必须动的地方"**

### 核心发现
- **隐式耦合**: `dashboardService.ts` 为了计算“今日待办”，直接导入了 `cardScheduler.ts` 的具体实现函数 `getTodayQueueSummary`。
  - *风险*: 看板（View层）不应耦合于调度器（Core Logic层）的具体实现。一旦调度算法为了性能进行重构，看板服务可能会因为依赖了错误的内部接口而崩溃。
  
### 建议
- **接口隔离**: 为调度器定义明确的公共接口（Public API），看板服务只消费该接口，不依赖内部工具函数。

## 4. 目标导向 (Goal-Driven Execution)
**"定义成功标准，循环验证"**

### 验证发现
- **难以验证的魔法数字**: 后端使用了 `CARD_SECONDS_PER_ITEM = 8` 等硬编码常量来估算学习时间。
  - *批评*: 这个数字没有来源依据，也没有配置入口。产品经理无法调整它，测试人员也无法验证“ETA计算准确性”——因为标准答案被硬编码在源码里。
  
### 建议
- **配置化**: 将这些业务常量移至 `src/config.ts` 或数据库配置表。
- **自动化验证**: 添加单元测试，显式断言：`ETA == (Cards * Conf.CardTime + Quiz * Conf.QuizTime)`，确保计算逻辑符合预期。

---

## 总结与行动计划

最紧迫的**隐患**是基于字符串匹配的错误处理，这像是一个随时可能引爆的地雷。最显著的**产品逻辑缺陷**是仪表盘缺少版本升级提示，可能导致用户困惑。

1. **重构错误处理**: 在 `courseService.ts` 中引入 Typed Errors。
2. **修补 DTO**: 在 `StudyDashboard` 返回及其对应的 Swagger/Schema 定义中增加 `upgradeAvailable`。
3. **物理拆分**: 将 `study.ts` 按领域拆分为多个小路由文件。
