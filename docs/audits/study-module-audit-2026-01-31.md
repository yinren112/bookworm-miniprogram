# 学习模块代码质量审计报告

**审计日期**: 2026-01-31  
**审计范围**: miniprogram/ 前端 + bookworm-backend/ 后端学习模块  
**审计人员**: Linus Torvalds (代码架构视角)  

---

## 【执行结果】

✓ 审计项检查: 34 项  
❌ 高风险问题: 5 项  
⚠️ 中风险问题: 8 项  
⏭️ 总计检查: 47 项  

---

## 【品味评分】

**前端**: 🟡 凑合  
**后端**: 🟢 好品味  
**整体架构**: 🟡 凑合  

---

## 【致命问题】（必须立即修复）

### 1. 【高风险】Schema 与数据库不一致（PRISMA-001）

**位置**: `bookworm-backend/prisma/schema.prisma`  
**问题**: `StudyCard` 模型缺少与 `UserStarredItem` 的关系定义

```prisma
// 当前代码 - StudyCard 只有这些关系
model StudyCard {
  ...
  userStates UserCardState[]
  feedbacks  StudyFeedback[] @relation("CardFeedbacks")
  // ❌ 缺少 starredItems 关系！
}

// 但 UserStarredItem 定义了 contentId 关联到卡片
model UserStarredItem {
  ...
  contentId  String?  // 这个应该关联到 StudyCard.contentId
  questionId Int?     // 这个关联到 StudyQuestion.id
  question StudyQuestion? @relation("QuestionStarredItems", ...)
  // ❌ 但没有 StudyCard 的关系！
}
```

**影响**: 
- 星标卡片的删除/级联行为不一致
- 卡片删除时不会清理星标记录
- 数据库外键约束缺失

**修复方案**: 
```prisma
model StudyCard {
  ...
  starredItems UserStarredItem[] @relation("CardStarredItems")
}

model UserStarredItem {
  ...
  card StudyCard? @relation("CardStarredItems", fields: [contentId], references: [contentId])
  @@index([contentId])
}
```

---

### 2. 【高风险】唯一约束缺失（DB-001）

**位置**: `UserStarredItem` 表  
**问题**: 两个独立唯一约束存在逻辑漏洞

```prisma
@@unique([userId, type, contentId], map: "uniq_user_starred_content")
@@unique([userId, type, questionId], map: "uniq_user_starred_question")
```

**风险**: 
- 用户可以同时拥有 `(type='card', contentId='abc')` 和 `(type='card', questionId=123)`
- 这违反了业务逻辑：一个星标项只能是卡片或题目之一
- 应该添加校验：`CHECK (contentId IS NULL) != (questionId IS NULL)`

**修复方案**: 
```sql
-- 添加表级约束
ALTER TABLE "user_starred_item" 
ADD CONSTRAINT chk_content_xor_question 
CHECK (
  (content_id IS NOT NULL AND question_id IS NULL) OR 
  (content_id IS NULL AND question_id IS NOT NULL)
);
```

---

### 3. 【高风险】竞态条件 - 星标状态不一致（FE-001）

**位置**: `subpackages/review/pages/flashcard/index.js:351-371`, `quiz/index.js:225-253`  
**问题**: 乐观更新但没有重试机制

```javascript
// 前端代码
this.setData({ isStarred: newVal });  // 立即更新 UI

updatePromise
  .then(() => { /* 更新本地缓存 */ })
  .catch((err) => {
    this.setData({ isStarred: !newVal });  // 失败时回滚
    // ❌ 问题：用户可能已经离开页面，回滚失败
    // ❌ 问题：网络抖动时用户会困惑
  });
```

**风险**: 
- 用户在网络不稳定时会看到状态闪烁
- 快速切换星标可能导致服务端与客户端状态不一致

**修复方案**: 
- 添加防抖（500ms）
- 添加重试队列
- 页面卸载时批量提交

---

### 4. 【高风险】内存泄漏风险（FE-002）

**位置**: `miniprogram/utils/study-timer.js:83-86`  
**问题**: 定时器在页面卸载时可能未清理

```javascript
this._tickTimer = setInterval(() => {
  this.tick();
}, TICK_INTERVAL_MS);
// ❌ 没有跟踪哪些页面创建了定时器
// ❌ 页面卸载时无法自动清理
```

**影响**: 
- 小程序后台运行 5 分钟后会强制回收，但可能触发异常
- 快速切换页面会累积定时器

