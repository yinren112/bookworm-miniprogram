

# Bookworm 复习系统需求文档 v1.0

建议保存路径：`docs/REVIEW_SYSTEM_PRD.md`
范围：小程序端 分包新增复习域，后端新增 StudyService 与数据模型，支持课程包导入与版本迭代
约束：复习域不得影响库存与订单域，库存状态机 In Stock → Reserved → Sold 不允许被复习功能读写或间接触发

## 1 背景与目标

本学期教材改版频繁，二手书回收存在不可控库存风险。产品需要一个更稳的校园入口，先用学习工具把用户关系建立起来，再决定交易功能扩张节奏。

复习系统的核心目标是形成一个可持续的学习闭环：用户打开后立刻知道今天该做什么，完成后得到即时反馈，系统据此安排下次出现的时间，减少用户靠意志力硬扛的成本。这个闭环在学习科学里对应两条稳定结论：练习性测试能显著提升长期保持，间隔复习在多研究汇总中表现稳健。([colinallen.dnsalias.org][1])

产品目标分三层。

第一层是启动效率。新用户从扫码或首页进入，到开始第一张卡或第一题，路径不超过两次点击。

第二层是留存机制。用“今日到期”做主入口，并用掌握反馈驱动下一次出现间隔，让用户能感知到系统在“记住他学到哪”。

第三层是内容可扩展。课程内容通过标准化课程包导入，外部 AI 或运营同学按规范产出，导入后立即上线新课，不需要开发改代码。

## 2 核心体验与功能边界

### 2.1 三种学习形态

复习域包含三类页面形态，彼此互补，避免“只有卡片”导致刷题迁移不足，也避免“只有题库”导致概念记忆薄弱。

闪念背诵 Flashcard
面向碎片时间，聚焦概念，公式，题型套路的一句话抓手。交互以翻面与掌握反馈为主，系统根据反馈排程。

刷题闯关 Quiz
面向坐下来刷题，聚焦选择题判断题填空题等可自动判分题型。强调毫秒级点击反馈与一句话解析，解析保持短，服务“立刻纠错”这一刻。

考前急救包 Cheat Sheet
面向考前半小时，聚焦一页纸重点，公式表，必考题型步骤，常见坑。它承担的是降低焦虑与快速回忆，不承担训练。

### 2.2 游戏化在 v1 的边界

v1 只做轻量激励，避免喧宾夺主。

连续打卡 Streak
按自然日统计，只要当天完成任意复习动作就记一次打卡。连续断一天不做强惩罚，提供一次“缓冲”，避免压力反噬。

课程内周榜 Leaderboard
按课程维度统计刷题数与复习卡片数，默认匿名展示，展示名可以是系统生成的“卷王编号”。榜单属于锦上添花，功能必须在无榜单时也完整可用。

### 2.3 复习域与交易域的隔离原则

复习域不读取也不写入 InventoryItem 与订单支付相关表，不调用 InventoryService OrderService PaymentService，不参与库存事务，不改变库存状态流转图。

复习域唯一允许的“跨域关联”是推荐层的只读关联，例如在教材详情页展示“这本书对应课程的复习入口”，这种推荐通过 courseKey 映射完成，不允许把教材库存状态写入复习域，也不允许把复习行为写入库存域。

## 3 信息架构与小程序端设计

### 3.1 入口策略

你们现有小程序是交易平台心智，复习功能要做到“显眼但不打断”。

优先方案是首页增加一张主卡片入口“今日复习”，展示到期数量与预计用时，点击进入复习域。若 tabBar 尚有空位，允许增加“复习”tab，但要注意 tabBar 页面通常需要放在主包页面集合中，复习深层页面仍放分包。分包的直接价值在于降低首包体积与启动下载时间，小程序生态普遍以分包做按需加载优化。([Ian的博客][2])

### 3.2 分包与目录规划

复习域采用分包 `subpackages/review/`。主包仅保留入口组件与跳转逻辑。

建议目录：

`miniprogram/`
`pages/` 现有交易域
`subpackages/review/pages/` 复习域页面
`subpackages/review/components/` 复习域组件
`subpackages/review/assets/` 复习域静态资源

### 3.3 页面清单与交互要点

复习首页 `review/home`
它是默认落点页，也是扫码兜底页。它只解决一件事：把用户送进“今天该做的队列”。

页面结构采用上中下三段。

上段是“今日任务”，显示到期卡片数，到期错题数，预计时长。预计时长用静态估算，卡片按 8 秒，题目按 20 秒。这里不搞复杂模型，保证稳定可解释。

中段是主按钮“开始复习”，点击后进入队列页。

下段是“课程列表”，显示用户已加入课程与推荐课程。高数起步时这里可以只有一个课程卡片。

