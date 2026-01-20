# Bookworm 复习系统完整实施计划 (Phase 1-6)

> 最后更新: 2025-12-16
> 状态: Phase 1-6 全部完成

## 概述

基于 `docs/REVIEW_SYSTEM_PRD.md` 需求文档，实现校园复习系统功能域。

**核心约束**: 复习域与库存/订单域完全隔离，不读写 InventoryItem/Order/Payment 相关表。

---

## 进度总览

| Phase | 名称 | 状态 | 完成日期 |
|-------|------|------|----------|
| Phase 1 | 数据模型与课程读取接口 | ✅ 已完成 | 2025-12 |
| Phase 2 | 卡片队列与排程更新 | ✅ 已完成 | 2025-12 |
| Phase 3 | 刷题 Session 与错题本 | ✅ 已完成 | 2025-12 |
| Phase 4 | 急救包与纠错入口 | ✅ 已完成 | 2025-12 |
| Phase 5 | Streak 与周榜 | ✅ 已完成 | 2025-12-16 |
| Phase 6 | 课程包导入器 | ✅ 已完成 | 2025-12-16 |

---

## Phase 1: 数据模型与课程读取接口 ✅

### 1.1 Prisma Schema 新增
- [x] 枚举定义: `QuestionType`, `FeedbackRating`, `FeedbackReasonType`, `StudyFeedbackStatus`
- [x] 内容侧模型: `StudyCourse`, `StudyUnit`, `StudyCard`, `StudyQuestion`, `StudyCheatSheet`, `StudyCampaignMap`
- [x] 进度侧模型: `UserCourseEnrollment`, `UserCardState`, `UserQuestionAttempt`, `UserWrongItem`, `UserStudyStreak`, `StudyFeedback`

**关键文件**: `bookworm-backend/prisma/schema.prisma`

### 1.2 服务层
- [x] `src/services/study/index.ts` - 公共导出
- [x] `src/services/study/courseService.ts` - getCourseList, getCourseByKey, enrollCourse

### 1.3 路由层
- [x] `src/routes/study.ts` - 路由定义
- [x] `src/routes/studySchemas.ts` - TypeBox schema
- [x] `GET /api/study/courses` - 课程列表
- [x] `GET /api/study/courses/:courseKey` - 课程详情与章节
- [x] `POST /api/study/courses/:courseKey/enroll` - 注册课程

### 1.4 种子数据
- [x] 测试课程: MA101 高等数学（上）
- [x] 测试章节: 极限、导数、积分
- [x] 测试卡片: 每章 3-5 张

---

## Phase 2: 卡片队列与排程更新 ✅

### 2.1 Leitner 排程算法
- [x] `src/services/study/cardScheduler.ts` - 排程算法实现

```typescript
// 核心间隔配置
const LEITNER_INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 }; // 天数

// 反馈处理
FORGOT  → boxLevel = 1, nextDue = now + 5h
FUZZY   → boxLevel = max(1, current-1), nextDue = now + 1d
KNEW    → boxLevel = min(5, current+1), nextDue = now + interval
PERFECT → boxLevel = min(5, current+2), nextDue = now + interval
```

### 2.2 服务函数
- [x] `getTodayQueue(userId, courseKey)` - 返回到期卡片
- [x] `startSession(userId, courseKey, unitId?)` - 创建学习 session
- [x] `submitCardAnswer(userId, cardId, sessionId, rating)` - 提交反馈并更新排程

### 2.3 路由端点
- [x] `GET /api/study/today?courseKey=` - 今日队列摘要
- [x] `POST /api/study/start` - 开始复习 session
- [x] `POST /api/study/cards/:contentId/answer` - 提交卡片反馈

### 2.4 前端页面
- [x] `miniprogram/subpackages/review/pages/home/` - 复习首页
- [x] `miniprogram/subpackages/review/pages/course/` - 课程详情
- [x] `miniprogram/subpackages/review/pages/flashcard/` - 卡片翻转页
- [x] 卡片翻转动画 (WXSS transform 3D)
- [x] 四档反馈按钮 (FORGOT/FUZZY/KNEW/PERFECT)
- [x] 乐观更新 + 异步提交

---

## Phase 3: 刷题 Session 与错题本 ✅

### 3.1 服务层
- [x] `src/services/study/quizService.ts` - 刷题服务