**修复方案**: 
```javascript
// 使用 WeakMap 跟踪页面引用
const pageTimers = new WeakMap();

// 页面生命周期中注册/注销
onLoad() {
  pageTimers.set(this, studyTimer.register());
}
onUnload() {
  const cleanup = pageTimers.get(this);
  if (cleanup) cleanup();
}
```

---

### 5. 【高风险】SQL 注入风险（BE-001）

**位置**: `bookworm-backend/src/routes/study.ts` 多处 `contentId` 参数  
**问题**: 虽然 Prisma 有防护，但某些查询拼接了字符串

```typescript
// 在 study.ts 中
const cards = await prisma.studyCard.findMany({
  where: { contentId, courseId: { in: courseIds } },
  // contentId 是用户传入的字符串，长度限制 100 但无格式校验
});
```

**风险**: 
- contentId 格式为 `String @db.VarChar(100)`
- 未限制字符集，可能包含特殊字符
- 尽管 Prisma 有转义，但 `contentId` 用于文件名生成时可能有风险

**修复方案**: 
```typescript
// 添加严格的格式校验
const contentIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
```

---

## 【中风险问题】

### 6. 【中风险】缓存污染（FE-003）

**位置**: `miniprogram/utils/cache.js:165-177`  
**问题**: SWR 策略后台刷新失败静默处理

```javascript
// 返回缓存后，后台刷新失败没有重试
fetcher()
  .then(freshData => { /* 更新缓存 */ })
  .catch(() => {
    // 静默失败，用户永远看不到新数据
  });
```

**建议**: 
- 添加失败计数器，3 次失败后清空缓存强制刷新

---

### 7. 【中风险】时间计算不准确（FE-004）

**位置**: `miniprogram/utils/study-timer.js:8-11`  
**问题**: 手动计算北京时间有精度问题

```javascript
function getBeijingNow() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000 + now.getTimezoneOffset() * 60 * 1000);
  // ❌ 夏令时边界情况可能出错
  // ❌ 应该使用 Intl API 或标准时区库
}
```

**建议**: 
```javascript
function getBeijingNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
}
```

---

### 8. 【中风险】存储空间爆炸（FE-005）

**位置**: `miniprogram/utils/study-session.js:11`  
**问题**: 会话快照可能存储过多数据

```javascript
const MAX_RESUME_SESSION_BYTES = 200 * 1024;  // 200KB
// ❌ 题目卡片可能包含大量 HTML/图片 URL
// ❌ 50 张卡片很容易超过 200KB
```

**现状**: 
- 代码有截断检查，但达到限制时直接不保存
- 用户会丢失学习进度

**建议**: 
- 压缩存储（去掉不必要的字段）
- 仅存储 contentId，恢复时重新拉取

---

### 9. 【中风险】死循环风险（FE-006）

**位置**: `pages/review/index.js:91-100`  
**问题**: 订阅机制可能导致循环更新

```javascript
bindDashboardSubscription(dashboardCacheKey) {
  this._dashboardUnsub = subscribe(dashboardCacheKey, (dashboard) => {
    const viewState = this.deriveDashboardState(dashboard);
    this.setData({ dashboard, ...viewState });
    // ❌ 如果 setData 触发其他操作又修改缓存，可能循环
  });
}
```

**现状**: 
- 当前代码没有明显的循环调用
- 但架构上存在风险

---

### 10. 【中风险】竞态条件 - 重复提交（FE-007）

**位置**: `subpackages/review/pages/quiz/index.js:321-382`  
**问题**: `submitting` 标志在异步间隙可被绕过

```javascript
async submitAnswer(answer) {
  if (this.data.submitting) return;  // 检查 1
  
  this.setData({ submitting: true });  // 设置标志
  // ❌ 如果用户双击，两个调用可能都通过检查 1
  
  try {
    const result = await submitQuizAnswer(...);
  } finally {
    this.setData({ submitting: false });
  }
}
```

**修复**: 
- 使用原子锁或防抖

---

### 11. 【中风险】API 设计不一致（API-001）

**问题**: 不同接口的 course 标识方式不一致

```typescript
// 接口 A: 使用 courseKey（字符串）
POST /study/quiz/answer { sessionId, questionId, answer }

// 接口 B: 同时使用 courseKey 和 courseId
POST /study/cards/:contentId/answer { sessionId, rating, courseKey?, courseId? }

// 接口 C: 只有 contentId，从 session 推断 course
POST /study/feedback { courseKey, cardId?, questionId? }
```

