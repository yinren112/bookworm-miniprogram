# Karpathy Guidelines Audit: 复习模块 (Review Module) - 最终修订版

**日期**: 2026-01-28
**范围**:
- 前端: `miniprogram/pages/review/index.js`, `utils/study-api.js`
- 后端: `bookworm-backend/src/routes/study.ts`, `services/study/courses.ts`

---

## 🔧 修复进度 (2026-01-29 更新)

| 状态 | 问题 ID | 描述 | 修复提交 |
|------|---------|------|----------|
| ✅ | 核心发现-1 | 脆弱的错误处理 (基于字符串匹配) | 引入 `StudyServiceError` + `StudyErrorCodes` |
| ✅ | TBC-Audit-20260128-GPT52-01 | 价格单位不一致（分/元） | `book-detail/index.js` 修正为 `/100` |
| ✅ | SF-New-01 | 前端重复硬编码 ETA 公式 | 提取到 `constants.js` |
| ✅ | GDE-Supp-20260128-01 | ServiceError 状态码映射不完整 | 扩展 `statusCodeMap` |
| ✅ | 核心发现-2 | 版本"逻辑锁" - StudyDashboard 缺少 upgradeAvailable | DTO 增加 upgradeAvailable |
| ✅ | TBC-New-01 | ETA 计算隐含排除 wrongCount | ETA 纳入 wrongCount |
| ✅ | TBC-Audit-20260128-01 | 今日日期时区假设 | 首页日期统一北京时间语义 |
| ✅ | 其他 P1/P2 | 见下方详细列表 | 已完成 |

---

## 执行摘要
经过二次“全新视角”的深度审查，不仅确认了之前的发现，还挖掘出了更深层的**架构脆弱性**。目前代码库中存在**依赖字符串匹配进行流程控制**的严重反模式，以及**课程版本锁死**的隐形业务风险。虽然系统功能正常，但维护成本和潜在故障风险正在累积。

---

## 1. 谋定而后动 (Think Before Coding)
**"不假设，不隐藏困惑，摆出权衡"**

### 核心发现 (Critical Findings)
- ✅ **脆弱的错误处理 (基于字符串匹配)**【核查:真实】【已修复 2026-01-29】: 
  - *现象*: `enrollCourse` 服务抛出带有魔法字符串（如 `"COURSE_NOT_FOUND"`）的通用 `Error`。在路由层 `study.ts` 中，使用 `if (error.message === "COURSE_NOT_FOUND")` 来捕获并转换为 404。
  - *违反*: 这种做法极为脆弱。任何对服务层错误信息的微调（如修正拼写、为了日志增加上下文）都会**静默地破坏** API 接口，导致原本应返回 404/400 的请求变成 500 服务器错误。这是典型的“隐式契约”。
  - *位置*: `src/routes/study.ts` (Lines 328-333) vs `src/services/study/courseService.ts` (Lines 299, 303)。

- **版本“逻辑锁” (Logic Lock)**【核查:真实】: 
  - *现象*: `getCourseByKey` 优先返回用户*已注册*的版本，而非*最新发布*的版本。然而，`StudyDashboard` 数据结构**完全未暴露** `upgradeAvailable` 或 `latestContentVersion` 字段给前端。
  - *后果*: 当修复严重内容错误的新版本 (v2) 发布后，老用户在面板上**完全无法感知**。他们点击“开始学习”时，系统默默地加载旧版本内容。这导致用户被锁定在有问题的旧版本中，且没有 UI 路径进行升级。
  - *位置*: `dashboardService.ts` (StudyDashboard interface) vs `courseService.ts` 的逻辑分支。
  - ✅ 已完成（2026-01-29）：StudyDashboard DTO 已增加 `upgradeAvailable` 字段并在 dashboardService 中填充。

### 建议
- **类型安全**: 立即停止抛出 `new Error("STRING")`。引入领域错误类（如 `class CourseNotFoundError extends DomainError`），并在路由层通过 `instanceof` 捕获。
- **暴露状态**: 修改 `StudyDashboard` DTO，增加 `upgradeAvailable: boolean` 字段，以便前端能提示用户“存在新版本”。

