# UI/UX 设计修复计划

> 基于 2026-01-30 全量设计审查，按优先级排列。
> 原则：不重新设计，只把已有 token 和模式贯彻到每一处。

---

## P0：硬伤（必须立即修复）

### 0-1. 进度条黄色色值不一致

**现状**
- `app.wxss:6` → `--color-juicy-yellow: #FFC800`
- `progress-chunky/index.wxss:27` → 硬编码 `background: #FFCC00`
- 两个黄色色相差 2%，进度条上肉眼可辨

**修复**

| 文件 | 行 | 改动 |
|------|----|------|
| `components/ui/progress-chunky/index.wxss` | 27 | `#FFCC00` → `var(--color-juicy-yellow)` |

---

### 0-2. 暗色模式语义色缺失

**现状**
`app.wxss` 的 `@media (prefers-color-scheme: dark)` 块内没有覆盖以下四个语义背景色：
- `--color-bg-success: rgba(70, 176, 101, 0.16)`
- `--color-bg-info: rgba(28, 176, 246, 0.16)`
- `--color-bg-warn: rgba(255, 200, 0, 0.18)`
- `--color-bg-danger: rgba(255, 75, 75, 0.14)`

这些颜色在暗色底（`#111111`）上会产生严重对比度问题。受影响区域：
- 刷题页选项状态（正确/错误/选中）
- 背卡页滑动指示器（记住/模糊/忘记/完美）
- pill-tag 组件所有彩色变体
- cheatsheet 图标背景

**修复**

| 文件 | 位置 | 改动 |
|------|------|------|
| `app.wxss` | dark mode 块内新增 | 添加四个语义色的暗色版本，提高不透明度至 0.24 以补偿深色底 |

新增值：
```css
--color-bg-success: rgba(70, 176, 101, 0.24);
--color-bg-info: rgba(28, 176, 246, 0.24);
--color-bg-warn: rgba(255, 200, 0, 0.24);
--color-bg-danger: rgba(255, 75, 75, 0.20);
```

---

### 0-3. 收藏按钮两页视觉不一致

**现状**

| 属性 | flashcard (`index.wxss:52-58`) | quiz (`index.wxss:49-56`) |
|------|-------------------------------|---------------------------|
| background | `var(--color-bg-card)` (白) | `var(--color-bg-soft)` (灰) |
| border | `2rpx solid var(--color-border)` | `none` |
| box-shadow | `0 4rpx 16rpx rgba(0,0,0,0.06)` | `0 4rpx 40rpx rgba(0,0,0,0.04)` |

同一个收藏操作，两种视觉表达。

**修复**
统一为 flashcard 版本（白底+边框+小阴影），因为它更清晰且与 card-flat 风格一致。

| 文件 | 行 | 改动 |
|------|----|------|
| `subpackages/review/pages/quiz/index.wxss` | 49-56 | `.star-hit` 改为 `background: var(--color-bg-card); border: 2rpx solid var(--color-border); box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.06);` |
| `subpackages/review/pages/quiz/index.wxss` | 58-61 | `.star-hit.starred` 改为 `border-color: var(--color-juicy-yellow-shade);`（删除 background 和 box-shadow 覆写） |

---

## P1：一致性问题

### 1-1. 页面容器内边距统一

**现状**

| 页面 | 选择器 | 水平内边距 |
|------|--------|-----------|
| review | `.content-wrapper` | `var(--space-6)` = 24rpx |
| flashcard | `.container` | `var(--space-8)` = 32rpx |
| quiz | `.container` | `var(--space-8)` = 32rpx |
| course | `.container` | `var(--space-6)` = 24rpx |
| cheatsheet | `.container` | `var(--space-6)` = 24rpx |
| leaderboard | `.container` | `var(--space-6)` = 24rpx |
| session-complete | `.page` | `var(--space-6)` = 24rpx |
| profile | `.profile-content` | `0 var(--space-8)` = 0 32rpx |

**方案**
统一为 `var(--space-6)`（24rpx）。flashcard 和 quiz 改为 24rpx，profile 水平内边距从 32rpx 改为 24rpx。

| 文件 | 改动 |
|------|------|
| `subpackages/review/pages/flashcard/index.wxss` | `.container` padding → `var(--space-6)` |
| `subpackages/review/pages/quiz/index.wxss` | `.container` padding → `var(--space-6)` |
| `pages/profile/index.wxss` | `.profile-content` padding → `0 var(--space-6)` |

