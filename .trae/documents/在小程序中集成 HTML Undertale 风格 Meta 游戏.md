## 项目愿景
- 创作一款可在移动端顺畅运行的 HTML5 Canvas Meta 游戏，整体美术与交互手感向 Undertale 致敬（非复刻、避免版权风险），强调叙事与“打破第四墙”的互动。
- 目标体验：极简像素黑白主调、细腻动画与音频反馈、精准输入与判定、具备弹幕回避战斗与分支对话系统。

## 技术栈与运行环境
- 前端游戏：原生 HTML5 Canvas + WebAudio，模块化 ES Modules，优先无依赖或极少依赖（移动端体积与性能优先）。
- 语言：JavaScript（必要处用 TypeScript 亦可，但当前 `public` 目录无打包器，先采用 ESM + 原生构建）。
- 渲染：固定步进（fixed timestep）主循环 + 帧插值，像素级缩放（整数缩放），屏幕抖动、淡入淡出和 CRT/暗角覆盖层实现“顶级手感”。
- 音频：WebAudio 精准调度，典型 chiptune/lo-fi 风格，移动端延迟优化。

## 与现有项目的集成方式
- 后端静态托管：在 `bookworm-backend/public` 下新增 `game/` 目录，提供 `index.html`、`styles.css`、`game.js`、资产与音频等。
- 路由与静态资源：在 Fastify 注册新的静态前缀，例如 `/game/`（参考已有静态注册在 `bookworm-backend/src/plugins.ts:12-15`），便于小程序 `web-view` 加载。
- 小程序入口：新增一个页面（如 `pages/game-webview/index`）使用 `web-view` 组件加载后端 `https://api*.lailinkeji.com/game/index.html`。
- 业务域名：在微信小程序后台将对应域名配置到“业务域名”（与 API 域名区分），确保 `web-view` 可正常打开。

## 核心系统设计
- 渲染管线：
  - 固定逻辑步长（如 16.666ms），渲染层进行插值；避免用 `setInterval`，统一用 `requestAnimationFrame` + 累加器设计。
  - 像素缩放策略：根据设备分辨率计算整数缩放因子，保持像素清晰，禁用抗锯齿。
  - 后处理：通过 Canvas 合成与遮罩实现暗角/噪点/色偏（轻度），可开关。
- 输入系统：
  - 移动端触控与虚拟按键；桌面端键盘兼容。
  - 输入缓冲与宽容窗（grace window），保证爽快感；长按与连击节流。
- 状态与场景管理：
  - `SceneManager` 统一调度：Title、Overworld、Battle、Dialogue、Settings 等。
  - 存档系统：LocalStorage 存档与“Meta”机制（识别前次运行、分支影响）。
- 战斗系统（弹幕回避）：
  - 模块化弹幕模式（Pattern），支持时序、速度曲线、轨迹函数与碰撞半径。
  - 玩家 Hurtbox/Invulnerability Frames（硬直与无敌帧）与精准判定。
- 对话与叙事：
  - 文本打字机效果、字距与行距控制、像素字体渲染。
  - 分支选择与条件变量，驱动剧情与 Meta 事件（例如重复游玩有独特反应）。

## 美术与音频风格
- 美术：黑白或有限调色板（2~4 色），像素尺寸统一（如 1x 原始像素），UI 使用“拟物对话框 + 边框像素”风格，角色用极简线条。
- 字体：选择许可友好的像素字体（如 SIL Open Font License），避免侵权。
- 动画：Ease-in/out、次像素插值（渲染层）、shake/flash/遮罩等反馈细节。
- 音频：短音效触发延迟 < 50ms、循环 BGM 无缝拼接；音量包络与滤波器用于情绪变化。

## 交互手感与性能策略
- 帧率目标 60fps（设备不足时降级到 30fps 但保持判定稳定）。
- 统一时间源与判定（固定步），碰撞与输入在逻辑帧内处理，渲染仅负责表现。
- 贴图合并与 SpriteSheet，资源预加载与最小化解码开销；移动端禁用昂贵滤镜。
- 内存与 GC 控制：对象池用于弹幕与粒子，减少分配抖动。

## 安全与合规
- 不读取或上传任何敏感信息；如需“Meta”效果（显示昵称等）仅在用户授权并可关闭的前提下进行。
- 后端已启用日志脱敏（参考 `bookworm-backend/src/index.ts:48-79`），不在游戏端打印或上传敏感数据。
- Undertale 为受版权保护作品，所有资产与音乐自行原创或使用可商用授权素材，仅“风格致敬”。

## 交付物结构
- `bookworm-backend/public/game/`
  - `index.html`：Canvas 舞台与加载界面
  - `styles.css`：像素风全局样式、遮罩/暗角
  - `game.js`：入口与主循环、场景管理
  - `scenes/`：`title.js`、`overworld.js`、`battle.js`、`dialogue.js`
  - `systems/`：`renderer.js`、`input.js`、`audio.js`、`save.js`
  - `assets/`：占位像素美术与音频（后续替换为最终素材）
- 小程序：`miniprogram/pages/game-webview/` + `app.json` 新增页面与入口按钮。

## 里程碑
- M0 原型（1 周）：
  - 固定步进主循环与像素缩放；对话打字机与基本弹幕模式；一场可玩的战斗 Demo；占位美术与音频。
- M1 垂直切片（2-3 周）：
  - 完整标题 → Overworld → 战斗 → 结算与分支；Meta 存档与重复游玩识别；移动端触控优化与音频延迟压缩。
- M2 美术与手感打磨（2 周）：
  - 替换高品质像素素材与音乐；动画、屏幕特效与 UI 细节；性能与发热优化。

## 验证与发布
- 开发阶段：手机真机灰度测试，采集帧率与音频延迟；异常监控仅记录非敏感指标。
- 上线前：配置 `web-view` 业务域名；在“市场/我的”页提供入口，或通过内容页深链。
- 回归测试：多机型输入与触控兼容、帧率稳定性、异常处理与资源加载容错。

## 下一步实施清单
- 后端静态前缀 `/game/` 注册（与现有 `/admin/` 并列）。
- 新建 `public/game` 基础文件与占位资产。
- 小程序新增 `pages/game-webview/index`（`web-view src` 指向后端 URL）并在 `app.json` 注册，页面入口位于 `pages/profile/index` 或 `pages/market/index`。
- 真机调试：域名配置与渲染/触控/音频延迟实测；性能基线报告。

如确认以上方案，我将按该计划开始落地，实现首个可玩垂直切片并持续打磨手感与美术。