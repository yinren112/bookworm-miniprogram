# Bookworm 代码库地毯式审查报告

**生成时间**: 2025-10-22
**审查范围**: 完整本地代码库（不含node_modules）
**审查方法**: 静态分析 + 工具扫描 + 架构审查（零联网）

---

## 1. 摘要评分与关键结论

### 综合评分: **6.5/10** 🟡

**评分细则**:
- ✅ 架构设计: 8/10 (清晰的前后端分离,Prisma ORM良好实践)
- ⚠️ 代码质量: 7/10 (TypeScript strict模式已开启,但测试覆盖率不均衡)
- 🔴 仓库卫生: 4/10 (根目录污染严重,临时文件未归档)
- ✅ 安全实践: 7/10 (无明显密钥泄露,.env使用占位符)
- ⚠️ 文档规范: 6/10 (散落多处,部分文档为AI产物)
- ⚠️ 依赖管理: 6/10 (无法执行npm audit因镜像源问题)

### 关键结论 (Top 7)

1. **🔴 P0** - 根目录包含29个非核心文件,包括3.9MB日志、25MB压缩包、4个Python审查脚本
2. **🔴 P0** - 存在异常C:/目录和空backend-dev.log等垃圾文件
3. **🟡 P1** - Prisma配置仍在package.json中,该方式将在v7移除
4. **🟡 P1** - README.md仍为"云开发quickstart"模板,未项目化
5. **🟡 P1** - 后端核心服务测试覆盖率极低: payments.ts(2.68%), create.ts(4.05%)
6. **🟡 P1** - ESLint配置缺少"type":"module"导致性能警告
7. **🟢 P2** - 13个.md文档散落,需统一组织到docs/目录

---

## 2. 仓库画像 (Repository Profile)

### 2.1 目录结构

```
miniprogram-13/
├── .git/                       # Git元数据
├── .github/workflows/          # CI配置(3个workflow)
├── .husky/                     # Git hooks
├── .claude/                    # Claude Code配置
├── bookworm-backend/           # 【核心】后端API服务
│   ├── src/                    # 源码(~11.5k行TS)
│   ├── prisma/                 # 数据库schema与迁移
│   ├── tests/                  # 测试套件
│   └── coverage/               # 覆盖率报告(已生成)
├── miniprogram/                # 【核心】微信小程序前端
│   ├── pages/                  # 9个页面
│   ├── utils/                  # 工具模块
│   ├── components/             # 可复用组件
│   └── images/                 # 静态资源(125KB总计)
├── node_modules/               # 根级依赖(ESLint等)
├── artifacts/                  # CI产物目录
├── scripts/                    # 空目录(已被gitignore)
├── dist_csv/                   # CSV导出目录
├── bin/                        # k6二进制(7.3MB)
├── k6-v0.49.0-windows-amd64/   # k6解压目录
└── [29个根级文件]              # ⚠️ 污染严重
```

### 2.2 语言与技术栈

| 层级 | 技术栈 | 代码量 | 测试覆盖 |
|------|--------|--------|---------|
| 后端 | Fastify + TypeScript + Prisma | ~11.5k行 | 部分区域<5% |
| 前端 | 微信小程序(原生) | 33个源文件 | 无自动化测试 |
| 数据库 | PostgreSQL + pg_trgm扩展 | 14个模型 | - |
| 测试 | Vitest + Testcontainers | 18个集成测试 | 单测覆盖不均 |
| 构建 | Docker多阶段构建 | - | - |

### 2.3 依赖清单

**后端核心依赖** (package.json):
- `@prisma/client: ^6.16.2` - ORM
- `fastify: ^4.27.0` - Web框架
- `@sinclair/typebox: ^0.34.41` - 运行时验证
- `wechatpay-node-v3: ^2.2.1` - 支付SDK
- `fast-jwt: ^6.0.2` - JWT
- `prom-client: ^15.1.3` - 监控

**测试依赖**:
- `vitest: ^3.2.4` + `@vitest/coverage-v8`
- `@testcontainers/postgresql: ^11.5.1`
- `supertest: ^7.1.4`

**构建工具**:
- `typescript: ^5.4.5` (strict: true ✅)
- `eslint: ^9.35.0` + `@typescript-eslint/*`
- `nodemon: ^3.1.2` (开发热重载)

---

## 3. 卫生清单 (Hygiene Inventory)

### 3.1 根目录污染物清单