---

### 1-2. 标题字号层级统一

**现状**
同级标题在不同页面用了四种不同的字号+字重组合，缺乏统一规范。

**方案**
定义三级标题规范，所有页面遵守：

| 层级 | 用途 | 字号 | 字重 | 示例 |
|------|------|------|------|------|
| H1 | 页面主标题 | `--font-size-2xl` (44rpx) | 800 | 课程名、排行榜标题、用户名 |
| H2 | 区块标题 | `--font-size-xl` (36rpx) | 800 | "今日队列"、"章节列表"、"本周统计" |
| H3 | 卡片内标题 | `--font-size-md` (28rpx) | 800 | 员工操作、设置项标题 |

需要修改的地方：

| 文件 | 行 | 现状 | 改为 |
|------|----|------|------|
| `pages/review/index.wxss` | 163-166 | `.section-title` 34rpx/700 | 36rpx (`var(--font-size-xl)`) / 800 (`var(--font-weight-heavy)`) |
| `pages/profile/index.wxss` | 98-100 | `.review-title` 34rpx/900 | 28rpx (`var(--font-size-md)`) / 800（H3 级，卡片内标题） |
| `pages/profile/index.wxss` | 169-172 | `.menu-text` 30rpx/700 | 28rpx (`var(--font-size-md)`) / 700 |

---

### 1-3. 硬编码颜色替换为 token

逐一列出所有需要替换的硬编码值：

| 文件 | 行 | 硬编码值 | 替换为 |
|------|----|----------|--------|
| `pages/review/index.wxss` | 224 | `background: #F9FAFB` | `background: var(--color-bg-soft)` |
| `pages/review/index.wxss` | 231 | `color: #6B7280` | `color: var(--color-text-light)` |
| `pages/review/index.wxss` | 256 | `border: 2rpx solid #E5E5E5` | `border: var(--border-thin) solid var(--color-border-shade)` |
| `pages/review/index.wxss` | 293 | `color: #AFAFAF` | `color: var(--color-text-muted)` |
| `pages/review/index.wxss` | 330 | `border: 2rpx solid #E5E5E5` | `border: var(--border-thin) solid var(--color-border-shade)` |
| `pages/review/index.wxss` | 434 | `border: 2rpx solid #F3F4F6` | `border: var(--border-thin) solid var(--color-border)` |
| `pages/review/index.wxss` | 450 | `border: 2rpx solid #F3F4F6` | `border: var(--border-thin) solid var(--color-border)` |
| `pages/review/index.wxss` | 489 | `background: #F9FAFB` | `background: var(--color-bg-soft)` |
| `pages/review/index.wxss` | 502 | `border: 2rpx solid #E5E5E5` | `border: var(--border-thin) solid var(--color-border-shade)` |
| `pages/review/index.wxss` | 166 | `color: #1D1D1F` | `color: var(--color-text-main)` |
| `components/ui/juicy-button/index.wxss` | 71 | `background: #FFFFFF` | `background: var(--color-bg-card)` |
| `components/ui/juicy-button/index.wxss` | 72 | `color: #6B7280` | `color: var(--color-text-light)` |
| `components/ui/juicy-button/index.wxss` | 73 | `border: 3rpx solid #F3F4F6` | `border: var(--jb-border) solid var(--color-border)` |
| `components/ui/progress-chunky/index.wxss` | 5 | `background: #E5E5E5` | `background: var(--color-border-shade)` |

---

### 1-4. study-card 双重间距冲突

**现状**
- `review/index.wxss:58` — `.study-card` 有 `margin-bottom: 40rpx`
- `review/index.wxss:68` — `.content-wrapper` 用 `gap: var(--space-6)` (24rpx)
- 两套间距叠加，卡片间距 = 40rpx margin + 24rpx gap = 64rpx（过大）

**修复**
删除 `.study-card` 的 `margin-bottom`，统一由父容器 gap 控制。同时将 `.content-wrapper` 的 gap 调大到 `var(--space-8)` (32rpx) 以保持适当间距。

| 文件 | 改动 |
|------|------|
| `pages/review/index.wxss` | `.study-card` 删除 `margin-bottom: 40rpx` |
| `pages/review/index.wxss` | `.content-wrapper` gap 从 `var(--space-6)` 改为 `var(--space-8)` |

