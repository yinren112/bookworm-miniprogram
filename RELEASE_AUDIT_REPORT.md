# RELEASE_AUDIT_REPORT.md

## 1. 结论摘要

- **P0 阻碍 (1 条)**: 后端依赖环境损坏且被占用，无法执行质量门槛检查（Lint/Test），发布前处于“裸奔”状态。
- **P1 风险 (2 条)**: 小程序前端缺乏自动化测试与代码规范检查；线上 API 域名需确认已在后台配置白名单。
- **P2 建议 (2 条)**: 建议 `url.js` 默认协议改为 HTTPS；确认自定义隐私弹窗与微信原生隐私协议的交互体验。

---

## 2. P0 阻碍清单（可执行）

### [P0-1] 后端质量门槛无法执行（依赖环境锁死）
- **现象**: 执行 `npm ci` 时失败，提示 `EPERM: operation not permitted`，因为核心文件被正在运行的 `node` 进程锁定。
- **证据**:
  ```bash
  npm error path ...\node_modules\.prisma\client\query_engine-windows.dll.node
  npm error code EPERM
  npm error syscall unlink
  ```
- **影响**: 
  - `node_modules` 处于半损坏状态（旧的删了一半，新的没装上）。
  - 下游的 `npm run lint` (ESLint) 和 `npm test` 均因缺包无法运行。
  - **严重后果**: 无法验证后端代码是否存在语法错误、逻辑漏洞或破坏性变更，强行发布极大概率导致线上服务崩溃。
- **修复建议**:
  1. **立刻停止** 本地运行的后端服务 (`Ctrl+C` 关闭 `npm run dev` 终端)。
  2. 删除锁定的 `node_modules` 目录。
  3. 重新执行完整安装与检查流程：
     ```powershell
     npm ci
     npm run lint
     npm test
     npm run build
     ```
  4. 只有上述命令全部变绿（Pass），才允许进入发布流程。

---

## 3. P1 风险清单

### [P1-1] 前端缺乏自动化质量门槛
- **现象**: `miniprogram/package.json` 中仅包含 `mp-html` 依赖，没有任何 `scripts`（如 `lint`, `test`）。
- **证据**: `cat miniprogram/package.json` 显示无测试脚本。
- **影响**: 前端代码质量全靠人工肉眼 Review，随着业务逻辑（如 `checkTermsAgreement`, `study-api.js`）变复杂，极易引入回归 Bug。

### [P1-2] 生产环境域名配置
- **现象**: `config.js` 中配置了 Release 域名 `https://api.lailinkeji.com/api`。
- **影响**: 若该域名未在“微信公众平台 -> 开发设置 -> 服务器域名”中配置为 request 合法域名，线上版将直接无法请求数据（开发版/体验版开启“不校验域名”可能掩盖此问题）。
- **建议**: 登录后台截图确认白名单已包含该域名。

---

## 4. 命令执行记录

### A. 基础环境
- **Git Status**: 干净（除了本报告文件）。
- **Backend Health**: 
  - ✅ `/api/health` 返回 200 OK (在服务未停止前测得)。
  - ✅ 数据库连接正常。

### B. 后端审计 (Bookworm Backend)
- ❌ `npm ci`: **FAILED** (EPERM, 文件被占用)。
- ❌ `npm run lint`: **FAILED** (MODULE_NOT_FOUND, 依赖缺失)。
- ❌ `npm test`: **FAILED** (同上)。
- ⚠️ `prisma migrate status`: 命令执行因环境问题受阻，但 `migrations` 文件夹与 `schema.prisma` 存在。

### C. 前端审计 (Miniprogram)
- ✅ **硬编码 IP/Localhost**: 
  - 扫描通过。`config.js` 包含完善的环境判断逻辑：
    - 开发工具 (devtools) -> `localhost:8080`
    - 真机 (Review/Release) -> `https://api-staging` / `https://api`
    - 兜底逻辑完善，不会导致真机请求 localhost。
- ✅ **Web API 兼容性**:
  - `study-api.js` 使用手写 `buildQueryString`，未使用 `URLSearchParams`。
  - 未发现 `window` / `document` / `FormData` 等非法调用。
- ✅ **隐私合规**:
  - `app.json` 已配置 `"__usePrivacyCheck__": true`。
  - `app.js` 调用了 `privacy.setupPrivacyAuthorization()`。
- ⚠️ **双重隐私弹窗风险**:
  - `app.js` 中实现了自定义的 `checkTermsAgreement` (Modal) 和 `privacy` (Native) 并存。需确保两者触发时机不冲突，建议优先使用微信原生隐私协议组件。

---

## 5. 需要产品侧决策的问题

1. **支付/交易功能**:
   - 代码中存在 `createSellOrder` (卖书) 和 `createAcquisition` 等交易相关逻辑。
   - **决策点**: 小程序类目是否已包含“图书/二手交易”？若只有“工具/教育”类目，提交审核时可能会被驳回或要求补充资质 (ICP/出版物经营许可证)。

2. **Webview 内容**:
   - `pages/webview/index` 用于展示协议。需确认加载的 URL 域名已配置业务域名白名单，否则无法打开。
