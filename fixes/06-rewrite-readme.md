# Bookworm - 校园二手教材交易平台

> 基于微信小程序的校园二手教材交易平台,采用现代化TypeScript全栈架构

## 项目简介

Bookworm是一个专为高校打造的二手教材交易平台,通过微信小程序提供便捷的买卖体验。系统采用"books as atomic inventory items"模型,每本实体书独立追踪,确保库存状态的原子性与并发安全。

### 核心特性

- 📱 **微信小程序原生开发** - 流畅的用户体验
- 🔒 **严格的并发控制** - PostgreSQL advisory lock + 事务隔离
- 💰 **微信支付集成** - 安全的支付回调与退款流程
- 📊 **Prometheus监控** - 实时业务指标追踪
- 🧪 **Testcontainers测试** - 隔离的集成测试环境
- 🎯 **TypeBox运行时验证** - API参数强类型校验

## 技术架构

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | 微信小程序(原生) | - |
| 后端 | Fastify + TypeScript | 4.27 / 5.4 |
| ORM | Prisma | 6.16 |
| 数据库 | PostgreSQL | 15+ |
| 支付 | 微信支付(Native) | wechatpay-node-v3 2.2 |
| 测试 | Vitest + Testcontainers | 3.2 / 11.5 |
| 监控 | Prometheus + prom-client | 15.1 |
| 容器 | Docker + docker-compose | - |

### 架构图

```
┌─────────────────┐
│  微信小程序前端  │  (miniprogram/)
│   原生框架       │
└────────┬────────┘
         │ HTTPS/JSON
         ▼
┌─────────────────────────────┐
│   Fastify API Server        │  (bookworm-backend/)
│   • JWT鉴权                 │
│   • TypeBox验证             │
│   • Pino结构化日志          │
└─────────┬───────────────────┘
          │ Prisma Client
          ▼
┌─────────────────────────────┐
│   PostgreSQL 15+            │
│   • pg_trgm全文搜索         │
│   • Advisory Lock并发控制   │
│   • CHECK约束业务规则       │
└─────────────────────────────┘
```

## 快速开始

### 环境依赖

- **Node.js**: 20.x LTS
- **PostgreSQL**: 15+
- **Docker & Docker Compose**: 最新稳定版
- **微信开发者工具**: 用于小程序开发

### 1. 克隆仓库

```bash
git clone <repository-url>
cd miniprogram-13
```

### 2. 后端配置

```bash
cd bookworm-backend

# 复制环境变量模板
cp .env.example .env

# 编辑.env,填入实际配置(开发环境可保留占位符)
# 必填项: WX_APP_ID, WX_APP_SECRET, JWT_SECRET
```

### 3. 启动数据库

```bash
# 启动PostgreSQL开发容器(端口65432)
docker-compose up -d postgres_dev
```

### 4. 运行数据库迁移

```bash
# 生成Prisma Client
npx prisma generate

# 执行迁移
npm run migrate:dev

# (可选)导入种子数据
npm run seed
```

### 5. 启动后端

```bash
# 开发模式(热重载)
npm run dev

# 生产构建
npm run build
npm run start
```

后端服务运行在 `http://localhost:8080`

### 6. 配置小程序前端

```bash
cd ../miniprogram

# 编辑config.js,设置后端API地址
# const apiBaseUrl = 'http://localhost:8080/api'
```

使用微信开发者工具打开`miniprogram/`目录,即可预览与调试。

## 项目结构