### P1 级
#### TBC-New-01: ETA 计算隐含排除 wrongCount【核查:真实】
**文件**: `bookworm-backend/src/services/study/dashboardService.ts`；`miniprogram/pages/review/index.js`  
**位置**: `estimateMinutes(dueCardCount, dueQuizCount)` 仅使用两项；首页 `dueTotal` 将 `wrongCount` 计入  
**问题**: ETA 口径未明确，后端计算不含错题但前端将错题视为待办，语义不一致  
**影响**: 用户看到有待办但 ETA 可能为 0 或明显偏低，难以定义可验证的 ETA 标准  
**建议**: 明确错题是否计入 ETA，统一口径并写入接口契约与测试
✅ 已完成（2026-01-29）：ETA 计算已纳入 wrongCount，并更新仪表盘集成测试期望。

#### TBC-Audit-20260128-01: “今日日期”展示隐含本地时区假设【核查:真实】
**文件**: `miniprogram/pages/review/index.js`；`miniprogram/utils/date.js`  
**位置**: `setTodayDate()` 使用 `new Date()` 本地时区；热力图 weekday 使用 `ymdToWeekdayLabel()` 的北京时间语义  
**问题**: 同一页面内对“今天/周几”的语义不一致：顶部标题取设备本地日界线，热力图与后端以北京时间日界线为语义  
**影响**: 非北京时间用户（或系统时区异常）会出现“顶部显示的周几/日期”与热力图、连胜、活动统计不一致，难以定位为前端还是数据问题  
**建议**: 明确“今天”的业务语义（北京时间或本地时间），并在所有展示与请求参数上统一（含 `setTodayDate` 与 weekday 计算）
✅ 已完成（2026-01-29）：首页日期展示改为北京时间语义，并复用 date 工具函数统一计算。

#### TBC-Supp-20260128-01: 鉴权链路错误被多次“重包”，导致错误形状与语义漂移【核查:真实】
**文件**: `miniprogram/utils/api.js`；`miniprogram/utils/auth-guard.js`；`miniprogram/utils/request.js`  
**位置**: `api.request` 在 `ensureLoggedIn` 失败时 `throw { message, errorCode }`；`exchangeCodeForToken` 捕获后 `throw new Error(...)` 覆盖原始错误；底层 `request.js` 以对象形式 `reject(errorPayload)`  
**问题**: 同一条错误链路在不同层被包装成不同“形状”（对象/`Error`/字符串），且字段集合不稳定（如 `statusCode`/`requestId`/`errorCode` 可能被丢失）  
**影响**: 上层无法定义可依赖的错误契约（例如基于 `statusCode` 的 401 重试、基于 `requestId` 的排障），错误处理只能靠“猜”；出现线上问题时难以追踪一次失败的端到端链路  
**建议**: 统一错误契约（至少稳定 `errorCode`/`statusCode`/`requestId`/`message`），避免抛出裸对象与无字段 `Error`；鉴权链路应尽量透传底层错误并保留可观测字段（必要时以 `cause`/附加字段承载）
✅ 已完成（2026-01-29）：新增统一错误规范化函数并在 request/api/auth-guard 中透传一致字段。

#### ✅ TBC-Audit-20260128-GPT52-01: 价格单位在两个页面中语义不一致（分/元）【核查:真实】【已修复 2026-01-29】
**文件**: `miniprogram/pages/book-detail/index.js`；`miniprogram/pages/order-confirm/index.js`  
**位置**: `book-detail` 的 `showModal` 直接展示 `¥${bookDetail.selling_price}`；`order-confirm` 展示 `¥${(book.selling_price / 100).toFixed(2)}`  
**问题**: 同一 API `/inventory/item/:id` 的 `selling_price` 字段在不同页面被当作不同单位使用（一个按“元”展示，一个按“分→元”转换）  
**影响**: 用户在不同入口看到不同价格；若 `selling_price` 实际为“分”，`book-detail` 会把分当元展示，属于高风险的金额语义错误，且难以通过 UI 回归“肉眼发现所有路径”  
**建议**: 明确 `selling_price` 的单位并将格式化收敛为单一函数/单一展示入口；对关键页面添加最小契约校验（例如断言展示值与 `selling_price/100` 一致）

#### TBC-Audit-20260128-GPT5-02: WeChat 电话号获取吞错并返回 null，失败语义不可验证【核查:真实】
**文件**: `bookworm-backend/src/services/authService.ts`  
**位置**: `requestWxPhoneNumber` 的 `catch` 与 `data.errcode` 分支；`axios.get/post` 无显式 timeout/重试  
**问题**: 外部调用失败（网络/5xx/超时）与业务失败（errcode/无号码/用户拒绝）被统一折叠为 `null` + 日志；同时 `axios` 调用无显式 timeout/重试，隐含“外部系统总会按时返回”的假设  
**影响**: 上层无法区分“可重试故障”和“不可重试拒绝/无数据”，只能把所有失败当作同一种；线上抖动会导致登录/手机号授权偶发失败但难以定义期望行为  
**建议**: 统一封装 WeChat HTTP client，显式配置 timeout + 指数退避重试；将返回改为可区分的结果或抛 typed error（保留 `cause/errcode`），让路由层能稳定映射为 4xx/5xx 并写测试锁定
✅ 已完成（2026-01-29）：增加超时与重试，明确区分可重试/不可重试失败，并在路由层映射为稳定错误码。