**核心函数**:
- [x] `startQuizSession(db, userId, courseId, options)` - 拉取一组题目
  - 支持 unitId 筛选
  - 支持 wrongItemsOnly 只做错题
  - 支持 limit 限制数量 (默认 20)
  - 返回 sessionId + questions 数组
- [x] `submitQuizAnswer(db, userId, questionId, sessionId, answer, durationMs)` - 提交答案
  - 自动判断答案正确性
  - 记录 UserQuestionAttempt
  - 错题自动加入 UserWrongItem
  - 连续 3 次正确自动清除错题
- [x] `getWrongItems(db, userId, courseId?, options)` - 错题列表
- [x] `clearWrongItem(db, userId, questionId)` - 手动清除错题
- [x] `getQuizStats(db, userId, courseId?)` - 刷题统计

**答案判断逻辑**:
```typescript
SINGLE_CHOICE: answer.toLowerCase() === correctAnswer.toLowerCase()
MULTI_CHOICE: Set比较，忽略顺序
TRUE_FALSE: answer.toLowerCase() === correctAnswer.toLowerCase()
FILL_BLANK: 支持多答案 ("|" 分隔)，忽略大小写
```

### 3.2 路由端点
- [x] `POST /api/study/quiz/start` - 开始刷题 session
- [x] `POST /api/study/quiz/answer` - 提交答题结果
- [x] `GET /api/study/wrong-items` - 获取错题列表
- [x] `DELETE /api/study/wrong-items/:questionId` - 清除错题
- [x] `GET /api/study/quiz/stats` - 获取刷题统计

### 3.3 前端页面
- [x] `miniprogram/subpackages/review/pages/quiz/` - 刷题页面
  - 单选/多选/判断/填空题渲染
  - 即时反馈 (正确/错误高亮)
  - 答案解析显示
  - 进度条 (currentIndex / total)
  - 完成状态统计

### 3.4 种子数据
- [x] 测试题目: 12 道题 (每章 4 道)
- [x] 题型覆盖: SINGLE_CHOICE, TRUE_FALSE, FILL_BLANK

---

## Phase 4: 急救包与纠错入口 ✅

### 4.1 服务层
- [x] `src/services/study/cheatsheetService.ts` - 急救包服务
  - `getCheatSheets(db, courseId, unitId?)` - 急救包列表
  - `getCheatSheetById(db, id)` - 急救包详情
- [x] `src/services/study/feedbackService.ts` - 纠错反馈服务
  - `createFeedback(db, input)` - 提交纠错
  - `getUserFeedbacks(db, userId, options)` - 用户反馈列表
  - `getPendingFeedbacks(db, courseId?, options)` - 待处理反馈 (管理员)
  - `updateFeedbackStatus(db, feedbackId, status)` - 更新反馈状态

**反馈原因类型**:
```typescript
ANSWER_ERROR        // 答案错误
STEM_AMBIGUOUS      // 题目描述不清
EXPLANATION_UNCLEAR // 解析不够清晰
FORMAT_ERROR        // 格式/排版问题
OTHER               // 其他问题
```

### 4.2 路由端点
- [x] `GET /api/study/cheatsheets?courseKey=` - 急救包列表
- [x] `GET /api/study/cheatsheets/:id` - 急救包详情
- [x] `POST /api/study/feedback` - 提交纠错反馈
- [x] `GET /api/study/feedback` - 获取我的反馈

### 4.3 前端页面
- [x] `miniprogram/subpackages/review/pages/cheatsheet/` - 急救包页面
  - PDF 文档预览 (wx.downloadFile + wx.openDocument)
  - 图片预览 (wx.previewImage)
  - 图片保存到相册 (wx.saveImageToPhotosAlbum)

### 4.4 前端组件
- [x] `miniprogram/subpackages/review/components/report-issue/` - 纠错弹窗
  - 5 种问题类型选项
  - 补充说明输入 (500字符)
  - 底部弹出动画
  - 已集成到 flashcard 和 quiz 页面

### 4.5 种子数据
- [x] 测试急救包: 3 个 (PDF + IMAGE)

---

## Phase 5: Streak 与周榜 ✅

### 5.1 数据模型 (已存在)
```prisma
model UserStudyStreak {
  id            Int      @id @default(autoincrement())
  userId        Int
  lastStudyDate DateTime @db.Date
  currentStreak Int      @default(0)
  bestStreak    Int      @default(0)
  weeklyPoints  Int      @default(0)
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id])
  @@unique([userId])
}
```

