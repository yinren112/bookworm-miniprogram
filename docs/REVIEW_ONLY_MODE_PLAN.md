# 🎯 纯净复习模式实施计划

> **目标**：在不删除任何交易代码的前提下，通过配置开关将小程序切换为"纯复习工具"模式，以便通过审核并在下学期使用。交易功能代码保留，后期可一键恢复。

---

## 📊 当前状态评估（已由技术分析确认）

| 项目 | 状态 | 说明 |
|------|------|------|
| 路由入口 | ✅ 已完成 | `pages/review-entry` 直接跳转复习主页 |
| TabBar | ✅ 已清除 | `app.json` 无 TabBar 定义 |
| 交易页面 | ✅ 已隔离 | `market/orders/book-detail` 等页面未在 `app.json` 注册 |
| 支付代码 | 🟡 需加护 | `utils/payment.js` 存在，需添加模式检查 |
| Profile页 | ⚪ 未注册 | 当前不可访问，如需注册需隐藏交易入口 |

**结论**：只需少量改动即可完成。

---

## 🔧 实施步骤

### Step 1: 添加全局配置开关xia'y

**文件**: `miniprogram/config.js`

在现有代码基础上添加 `APP_CONFIG` 对象：

```javascript
// miniprogram/config.js
// ... 保留原有 getApiBaseUrl() 函数 ...

const config = {
  apiBaseUrl: getApiBaseUrl()
};

// ========== 新增：应用模式配置 ==========
const APP_CONFIG = {
  /**
   * 纯净复习模式开关
   * - true:  隐藏所有交易功能，仅展示复习功能（用于审核和复习专用期）
   * - false: 完整模式，包含复习 + 二手书交易功能
   */
  REVIEW_ONLY_MODE: true,
};
// =========================================

module.exports = { 
  ...config, 
  APP_CONFIG 
};
```

---

### Step 2: 支付API添加模式防护

**文件**: `miniprogram/utils/payment.js`

在文件开头添加配置引用和防护逻辑：

```javascript
// miniprogram/utils/payment.js
const { request } = require('./api');
const ui = require('./ui');
const { extractErrorMessage } = require('./error');
const { APP_CONFIG } = require('../config');  // 新增

function requestPayment(params) {
  // ========== 新增：模式检查 ==========
  if (APP_CONFIG.REVIEW_ONLY_MODE) {
    console.warn('[Payment] Blocked: Review-only mode is enabled');
    return Promise.reject({ 
      errMsg: 'requestPayment:fail review mode', 
      reviewModeBlocked: true 
    });
  }
  // =====================================
  
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...params,
      success: resolve,
      fail: reject,
    });
  });
}

// ... 其余代码保持不变 ...
```

---

### Step 3: （可选）如需注册"我的"页面

如果后续需要在 `app.json` 中注册 `pages/profile/index`，需要修改该页面以隐藏交易相关入口。

**文件**: `miniprogram/pages/profile/index.js`

在 `data` 中添加模式状态：

```javascript
const { APP_CONFIG } = require('../../config');  // 新增

Page({
  data: {
    // ... 原有字段 ...
    isReviewMode: APP_CONFIG.REVIEW_ONLY_MODE,  // 新增
  },
  // ... 其余代码保持不变 ...
});
```

**文件**: `miniprogram/pages/profile/index.wxml`

使用 `wx:if` 条件隐藏交易相关入口：

```html
<!-- 隐藏手机号授权按钮（与卖书关联） -->
<button
  wx:if="{{!isReviewMode && !hasPhoneNumber}}"
  class="auth-phone-button"
  open-type="getPhoneNumber"
  bindgetphonenumber="onGetPhoneNumber"
>
  授权手机号（关联卖书记录）
</button>

<!-- 隐藏员工操作区域 -->
<view wx:if="{{!isReviewMode && userInfo.role === 'STAFF'}}" class="staff-section menu-card card">
  <!-- ... 原有员工操作内容 ... -->
</view>
```

---

### Step 4: 验证检查清单

完成上述修改后，请进行以下验证：

| # | 检查项 | 预期结果 | 通过 |
|---|--------|----------|------|
| 1 | 打开小程序 | 直接进入复习主页，显示"你好，同学👋" | ☐ |
| 2 | 检查底部 | 无 TabBar（底部导航栏） | ☐ |
| 3 | 复习功能 | 能正常使用背卡、刷题等功能 | ☐ |
| 4 | 尝试支付 | 如有代码调用，应被拦截并打印警告日志 | ☐ |
| 5 | 代码审查 | `config.js` 中 `REVIEW_ONLY_MODE: true` | ☐ |

---

## 🔄 后期恢复交易功能

当需要恢复二手书交易功能时，只需：

1. **修改配置开关**：
   ```javascript
   // config.js
   REVIEW_ONLY_MODE: false,  // 改为 false
   ```

2. **更新 `app.json`**：
   - 添加 TabBar 配置
   - 注册交易相关页面（`pages/market/index`, `pages/orders/index` 等）

3. **重新提交审核**（如有需要）

---

## 📁 涉及文件清单

| 文件路径 | 改动类型 | 优先级 |
|----------|----------|--------|
| `miniprogram/config.js` | 新增配置 | P0 必须 |
| `miniprogram/utils/payment.js` | 添加防护 | P0 必须 |
| `miniprogram/pages/profile/index.js` | 条件逻辑 | P2 如注册 |
| `miniprogram/pages/profile/index.wxml` | 条件隐藏 | P2 如注册 |

---

## ⚠️ 注意事项

1. **不要删除任何交易代码**：所有 `pages/market/`, `pages/orders/` 等代码保持原样，只是不注册
2. **不要修改 `app.json`**：当前配置已是纯复习模式，无需改动
3. **保持分支管理**：建议在 `feature/review-only-mode` 分支上开发，便于后期合并
4. **测试环境**：在微信开发者工具中使用"预览"和"真机调试"验证

---

## 📞 技术联系

如有疑问，请联系项目技术负责人。

---

*文档生成时间: 2026-01-21*
*分析依据: 项目代码库实际结构*