### P2 级
#### TBC-Audit-20260128-GPT52-02: typeGuards 自述“无 as any”但全文件禁用 any 且多处强转【核查:真实】
**文件**: `bookworm-backend/src/utils/typeGuards.ts`  
**位置**: 文件头部注释 `Type guards for safe error handling without 'as any'`；同时全文件 `/* eslint-disable @typescript-eslint/no-explicit-any */` 且多处 `(error as any)`  
**问题**: 代码自述的设计目标（避免 `as any`）与实现手段（禁用规则 + 广泛强转）相矛盾，属于“隐藏权衡/假设”的反模式  
**影响**: 读者会误以为该模块提供了可复用的类型安全护栏，但实际仍依赖 `any`；后续在错误处理链路里继续扩大 `any` 的使用范围，会让“错误形状/字段契约”更加不可验证  
**建议**: 移除文件级禁用并将 `any` 约束到最小范围；用更窄的结构检查替代 `(error as any)`（例如 `'statusCode' in obj` + `typeof` 守卫），并让注释准确反映真实权衡
✅ 已完成（2026-01-29）：移除文件级 any 禁用并使用更窄的对象守卫替代强转。

#### TBC-Audit-20260128-AG1: 提醒时区参数被吞掉，行为恒定为北京时间【核查:真实】
**文件**: `bookworm-backend/src/services/study/reminderService.ts`  
**位置**: `getNextSendAt()` 对非 `DEFAULT_TIMEZONE` 直接回落；内部使用 `getBeijingNow()` 固定北京时间  
**问题**: API 接受 timezone 并写入订阅，但调度逻辑忽略该值，形成“伪多时区”。这是隐式假设  
**影响**: 非北京时间用户的提醒时间不准确；线上问题难以复现（因为数据里看似有 timezone）  
**建议**: 要么移除 timezone 输入与存储并明确单一时区；要么真正按 timezone 计算 `nextSendAt` 并补充测试
✅ 已完成（2026-01-29）：按传入时区计算 nextSendAt，并对无效时区回退默认值。

#### TBC-Audit-20260128-AG2: 提醒“当前课程”选择规则未定义【核查:真实】
**文件**: `bookworm-backend/src/services/study/reminderService.ts`；`bookworm-backend/src/services/study/courseService.ts`  
**位置**: `resolveCurrentCourse()` 直接取 `courses[0]`；`getUserEnrolledCourses()` 仅按 `lastStudiedAt` 排序  
**问题**: reminder 的课程选择依赖列表排序，但没有业务定义（“最近学习”还是“用户指定”）。这是隐式契约  
**影响**: 多课程用户可能收到与预期不一致的提醒；回归与排障无法定义“正确课程”的可验证标准  
**建议**: 明确“当前课程”规则（例如显式字段、用户设置或固定按最近学习），并在接口与测试中固化
✅ 已完成（2026-01-29）：明确按“最近学习，其次最近注册”选取提醒课程。

#### TBC-Audit-20260128-AG3: 继续使用已标记 deprecated 的“伪北京时间”API【核查:真实】
**文件**: `bookworm-backend/src/services/study/activityService.ts`；`bookworm-backend/src/routes/study.ts`；`bookworm-backend/src/utils/timezone.ts`  
**位置**: 多处使用 `getBeijingNow()` 参与日期边界与回填校验；该函数注释明确“伪时间戳”并建议替换  
**问题**: 业务逻辑仍依赖被声明会引起混淆的 API，隐藏了时间语义的权衡  
**影响**: 维护者容易把该 Date 当作 UTC 时间戳使用，导致活动日期校验与热力图范围出现边界错误  
**建议**: 用 `getBeijingTodayStart()` / `getBeijingDateOnlyString()` 等明确 API 替换，并补充边界测试（北京时间日切、跨时区）
✅ 已完成（2026-01-29）：活动与热力图日期边界改用 `getBeijingDateOnlyString()` 计算。

