# Security Notes - 登录与 401 策略

本文档说明小程序的登录守卫机制和 401 错误处理策略。

## 架构概览

小程序采用**前置守卫 + 单例登录**的架构，消除了深层 401 重入和隐性循环依赖：

```
页面层
  ↓ 调用
API 层 (api.js)
  ↓ 前置守卫
登录守卫 (auth-guard.js)
  ↓ 单例 Promise
微信登录 → 后端 token → 本地存储
```

## 核心组件

### 1. auth-guard.js - 登录守卫与会话管理

**职责：**
- 管理登录状态检查
- 实现单例登录（避免并发登录）
- 处理微信登录流程
- 提供手机号授权登录（账户合并）

**核心接口：**

```javascript
// 检查是否已登录
isLoggedIn(): boolean

// 获取当前 token
getToken(): string | null

// 确保已登录（自动登录）
ensureLoggedIn({ silent = false }): Promise<{ token, userId }>
  - silent=true: 静默登录，不弹 toast（用于 API 前置守卫）
  - silent=false: 失败时弹 toast 提示用户

// 带手机号授权的登录（账户合并）
loginWithPhoneNumber(phoneCode): Promise<{ token, userId, merged }>

// 登出
logout(): void
```

**单例登录机制：**
```javascript
let loginInFlight = null; // 单例 Promise

async function ensureLoggedIn({ silent = false } = {}) {
  // 已登录：直接返回
  if (isLoggedIn()) return { token, userId };

  // 登录中：等待完成
  if (loginInFlight) return await loginInFlight;

  // 开始新登录：创建单例 Promise
  loginInFlight = (async () => {
    try {
      const code = await wx.login();
      const data = await backend('/auth/login', { code });
      saveToken(data.token);
      return data;
    } finally {
      loginInFlight = null; // 清除单例
    }
  })();

  return await loginInFlight;
}
```

### 2. api.js - API 请求层

**职责：**
- 统一的 API 请求入口
- 前置守卫（调用前确保已登录）
- 401 错误拦截与重登录
- 重试机制（429、5xx）

**请求流程：**

```
1. 前置守卫（requireAuth=true）
   ↓
   await authGuard.ensureLoggedIn({ silent: true })
   ↓ 成功
2. 发起请求（带 token）
   ↓
3. 响应处理
   ├─ 2xx: 返回数据
   ├─ 401: 清 token → 重新登录 → 重试请求
   ├─ 429/5xx: 重试（最多 3 次）
   └─ 其他: 返回错误
```

**401 处理策略：**

```javascript
if (res.statusCode === 401 && requireAuth && retryAuth) {
  // 清除失效 token
  tokenUtil.clearToken();

  try {
    // 重新登录（弹 toast 提示用户）
    await authGuard.ensureLoggedIn({ silent: false });

    // 重试请求（仅一次，retryAuth=false）
    return await performRequest({ ...options, retryAuth: false });
  } catch (loginError) {
    reject(loginError);
  }
}
```

**requireAuth 参数：**
- 默认值：`true`（所有 API 默认需要鉴权）
- 用途：控制是否需要前置守卫和 401 重登录
- 示例：
  ```javascript
  // 需要鉴权的 API（默认）
  api.request({ url: '/orders/my' });

  // 公开 API（不需要鉴权）
  api.request({ url: '/books/search', requireAuth: false });
  ```

## 登录时机

### 自动触发登录的场景

1. **首次调用需要鉴权的 API**
   - 前置守卫检测到未登录
   - 自动调用 `ensureLoggedIn({ silent: true })`
   - 静默完成微信登录

2. **401 错误**
   - Token 失效或被清除
   - 自动重新登录（弹 toast）
   - 重试原请求

3. **手机号授权**
   - 用户点击"授权手机号"按钮
   - 调用 `loginWithPhoneNumber(phoneCode)`
   - 触发账户合并

### 不再主动登录的场景