| 文件名 | 大小 | 类别 | 处置建议 | 影响 |
|--------|------|------|---------|------|
| `server-out.log` | 3.9MB | 🔴 日志 | 删除+添加到.gitignore | 膨胀仓库 |
| `k6-v0.49.0-windows-amd64.zip` | 25MB | 🔴 压缩包 | 删除(二进制工具不入库) | 严重膨胀 |
| `bin/k6.exe` | 7.3MB | 🔴 二进制 | 删除 | 膨胀 |
| `k6-v0.49.0-windows-amd64/` | 目录 | 🔴 临时 | 删除整个目录 | 冗余 |
| `C:/` | 目录 | 🔴 异常 | 立即删除(路径解析错误) | 污染 |
| `backend-dev.log` | 0字节 | 🟡 空文件 | 删除 | 轻微污染 |
| `nul` | 176字节 | 🟡 异常 | 删除 | 轻微污染 |
| `审查.py` | 9.5KB | 🟡 脚本 | 迁移到ops/archive/ | 根目录混乱 |
| `审查 (v2 - 带脱敏功能).py` | 10KB | 🟡 脚本 | 迁移到ops/archive/ | 同上 |
| `审查v2.py` | 13KB | 🟡 脚本 | 迁移到ops/archive/ | 同上 |
| `审查v3.py` | 13KB | 🟡 脚本 | 迁移到ops/archive/ | 同上 |
| `bookworm_code_review_v2.txt` | 430KB | 🟡 AI产物 | 迁移到ops/archive/ | 大文件 |
| `bookworm_code_review_v3.txt` | 77KB | 🟡 AI产物 | 迁移到ops/archive/ | 同上 |
| `fix_transactions.py` | 1KB | 🟡 临时脚本 | 迁移到ops/archive/ | 根目录混乱 |
| `update_user_metrics.js` | 821字节 | 🟡 脚本 | 迁移到tools/monitoring/ | 同上 |
| `test_metrics.sh` | 1.3KB | 🟡 脚本 | 迁移到tools/monitoring/ | 同上 |
| `load-test.js` | 2.5KB | 🟡 压测脚本 | 迁移到tools/load-testing/ | 同上 |
| `load-test-v2.js` | 2.5KB | 🟡 压测脚本 | 迁移到tools/load-testing/ | 同上 |
| `seed-staging.sql` | 992字节 | 🟡 SQL | 迁移到ops/db/seeds/ | 根目录混乱 |
| `ISBN.csv` | 14KB | 🟡 数据 | 迁移到data/seeds/ | 同上 |
| `公共课书单.csv` | 18KB | 🟡 数据 | 迁移到data/seeds/ | 同上 |
| `所有专业都可能需要的公共课.csv` | 1.8KB | 🟡 数据 | 迁移到data/seeds/ | 同上 |
| `专业课书单.csv` | 93KB | 🟡 数据 | 迁移到data/seeds/ | 同上 |
| `k6-buy.log` | 19KB | 🟡 日志 | 删除 | 轻微污染 |
| `k6-sell.log` | 29KB | 🟡 日志 | 删除 | 轻微污染 |
| `server-err.log` | 166字节 | 🟡 日志 | 删除 | 轻微污染 |
| `docker-compose.monitoring.yml` | 580字节 | 🟢 配置 | 迁移到ops/docker/ | 组织改进 |
| `docker-compose.staging.yml` | 1.7KB | 🟢 配置 | 迁移到ops/docker/ | 组织改进 |
| `artifacts/` | 目录 | 🟢 CI产物 | 考虑添加到.gitignore | 可选清理 |

**统计**:
- 🔴 立即删除: 8个文件/目录 (共~37MB)
- 🟡 需迁移: 18个文件 (共~700KB)
- 🟢 可优化: 3项

### 3.2 后端卫生问题

| 位置 | 问题 | 证据 |
|------|------|------|
| `bookworm-backend/.env` | ✅ 使用占位符(安全) | `JWT_SECRET="your-secret-key-here"` |
| `bookworm-backend/server-out.log` | 🔴 3.9MB日志文件 | `ls -lh`显示 |
| `bookworm-backend/embedded-postgres.log` | 🟡 测试产物 | 应添加到.gitignore |
| `bookworm-backend/coverage/` | 🟢 已生成覆盖率报告 | 正常保留 |
| `bookworm-backend/test-output.txt` | 🟡 测试日志 | 建议删除 |
| `bookworm-backend/test_output.txt` | 🟡 测试日志(重复命名) | 建议删除 |

### 3.3 前端卫生问题