#### TBC-Audit-20260128-GPT5-01: 后端 log 包装器对 Error 参数退化为 data 数组，丢失 stack/cause【核查:真实】
**文件**: `bookworm-backend/src/lib/logger.ts`；`bookworm-backend/src/services/authService.ts`；`bookworm-backend/src/jobs/refundProcessor.ts`；`bookworm-backend/src/jobs/cancelExpiredOrders.ts`  
**位置**: `log.error(...args)` 对 `(string, error)` 等形态走 `logger.error({ data: args }, 'error log')`；调用点存在 `log.error("...", error)`  
**问题**: Logger wrapper 仅把“第一个参数是 object”视为结构化日志，其它形态全部包进 `data`；导致 Error 不会落到 `err` 字段，pino 无法输出标准 stack/类型信息  
**影响**: 线上错误日志缺 stack、缺 cause，排障依赖手动字符串；统一 redaction/字段规范失去可验证性  
**建议**: 最小改动是统一调用 `log.error({ err: error }, "msg")`；或在 wrapper 中专门识别 `(string, Error)`/`(Error, string)` 并转换为 `{ err }`，并加测试锁定输出结构
✅ 已完成（2026-01-29）：log 包装器识别 Error 参数并落到 `err` 字段，保留 stack/cause 结构化输出。

#### TBC-Audit-20260128-GPT5-03: WechatPayAdapter 重新抛出字符串拼接 Error，破坏错误链【核查:真实】
**文件**: `bookworm-backend/src/adapters/wechatPayAdapter.ts`  
**位置**: `createPaymentOrder` 的 `catch`：`throw new Error(\`Failed...: ${...}\`)`  
**问题**: 把原始错误类型/字段/cause 全部压扁成 message 字符串，破坏上层可分类处理  
**影响**: 调用方只能靠字符串判断是否可重试/如何告警；与同文件中 `WechatPayError(..., cause)` 的设计目标不一致，形成隐式双轨  
**建议**: 使用 `new Error(msg, { cause: error })` 或抛出统一的 `WechatPayError` 子类，保留 `retryable/code` 并用单测覆盖
✅ 已完成（2026-01-29）：createPaymentOrder 统一抛出 `WechatPayError` 并保留原始错误信息。

#### TBC-Audit-20260128-GPT5-04: 测试环境错误信息拼接 TEST_CONTAINERS，可能泄漏数据库连接串【核查:真实】
**文件**: `bookworm-backend/src/tests/globalSetup.testcontainers.ts`  
**位置**: `getPrismaClientForWorker` 的 `throw new Error(... TEST_CONTAINERS: ${process.env.TEST_CONTAINERS})`  
**问题**: 将整个 env 变量直接写入错误消息（CI/本地日志可见），默认假设“测试日志不敏感”  
**影响**: 若 `TEST_CONTAINERS` 包含带凭据的连接串，可能出现在日志/报错中；也会增加排障噪音  
**建议**: 错误消息只输出 workerId 与可用 worker key；如确需打印 URL，做严格脱敏（只保留 host/port，移除 user/pass/db/query）
✅ 已完成（2026-01-29）：错误消息不再输出 TEST_CONTAINERS，日志仅输出脱敏 URL。

#### TBC-Audit-20260128-GPT5-05: 前端 logger 文件级禁用 no-console，突破日志安全护栏【核查:真实】
**文件**: `miniprogram/utils/logger.js`；`.eslintrc.js`  
**位置**: `logger.js` 文件头 `/* eslint-disable no-console */` 与内部 `console.log/info/warn`；前端 ESLint 规则强制 `no-console` 仅允许 `error`  
**问题**: 通过文件级禁用直接绕过全局“禁止前端 console.log/debug/info”的护栏，属于隐藏权衡。结果是 logger 的 `info/warn` 在生产前端也会落到控制台，违反“只允许 console.error”的安全约束。  
**影响**: 增加在前端泄漏敏感信息的风险（`no-restricted-syntax` 仅能拦静态字面量，动态拼接信息无法被规则捕获）；同时 CI 的 console 检查与运行时行为出现不一致，难以建立可验证的日志契约。  
**建议**: 移除文件级 `eslint-disable no-console`，前端 logger 收敛为仅输出 `error`（`info/warn/debug` 在生产默认为 no-op，并在 DevTools 内部通过 `wx.getLogManager` 或统一调试开关启用）；补充最小测试/静态检查，断言前端代码库中仅存在 `console.error` 调用。
✅ 已完成（2026-01-29）：移除文件级禁用，debug/info/warn 仅在 DEBUG + logManager 下启用，其余为 no-op。

