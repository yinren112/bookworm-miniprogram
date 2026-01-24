# RELEASE_AUDIT_REPORT.md

## 1. 结论摘要

- **P0 阻碍 (2 条)**:
  1. **前端隐私协议缺失交互入口**: `app.json` 开启了隐私检查，但代码中未发现 `agreePrivacyAuthorization` 按钮或 `onNeedPrivacyAuthorization` 监听，用户无法同意协议，导致小程序不可用。
  2. **后端代码质量门槛未通过**: `npm run lint` 失败，存在 3 个禁止的 Raw Select 错误，违反架构规范。

- **P1 风险 (1 条)**:
  1. **前端缺乏自动化质量门槛**: `miniprogram/package.json` 中缺失 `lint`, `test` 等脚本，无法在 CI/CD 中自动验证代码质量。

- **P2 建议 (2 条)**:
  1. **依赖兼容性风险 (mp-html)**: `mp-html` 依赖包中包含大量 `window`/`document` 引用，虽多为 uni-app 适配代码，但需验证在原生小程序环境下的稳定性。
  2. **Prisma 配置警告**: 收到 Prisma 7 废弃警告，建议迁移配置。

---

## 2. P0 阻碍清单 (可执行)

### 1. 前端隐私协议缺失交互入口
- **现象**: `app.json` 设置了 `"__usePrivacyCheck__": true`，但全局搜索 `privacy` 或 `隐私` 未发现任何交互实现。
- **证据**:
  - `miniprogram/app.json`: Line 2 `"__usePrivacyCheck__": true`
  - `grep` 搜索 `privacy|隐私` (Exclude node_modules): **无结果**
- **影响**: 用户进入小程序触发隐私接口时（如获取昵称、剪切板等），会被微信拦截，且因无同意按钮（`open-type="agreePrivacyAuthorization"`），用户将卡死无法继续使用。
- **修复建议**:
  1. 在 `miniprogram/components` 下新建 `privacy-popup` 组件。
  2. 实现 `wx.onNeedPrivacyAuthorization` 监听。
  3. 添加 `<button open-type="agreePrivacyAuthorization">` 供用户点击。

### 2. 后端代码质量门槛未通过
- **现象**: 后端 Lint 检查失败，构建管道应被阻止。
- **证据**: `npm run lint` 输出:
  ```
  src/services/study/activityService.ts:109:5 error Use view selector from src/db/views/* instead of raw select
  src/services/study/cheatsheetService.ts:58:5 error Use view selector ...
  src/services/study/cheatsheetService.ts:88:5 error Use view selector ...
  ```
- **影响**: 违反 `no-prisma-raw-select` 架构规则，可能导致数据泄露或查询性能问题，且阻止自动发布流程。
- **修复建议**: 修改上述文件，使用 `src/db/views/` 下定义的标准 Select 对象替代硬编码的 `select: { ... }`。

---

## 3. 命令执行记录

### 基础信息
- **Root Path**: `C:\Users\wapadil\WeChatProjects\miniprogram-13`
- **Git Commit**: `a0a4f0e788aa67942bc65818d06b7a96aec87eef`

### 后端审计 (bookworm-backend)
| 命令 | 状态 | 关键输出摘要 |
|---|---|---|
| `npm ci / install` | ✅ Pass | 正常安装 |
| `npm run lint` | ❌ **FAIL** | `3 problems (3 errors, 0 warnings)` - 禁止的 Raw Select |
| `npm test` | ✅ Pass | 测试通过 |
| `npm run build` | ✅ Pass | TypeScript 编译成功 |
| `prisma migrate status`| ✅ Pass | `Database schema is up to date!` |

### 前端审计 (miniprogram)
| 检查项 | 状态 | 关键输出摘要 |
|---|---|---|
| **非法域名/IP** | ✅ Pass | 未发现硬编码 IP 或 HTTP 链接 |
| **隐私保护代码** | ❌ **FAIL** | `grep` 未搜到 "privacy" 相关代码 (app.json 除外) |
| **Web API 滥用** | ⚠️ Warn | `mp-html` 包含 `window`/`document` 引用 (需通过冒烟测试验证) |
| **Package Scripts** | ⚠️ Warn | `package.json` 无 `lint`/`test` 脚本 |

---

## 4. 发布与平台门槛清单 (人工确认)

请在发布前人工核对以下项目：
1. **隐私协议**: 微信后台“设置 -> 服务内容声明 -> 用户隐私保护指引”是否已更新并审核通过？
2. **服务器域名**: `request`合法域名列表是否已包含后端 API 域名？(需为 HTTPS)
3. **AppSecret**: 确保生产环境 `WX_APP_SECRET` 正确，且未泄露给前端。
4. **类目资质**: 确认当前小程序服务类目是否覆盖所有功能（如涉及“教育”、“社交”等特殊资质）。

## 5. 需要产品侧决策的问题
- **版本控制**: 当前版本是否包含未完成的测试功能（如 `subpackages/review` 中的实验性功能）？
- **支付功能**: 是否需要开启支付？目前代码审计未发现支付相关阻碍，但需确认商户号绑定状态。