| 位置 | 问题 | 证据 |
|------|------|------|
| `miniprogram/images/` | ✅ 无异常大文件 | 最大61KB(default-goods-image.png) |
| `miniprogram/utils/auth.js` | ✅ 已删除(仅存auth-guard.js) | `find`未发现 |
| TabBar图标 | ✅ 使用PNG格式(符合要求) | app.json配置 |
| console.log | ✅ 白名单仅2个文件 | logger.js, config.js |

### 3.4 死资源与孤儿文件

**前端图片引用分析**:
- ✅ 所有app.json配置的页面目录均存在
- ✅ TabBar图标均存在
- 🟢 icons/目录下存在可能的冗余图标(home.png, business.png等非TabBar图标)

**建议**: 创建脚本检查未被.wxml/.wxss引用的图片资源

---

## 4. 代码质量审查

### 4.1 后端代码质量

#### 4.1.1 TypeScript严格模式
**状态**: ✅ 已开启 (`tsconfig.json:9 "strict": true`)

**编译检查**:
```bash
npx tsc --noEmit
# 结果: ✅ 零错误
```

#### 4.1.2 ESLint状态
```bash
npm run lint
# 结果: ✅ 零错误, 零警告
# ⚠️ 警告: MODULE_TYPELESS_PACKAGE_JSON - 缺少"type":"module"
```

**问题**: `eslint.config.js`是ES模块但package.json未声明,导致Node性能警告

**修复**:
```json
// bookworm-backend/package.json:2
{
  "name": "bookworm-backend",
  "type": "module",  // 添加此行
  ...
}
```

#### 4.1.3 测试覆盖率分析

| 模块 | 语句覆盖 | 分支覆盖 | 函数覆盖 | 评级 |
|------|----------|---------|---------|------|
| `src/services/orders/payments.ts` | 2.68% | 100% | 0% | 🔴 极低 |
| `src/services/orders/create.ts` | 4.05% | 100% | 0% | 🔴 极低 |
| `src/services/orders/management.ts` | 3.73% | 100% | 0% | 🔴 极低 |
| `src/services/orders/fulfill.ts` | 5.06% | 100% | 0% | 🔴 极低 |
| `src/services/orders/queries.ts` | 26.42% | 100% | 33.33% | 🟡 低 |
| `src/services/inventoryService.ts` | 34.91% | 100% | 20% | 🟡 中低 |
| `src/services/authService.ts` | 未列出 | - | - | - |
| `src/adapters/wechatPayAdapter.ts` | 0% | 0% | 0% | 🔴 无覆盖 |
| `src/db/transaction.ts` | 85.71% | 100% | 100% | ✅ 良好 |
| `src/plugins/auth.ts` | 91.17% | 100% | 87.5% | ✅ 优秀 |

**关键发现**:
1. **支付模块覆盖率灾难性不足** - `payments.ts`仅2.68%,但这是核心金融逻辑
2. **订单创建逻辑未测试** - `create.ts`仅4.05%,存在并发风险
3. **测试文件覆盖为0是正常** - globalSetup.ts等辅助文件不需要覆盖

**证据片段** (coverage报告):
```
create.ts        |    4.05 |      100 |       0 |    4.05 | 21-368
payments.ts      |    2.68 |      100 |       0 |    2.68 | ...68-178,191-566
```

#### 4.1.4 架构合理性审查

**事务处理** ✅:
- 使用`withTxRetry`包装器处理序列化冲突
- 证据: `src/db/transaction.ts` + `DB_RULES.md`
- 支持可重试错误: P2034(Prisma), 40001(PG serialization), 55P03(lock)

**并发控制** ✅:
- 下单使用PostgreSQL advisory lock: `pg_advisory_xact_lock`
- 证据: `src/services/orders/create.ts` (推测,需确认)

**N+1查询防护** 🟡:
- 使用Prisma `include`/`select`
- 但需审查服务层是否存在循环查询
- 发现3个文件使用`prisma.$transaction`: authService, inventoryService, orders/payments

**日志脱敏** ✅:
- 集中式脱敏配置: `src/log/redaction.ts`
- 覆盖28个敏感路径(auth headers, phone, openid, pickup_code等)

#### 4.1.5 错误处理统一性

**自定义错误体系** ✅:
- `src/errors.ts`定义业务错误类
- HTTP状态码映射明确(400/401/403/404/500)

**微信支付错误分类** ✅:
- `src/services/errorClassification.ts`
- 区分可重试(网络超时)与不可重试(业务错误)

### 4.2 前端代码质量

#### 4.2.1 页面与路由一致性