## 2. 简洁第一 (Simplicity First)
**"用最少的代码解决问题"**

### 验证发现
- **路由上帝对象**【核查:真实（文件 1342 行）】: `src/routes/study.ts` 确实达到了 **1342 行**。它不是一个简单的路由文件，而是将 7 个不同领域（测验、反馈、看板等）的控制器逻辑强行捆绑。这增加了合并冲突的概率，也让代码导航变得极度困难。
- **领域逻辑泄露**【核查:真实】: `resolveCourseIds` (study.ts Lines 154-189) 是核心的“用户权限范围解析”逻辑，却被写成了一个路由内部的闭包函数。这导致其他 Service 无法复用此逻辑，只能重复编写。

### 建议
- **拆分与移动**: 立即拆解 `study.ts`。将 `resolveCourseIds` 提取到 `UserService` 或专门的 `ScopeService` 中。

### P1 级
#### SF-Audit-20260128-GPT5-01: orders 路由用 any + delete 做 DTO 清洗，字段契约不可验证【核查:真实】
**文件**: `bookworm-backend/src/routes/orders.ts`  
**位置**: `presentOrderAmount(order: any)` 复制后 `delete rest.web_staff_id`  
**问题**: 运行时“删字段”依赖记忆和人工维护，类型系统完全退出；新增敏感字段时容易漏删，且调用点看不出返回契约  
**影响**: 响应字段可能随 Prisma 返回结构漂移，存在意外暴露内部字段的风险；测试很难锁定“哪些字段必须不出现”  
**建议**: 用白名单映射生成 DTO（显式列出允许字段）；更好是从查询层用 Prisma `select` 只取需要字段，并定义稳定的 Order DTO 类型
✅ 已完成（2026-01-29）：订单响应改为白名单字段映射并移除 any/delete 清洗。

### P2 级
#### ✅ SF-New-01: 前端重复硬编码 ETA 公式【核查:真实】【已修复 2026-01-29】
**文件**: `miniprogram/subpackages/review/pages/flashcard/index.js`；`miniprogram/subpackages/review/pages/quiz/index.js`  
**位置**: `updateProgress` 使用 `8` / `30` 秒计算 `remainingMinutes`  
**问题**: ETA 逻辑在前端硬编码，与后端常量分散，形成双源逻辑  
**影响**: 一处调整会导致前后端 ETA 不一致，维护成本上升  
**建议**: 统一从后端返回或共享配置，避免重复公式

#### SF-Audit-20260128-01: 错误分类引入“设计模式栈”导致不必要的复杂度【核查:真实】
**文件**: `bookworm-backend/src/services/errorClassification.ts`  
**位置**: 使用多个 `*ErrorClassifier` 类 + Chain of Responsibility；文件头部自述 “Strategy + Chain of Responsibility patterns”  
**问题**: 对小规模规则（少量错误码与策略）采用类层级与链式分发，增加阅读与改动成本，且把“可配置的策略”伪装成“可扩展的框架”  
**影响**: 新增/调整一条规则需要理解多个类与顺序，容易引入顺序依赖与漏网；审计时难以定义“覆盖完所有错误类型”的可验证标准  
**建议**: 在不需要多态扩展的前提下收敛为数据驱动的映射表/单函数分支，并用单测覆盖关键错误码与兜底行为
✅ 已完成（2026-01-29）：收敛为单函数与规则集判断，移除多类链式分发。

#### SF-Supp-20260128-01: 废弃的错误提取工具仍被广泛使用，形成“双轨”错误展示入口【核查:真实】
**文件**: `miniprogram/utils/error.js`；`miniprogram/utils/ui.js`；`miniprogram/pages/*`；`miniprogram/utils/payment.js`  
**位置**: `utils/error.js` 标注 `@deprecated`，但 `extractErrorMessage` 仍被多个页面与工具模块直接依赖（如 `pages/acquisition-scan/index.js`、`pages/orders/index.js` 等）  
**问题**: 错误展示与敏感信息过滤存在两套并行入口：一套是 `ui.showError`（支持错误码映射与对象输入），另一套是 `extractErrorMessage`（先提取字符串再展示）。这让“到底应该传 error 对象还是字符串”变成隐式约定  
**影响**: 错误码映射、敏感信息过滤、fallback 语义在不同调用点分叉；后续想统一文案/错误码或强化过滤时，需要全仓库追溯两套路径，维护成本呈线性上升  
**建议**: 收敛为单一入口（优先 `ui.showError(error, { fallback })`），并制定迁移边界：要么让 `extractErrorMessage` 仅做薄代理并逐步移除，要么在调用点全部迁移后删除该模块（避免长期“废弃但仍在用”）
✅ 已完成（2026-01-29）：调用点迁移至 `ui.showError`/`ui.getErrorMessage`，`extractErrorMessage` 仅保留薄代理。