课程页 `review/course`
展示课程信息，章节目录，掌握概览。章节粒度以 Unit 为准，每章提供两个入口：背卡与刷题。掌握概览最小实现是“已掌握卡片占比”与“本章错题数量”。

卡片页 `review/flashcard`
单卡居中，点击翻面，翻面后显示答案与掌握按钮。翻面动画用 WXSS transform 实现，要求稳定不掉帧。

按钮为四档，文案固定：不会，模糊，会，很熟。按钮点击后必须触觉反馈，并立刻跳下一张，上一张的状态写入后端。掌握反馈驱动间隔复习，参考 Anki 的设计思路，按钮会影响间隔倍数与下一次出现时间，Anki 手册明确了 Hard 等按钮会对间隔做乘数调整。([Anki 手册][3])

题目页 `review/quiz`
单题模式。顶部进度条 5/50。选择题点击选项后立即变色，答对停留 500ms 自动下一题。答错显示正确选项，并弹出一句话解析。解析字段来自题目内容的 explanationShort，v1 不接在线大模型生成，避免延迟与成本。

急救包页 `review/cheatsheet`
展示一页纸重点。资源形式支持图片长图与 pdf。v1 做预览与保存引导，不做外链跳转。

纠错入口组件 `review/components/ReportIssue`
卡片与题目页都要挂载“有问题”按钮。弹窗让用户选择原因并输入补充。原因枚举建议包含：答案错误，题干歧义，解析不清，排版错误，其他。提交后给出反馈成功提示。

### 3.4 扫码投放承接与 scene 设计

你们线下贴纸使用小程序码 getUnlimited。官方生态对 scene 的长度与字符集约束比较严格，常见描述是最多 32 个可见字符，并且字符集有限，中文不直接支持，需要自行编码。([GitHub][4])

因此 scene 不承载复杂参数。采用短码映射策略。

贴纸上是 `scene=Rxxxxx`，例如 `R9xK2pQ`。小程序启动后把 scene 上报后端，后端查映射表得到 courseKey 与可选 unitKey，再跳转到对应课程页或直接进入今日队列。这样你们以后上线线代或高数 2 只需要新增映射记录，不需要重新设计编码规则。

## 4 学习引擎与排程规则

### 4.1 为什么一定要排程

如果只是把资料卡片化，用户会在两天后把它当成资料库遗忘。排程的作用是把“复习”从一次性行为变成持续行为。学习研究的汇总结论显示，练习性测试与间隔复习属于高效学习技术，且在不同材料与任务上具有较好外推性。([PubMed][5])

### 4.2 v1 排程实现

v1 使用盒子法 Leitner 的简化版本。盒子法的好处是实现简单，可解释，调参直观，适合小程序早期。([goodnotes.com][6])

定义 boxLevel 1 到 5，并定义间隔表。

box 1 下一次 1 天
box 2 下一次 3 天
box 3 下一次 7 天
box 4 下一次 14 天
box 5 下一次 30 天

用户对每张卡的反馈映射规则。

不会
boxLevel 设为 1，nextDueAt 设为 now + 5 小时，确保当天能再见一次

模糊
boxLevel 降 1 但不低于 1，nextDueAt 设为 now + 1 天

会
boxLevel 升 1 但不高于 5，nextDueAt 设为 now + interval(boxLevel)

很熟
boxLevel 增 2 但不高于 5，nextDueAt 设为 now + interval(boxLevel)

为了防止同一天陷入循环，同一张卡同一自然日最多出现 3 次。超过次数仍答错时，提示用户先看解析与急救包，再继续。

### 4.3 错题本策略

错题本来自 Quiz 的答错记录。v1 的错题策略不做复杂分类，先做到以下两点。

今日队列里包含一定比例错题回炉，建议 30%。如果今日错题较多，仍要设置上限，避免用户被错题淹没。

错题回炉完成后，若同一题连续三次答对，则从错题本移除，但保留尝试记录。

## 5 内容体系与可导入课程包规范

### 5.1 设计目标

你们希望把资料交给外部 AI，产出固定格式，再导入项目新增课程。这个目标成立的前提是课程包规范足够清晰，导入过程幂等，版本迭代不破坏用户进度。

课程包是一个 zip 文件，里面包含 manifest 与若干内容文件。导入器负责校验，转换，写入。课程包一旦格式固定，后续线代，高数 2，高数 3 都只走“生成课程包 导入 发布”流程。

### 5.2 课程包目录结构

`course-pack.zip` 内容如下。

`manifest.json`
描述课程与版本信息，以及文件引用。

`units.json`
章节结构，可与 manifest 合并，也可独立。

