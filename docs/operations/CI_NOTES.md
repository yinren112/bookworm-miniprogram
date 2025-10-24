# CI 构建说明 - Workspace 依赖管理

## 变更摘要

项目已完成工作区依赖去重（workspace hygiene），确保运行时依赖仅在实际使用的包中声明。

## 依赖分布原则

### 根目录 (`package.json`)
- **作用**: 仅保留仓库级工具依赖
- **当前状态**: 已清空所有依赖（工具依赖按需添加）
- **应包含的依赖类型**:
  - ESLint, Prettier
  - Husky, lint-staged
  - Turbo (如果使用 monorepo 工具)
  - 其他仓库级开发工具

### Backend 包 (`bookworm-backend/package.json`)
- **作用**: 声明所有后端运行时依赖
- **包含的运行时依赖**:
  - `axios` - HTTP 客户端
  - `dotenv` - 环境变量加载
  - `jsonwebtoken` - JWT 令牌处理
  - `wechatpay-node-v3` - 微信支付 SDK
  - Fastify 及其插件
  - Prisma Client
  - 其他业务依赖
- **devDependencies**: 包含类型定义 (`@types/*`)、测试工具、构建工具

## CI 构建指令

### 1. 安装依赖

**根目录安装（如需）:**
```bash
npm install
```

**后端包安装:**
```bash
npm install --workspace bookworm-backend
# 或在 backend 目录内
cd bookworm-backend && npm install
```

### 2. 构建后端

```bash
npm run build --workspace bookworm-backend
# 或
cd bookworm-backend && npm run build
```

### 3. 运行测试

**单元测试:**
```bash
cd bookworm-backend && npm test
```

**集成测试:**
```bash
cd bookworm-backend && npm run test:integration
```

### 4. 生产部署

```bash
# 构建 Docker 镜像
docker build -f bookworm-backend/Dockerfile.prod -t bookworm-backend .

# 运行容器
docker run -p 8080:8080 --env-file .env bookworm-backend
```

## 常见问题

### Q: 为什么根目录的 package.json 是空的？
A: 根据 workspace hygiene 原则，运行时依赖应该只在实际使用它们的包中声明。根目录仅保留仓库级工具依赖（如 linter、commit hooks）。

### Q: CI 构建时应该安装哪个目录的依赖？
A: 应该安装后端包的依赖：
```bash
npm install --workspace bookworm-backend
```

### Q: 如何验证依赖正确性？
A: 运行构建和测试：
```bash
cd bookworm-backend
npm run build  # 应该成功
npm test       # 应该全部通过
npm run test:integration  # 应该全部通过
```

## 技术细节

### 修复的类型问题
在依赖迁移过程中，修复了 `src/db/transaction.ts` 中的 Prisma 类型引用问题：
- **原问题**: `Prisma.TransactionOptions` 类型不存在
- **解决方案**: 使用显式接口定义 `{ maxWait?: number; timeout?: number }`

### 测试状态
- **单元测试**: 48/48 通过 ✓
- **集成测试**: 116/116 通过 ✓ (1 个 flaky test 在重试后通过)
- **构建**: 成功 ✓

## 迁移清单

- [x] 从根 `package.json` 移除 4 个运行时依赖
- [x] 从根 `package.json` 移除 1 个类型定义依赖
- [x] 在 `bookworm-backend/package.json` 中将 `@types/jsonwebtoken` 移至 devDependencies
- [x] 重新安装所有依赖
- [x] 验证构建通过
- [x] 验证测试通过
- [x] 修复 Prisma 类型引用问题

## 下一步行动

1. 更新 CI/CD 配置文件（如有）以使用新的构建指令
2. 根据需要在根目录添加仓库级工具依赖（eslint, prettier等）
3. 提交 package.json 和 package-lock.json 的变更