#### SF-New-02: Import Service 重新发明了验证轮子【核查:真实】
**文件**: `bookworm-backend/src/services/study/importService.ts`；`bookworm-backend/src/routes/studySchemas.ts`
**位置**: `importService.ts` Lines 477-517 (手动检查 `!q.contentId` / `q.questionType` 等)
**问题**: 在已经定义了 `studySchemas.ts` (TypeBox) 的情况下，服务层仍手动编写大量 `if-push-error` 逻辑来校验 JSON 结构与字段存在性。这是典型的“重复造轮子”与“Simplicity First”违规。
**影响**: 验证逻辑在 Schema 定义与服务实现间重复且可能漂移；增加了大量枯燥的样板代码，降低了可读性。
**建议**: 利用 `@sinclair/typebox/value` 的 `Value.Check` 或 `Value.Errors` 直接复用 Schema 进行校验，删除手动判断代码。
✅ 已完成（2026-01-29）：校验复用 ImportCourseBodySchema，并保留 LaTeX/多选答案的语义检查。

#### SF-New-03: 前端 Config/Logger 循环依赖的复杂绕过【核查:真实】
**文件**: `miniprogram/config.js`；`miniprogram/utils/logger.js`
**位置**: `config.js` 头部注释声明无法引用 logger；`logger.js` 使用 `try-catch` 动态 `require('../config')`。
**问题**: 为了解决 `config.js` (含 DEBUG_MODE) 与 `logger.js` (依赖 DEBUG_MODE) 的循环依赖，引入了运行时 `try-catch` 与内联 `console.warn` 的复杂性。
**影响**: 代码结构脆弱，依赖关系不直观；`config.js` 无法享受统一日志能力。
**建议**: 将无依赖的基础配置（如 `DEBUG_MODE`, `APP_CONFIG`）提取到独立的 `env.js` 或 `constants.js`，让 `config.js` 和 `logger.js` 均作为上层消费者，打破循环。
✅ 已完成（2026-01-29）：logger 不再依赖 config，config 使用 logger 输出，APP_CONFIG 迁移到 constants。

#### SF-New-04: API Base URL 归一与校验分散为三套逻辑，形成双源规则【核查:真实】
**文件**: `miniprogram/utils/url.js`；`miniprogram/config.js`；`miniprogram/utils/request.js`  
**位置**: `url.js` 的 `sanitizeUrlInput/normalizeApiBaseUrl/enforceApiBaseUrlPolicy`；`config.js` 的 `getApiBaseUrl()` 选择与策略；`request.js` 对 `finalUrl` 的再次字符级校验（全角字符/引号/空格）  
**问题**: Base URL 的“归一 + https 强制 + 非法字符校验”分别实现于 3 个模块且逻辑不一致，造成规则双源/三源。任何一处变更（如新增非法字符或策略调整）都可能与其他两处脱钩。  
**影响**: 维护与测试成本上升；难以定义“什么是合法 URL”的唯一标准，出现线上故障时排查路径分叉（到底是 normalize 问题还是 request 拦截）。  
**建议**: 将 URL 归一与校验收敛为单一入口（建议集中到 `utils/url.js` 并导出 `buildFinalApiUrl(path)`）；`config.js` 仅负责选择环境与基准 URL；`request.js` 依赖单一校验结果，不再维护独立字符黑名单。为关键路径添加最小单测，锁定“合法/非法”行为。  
✅ 已完成（2026-01-29）：URL 校验集中到 `utils/url.js`，`request.js` 统一调用单一入口。

## 3. 外科手术式修改 (Surgical Changes)
**"只动必须动的地方"**

### 核心发现
- **隐式耦合**【核查:真实】: `dashboardService.ts` 为了计算“今日待办”，直接导入了 `cardScheduler.ts` 的具体实现函数 `getTodayQueueSummary`。
  - *风险*: 看板（View层）不应耦合于调度器（Core Logic层）的具体实现。一旦调度算法为了性能进行重构，看板服务可能会因为依赖了错误的内部接口而崩溃。
  
