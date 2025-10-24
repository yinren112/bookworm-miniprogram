# Bookworm - 校园二手教材交易平台

## 项目简介

Bookworm 是一个基于微信小程序的校园二手教材交易平台，采用前后端分离架构，提供教材买卖、库存管理、订单处理和支付集成等完整功能。系统严格遵循"一书一条目"的原子库存模型，确保库存状态的准确性和交易安全。

### 核心特性

- **原子库存管理**: 每本实体书独立追踪，状态机式管理（in_stock → reserved → sold）
- **账户合并机制**: 支持微信登录用户与预注册用户（通过手机号）的自动合并
- **并发安全**: 使用 PostgreSQL advisory locks 和事务级约束防止超卖
- **支付集成**: 微信支付 Native 模式，支持主动查单和退款流程
- **推荐系统**: 基于学生专业和年级的个性化教材推荐
- **监控与可观测**: Prometheus 指标 + 结构化日志

## 技术架构

### 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **前端** | 微信小程序原生框架 | 9个页面 + TabBar导航 |
| **后端** | Fastify + TypeScript | RESTful API + 插件化架构 |
| **数据库** | PostgreSQL 15+ + Prisma ORM | 14个模型 + pg_trgm全文搜索 |
| **支付** | 微信支付 API v3 | Native支付 + 自动证书刷新 |
| **测试** | Vitest + Testcontainers | 单元测试 + 隔离集成测试 |
| **监控** | Prometheus + Grafana | 业务指标 + 系统监控 |
| **构建** | Docker多阶段构建 | 生产环境镜像优化 |

### 架构原则

1. **数据库即法律**: 核心业务规则通过数据库约束强制执行（唯一索引、CHECK约束、咨询锁）
2. **零信任外部输入**: 支付回调采用主动查单模式，拒绝信任通知内容
3. **测试驱动**: 所有代码变更必须通过完整测试套件
4. **基础设施即代码**: 环境配置完全通过 docker-compose 和 .env 文件管理

## 快速开始

### 环境准备

- **Node.js**: 20.x LTS
- **PostgreSQL**: 15+
- **Docker & Docker Compose**: 用于本地开发环境
- **微信开发者工具**: 用于小程序调试

### 本地开发

#### 1. 克隆仓库

```bash
git clone https://github.com/yinren112/bookworm-miniprogram.git
cd miniprogram-13
```

#### 2. 后端服务启动

```bash
cd bookworm-backend

# 安装依赖
npm install

# 配置环境变量（复制模板并填入真实值）
cp .env .env.local
# 编辑 .env.local，至少配置以下字段：
# - DATABASE_URL
# - JWT_SECRET
# - WX_APP_ID, WX_APP_SECRET

# 启动数据库（Docker）
docker-compose up -d postgres

# 运行数据库迁移
npm run migrate:dev

# （可选）填充种子数据
npm run seed

# 启动开发服务器（热重载）
npm run dev
```

服务将在 `http://localhost:8080` 启动。

#### 3. 前端小程序配置

```bash
# 回到根目录
cd ..

# 使用微信开发者工具打开 miniprogram/ 目录
# 配置 API 端点：编辑 miniprogram/utils/config.js
# 修改 apiBaseUrl 为后端地址（开发环境：http://localhost:8080）
```

### 测试

```bash
cd bookworm-backend

# 单元测试（带覆盖率）
npm test

# 集成测试（使用 Testcontainers）
npm run test:integration

# 代码检查
npm run lint

# TypeScript 类型检查
npx tsc --noEmit
```

## 目录结构

```
miniprogram-13/
├── bookworm-backend/          # 后端 API 服务
│   ├── src/                   # TypeScript 源码（~11.5k 行）
│   │   ├── routes/            # API 路由定义
│   │   ├── services/          # 业务逻辑层
│   │   ├── adapters/          # 外部 SDK 封装（微信支付等）
│   │   ├── plugins/           # Fastify 插件（认证、限流、监控）
│   │   ├── jobs/              # 定时任务（订单清理、指标更新）
│   │   ├── db/                # 数据库工具（事务重试、视图选择器）
│   │   └── tests/             # 测试套件（24个测试文件）
│   ├── prisma/                # Prisma ORM
│   │   ├── schema.prisma      # 数据库 schema（14个模型）
│   │   ├── migrations/        # 数据库迁移历史
│   │   └── seed.ts            # 种子数据脚本
│   ├── tools/                 # 开发工具（ESLint 自定义规则等）
│   ├── Dockerfile.prod        # 生产环境多阶段构建
│   └── package.json           # 依赖与脚本
│
├── miniprogram/               # 微信小程序前端
│   ├── pages/                 # 页面（market, orders, profile 等）
│   ├── utils/                 # 工具模块（api, auth, payment, ui）
│   ├── components/            # 可复用组件
│   ├── images/                # 静态资源（TabBar 图标等）
│   └── app.json               # 小程序配置
│
├── data/                      # 数据文件
│   └── seeds/                 # CSV 种子数据（ISBN、书单）
│
├── ops/                       # 运维配置
│   ├── docker/                # Docker Compose 文件（staging/监控）
│   ├── db/seeds/              # 数据库种子 SQL
│   └── archive/               # 历史脚本归档
│
├── tools/                     # 开发工具
│   ├── load-testing/          # k6 性能测试脚本
│   └── monitoring/            # 监控辅助脚本
│
├── .github/workflows/         # CI/CD 配置
├── CLAUDE.md                  # Claude Code 开发指南
├── AGENTS.md                  # AI Agents 协作规范
└── README.md                  # 本文件
```