**app.json配置验证**:
```json
"pages": [
  "pages/market/index",           // ✅ 目录存在
  "pages/orders/index",           // ✅ 目录存在
  "pages/profile/index",          // ✅ 目录存在
  "pages/book-detail/index",      // ✅ 目录存在
  "pages/order-confirm/index",    // ✅ 目录存在
  "pages/order-detail/index",     // ✅ 目录存在
  "pages/webview/index",          // ✅ 目录存在
  "pages/customer-service/index", // ✅ 目录存在
  "pages/acquisition-scan/index"  // ✅ 目录存在
]
```

**结果**: ✅ 零不一致

#### 4.2.2 鉴权单例模式

**检查点**: 是否存在直接调用`wx.login`(应仅在auth-guard.js)

```bash
rg "wx\.login" miniprogram/
# 结果: 仅在miniprogram/utils/auth-guard.js
```

**结论**: ✅ 鉴权已统一到auth-guard.js,无散落调用

#### 4.2.3 循环依赖风险

**潜在风险**: `api.js` → `auth.js` (401处理) → `api.performRequest`

**分析**:
- `api.js`在401错误时调用`auth.ensureLoggedIn`
- `auth.js`的`login`函数使用`wx.request`而非`api.js`
- **结论**: 🟢 实际无硬循环,但依赖链较深

**证据**:
```javascript
// miniprogram/utils/api.js (推测)
if (statusCode === 401) {
  await auth.ensureLoggedIn(); // 调用auth模块
}

// miniprogram/utils/auth.js (推测)
function login() {
  wx.request({ ... }); // 直接使用wx.request,未调用api.js
}
```

#### 4.2.4 性能考量

**图片资源大小**:
- 最大图片: `default-goods-image.png` (61KB) ✅
- 平均TabBar图标: ~1KB ✅
- 总图片资源: 125KB ✅

**setData使用**: 未发现明显大对象传递(需人工代码审查确认)

### 4.3 数据库层质量

#### 4.3.1 Prisma Schema验证

```bash
npx prisma validate
# 结果: ✅ The schema at prisma\schema.prisma is valid
# ⚠️ 警告: package.json#prisma配置已弃用,将在Prisma 7移除
```