`cards.tsv`
闪卡数据，tab 分隔。

`questions.gift`
题库数据，采用 Moodle GIFT 格式，因为它对题型支持清晰，且生态里大量工具和人员熟悉。([Moodle 文档][7])

`cheatsheets/`
急救包资源文件，png 或 pdf。

`assets/`
题目插图等资源，v1 可不启用，留扩展口。

### 5.3 manifest 字段规范

示例：

```json
{
  "courseKey": "MA101",
  "title": "高等数学（上）",
  "contentVersion": "2026S-v1",
  "locale": "zh-CN",
  "unitsFile": "units.json",
  "cardsFile": "cards.tsv",
  "questionsFile": "questions.gift",
  "cheatsheets": [
    { "id": "cs-main", "title": "必考公式与题型", "file": "cheatsheets/main.pdf" }
  ],
  "createdBy": "external-ai-pipeline",
  "checksum": "sha256:..."
}
```

关键字段解释。

courseKey 是课程稳定标识，用于全局引用与扫码映射，例如 MA101 LA101。

contentVersion 是内容版本号，用于更新迭代。它不与学期强绑定，但建议你们用 2026S 这种前缀方便运营理解。

checksum 用于防止课程包被误改或重复导入难以追踪。

### 5.4 cards.tsv 字段规范

每行一张卡，字段用 tab 分隔，禁止出现未转义 tab。

列定义：

contentId
unitKey
front
back
tags
difficulty

contentId 必须稳定，决定幂等更新与进度继承。你们后续更新文案时尽量保持 contentId 不变，除非知识点结构发生实质变化。

front 与 back 支持 Markdown 的子集，v1 只允许粗体，斜体，行内代码，列表，行内公式占位符。复杂公式建议转成图片放 cheatsheet 或 assets，避免渲染分歧。

### 5.5 questions.gift 支持范围

v1 支持题型。

单选
多选
判断
填空
数值题可以先不做

每题必须包含。

题干
答案
explanationShort 一句解析
unitKey

GIFT 的语法细节按 MoodleDocs 执行，导入器按你们定义的标记把 unitKey 与解析读出来。([Moodle 文档][7])

建议你们在 GIFT 里用注释或自定义前缀标记 unitKey，例如：

```text
// unit: derivative
::Q001::导数的定义是 {=极限形式 ~其它干扰}
#### 因为导数定义就是差商极限
```

导入器识别 `// unit:` 与 `####` 后的解析。

## 6 后端设计 Fastify TypeScript Prisma Postgres

### 6.1 模块与代码结构

新增 `StudyService`，放置于 `src/services/study/`。该模块不得 import 现有库存与支付相关 service。对外提供明确的接口，路由层只做参数校验与事务边界。

新增路由 `src/routes/study.ts`，统一挂载在 `/api/study/*`。

### 6.2 数据模型建议

内容侧表。

StudyCourse
id, courseKey, title, contentVersion, status, createdAt

StudyUnit
id, courseId, unitKey, title, orderIndex

StudyCard
id, courseId, unitId, contentId, front, back, tags, difficulty

StudyQuestion
id, courseId, unitId, contentId, stem, optionsJson, answerJson, explanationShort, difficulty, questionType

StudyCheatSheet
id, courseId, unitId nullable, assetType, url, title, version

StudyCampaignMap
id, sceneCode, courseKey, unitKey nullable, createdAt, note

进度侧表。

UserCourseEnrollment
id, userId, courseId, enrolledAt, sourceScene nullable

UserCardState
id, userId, cardId, boxLevel, nextDueAt, lastAnsweredAt, todayShownCount, updatedAt

UserQuestionAttempt
id, userId, questionId, isCorrect, chosenAnswerJson, durationMs, createdAt

UserWrongItem
id, userId, questionId, wrongCount, lastWrongAt, clearedAt nullable

UserStudyStreak
id, userId, lastStudyDate, currentStreak, bestStreak

StudyFeedback
id, userId, courseId, targetType card or question, targetId, reason, message, createdAt, status

索引要求。

UserCardState(userId, nextDueAt) 用于拉今日到期队列
UserWrongItem(userId, lastWrongAt) 用于错题回炉
StudyCourse(courseKey, contentVersion) 用于幂等导入定位
StudyCampaignMap(sceneCode) 用于扫码映射

### 6.3 API 端点与契约

以 TypeBox 定义 schema，保证 request response 可控。

建议端点表。

