# 复习模块上线前深度核查待办清单

## 核查范围
- miniprogram/ 复习首页与复习子页面（pages/review、subpackages/review）
- miniprogram/ 个人中心与客服入口（pages/profile、pages/customer-service）
- bookworm-backend/src/services/study 与 bookworm-backend/src/routes/study.ts
- bookworm-backend/prisma/seed.ts（复习系统种子数据）
- 题库与课程包数据文件（manifest.json、units.json、questions/*.gift、cards/*.tsv）

## 待办事项（按优先级）

### P0 必须清零
- [ ] 替换复习首页热力图随机/模拟数据：`miniprogram/pages/review/index.js`、`miniprogram/subpackages/review/pages/home/index.js` 的 `generateHeatmapData()` 使用 `Math.random()` 生成假数据；需要接入真实学习日历数据或临时隐藏该模块。
- [ ] 替换卡片复习“下次复习”提示的模拟规则：`miniprogram/subpackages/review/pages/flashcard/index.js` 中 `nextDays` 为固定 2/4 天；应改用 `/api/study/cards/:contentId/answer` 返回的 `nextDueAt` 计算真实间隔。
- [ ] 确认生产不会运行示例课程种子数据：`bookworm-backend/prisma/seed.ts` 含完整示例课程/卡片/题目；上线库必须导入真实题库，避免示例数据进入生产。
- [ ] 题库/课程包源数据缺失：仓库未发现 `manifest.json`、`units.json`、`questions/*.gift`、`cards/*.tsv`；需向运维获取正式包并通过 `/api/study/admin/import` 导入，核对 `study_course`、`study_unit`、`study_card`、`study_question` 实际落库数据。

### P1 上线前确认
- [ ] 替换客服微信占位值：`miniprogram/pages/profile/index.js` 的 `serviceInfo.wechatId` 仍为占位值；同时确认 `miniprogram/pages/customer-service/index.js` 的 `customerServiceWechat` 是否为真实客服号。
- [ ] 个人中心用户名/昵称为占位显示：`miniprogram/pages/profile/index.wxml` 固定展示“用户名”，`miniprogram/pages/profile/index.js` 默认 `微信用户` 且未从后端刷新昵称；若上线要求真实用户信息，需要接入实际昵称/头像或隐藏该行。
- [ ] 确保生产环境不会触发 mock 登录：`bookworm-backend/src/services/authService.ts` 在 `NODE_ENV` 非 `production|staging` 或 `WX_APP_ID/WX_APP_SECRET` 以 `dummy` 开头时返回固定 `openid/phone`，需确认生产配置已填真实值。
- [ ] 确保 `QUIZ_DEBUG` 未在生产启用：`bookworm-backend/src/services/study/quizService.ts` 会在启用时打印题目答案与选项，存在信息暴露风险。
- [ ] 确认小程序发布环境为 `release` 且 API 指向生产域名：`miniprogram/config.js` 仅在 release 时使用 `https://api.lailinkeji.com/api`。
- [ ] 防止环境识别失败回落到本地：`miniprogram/config.js` 在 `envVersion` 获取失败时会回落到 `http://localhost:8080/api`，需确保发布包不会触发该分支或改为显式失败。
- [ ] 周榜昵称存在合成兜底：`bookworm-backend/src/services/study/streakService.ts` 使用 `用户${id}` 作为无昵称用户的显示名；若要求不出现“合成昵称”，需接入真实昵称来源或改为匿名显示。

### P2 需求澄清或可选优化
- [ ] 刷题题目顺序当前使用随机洗牌：`bookworm-backend/src/services/study/quizService.ts` 的 `shuffleArray()` 使用 `Math.random()`；若上线要求“无随机”，需改为确定性排序并固化规则。
- [ ] 请求追踪 ID 含随机：`miniprogram/utils/request.js` 使用 `Math.random()` 生成请求 ID；若要求完全去随机，需改为后端生成或确定性方案。
- [ ] 复习首页存在主包与分包两套实现：`pages/review/index` 与 `subpackages/review/pages/home` 同步成本高且分包仍含模拟热力图，若分包不再使用建议删除或统一逻辑。
- [ ] 第三方渲染组件含随机：`miniprogram/components/mp-html/parser.js` 使用 `Math.random()` 处理重复图片 URL；若要求“代码层完全无随机”，需评估替换或打补丁。

## 已检查但未发现模拟/虚假 API
- `miniprogram/utils/study-api.js` 仅调用 `/study/*` 正式接口，无本地假数据或假 API。
- `bookworm-backend/src/routes/study.ts` 与 `bookworm-backend/src/services/study/*` 未发现返回模拟数据的分支。