### 5.2 服务层
- [x] `src/services/study/streakService.ts` - 连续学习服务

**核心函数**:
```typescript
/**
 * 记录学习活动并更新连续天数
 * - 如果是今天第一次学习，currentStreak++
 * - 如果中断超过1天，currentStreak = 1
 * - 更新 bestStreak 如果当前超过历史最佳
 * - 增加 weeklyPoints
 */
export async function recordActivity(
  db: DbCtx,
  userId: number,
  pointsEarned: number = 1
): Promise<StreakInfo>

/**
 * 获取用户连续学习信息
 */
export async function getStreakInfo(
  db: DbCtx,
  userId: number
): Promise<StreakInfo>

/**
 * 获取周榜
 * @param courseId - 可选，按课程筛选
 * @param limit - 返回数量，默认 50
 */
export async function getWeeklyLeaderboard(
  db: DbCtx,
  courseId?: number,
  limit: number = 50
): Promise<LeaderboardEntry[]>

/**
 * 获取用户排名
 */
export async function getUserRank(
  db: DbCtx,
  userId: number
): Promise<number | null>

/**
 * 重置所有用户的 weeklyPoints (每周一执行)
 */
export async function resetWeeklyPoints(db: DbCtx): Promise<number>
```

**类型定义**:
```typescript
interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  weeklyPoints: number;
  lastStudyDate: string | null;
  isStudiedToday: boolean;
}

interface LeaderboardEntry {
  rank: number;
  oderId: number;
  nickname: string;
  avatarUrl: string | null;
  weeklyPoints: number;
  currentStreak: number;
}
```

### 5.3 路由端点
- [x] `GET /api/study/streak` - 获取当前用户连续学习信息
- [x] `GET /api/study/leaderboard?limit=` - 获取周榜

### 5.4 集成点
- [x] 在 `submitCardFeedback` 中调用 `recordActivity`
- [x] 在 `submitQuizAnswer` 中调用 `recordActivity`
- [x] 每次学习活动增加 1 点 weeklyPoints

### 5.5 Cron Job
- [x] 在 `src/jobs.ts` 中添加周重置任务
- [x] 配置: `CRON_WEEKLY_POINTS_RESET=0 16 * * 0` (周日 16:00 UTC = 周一 00:00 北京时间)
- [x] 在 `src/config.ts` 中添加 `CRON_WEEKLY_POINTS_RESET` 配置项

### 5.6 前端页面
- [x] 更新 `pages/home/index` - 显示连续学习天数和排名入口
  - 新增 streak 卡片 (火焰图标 + 天数)
  - 显示本周积分和最长连续天数
  - 点击跳转周榜页面
- [x] 新建 `pages/leaderboard/index` - 周榜页面
  - 显示 Top 50 用户
  - 高亮当前用户排名
  - 显示连续学习天数
  - 我的排名卡片

### 5.7 验收标准
- [x] 连续学习天数正确计算 (北京时区 UTC+8)
- [x] 中断后重置为 1
- [x] 周榜排序正确 (按 weeklyPoints 降序, currentStreak 次序)
- [x] 每周一 00:00 (北京时间) 自动重置积分

---

## Phase 6: 课程包导入器 ✅

### 6.1 课程包格式规范