```
.
├── bookworm-backend/          # 后端API服务
│   ├── src/
│   │   ├── routes/            # API路由定义
│   │   ├── services/          # 业务逻辑层
│   │   ├── adapters/          # 外部系统适配器
│   │   ├── plugins/           # Fastify插件
│   │   ├── db/                # 数据库工具与视图
│   │   └── tests/             # 单元与集成测试
│   ├── prisma/
│   │   ├── schema.prisma      # 数据模型定义
│   │   └── migrations/        # 数据库迁移
│   └── public/                # 静态资源(管理后台)
├── miniprogram/               # 微信小程序前端
│   ├── pages/                 # 页面(市场/订单/个人中心等)
│   ├── utils/                 # 工具模块(api/auth/logger)
│   ├── components/            # 可复用组件
│   └── images/                # 静态资源
├── ops/                       # 运维脚本与配置
├── tools/                     # 开发工具(压测/监控)
├── data/                      # 种子数据
├── docs/                      # 项目文档
├── CLAUDE.md                  # AI开发指令
└── AGENTS.md                  # AI Agent配置
```

## 开发指南

### 运行测试

```bash
cd bookworm-backend

# 单元测试(带覆盖率)
npm test

# 集成测试(使用Testcontainers)
npm run test:integration

# 特定测试文件
npx vitest run src/tests/order.integration.test.ts
```

### 代码规范

```bash
# ESLint检查
npm run lint

# 自动修复
npm run lint:fix

# TypeScript编译检查
npx tsc --noEmit
```

### 数据库操作

```bash
# 创建迁移
npx prisma migrate dev --name <migration-name>

# 重置数据库(危险!)
npm run db:migrate:test:reset

# 打开Prisma Studio(GUI)
npx prisma studio
```

### 查看监控指标

```bash
# 访问Prometheus指标端点
curl http://localhost:8080/metrics

# 查看健康状态
curl http://localhost:8080/api/health
```

## API端点

完整API文档见 `docs/api/`

**核心端点**:
- `POST /api/auth/login` - 微信登录
- `GET /api/inventory/available` - 可用书籍列表
- `POST /api/orders/create` - 创建订单
- `POST /api/orders/:id/pay` - 生成支付参数
- `POST /api/payment/notify` - 支付回调(webhook)

## 部署

### Docker生产部署

```bash
cd bookworm-backend

# 构建镜像
docker build -f Dockerfile.prod -t bookworm-backend:latest .

# 运行容器
docker run -d \
  -p 8080:8080 \
  --env-file .env.production \
  bookworm-backend:latest
```

### Staging环境

```bash
# 启动staging环境(含Nginx负载均衡)
docker-compose -f ops/docker/docker-compose.staging.yml up -d
```

详见 `docs/operations/deployment.md`

## 核心概念

### 数据库即法律 (Database as Law)

系统通过数据库原生约束强制执行业务规则:
- **唯一约束**: 每用户仅一个待支付订单 (`uniq_order_pending_per_user`)
- **CHECK约束**: 库存状态与预留订单ID逻辑一致性
- **Advisory Lock**: 下单时序列化同一用户操作,防止竞态

### 零信任外部输入

支付回调采用"主动查单"模式:
1. 忽略通知内容
2. 主动向微信权威API查询真实状态
3. 时间戳与签名验证防重放

### 测试即真相

- 使用Testcontainers在隔离PostgreSQL容器中运行集成测试
- 测试覆盖关键路径:并发控制/幂等性/事务回滚

## 常见问题 (FAQ)

**Q: npm audit报错404?**
A: 当前使用npm镜像源(npmmirror.com)不支持audit,建议临时切换:
```bash
npm config set registry https://registry.npmjs.org/
npm audit
```

**Q: 测试数据库连接失败?**
A: 确保Docker容器运行且端口无冲突:
```bash
docker ps | grep postgres
# 应看到postgres_dev容器在65432端口
```

**Q: 微信小程序无法调用API?**
A: 检查`miniprogram/config.js`中的`apiBaseUrl`与后端地址是否一致。

## 贡献指南

见 [CONTRIBUTING.md](docs/CONTRIBUTING.md) (待创建)

## 版本历史

见 [CHANGELOG.md](CHANGELOG.md)

## 安全声明

见 [SECURITY_NOTES.md](SECURITY_NOTES.md)

## License

MIT

---

**维护团队**: Bookworm Development Team
**最后更新**: 2025-10-22