---

## P2：体验细节

### 2-1. 触摸反馈风格统一

**现状**
四种不同的按压反馈并存：
- `translateY(2rpx)`（课程卡头部 `.course-header--pressed`）
- `scale(0.98)`（全局 `.hover-pressed` / `.item-hover`）
- `scale(0.99)`（card-flat `.is-pressed`、juicy-button `.is-pressed`）
- `translateY(2rpx)`（课程芯片 `.course-chip--pressed`、discover-item `.discover-item--pressed`）

**方案**
统一为 `scale(var(--motion-scale-press))`（0.98）。删除所有 translateY 按压效果。

| 文件 | 选择器 | 改动 |
|------|--------|------|
| `pages/review/index.wxss` | `.course-header--pressed` | `transform: translateY(2rpx)` → `transform: scale(var(--motion-scale-press))` |
| `pages/review/index.wxss` | `.course-chip--pressed` | 同上 |
| `pages/review/index.wxss` | `.discover-item--pressed` | 同上 |
| `components/ui/card-flat/index.wxss` | `.card-flat.is-pressed` | `scale(0.99)` → `scale(var(--motion-scale-press))` |

juicy-button 保持 `scale(0.99)` 不变——按钮因为有 lip/shadow 结构，需要比卡片更克制的缩放。

---

### 2-2. 卡片圆角分级

**现状**
几乎所有元素统一使用 `--radius-card: 64rpx`，小元素过于"胶囊化"。

**方案**
已有 token 完全够用，只是没有分层使用：

| 元素类型 | 当前 | 改为 | 对应 token |
|----------|------|------|-----------|
| study-card（大卡片） | 64rpx | 48rpx | 新增 `--radius-xl: 48rpx` 或直接写 |
| card-flat（通用卡片） | `--radius-card` (64rpx) | 32rpx | `--radius-md` |
| course-chip / discover-item / picker-item | 32rpx | 24rpx | 新增 `--radius-card-sm: 24rpx` 或直接用 `var(--space-6)` |
| result-section (quiz) | `--radius-lg` (64rpx) | 32rpx | `--radius-md` |
| stat-item (session-complete) | `--radius-lg` (64rpx) | 32rpx | `--radius-md` |

具体改动：

| 文件 | 选择器 | 改动 |
|------|--------|------|
| `app.wxss` | `:root` | `--radius-card: 64rpx` → `--radius-card: 32rpx` |
| `pages/review/index.wxss` | `.study-card` | `border-radius: 64rpx` → `border-radius: 48rpx` |
| `subpackages/review/pages/quiz/index.wxss` | `.result-section` | `border-radius: var(--radius-lg)` → `border-radius: var(--radius-md)` |
| `subpackages/review/pages/session-complete/index.wxss` | `.stat-item` | `border-radius: var(--radius-lg)` → `border-radius: var(--radius-md)` |
| `subpackages/review/pages/course/index.wxss` | `.course-meta` | `border-radius: var(--radius-lg)` → `border-radius: var(--radius-md)` |

> 注意：`--radius-card` 被 card-flat 组件的 `:host` 引用。将 `--radius-card` 从 64rpx 降到 32rpx 会自动影响所有 `<card-flat>` 实例。study-card 不使用 card-flat 组件，需要单独调整。

---

### 2-3. stat-split 数字字号过大

**现状**
`stat-split/index.wxss:15` — `font-size: 84rpx`，比页面标题（44rpx）大近一倍。

**修复**

| 文件 | 行 | 改动 |
|------|----|------|
| `components/ui/stat-split/index.wxss` | 15 | `font-size: 84rpx` → `font-size: 64rpx` |

---

### 2-4. muted 文字对比度不足

**现状**
`--color-text-muted: #9CA3AF` 在 `--color-bg-soft: #F5F5F7` 上对比度约 2.8:1，低于 WCAG AA 的 4.5:1。

**修复**

| 文件 | 行 | 改动 |
|------|----|------|
| `app.wxss` | 19 | `--color-text-muted: #9CA3AF` → `--color-text-muted: #737980` |

> `#737980` 在 `#F5F5F7` 上对比度约 4.6:1，刚好达标。在 `#FFFFFF` 上约 5.2:1。

---

### 2-5. 按钮 disabled 状态增强

**现状**
`juicy-button/index.wxss:90` — 仅 `opacity: .45`。