- **应用启动（app.onLaunch）**：不再主动登录，延迟到首次 API 调用
- **页面加载（page.onLoad）**：页面不再负责登录，由 API 层自动处理

## 防循环机制

### 问题：旧架构的循环依赖

```
api.js → 401 → invokeLoginProvider → auth.ensureLoggedIn
                                          ↓
                                    wx.request (绕过 api.js)
                                          ↓
                                    401 → 递归陷阱
```

### 解决：新架构的单向依赖

```
页面 → api.js → auth-guard.js → wx.login/wx.request
                                    ↓
                                后端 /auth/login
                                （不经过 api.js）
```

**关键设计：**
1. `auth-guard.js` 的 `exchangeCodeForToken` 使用原始 `wx.request`，不经过 `api.js`
2. 单例 Promise 确保同时只有一个登录流程
3. `retryAuth=false` 确保 401 重试仅发生一次

## 验收标准

### 1. 未登录访问需要鉴权的接口

**操作：**
- 清除本地 token（`wx.clearStorage()`）
- 访问 `/orders/my` 等需要鉴权的接口

**预期：**
- 自动触发一次登录（无弹窗）
- 登录成功后正常返回数据
- 不出现循环登录

### 2. 已登录访问

**操作：**
- 已有有效 token
- 访问任意接口

**预期：**
- 无额外登录请求
- 直接使用现有 token

### 3. 401 处理

**操作：**
- 后端返回 401（token 失效）

**预期：**
- 清除本地 token
- 触发一次重新登录（弹 toast）
- 重试原请求
- 不出现循环重试

### 4. 并发请求

**操作：**
- 同时发起多个需要鉴权的请求（未登录状态）

**预期：**
- 只发起一次登录请求
- 所有请求等待同一个登录 Promise
- 登录成功后所有请求正常完成

## 迁移清单

### 已完成

- [x] 创建 `miniprogram/utils/auth-guard.js`
- [x] 改造 `miniprogram/utils/api.js`（移除 `setLoginProvider`）
- [x] 修改 `miniprogram/app.js`（移除 onLaunch 主动登录）
- [x] 更新 `miniprogram/pages/profile/index.js`（使用 `authGuard.loginWithPhoneNumber`）
- [x] 验证页面无显式 `wx.login` 调用

### 可选

- [ ] 废弃旧的 `miniprogram/utils/auth.js`（保留作为参考，或删除）
- [ ] 添加集成测试验证登录守卫机制

## 安全考虑

1. **Token 存储**：使用 `wx.setStorageSync` 存储在本地，应用内可见
2. **Token 传输**：通过 `Authorization: Bearer <token>` 头传输，使用 HTTPS
3. **Token 失效**：后端返回 401 时自动重新登录
4. **手机号授权**：使用微信官方 `getPhoneNumber` API，需企业认证
5. **防重放**：后端应实施 token 过期机制和签名验证

## 故障排查

### 问题：循环登录

**症状：**
- 不断弹出登录 toast
- 网络请求循环发送

**排查：**
1. 检查 `auth-guard.js` 的 `exchangeCodeForToken` 是否使用原始 `wx.request`
2. 检查 `api.js` 的 401 处理是否设置了 `retryAuth=false`
3. 检查单例 Promise `loginInFlight` 是否正确实现

### 问题：未授权错误

**症状：**
- 请求返回 401
- 没有自动重新登录

**排查：**
1. 检查 `requireAuth` 参数是否正确设置
2. 检查 `authGuard.ensureLoggedIn` 是否被正确调用
3. 检查后端 token 验证逻辑

### 问题：并发登录

**症状：**
- 多个请求同时发起时，发起多次登录

**排查：**
1. 检查 `loginInFlight` 单例是否正确实现
2. 检查 `ensureLoggedIn` 中的 `if (loginInFlight)` 判断

## 参考

- [微信小程序登录文档](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)
- [手机号授权文档](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html)
- 后端 API: `POST /api/auth/login` (接受 `code` 和可选的 `phoneCode`)
