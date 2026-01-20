# 复习模块上线阻塞问题清单（6项）

目标：列出当前会阻碍复习模块上线或导致核心流程不可用的具体问题与证据。

## 1. 题目答题判定不一致（选择题/判断题）
- 现象：选择题提交后经常被判错；判断题无选项可选。
- 证据：
  - 题库导入把正确答案存为“选项文本”，而不是字母：`bookworm-backend/src/services/study/importService.ts`。
  - 判题逻辑按字符串对比：`bookworm-backend/src/services/study/quizService.ts`。
  - 前端只提交选项字母（A/B/C...）：`miniprogram/subpackages/review/pages/quiz/index.js`。
  - 判断题未生成 `options`：`bookworm-backend/src/services/study/importService.ts`（TRUE/FALSE 分支未设置 options）。
- 影响：单选/多选判题不一致；判断题无法作答，刷题流程不可用。
- 修复方向：统一“提交答案格式”和“存储答案格式”；为判断题下发固定选项。

## 2. 今日队列字段契约不一致
- 现象：首页/课程页今日数据不显示或全部为 0，开始复习按钮条件失效。
- 证据：
  - 后端返回字段：`dueCards/newCards/reviewedToday`：`bookworm-backend/src/services/study/cardScheduler.ts`。
  - 前端读取字段：`dueCount/newCount/reviewedCount`：`miniprogram/subpackages/review/pages/home/index.wxml`、`miniprogram/subpackages/review/pages/course/index.wxml`。
- 影响：用户无法看到今日复习任务，关键 CTA 无法触发。
- 修复方向：统一字段名或在前端做映射适配。

## 3. 课程注册状态字段不一致
- 现象：首页无法识别已注册课程，导致默认课程为空。
- 证据：
  - 课程列表返回 `enrolled` 布尔值：`bookworm-backend/src/services/study/courseService.ts`。
  - 前端首页判断 `course.enrollment`：`miniprogram/subpackages/review/pages/home/index.js`。
- 影响：首页“开始背卡/刷题”入口不可用。
- 修复方向：前端改用 `enrolled` 或后端返回 `enrollment` 结构。

## 4. 急救包 assetType 大小写不一致
- 现象：急救包预览/保存逻辑不生效。
- 证据：
  - 后端只允许 `pdf`/`image`（小写）：`bookworm-backend/prisma/schema.prisma`、`bookworm-backend/src/services/study/importService.ts`。
  - 前端判断 `PDF/IMAGE/VIDEO`（大写）：`miniprogram/subpackages/review/pages/cheatsheet/index.js`。
- 影响：用户无法打开或保存急救包资源。
- 修复方向：统一大小写协议或前端做兼容分支。

## 5. 纠错反馈 message 必填不一致
- 现象：不填写文字时，提交失败（400）。
- 证据：
  - 后端要求 `message` 必填且长度 >= 1：`bookworm-backend/src/routes/studySchemas.ts`。
  - 前端允许空字符串：`miniprogram/subpackages/review/components/report-issue/index.js`。
- 影响：用户无法提交反馈，反馈流程不可用。
- 修复方向：前端强制填写或后端允许空文本。

## 6. “只保留复习模块”入口未闭合
- 现象：小程序入口仍以市场/订单为主，复习模块不作为主入口。
- 证据：
  - `app.json` 仍包含市场/订单/个人中心主包页面与 TabBar：`miniprogram/app.json`。
  - 复习模块仅为分包，预加载依赖市场页：`miniprogram/app.json`。
- 影响：无法满足“只上线复习模块”的上线策略，非复习功能仍可被访问。
- 修复方向：将复习主页设为主入口，移除或隐藏非复习页面与 TabBar。