**修复**

| 文件 | 行 | 改动 |
|------|----|------|
| `components/ui/juicy-button/index.wxss` | 90 | `.is-disabled { opacity: .45; }` → `.is-disabled { opacity: .45; pointer-events: none; }` |

> `pointer-events: none` 防止禁用状态下仍触发点击。小程序中 `disabled` 属性本身会阻止事件，这是 CSS 层面的兜底。

---

### 2-6. 热力图柱子触摸区域过窄

**现状**
`review/index.wxss:184` — `.day-bar` 宽度 32rpx（16px），如果可点击则远低于 44px 最低触摸目标。

**修复**
如果热力图柱子可交互，将 `.day-column` 作为点击目标（它是 `flex: 1` 的，宽度足够），而非 `.day-bar`。
如果不可交互，无需改动。

| 文件 | 改动 |
|------|------|
| `pages/review/index.wxml` | 如有 `bindtap` 在 `.day-bar` 上，移到 `.day-column` 上 |

---

## P3：架构级建议（可选）

### 3-1. juicy-button 3D lip 效果统一

**现状**
只有 `--danger` 变体有 lip 背景色，其他三种变体 lip 都是 `transparent`。3D 效果只在危险按钮上出现，设计语言不一致。

**方案**
两个选择：
- **A（推荐）**：所有变体都去掉 lip 效果，删除 `.jb__lip` 元素，按钮统一为扁平设计。当前 lip 高度已经是 0rpx（`--jb-lip: 0rpx`），实际上已经没有 3D 效果，只是 danger 的 lip 有颜色但看不到。这属于死代码。
- **B**：恢复所有变体的 lip，统一启用 3D 效果。

| 文件 | 改动 |
|------|------|
| `components/ui/juicy-button/index.wxss` | 如选 A：删除 `.jb__lip` 相关所有规则 |
| `components/ui/juicy-button/index.wxml` | 如选 A：删除 `.jb__lip` 元素 |

---

### 3-2. 暗色模式卡片阴影适配

**现状**
暗色模式下卡片阴影 `rgba(0,0,0,0.06)` 在深色底上不可见。

**修复**
在 dark mode 块内覆盖卡片阴影为更亮的高光边框或微弱发光：

```css
/* app.wxss dark mode 块内新增 */
--shadow-card: 0 0 0 1rpx rgba(255,255,255,0.06);
```

需要在 card-flat 和各页面的 box-shadow 改用此变量。这是一个较大的重构，建议后续单独处理。

---

### 3-3. 页面入场动画

**现状**
子页面（course → flashcard/quiz → session-complete）之间没有入场动画，只有系统默认的从右滑入。TabBar 切换有 `pageActivate` 动画，但非 TabBar 页面没有。

**方案**
在子页面的 `.container` 上加轻量 fade-in：

```css
.container {
  animation: pageFadeIn 0.3s var(--ease-out-expo) both;
}
@keyframes pageFadeIn {
  0% { opacity: 0; transform: translateY(var(--motion-translate-sm)); }
  100% { opacity: 1; transform: translateY(0); }
}
```

| 文件 | 改动 |
|------|------|
| 所有子页面 wxss | `.container` 添加入场动画 |
| `app.wxss` | 新增 `pageFadeIn` 关键帧 |

---

## 执行顺序

```
Phase 1 — P0 硬伤（3 项）
  ├── 0-1  进度条色值
  ├── 0-2  暗色模式语义色
  └── 0-3  收藏按钮统一

Phase 2 — P1 一致性（4 项）
  ├── 1-1  容器内边距统一
  ├── 1-2  标题字号层级
  ├── 1-3  硬编码颜色替换
  └── 1-4  双重间距冲突

Phase 3 — P2 体验细节（6 项）
  ├── 2-1  触摸反馈统一
  ├── 2-2  卡片圆角分级
  ├── 2-3  stat-split 字号
  ├── 2-4  muted 对比度
  ├── 2-5  disabled 状态
  └── 2-6  热力图触摸区域

Phase 4 — P3 架构级（3 项，可选）
  ├── 3-1  lip 效果统一
  ├── 3-2  暗色模式阴影
  └── 3-3  页面入场动画
```

每个 Phase 完成后在开发者工具中逐页验证：亮色模式 + 暗色模式 + iPhone SE（最小屏）+ iPad（最大屏）。