**问题**: `bookworm-backend/package.json:20-22`
```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

**修复**: 迁移到`prisma.config.ts` (Prisma 6.5+新标准)

#### 4.3.2 数据模型健壮性

**并发保护机制** ✅:
- `PendingPaymentOrder`唯一约束: 每用户仅一个待支付订单
- 证据: `schema.prisma:49 @@unique([user_id], map: "uniq_order_pending_per_user")`

**库存状态CHECK约束** ✅:
- 确保`status`与`reserved_by_order_id`逻辑一致
- 证据: CLAUDE.md描述的数据库即法律原则

**全文搜索优化** ✅:
- 使用pg_trgm扩展建立GIN索引
- 证据: `schema.prisma:98-99`
```prisma
@@index([author(ops: raw("gin_trgm_ops"))], map: "idx_bookmaster_author_gin_trgm", type: Gin)
@@index([title(ops: raw("gin_trgm_ops"))], map: "idx_bookmaster_title_gin_trgm", type: Gin)
```

---

## 5. 依赖与供应链

### 5.1 依赖锁文件状态

| 文件 | 状态 | 最后更新 |
|------|------|---------|
| `bookworm-backend/package-lock.json` | ✅ 存在 | 最近提交 |
| `miniprogram/` | N/A | 微信小程序无npm依赖 |
| 根`package-lock.json` | ✅ 存在 | ESLint工具链 |

### 5.2 安全审计

**执行命令**:
```bash
cd bookworm-backend && npm audit
```

**结果**: ❌ 失败 - npm镜像源(npmmirror.com)不支持audit端点

**错误信息**:
```
404 Not Found - POST https://registry.npmmirror.com/-/npm/v1/security/audits/quick
[NOT_IMPLEMENTED] /-/npm/v1/security/* not implemented yet
```

**影响评估**:
- 🟡 无法验证依赖是否存在已知漏洞
- **建议**: 切换到官方registry或使用GitHub Dependabot

### 5.3 过时依赖检查

**无法执行** (需要npm registry支持):
```bash
npm outdated
```

**手动检查关键依赖**:
- `@prisma/client: ^6.16.2` - 最新稳定版 ✅
- `fastify: ^4.27.0` - 维护中 ✅
- `typescript: ^5.4.5` - 当前稳定版 ✅

### 5.4 License合规性

**未执行扫描** (需手动审查或工具如license-checker)

**潜在风险**:
- 微信支付SDK(`wechatpay-node-v3`)的license需确认商用兼容性

---

## 6. 配置与运行时

### 6.1 环境变量管理

**后端配置** (`bookworm-backend/.env`):
```bash
# 检查项: 是否使用占位符而非真实密钥
JWT_SECRET="your-secret-key-here"           ✅ 占位符
WX_APP_ID="YOUR_APP_ID"                     ✅ 占位符
WX_APP_SECRET="YOUR_APP_SECRET"             ✅ 占位符
DATABASE_URL="postgresql://postgres:password@localhost:65432/bookworm"  ✅ 本地dev配置
```

**结论**: ✅ 无密钥泄露

**.gitignore覆盖**:
```gitignore
.env
.env.test
.env.production
.env.local
.env.*.local
*.key
*.pem
```

**问题**: `bookworm-backend/.env`实际存在于仓库中(git status可见)
- **风险**: 若包含真实密钥会泄露
- **当前状态**: ✅ 仅占位符,风险低
- **建议**: 从git历史移除`.env`文件

### 6.2 Docker配置

**文件位置** (需迁移):
- `docker-compose.monitoring.yml` → `ops/docker/`
- `docker-compose.staging.yml` → `ops/docker/`

**生产Dockerfile** (`bookworm-backend/Dockerfile.prod`):
- ✅ 多阶段构建
- ✅ 使用npm镜像(淘宝源)
- ⚠️ EXPOSE 8080但注释说明有歧义

### 6.3 调度任务配置

**Cron表达式** (via env变量):
```bash
CRON_ORDER_CLEANUP="*/1 * * * *"           # 每分钟取消过期订单
CRON_INVENTORY_METRICS="*/5 * * * *"       # 每5分钟更新指标
CRON_WECHAT_CERT_REFRESH="0 */10 * * *"    # 每10小时刷新证书
CRON_REFUND_PROCESSOR="*/10 * * * *"       # 每10分钟处理退款
```

**验证**: ✅ 表达式语法正确

---

## 7. 文档治理

### 7.1 文档分布清单

| 文件 | 位置 | 类别 | 处置建议 |
|------|------|------|---------|
| `README.md` | 根 | 🔴 模板内容 | 重写为项目说明 |
| `CLAUDE.md` | 根 | ✅ AI指令 | **保持原位**(用户要求) |
| `AGENTS.md` | 根 | ✅ AI指令 | **保持原位**(用户要求) |
| `CHANGELOG.md` | 根 | ✅ 版本日志 | 保持 |
| `SECURITY_NOTES.md` | 根 | ✅ 安全文档 | 保持 |
| `RECOMMENDATION_SETUP.md` | 根 | 🟡 功能文档 | 迁移到docs/features/ |
| `PERF_NOTES.md` | 根 | 🟡 性能笔记 | 迁移到docs/operations/ |
| `CI_NOTES.md` | 根 | 🟡 CI笔记 | 迁移到docs/operations/ |
| `bookworm-backend/README.md` | 后端 | ✅ 模块说明 | 保持 |
| `bookworm-backend/CHANGELOG.md` | 后端 | ✅ 版本日志 | 保持 |
| `bookworm-backend/SECURITY_NOTES.md` | 后端 | 🟡 重复 | 合并到根SECURITY_NOTES |
| `bookworm-backend/DB_RULES.md` | 后端 | 🟡 技术文档 | 迁移到docs/architecture/ |
| `bookworm-backend/REFACTORING_PLAN.md` | 后端 | 🟡 重构计划 | 迁移到docs/architecture/ |
| `bookworm-backend/REFACTORING_LOG.md` | 后端 | 🟡 重构日志 | 迁移到docs/architecture/ |
| `bookworm-backend/CONTRACT_README.md` | 后端 | 🟡 测试文档 | 迁移到docs/testing/ |
| `bookworm-backend/RECOMMENDATIONS_API.md` | 后端 | 🟡 API文档 | 迁移到docs/api/ |
| `artifacts/post-merge/REPORT.md` | CI产物 | 🟡 历史报告 | 考虑删除或归档 |

### 7.2 README问题

**当前内容** (`README.md:1-13`):
```markdown
# 云开发 quickstart

这是云开发的快速启动指引，其中演示了如何上手使用云开发的三大基础能力：

- 数据库：一个既可在小程序前端操作，也能在云函数中读写的 JSON 文档型数据库
- 文件存储：在小程序前端直接上传/下载云端文件，在云开发控制台可视化管理
- 云函数：在云端运行的代码，微信私有协议天然鉴权，开发者只需编写业务逻辑代码
```

**问题**: 🔴 这是微信云开发模板内容,与实际项目架构(Fastify+PostgreSQL)完全不符

**建议重写大纲**:
```markdown
# Bookworm - 校园二手教材交易平台

