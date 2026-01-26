# E1 强阻断验证

## 1) 清理本地存储
1. 打开微信开发者工具，选择本小程序项目。
2. 在工具栏选择“清缓存/重置缓存”。
3. 勾选“清除数据缓存”并确认。

## 2) 重启后必定进入协议页
1. 重新编译或点击“预览/刷新”。
2. 预期：自动进入 `pages/terms/index` 协议页。

## 3) 尝试从其他入口进入页面会被拦截
1. 在控制台执行 `wx.switchTab({ url: '/pages/profile/index' })` 或点击 TabBar 的“我的”。
2. 预期：页面 onShow 被拦截并 `reLaunch` 回协议页。
3. 在控制台执行 `wx.navigateTo({ url: '/subpackages/review/pages/course/index' })`。
4. 预期：仍被拉回协议页，无法停留在业务页面。

## 4) 同意后可正常进入首页
1. 点击“同意并继续”。
2. 预期：写入本地存储后跳转到 TabBar 首页（`pages/review/index`）。
3. 再次切换 TabBar 或进入子页面均可正常访问。