| 方法   | 路径                                                 | 用途             | 关键返回                                    |
| ---- | -------------------------------------------------- | -------------- | --------------------------------------- |
| GET  | /api/study/courses                                 | 课程列表           | courseKey title contentVersion enrolled |
| GET  | /api/study/courses/:courseKey                      | 课程详情与章节        | units 掌握概览 cheatsheet                   |
| GET  | /api/study/today?courseKey=MA101                   | 今日队列摘要         | dueCards dueWrongQuestions etaSeconds   |
| POST | /api/study/start                                   | 开始一次复习 session | sessionId 队列首屏数据                        |
| POST | /api/study/cards/:contentId/answer                 | 提交卡片反馈         | nextCard + 更新后的 state                   |
| POST | /api/study/quiz/start                              | 拉取一组题目         | quizSessionId questions                 |
| POST | /api/study/quiz/:quizSessionId/answer              | 提交答题           | isCorrect explanationShort nextQuestion |
| GET  | /api/study/cheatsheets?courseKey=MA101             | 急救包列表          | assets                                  |
| POST | /api/study/feedback                                | 纠错提交           | ok                                      |
| GET  | /api/study/leaderboard?courseKey=MA101&period=week | 周榜             | rankList                                |

所有写入端点要求 JWT，复用现有鉴权注入 userId。与用户状态相关的更新采用事务，确保作答记录与 nextDueAt 同步写入。

### 6.4 课程包导入接口

v1 支持两条导入路径，方便你们先跑起来。

离线 seed
通过 `prisma/seed.ts` 导入高数初始内容。

在线 admin 导入
新增 `POST /api/study/admin/import`，仅 STAFF 角色可用。入参是课程包 zip 或已经解析成 JSON 的结构。导入逻辑必须幂等。

幂等规则。

以 courseKey + contentVersion 定位课程版本。若存在则更新内容，不重复插入。

以 contentId 定位卡片与题目。contentId 相同则更新文本字段，保留 cardId questionId 不变，从而保证用户进度可继承。

导入过程写入 ImportRun 记录，状态 running success failed。失败要回滚，避免只导入一半。

## 7 小程序端实现细节

### 7.1 与现有基础设施的融合

所有请求走你们现有 api.js，复用 token 自动附加与错误处理。

复习域页面样式使用你们 V10 Design System 变量，避免引入新的全局 wxss。复习域组件只在分包内引用，避免主包体积增长。

### 7.2 性能与缓存策略

今日队列接口本地缓存 3 分钟，避免用户频繁进出造成多次网络请求。

卡片提交与刷题提交采用乐观更新，先本地切换下一张，再异步确认。若失败则提示并回退上一张，防止队列乱序。

急救包资源尽量用 CDN 静态资源，避免走后端转发。

### 7.3 体验稳定性

卡片翻面状态要锁住，翻面动画期间禁止重复点击触发两次翻面。

刷题点击后立刻锁定本题选项，避免连点导致多次提交。

断网状态提供“稍后再试”，并在复习首页给出离线提示。

## 8 数据合规与内容安全

课程内容来源必须可控。你们已经决定以知识点骨架与自研题目为主，外部 AI 只作为草稿生成工具。系统层面需要两点保障。

第一，用户投稿或纠错内容默认不公开，仅用于内部修订。公开发布的内容必须走你们的审核发布流程。

第二，课程包导入时做基础敏感信息校验，禁止导入包含手机号，身份证号等明显个人信息的文本。

## 9 测试策略与验收标准

### 9.1 后端集成测试

沿用你们现有 Testcontainers 集成测试风格，覆盖以下流程。

首次进入课程，自动创建 enrollment，并返回章节列表。

拉今日队列，返回 dueCards 与 dueWrongQuestions 且 ETA 可解释。

提交卡片反馈，会更新 boxLevel 与 nextDueAt，并写入作答时间。

刷题 start 与 answer 流程可用，答错会生成 WrongItem，答对达到阈值会清除 WrongItem。

扫码 scene 映射可用，非法 scene 会降级到复习首页。

导入接口幂等，同一课程包导入两次不会产生重复卡片。

### 9.2 前端验收

从首页复习入口到开始第一张卡，两次点击内完成。

卡片翻面动画不抖，按钮反馈及时，连续 50 张不卡顿。

刷题点击反馈在 200ms 内可感知，解析一句话，下一题切换稳定。

复习域上线不影响市场下单与订单查询，库存状态机相关接口无变更。

## 10 实施顺序建议

第一阶段
完成数据模型与课程读取接口，前端能渲染课程与章节。

第二阶段
完成卡片队列与排程更新，今日复习闭环跑通。

第三阶段
完成刷题 session 与错题本回炉，加入一句话解析字段。

第四阶段
完成急救包与纠错入口，形成内容质量闭环。

第五阶段
完成 streak 与周榜，补齐扫码承接映射表。

第六阶段
完成课程包导入器与文档，打通外部 AI 产出到上线的流水线。

