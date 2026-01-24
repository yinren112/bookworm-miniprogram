# 迁移进度（Duolingo 风格升级）

## 阶段 0：盘点与计划输出

- [ ] pages.md（页面路由/用途/优先级）
- [ ] legacy-audit.md（旧样式残留统计）

## 阶段 1：tokens 与 components/ui 基建

- [ ] app.wxss：tokens 完整（颜色/圆角/边框/lip/间距/字体/动效）
- [ ] components/ui/juicy-button
- [ ] components/ui/card-flat
- [ ] components/ui/progress-chunky
- [ ] components/ui/pill-tag
- [ ] components/ui/stat-split
- [ ] components/ui/empty-state
- [ ] components/ui/topbar（可选，如实际替换中有收益则启用）

## 阶段 2：页面改造

### P0

- [x] /pages/review/index
- [x] /subpackages/review/pages/flashcard/index
- [x] /subpackages/review/pages/quiz/index

### P1

- [ ] /subpackages/review/pages/course/index
- [ ] /subpackages/review/pages/cheatsheet/index
- [ ] /subpackages/review/pages/leaderboard/index
- [ ] /subpackages/review/pages/activity-history/index
- [ ] /subpackages/review/pages/session-complete/index

### P2

- [ ] /pages/profile/index
- [ ] /pages/webview/index
- [ ] /pages/customer-service/index
- [ ] /pages/dev-settings/index

## 验收（必须量化）

- [x] miniprogram/ 内 grep：`box-shadow` 清零
- [x] miniprogram/ 内 grep：`#2c5f2d` 清零
- [x] miniprogram/ 内 grep：`.clay-` 清零
- [ ] 按钮点击 100ms 内出现视觉反馈（按压行程统一来自 juicy-button）
- [ ] 正误反馈动画一致且仅用 transform/opacity（quiz/flashcard）
- [ ] 列表页滚动不做持续动画、不高频 setData