**支持两种导入方式**:
1. **JSON API**: 通过 `POST /api/study/admin/import` 直接传入结构化数据
2. **文件包**: manifest.json + units.json + cards/*.tsv + questions/*.gift

**manifest.json**:
```json
{
  "courseKey": "MA101",
  "title": "高等数学（上）",
  "description": "大一必修课程",
  "contentVersion": 2,
  "locale": "zh-CN"
}
```

**units.json**:
```json
[
  { "unitKey": "limit", "title": "极限", "orderIndex": 1 },
  { "unitKey": "derivative", "title": "导数", "orderIndex": 2 }
]
```

**cards/{unitKey}.tsv** (Tab分隔):
```
contentId	front	back	tags	difficulty
card-001	极限的定义是什么？	ε-δ语言：...	定义,基础	1
card-002	洛必达法则适用条件？	0/0型或∞/∞型	法则,技巧	2
```

**questions/{unitKey}.gift** (GIFT格式简化子集):
```
// 单选题
::Q001:: 极限存在的充要条件是什么？ {
=左右极限存在且相等
~只需左极限存在
~只需右极限存在
~极限等于函数值
}

// 多选题 (多个=)
::Q002:: 下列哪些是无穷大量？ {
=1/x (x→0)
=tanx (x→π/2)
~sinx
~cosx
}

// 判断题
::Q003:: 连续函数在闭区间上一定有最值。 {TRUE}
::Q004:: 可导函数一定连续。 {F}

// 填空题
::Q005:: lim(x→0) sin(x)/x = {=1}
::Q006:: e的值约等于 {=2.718|2.72}
```

### 6.2 服务层
- [x] `src/services/study/importService.ts` - 导入服务

**核心函数**:
```typescript
// 解析器
parseManifest(content: string): CourseManifest
parseUnits(content: string): UnitDefinition[]
parseCardsTsv(content: string, unitKey: string): CardDefinition[]
parseQuestionsGift(content: string, unitKey: string): QuestionDefinition[]
parseCheatsheets(content: string): CheatSheetDefinition[]
parseCoursePackage(files: PackageFiles): CoursePackage

// 导入核心
importCoursePackage(db, pkg, options): Promise<ImportResult>
listCourseVersions(db, courseKey): Promise<CourseVersionInfo[]>
setCourseStatus(db, courseId, status): Promise<void>
```

**ImportOptions**:
- `dryRun`: 只验证不写入
- `overwriteContent`: 覆盖已有内容
- `publishOnImport`: 导入后自动发布

### 6.3 幂等规则
- [x] courseKey + contentVersion 定位版本
- [x] 同版本重复导入: 跳过或更新 (基于 overwriteContent)
- [x] contentId 匹配: 更新内容，保留用户进度
- [x] 用户学习进度通过 contentId 关联，不受内容更新影响

### 6.4 路由端点
- [x] `POST /api/study/admin/import` - 导入课程包 (STAFF only)
- [x] `GET /api/study/admin/courses/:courseKey/versions` - 获取课程版本列表 (STAFF only)
- [x] `PATCH /api/study/admin/courses/:id/status` - 更新课程状态 (STAFF only)

### 6.5 单元测试
- [x] `src/tests/importService.test.ts` - 31 个测试用例
  - parseManifest: 5 个测试
  - parseUnits: 4 个测试
  - parseCardsTsv: 7 个测试
  - parseQuestionsGift: 11 个测试
  - parseCheatsheets: 4 个测试

### 6.6 验收标准
- [x] 解析 manifest.json 正确 (含校验和默认值)
- [x] 解析 TSV 格式卡片正确 (大小写不敏感表头)
- [x] 解析 GIFT 格式题目正确 (单选/多选/判断/填空)
- [x] 同一课程包导入两次不产生重复 (幂等)
- [x] 用户进度在内容更新后保留

---

## 前端分包配置 (当前状态)

**文件**: `miniprogram/app.json`

```json
{
  "subpackages": [{
    "root": "subpackages/review",
    "name": "review",
    "pages": [
      "pages/home/index",
      "pages/course/index",
      "pages/flashcard/index",
      "pages/quiz/index",
      "pages/cheatsheet/index",
      "pages/leaderboard/index"
    ]
  }],
  "preloadRule": {
    "pages/market/index": {
      "network": "wifi",
      "packages": ["review"]
    }
  }
}
```

---

## 目录结构 (当前状态)

```
miniprogram/subpackages/review/
├── pages/
│   ├── home/           ✅ 复习首页 - 今日任务 + 课程列表 + Streak卡片
│   ├── course/         ✅ 课程详情 - 章节目录 + 掌握概览
│   ├── flashcard/      ✅ 卡片页 - 翻转 + 四档反馈
│   ├── quiz/           ✅ 题目页 - 选择/判断/填空
│   ├── cheatsheet/     ✅ 急救包 - PDF/图片预览
│   └── leaderboard/    ✅ 周榜页 - Top 50 + 我的排名
├── components/
│   └── report-issue/   ✅ 纠错弹窗
└── utils/
    └── study-api.js    ✅ 复习 API 封装 (含 streak/leaderboard)

bookworm-backend/src/services/study/
├── index.ts            ✅ 公共导出
├── courseService.ts    ✅ 课程读取逻辑
├── cardScheduler.ts    ✅ Leitner 排程算法 + recordActivity集成
├── quizService.ts      ✅ 刷题服务 + recordActivity集成
├── cheatsheetService.ts ✅ 急救包服务
├── feedbackService.ts  ✅ 纠错反馈服务
├── streakService.ts    ✅ 连续学习服务
└── importService.ts    ✅ 课程包导入器
```

---

## API 端点汇总

### Phase 1-2 (课程与卡片)
| 方法 | 端点 | 状态 | 说明 |
|------|------|------|------|
| GET | `/api/study/courses` | ✅ | 课程列表 |
| GET | `/api/study/courses/:courseKey` | ✅ | 课程详情与章节 |
| POST | `/api/study/courses/:courseKey/enroll` | ✅ | 注册课程 |
| GET | `/api/study/today` | ✅ | 今日队列摘要 |
| POST | `/api/study/start` | ✅ | 开始复习 session |
| POST | `/api/study/cards/:contentId/answer` | ✅ | 提交卡片反馈 |

### Phase 3 (刷题)
| 方法 | 端点 | 状态 | 说明 |
|------|------|------|------|
| POST | `/api/study/quiz/start` | ✅ | 开始刷题 session |
| POST | `/api/study/quiz/answer` | ✅ | 提交答题结果 |
| GET | `/api/study/wrong-items` | ✅ | 获取错题列表 |
| DELETE | `/api/study/wrong-items/:questionId` | ✅ | 清除错题 |
| GET | `/api/study/quiz/stats` | ✅ | 获取刷题统计 |

### Phase 4 (急救包与纠错)
| 方法 | 端点 | 状态 | 说明 |
|------|------|------|------|
| GET | `/api/study/cheatsheets` | ✅ | 急救包列表 |
| GET | `/api/study/cheatsheets/:id` | ✅ | 急救包详情 |
| POST | `/api/study/feedback` | ✅ | 提交纠错反馈 |
| GET | `/api/study/feedback` | ✅ | 获取我的反馈 |

### Phase 5 (Streak与周榜)
| 方法 | 端点 | 状态 | 说明 |
|------|------|------|------|
| GET | `/api/study/streak` | ✅ | 获取连续学习信息 |
| GET | `/api/study/leaderboard` | ✅ | 获取周榜 |

### Phase 6 (导入器)
| 方法 | 端点 | 状态 | 说明 |
|------|------|------|------|
| POST | `/api/study/admin/import` | ✅ | 导入课程包 (STAFF) |
| GET | `/api/study/admin/courses/:courseKey/versions` | ✅ | 获取课程版本列表 (STAFF) |
| PATCH | `/api/study/admin/courses/:id/status` | ✅ | 更新课程状态 (STAFF) |

---

## 变更日志

### 2025-12-16
- **Phase 6 完成**: 课程包导入器
  - 新增 `importService.ts`: 解析器 + 导入核心
    - `parseManifest`: manifest.json 解析
    - `parseUnits`: units.json 解析
    - `parseCardsTsv`: TSV 卡片解析 (大小写不敏感表头)
    - `parseQuestionsGift`: GIFT 格式题目解析 (单选/多选/判断/填空)
    - `parseCheatsheets`: 急救包配置解析
    - `importCoursePackage`: 事务性导入，幂等处理
  - 新增 API 端点 (STAFF only):
    - POST /api/study/admin/import
    - GET /api/study/admin/courses/:courseKey/versions
    - PATCH /api/study/admin/courses/:id/status
  - 新增 `studySchemas.ts` Phase 6 schemas
  - 新增 `importService.test.ts`: 31 个单元测试
- **Phase 5 完成**: Streak 与周榜功能
  - 新增 `streakService.ts`: recordActivity, getStreakInfo, getWeeklyLeaderboard, getUserRank, resetWeeklyPoints
  - 新增 API 端点: GET /api/study/streak, GET /api/study/leaderboard
  - 集成 recordActivity 到 cardScheduler.ts 和 quizService.ts
  - 新增周榜前端页面 `pages/leaderboard/index`
  - 更新复习首页显示 streak 卡片
  - 新增周重置 Cron Job (CRON_WEEKLY_POINTS_RESET)
  - 北京时区处理 (UTC+8)
- Phase 3-4 前端完成: quiz, cheatsheet 页面 + report-issue 组件
- 修复 feedbackService.ts 类型错误
- 添加 @types/uuid 依赖

### 2025-12-XX (之前)
- Phase 1-2 完成: 数据模型、课程服务、卡片排程
- Phase 3-4 后端完成: 刷题服务、急救包服务、纠错服务