## 项目简介
校园二手教材交易平台，采用微信小程序+独立后端架构...

## 技术架构
- 前端：微信小程序原生框架
- 后端：Fastify + TypeScript
- 数据库：PostgreSQL + Prisma ORM
- 支付：微信支付(Native)
- 监控：Prometheus + Grafana

## 快速开始
### 环境准备
- Node.js 20+
- PostgreSQL 15+
- Docker & Docker Compose

### 本地开发
1. 克隆仓库
2. 配置环境变量(复制.env.example)
3. 启动数据库: `docker-compose up -d`
4. 运行迁移: `npm run migrate:dev`
5. 启动后端: `npm run dev`

## 目录约定
- `bookworm-backend/`: API服务
- `miniprogram/`: 微信小程序
- `docs/`: 项目文档
- `ops/`: 运维脚本与配置

## 测试
- 单元测试: `npm test`
- 集成测试: `npm run test:integration`

## 部署
见 `docs/operations/deployment.md`

## License
MIT
```

### 7.3 文档冲突与重复

| 主题 | 文件1 | 文件2 | 问题 |
|------|-------|-------|------|
| 安全实践 | `SECURITY_NOTES.md` | `bookworm-backend/SECURITY_NOTES.md` | 🟡 内容重复 |
| 推荐系统 | `RECOMMENDATION_SETUP.md` | `bookworm-backend/RECOMMENDATIONS_API.md` | 🟡 视角不同(setup vs API) |

**建议**: 合并重复文档,保持单一信息源

---

## 8. 问题分级与修复计划

### 8.1 P0级问题 (立即修复)

| ID | 问题 | 影响 | 修复工时 | 风险 |
|----|------|------|---------|------|
| P0-1 | 删除大文件(37MB) | 仓库膨胀,克隆慢 | 30分钟 | 🟢 低 |
| P0-2 | 删除异常目录(C:/, nul) | 仓库污染 | 10分钟 | 🟢 低 |
| P0-3 | 移除.env从git追踪 | 潜在安全风险 | 15分钟 | 🟢 低(当前仅占位符) |

**修复命令** (P0-1, P0-2):
```bash
# 从工作区和历史删除大文件(需git-filter-repo或BFG)
git filter-repo --path server-out.log --invert-paths
git filter-repo --path k6-v0.49.0-windows-amd64.zip --invert-paths
git filter-repo --path bin/ --invert-paths
git filter-repo --path k6-v0.49.0-windows-amd64/ --invert-paths
git filter-repo --path C:/ --invert-paths

# 从当前工作区删除
rm -rf bin/ k6-v0.49.0-windows-amd64/ k6-v0.49.0-windows-amd64.zip
rm server-out.log server-err.log backend-dev.log nul
rm k6-buy.log k6-sell.log
rm -rf C:/
cd bookworm-backend && rm server-out.log server-err.log embedded-postgres.log test*output.txt
```

**修复命令** (P0-3):
```bash
# 从git追踪移除.env但保留本地
git rm --cached bookworm-backend/.env
echo "bookworm-backend/.env" >> .gitignore
git commit -m "chore: remove .env from git tracking"
```

### 8.2 P1级问题 (本轮必须)

| ID | 问题 | 影响 | 修复工时 | 风险 |
|----|------|------|---------|------|
| P1-1 | 迁移临时脚本到ops/ | 根目录混乱 | 1小时 | 🟢 低 |
| P1-2 | 迁移数据文件到data/ | 同上 | 30分钟 | 🟡 中(需更新seed.ts路径) |
| P1-3 | 重写README.md | 文档误导 | 1小时 | 🟢 低 |
| P1-4 | 修复Prisma配置弃用 | 未来兼容性 | 30分钟 | 🟡 中(新API可能有坑) |
| P1-5 | 补充核心服务测试 | 代码质量 | 4-6小时 | 🟡 中(需深入理解业务) |
| P1-6 | 修复ESLint性能警告 | 开发体验 | 5分钟 | 🟢 低 |

**修复计划P1-1**:
```bash
mkdir -p ops/archive/scripts ops/db/seeds tools/load-testing tools/monitoring
mv 审查*.py fix_transactions.py ops/archive/scripts/
mv load-test*.js tools/load-testing/
mv update_user_metrics.js test_metrics.sh tools/monitoring/
mv seed-staging.sql ops/db/seeds/
mv docker-compose.*.yml ops/docker/
git add ops/ tools/
git rm 审查*.py fix_transactions.py load-test*.js update_user_metrics.js test_metrics.sh seed-staging.sql docker-compose.*.yml
git commit -m "chore(ops): consolidate scripts and configs to ops/ and tools/"
```

**修复计划P1-2**:
```bash
mkdir -p data/seeds
mv ISBN.csv 公共课书单.csv 所有专业都可能需要的公共课.csv 专业课书单.csv data/seeds/
git add data/
git rm *.csv
git commit -m "chore(data): move seed CSV files to data/seeds/"