### 建议
- **接口隔离**: 为调度器定义明确的公共接口（Public API），看板服务只消费该接口，不依赖内部工具函数。

## 4. 目标导向 (Goal-Driven Execution)
**"定义成功标准，循环验证"**

### 验证发现
- **难以验证的魔法数字**【核查:真实】: 后端使用了 `CARD_SECONDS_PER_ITEM = 8` 等硬编码常量来估算学习时间。
  - *批评*: 这个数字没有来源依据，也没有配置入口。产品经理无法调整它，测试人员也无法验证“ETA计算准确性”——因为标准答案被硬编码在源码里。
  
### 建议
- **配置化**: 将这些业务常量移至 `src/config.ts` 或数据库配置表。
- **自动化验证**: 添加单元测试，显式断言：`ETA == (Cards * Conf.CardTime + Quiz * Conf.QuizTime)`，确保计算逻辑符合预期。

### P1 级
#### ✅ GDE-Supp-20260128-01: ServiceError 设计目标未闭环，新增错误码默认落到 500【核查:真实】【已修复 2026-01-29】
**文件**: `bookworm-backend/src/index.ts`；`bookworm-backend/src/errors.ts`；`bookworm-backend/src/services/imageProxyService.ts`  
**位置**: 全局错误处理 Layer 4a 的 `statusCodeMap` 仅包含 `METADATA_SERVICE_UNAVAILABLE`；`imageProxyService` 抛出多种 `ServiceError`（如 `IMAGE_PROXY_INVALID_URL`/`IMAGE_PROXY_HOST_NOT_ALLOWED`）  
**问题**: Service 层用 `ServiceError(code, message)` 试图建立“与 HTTP 解耦的领域错误”，但路由层映射表不完整且缺少强约束，导致新增 `code` 会静默退化为 500  
**影响**: 明明是 400/403/502 之类的可预期错误，却被统一包装成 500；客户端无法基于状态码做重试/提示策略，监控也会把业务错误误报为服务故障，目标不可验证  
**建议**: 将“code → httpStatus”变为强约束（例如让 `ServiceError` 自带 `httpStatus`，或将映射集中到单一模块并对所有 `ServiceError` code 做单测覆盖），保证新增错误码不会默默走到 500

### P2 级
#### GDE-New-01: 会话快照保存缺少成功校验与容量边界【核查:真实】
**文件**: `miniprogram/utils/study-session.js`；`miniprogram/subpackages/review/pages/flashcard/index.js`；`miniprogram/subpackages/review/pages/quiz/index.js`  
**位置**: `saveResumeSession` 直接存入 `cards`/`questions` 全量数组；调用方不校验保存成功  
**问题**: 依赖本地存储容量与序列化成功，但没有验证或失败回退策略  
**影响**: 大课程/题量时可能写入失败却仍显示“可继续会话”，恢复失败难复现  
**建议**: 定义存储上限与失败处理，或改为只存最小可重建信息并添加恢复验证
✅ 已完成（2026-01-29）：增加存储上限与保存结果返回，调用方在失败后停止继续写入。

#### GDE-Audit-20260128-02: 重试请求会生成新的 requestId，破坏端到端可追踪性【核查:真实】
**文件**: `miniprogram/utils/request.js`  
**位置**: `performRequest()` 每次调用都 `generateRequestId()`；重试递归调用 `performRequest(options, attempt + 1)`  
**问题**: 逻辑上属于同一次“用户触发请求”的重试链路，却在每次尝试生成不同的 `X-Request-ID`，导致日志与排障无法将多次尝试关联为同一链路  
**影响**: 线上排障与观测性目标（一次请求一个 requestId）被弱化；出现短时网络抖动时，问题被分散到多个 requestId，定位成本上升  
**建议**: 为一次逻辑请求复用同一个 requestId（例如把 requestId 注入 options 并在重试链路透传），并用可验证用例断言“重试前后 requestId 不变”
✅ 已完成（2026-01-29）：重试链路复用同一 requestId，并透传到后续重试请求。