## 核心业务流程

### 1. 用户购买流程

```
用户浏览市场 → 选择书籍 → 创建订单（预留库存） → 微信支付
→ 支付成功（回调验证） → 订单状态更新为待取货 → 生成取货码
→ 工作人员扫码核销 → 订单完成（库存状态更新为 sold）
```

### 2. 账户合并流程

```
工作人员收书 → 创建预注册账户（仅手机号） → 生成 SELL 订单
→ 用户首次微信登录 → 授权手机号 → 系统检测到相同手机号
→ 自动合并账户（保留所有历史订单）
```

### 3. 并发安全保障

- **一用户一待支付订单**: Prisma 唯一索引 `uniq_order_pending_per_user`
- **库存原子预留**: PostgreSQL advisory lock `pg_advisory_xact_lock(user_id)`
- **支付重放防护**: `webhook_events` 表记录所有支付通知 ID

## 部署

### Docker 生产部署

```bash
# 构建生产镜像
cd bookworm-backend
docker build -f Dockerfile.prod -t bookworm-backend:latest .

# 启动生产环境（包含负载均衡）
cd ../ops/docker
docker-compose -f docker-compose.staging.yml up -d
```

### 环境变量配置

生产环境必须配置的环境变量（参考 `bookworm-backend/.env`）：

```bash
# 核心配置
DATABASE_URL=postgresql://user:pass@host:5432/bookworm?connection_limit=50
JWT_SECRET=<strong-secret-key>
WX_APP_ID=<your-app-id>
WX_APP_SECRET=<your-app-secret>

# 微信支付（可选，不配置则无法使用支付功能）
WXPAY_MCHID=<merchant-id>
WXPAY_PRIVATE_KEY_PATH=/path/to/apiclient_key.pem
WXPAY_CERT_SERIAL_NO=<cert-serial>
WXPAY_API_V3_KEY=<api-v3-key>
WXPAY_NOTIFY_URL=https://your-domain.com/api/payment/notify

# 监控与日志
LOG_LEVEL=info
PROMETHEUS_ENABLED=true

# 定时任务（cron 表达式）
CRON_ORDER_CLEANUP="*/1 * * * *"
CRON_REFUND_PROCESSOR="*/10 * * * *"
```

### 健康检查

```bash
# API 健康检查
curl http://localhost:8080/api/health

# Prometheus 指标
curl http://localhost:8080/metrics
```

## 监控与可观测性

- **健康检查**: `GET /api/health`（数据库连通性 + 系统状态）
- **Prometheus 指标**: `GET /metrics`
  - 订单创建/完成/取消计数器
  - 支付处理指标
  - 库存状态分布（gauge）
  - 数据库重试计数器
- **结构化日志**: Pino JSON 日志 + 敏感字段脱敏（28个路径）

## 常见问题

### Q: 为什么添加 `"type": "module"` 到 package.json？
**A**: 为了消除 ESLint 的 `MODULE_TYPELESS_PACKAGE_JSON` 性能警告。项目的 `eslint.config.js` 使用 ES 模块语法，声明模块类型可避免 Node.js 重复解析。

### Q: Prisma 配置弃用警告如何处理？
**A**: Prisma 6.16.2 的 `package.json#prisma` 字段在 Prisma 7 将被移除。虽然官方建议迁移到 `prisma.config.ts`，但当前版本尚未完全支持该功能，因此保留原配置直到 Prisma 7 正式发布。

### Q: 如何运行集成测试？
**A**: 集成测试使用 Testcontainers 动态创建隔离的 PostgreSQL 容器，无需手动配置测试数据库：
```bash
npm run test:integration
```

### Q: TabBar 图标为什么必须是 PNG？
**A**: 微信小程序的 TabBar 仅支持 PNG 格式图标，不支持 SVG。图标尺寸推荐 81x81px。

## 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交变更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

**重要**: 所有 PR 必须通过 CI 检查（TypeScript 编译、ESLint、测试套件）。

## License

本项目采用 MIT 许可证。详见 LICENSE 文件。

---

## 技术支持

- **项目仓库**: https://github.com/yinren112/bookworm-miniprogram (Private)
- **问题反馈**: 请通过 GitHub Issues 提交
- **开发文档**: 详见 `CLAUDE.md`（AI 辅助开发指南）和 `bookworm-backend/` 下的技术文档

---

**最后更新**: 2025-10-24
**当前版本**: Backend 1.0.1 | Miniprogram 1.0.1