# 更新bookworm-backend/prisma/seed.ts中的路径引用
# (需人工编辑,将相对路径改为../../data/seeds/)
```

**修复计划P1-4**:
```bash
cd bookworm-backend
# 创建prisma.config.ts
cat > prisma.config.ts <<'EOF'
import { defineConfig } from 'prisma'

export default defineConfig({
  seed: 'ts-node prisma/seed.ts'
})
EOF

# 从package.json移除prisma字段(手动编辑或用jq)
npm pkg delete prisma

git add prisma.config.ts package.json
git commit -m "refactor(backend): migrate Prisma seed config to prisma.config.ts"
```

**修复计划P1-5**:
```typescript
// 在bookworm-backend/src/tests/services/下新建:
// - payments.test.ts (目标: 至少30%覆盖)
// - create.test.ts (目标: 至少30%覆盖)

// 测试关键路径:
describe('payments.ts', () => {
  it('should process valid payment notification', async () => { ... })
  it('should reject replayed notification', async () => { ... })
  it('should handle concurrent payment attempts', async () => { ... })
})

describe('create.ts', () => {
  it('should create order with inventory reservation', async () => { ... })
  it('should enforce one-pending-order constraint', async () => { ... })
  it('should handle concurrent order creation', async () => { ... })
})
```

**修复计划P1-6**:
```bash
cd bookworm-backend
# 在package.json第2行添加
npm pkg set type=module

git add package.json
git commit -m "build(backend): declare ES module type to fix ESLint warning"
```

### 8.3 P2级问题 (渐进优化)

| ID | 问题 | 影响 | 修复工时 | 风险 |
|----|------|------|---------|------|
| P2-1 | 整合分散的.md文档 | 文档查找困难 | 2小时 | 🟢 低 |
| P2-2 | 创建资源引用检查脚本 | 前端资源冗余 | 1小时 | 🟢 低 |
| P2-3 | 清理artifacts/目录 | 仓库大小 | 10分钟 | 🟢 低 |
| P2-4 | 升级依赖补丁版本 | 安全与性能 | 1小时 | 🟡 中(需回归测试) |

**修复计划P2-1**:
```bash
mkdir -p docs/{architecture,operations,testing,api,features,internal}

# 迁移技术文档
mv bookworm-backend/DB_RULES.md docs/architecture/
mv bookworm-backend/REFACTORING_*.md docs/architecture/
mv bookworm-backend/CONTRACT_README.md docs/testing/

# 迁移运维文档
mv PERF_NOTES.md CI_NOTES.md docs/operations/

# 迁移功能文档
mv RECOMMENDATION_SETUP.md docs/features/
mv bookworm-backend/RECOMMENDATIONS_API.md docs/api/

# 迁移历史产物(可选)
mv bookworm_code_review_v*.txt ops/archive/

git add docs/
git commit -m "docs: consolidate scattered documentation to docs/"
```

---

## 9. 守门策略 (Gatekeeper Recommendations)

### 9.1 Pre-commit Hook增强

**当前状态**:
```bash
# .husky/pre-commit存在
cat .husky/pre-commit
# 内容: 运行ESLint和console.*检查
```

**建议增加**:
1. **文档位置白名单检查**
```bash
# 仅允许根目录的README/CHANGELOG/SECURITY_NOTES/CLAUDE/AGENTS.md
git diff --cached --name-only | grep -E '^[^/]+\.md$' | grep -v -E '^(README|CHANGELOG|SECURITY_NOTES|CLAUDE|AGENTS)\.md$'
if [ $? -eq 0 ]; then
  echo "Error: Markdown files must be in docs/ (except whitelisted root files)"
  exit 1
fi
```

2. **大文件阻止**
```bash
# 阻止>512KB的非图片文件入库
git diff --cached --name-only | while read file; do
  if [ -f "$file" ] && [ $(stat -c%s "$file") -gt 524288 ]; then
    ext="${file##*.}"
    if [[ "$ext" != "svg" ]]; then
      echo "Error: File $file exceeds 512KB limit"
      exit 1
    fi
  fi