#### GDE-Audit-20260128-GPT52-01: 事务重试“可重试错误集合”在代码/文档间漂移且默认引入随机抖动【核查:真实（DB_RULES 未列 P1008，但代码内集合不一致）】
**文件**: `bookworm-backend/src/db/transaction.ts`；`bookworm-backend/src/utils/typeGuards.ts`；`docs/architecture/DB_RULES.md`  
**位置**: `DB_RULES.md` 仅列 `P2034`；`typeGuards.ts` 的 `RETRYABLE_PRISMA_CODES` 含 `P1008`；但 `transaction.ts` 的 `RETRYABLE_PRISMA_CODES` 仅含 `P2034` 且默认 `jitter: true` 使用 `Math.random()`  
**问题**: 同一“可重试错误集合”的真相源分散在文档与两个实现中，且集合不一致；默认抖动引入随机性，使得重试行为在时间维度上难以稳定复现  
**影响**: 线上遇到 `P1008`（超时）时是否重试取决于调用点使用的工具函数，行为不可预测；文档与代码不一致导致排障与回归标准不可信；随机抖动会放大 CI/压测下的时间不确定性，降低可验证性  
**建议**: 收敛为单一真相源（例如在 `transaction.ts` 导出并复用错误集合，或反向让 `typeGuards` 复用 `transaction` 的判定函数）；对 `P1008` 是否应重试给出明确决策并用测试锁定；在测试环境默认关闭 jitter（或允许注入 deterministic jitter）
✅ 已完成（2026-01-29）：可重试错误集合抽为共享常量并与文档一致，测试环境默认关闭 jitter。

#### GDE-New-02: 证明测试验证了“数学”而非“业务”】【核查:真实】
**文件**: `bookworm-backend/src/tests/paymentSecurity.proof.test.ts`
**位置**: `expect(currentTime - validRequestTime).toBeCloseTo(300, 1)`
**问题**: 测试代码花费篇幅去断言 `300 - 0 == 300` (测试数据的数学关系)，而非专注于断言业务逻辑的输出。这种“Self-Verifying Data”的断言是噪音。
**影响**: 增加了测试代码的维护成本，且给人一种“测试很严谨”的错觉，实际上只是验证了减法运算。
**建议**: 移除对测试数据本身的断言，只保留对 `response.status` / `response.body` 的断言，专注于黑盒行为验证。
✅ 已完成（2026-01-29）：移除对测试数据数学关系的断言，仅保留业务逻辑验证。

#### GDE-Audit-20260128-GPT5-01: Quiz 出题顺序使用 Math.random 洗牌，导致同输入不可复现【核查:真实】
**文件**: `bookworm-backend/src/services/study/quizService.ts`  
**位置**: `shuffleArray` 用 `Math.random()`；`getQuizSession` 合并题目后直接洗牌  
**问题**: 随机性未被建模为可控输入（seed/session），无法复盘同一 session 的题序  
**影响**: 线上“某题出现/不出现”的投诉难复现；测试难以锁定顺序相关 bug  
**建议**: 改为“同一 sessionId 下确定性洗牌”（seed = sessionId）；或明确不保证顺序并写入接口契约与测试
✅ 已完成（2026-01-29）：使用 sessionId 作为 seed 进行确定性洗牌。

#### GDE-Audit-20260128-GPT5-02: 后台 Job 混用 console.log 与 log.*，可观测性入口分叉【核查:真实】
**文件**: `bookworm-backend/src/jobs/refundProcessor.ts`；`bookworm-backend/src/jobs/cancelExpiredOrders.ts`  
**位置**: 多处 `console.log(...)`；以及 `log.error("...", error)`/`log.warn("...", data)` 的参数形态  
**问题**: Job 日志不走统一的结构化字段与脱敏规则；且部分 log.* 调用形态会退化为 `{ data: [...] }`，进一步丢失错误细节  
**影响**: 无法稳定用字段过滤/聚合 job 结果；线上排障需要依赖字符串，难以设定“成功/失败”可验证标准  
**建议**: 全部改为结构化 `log.info({ jobName, ... }, "msg")`；Error 使用 `{ err }`；为关键路径添加最小断言/测试（例如“未配置微信支付时必须输出 skip 且不处理记录”）
✅ 已完成（2026-01-29）：Job 日志统一为结构化 log.*，Error 使用 `{ err }` 输出。

---

## 总结与行动计划

最紧迫的**隐患**是基于字符串匹配的错误处理，这像是一个随时可能引爆的地雷。最显著的**产品逻辑缺陷**是仪表盘缺少版本升级提示，可能导致用户困惑。

1. **重构错误处理**: 在 `courseService.ts` 中引入 Typed Errors。
2. **修补 DTO**: 在 `StudyDashboard` 返回及其对应的 Swagger/Schema 定义中增加 `upgradeAvailable`。
3. **物理拆分**: 将 `study.ts` 按领域拆分为多个小路由文件。