**风险**: 
- 代码维护困难
- 容易传错参数

---

### 12. 【中风险】疲劳检测过于简单（FE-008）

**位置**: `miniprogram/utils/fatigue.js`  
**问题**: 仅基于时间，不考虑用户行为

```javascript
const FATIGUE_THRESHOLD_MS = 15 * 60 * 1000;  // 固定 15 分钟
// ❌ 没有考虑答题正确率下降
// ❌ 没有考虑操作速度变慢
// ❌ 没有考虑时间段的疲劳差异（深夜）
```

---

### 13. 【中风险】权限控制集中化不足（BE-002）

**位置**: `bookworm-backend/src/routes/study.ts:154-240`  
**问题**: `resolveCourseIds` 在每个路由中重复调用

```typescript
// 每个路由都要重复写
const courseIds = await resolveCourseIds(userId, { courseKey });
if (courseIds.length === 0) throw new ApiError(404, ...);
```

**建议**: 
- 提取为 Fastify 预处理器（preHandler）

---

## 【低风险与建议】

### 14. 【建议】Schema 注释不完整

多处 Schema 缺少 JSDoc 注释，如：
- `StudyCheatSheet.content` 格式未说明
- `StudyQuestion.optionsJson` 结构未文档化

### 15. 【建议】硬编码配置过多

```javascript
// miniprogram/utils/constants.js 可能包含分散的配置
// 建议统一到配置表
const QUIZ_SECONDS_PER_ITEM = 45;  // 这是什么依据？
const CARD_SECONDS_PER_ITEM = 30;  // 用户能力差异很大
```

### 16. 【建议】错误码不够细分

```typescript
// 400 Bad Request 被大量使用，应该细分：
// - 4001: 缺少必需参数
// - 4002: 参数格式错误
// - 4003: 业务规则冲突
```

### 17. 【建议】缺少限流

星标、提交反馈等操作没有限流，用户可能误触刷屏。

---

## 【正向发现】（值得保持）

1. ✅ 分包转发器模式 (`subpackages/review/utils/study-api.js` 转发到主包) - 避免代码重复的好设计
2. ✅ SWR 缓存策略 - 合理使用 stale-while-revalidate
3. ✅ 幂等性设计 - `uniq_attempt_session_user_question` 约束防止重复提交
4. ✅ 会话恢复机制 - `saveResumeSession`/`getResumeSession` 完善
5. ✅ 触觉/音效反馈 - 良好的用户体验细节
6. ✅ 后端测试覆盖 - 集成测试文件齐全

---

## 【技术债务清单】

| 债务项 | 优先级 | 预估工时 | 风险等级 |
|--------|--------|----------|----------|
| Schema 关系补全 | P0 | 4h | 高 |
| 星标竞态修复 | P0 | 6h | 高 |
| 定时器内存泄漏 | P1 | 4h | 高 |
| contentId 格式校验 | P1 | 2h | 高 |
| SWR 失败重试 | P2 | 4h | 中 |
| 时间计算精度 | P2 | 2h | 中 |
| 存储优化 | P2 | 8h | 中 |
| 权限预处理器 | P3 | 6h | 中 |
| 疲劳检测增强 | P3 | 8h | 中 |
| API 统一重构 | P3 | 16h | 低 |

---

## 【修复验证方法】

### 验证 Schema 修复
```bash
cd bookworm-backend
npx prisma migrate dev --name fix_starred_item_relations
npx prisma generate
npm run test:integration  # 确保测试通过
```

### 验证星标竞态修复
```javascript
// 测试代码
for (let i = 0; i < 10; i++) {
  page.toggleStar();  // 快速点击 10 次
}
// 期望：最终状态一致，没有重复请求
```

### 验证定时器修复
```javascript
// 使用 Performance.memory (如果可用)
// 快速进出页面 20 次，检查内存占用
```

---

## 【Linus 式总结】

"数据结构错了，星标的关系定义有问题。  
特殊情况太多，API 参数不一致。  
这 10 行可以变成 3 行，用预处理中间件。

但整体架构是合理的，SWR 和幂等性设计是亮点。
先修复 5 个高风险，其他可以慢慢还技术债。"

---

**报告生成时间**: 2026-01-31T16:45:00Z  
**下次审计建议**: 修复 P0 问题后重新审计