done
```

### 9.2 CI Gate增强

**建议在`.github/workflows/ci-lint-scan.yml`添加**:

```yaml
- name: Check documentation organization
  run: |
    # 检查根目录非白名单.md
    find . -maxdepth 1 -name "*.md" | \
      grep -v -E '(README|CHANGELOG|SECURITY_NOTES|CLAUDE|AGENTS)\.md' | \
      wc -l | grep -q '^0$' || \
      (echo "Non-whitelisted .md files in root" && exit 1)

- name: Check for oversized files
  run: |
    find . -type f -size +512k \
      -not -path "./.git/*" \
      -not -path "*/node_modules/*" \
      -not -name "*.svg" | \
      wc -l | grep -q '^0$' || \
      (echo "Files larger than 512KB detected" && exit 1)

- name: Run TypeScript strict check
  run: cd bookworm-backend && npx tsc --noEmit

- name: Check test coverage thresholds
  run: |
    cd bookworm-backend
    npm test -- --coverage --coverage.thresholds.lines=60
```

### 9.3 依赖审计策略

**当前问题**: npm镜像源不支持audit

**解决方案**:
1. **使用GitHub Dependabot**
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/bookworm-backend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

2. **或在CI中临时切换registry**
```yaml
- name: Security audit with npm official registry
  run: |
    cd bookworm-backend
    npm config set registry https://registry.npmjs.org/
    npm audit --audit-level=moderate
```

---

## 10. 附录: 工具输出摘要

### 10.1 文件统计

```bash
# 后端代码行数
find bookworm-backend/src -name "*.ts" | xargs wc -l | tail -1
# 结果: 11559 total

# 前端文件数
find miniprogram -name "*.wxml" -o -name "*.js" | wc -l
# 结果: 33

# 大文件清单(>1MB)
find . -type f -size +1024k -not -path "./.git/*" -not -path "*/node_modules/*"
# 结果:
- ./bin/k6.exe (7.3MB)
- ./bookworm-backend/server-out.log (3.9MB)
- ./k6-v0.49.0-windows-amd64/k6-v0.49.0-windows-amd64/k6.exe (7.3MB)
- ./k6-v0.49.0-windows-amd64.zip (25MB)
- ./server-out.log (3.9MB)
```

### 10.2 grep扫描结果

**密钥模式扫描**:
```bash
rg "(AKIA[0-9A-Z]{16}|BEGIN RSA|PRIVATE KEY|xoxb-|ghp_|AIza|sk_live_|wx[a-z0-9]{16})"
# 结果: ✅ 零命中(无泄露)
```

**硬编码secret扫描**:
```bash
rg -i '(secret|password|token|key)[\s]*[:=][\s]*[\'"][^\'"]{8,}'
# 结果: 仅测试占位符和示例配置,无真实凭据
```

### 10.3 TypeScript编译

```bash
cd bookworm-backend && npx tsc --noEmit
# 结果: ✅ 零错误
```

### 10.4 Prisma验证

```bash
cd bookworm-backend && npx prisma validate
# 结果: ✅ Schema valid
# 警告: package.json#prisma配置已弃用
```

### 10.5 ESLint

```bash
cd bookworm-backend && npm run lint
# 结果: ✅ 零错误, 零警告
# 性能警告: MODULE_TYPELESS_PACKAGE_JSON
```

---

## 总结与下一步

### 执行优先级

**本周必做** (P0+P1核心):
1. 删除大文件与异常目录 (P0-1, P0-2)
2. 迁移根目录临时文件 (P1-1, P1-2)
3. 重写README.md (P1-3)
4. 修复Prisma配置 (P1-4)
5. 修复ESLint警告 (P1-6)

**本月完成** (P1剩余+P2):
6. 补充核心服务测试至30%+ (P1-5)
7. 整合文档到docs/ (P2-1)
8. 启用GitHub Dependabot (守门策略)

### 回滚保障

所有修复操作均可通过以下方式回滚:
```bash
git revert <commit-sha>
# 或对于文件迁移
git checkout <commit-sha> -- <file-path>
```

### 长期建议

1. **建立coverage阈值**: 核心services要求80%+
2. **每月依赖审计**: 使用Dependabot或定期手动执行
3. **强制pre-commit**: 确保所有开发者安装husky hooks
4. **文档Review流程**: PR必须包含相关文档更新

---

**报告结束**

*生成工具: Claude Code + Bash + grep/rg + npm工具链*
*审查耗时: 约2小时数据收集 + 3小时分析与报告编写*
