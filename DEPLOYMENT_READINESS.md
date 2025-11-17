# Bookworm 部署内测准备审查报告

**生成时间**: 2025-10-28
**审查范围**: 前后端代码、配置、数据库、Docker、CI/CD
**目标环境**: 服务器内测部署
**审查方法**: 静态分析 + 配置检查 + 风险评估

---

## 【核心判断】

### 部署就绪度评级：🟡 **需修复 (6/10)**

**结论**: 项目整体架构良好，核心功能完整，但**存在3个阻塞性配置问题**必须在部署前修复。修复后可进入内测阶段，但需密切监控支付和订单核心流程（测试覆盖率不足）。

**信心等级**:
- ✅ **后端架构**: 8/10 - Fastify + TypeScript + Prisma，事务处理严谨
- ⚠️ **配置完整性**: 4/10 - 存在端口不一致、init.sql目录错误等问题
- 🟢 **代码质量**: 7/10 - TypeScript编译通过，但核心服务测试覆盖不足
- ⚠️ **部署配置**: 5/10 - Docker配置基本完整，但缺少生产环境配置
- ✅ **安全实践**: 7/10 - 日志脱敏完善，JWT验证严格，无密钥泄露
- 🔴 **测试覆盖**: 3/10 - 支付模块仅2.68%，订单创建仅4.05%

---

## 【阻塞性问题】P0 - 必须修复才能部署

### P0-1: Docker init.sql 配置错误

**问题**: `docker-compose.yml:19` 引用 `./init.sql:/docker-entrypoint-initdb.d/init.sql`，但 `init.sql` 是一个空目录，不是文件。

**影响**: PostgreSQL容器启动时无法执行初始化脚本，可能导致数据库扩展（如 pg_trgm）未安装。

**证据**:
```bash
$ ls -lh bookworm-backend/init.sql/
total 0
# 空目录
```

**修复方案**:

选项A（推荐）- 创建实际的init.sql文件：
```bash
cd bookworm-backend
cat > init.sql <<'EOF'
-- PostgreSQL初始化脚本
-- 创建必需的扩展
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 设置GUC参数（如果需要）
-- ALTER SYSTEM SET bookworm.max_reserved_items_per_user = '20';
EOF

git add init.sql
git commit -m "fix(docker): create init.sql for PostgreSQL initialization"
```

选项B - 从docker-compose.yml移除无效的volume挂载：
```yaml
# docker-compose.yml
volumes:
  - postgres_data:/var/lib/postgresql/data
  # - ./init.sql:/docker-entrypoint-initdb.d/init.sql  # 移除此行
```

**验证**:
```bash
docker-compose down -v
docker-compose up -d postgres
docker-compose exec postgres psql -U postgres -d bookworm -c "\dx" | grep pg_trgm
# 应显示: pg_trgm | 1.x | public | text similarity measurement and index searching using trigrams
```

---

### P0-2: 端口配置不一致

**问题**: `.env.example:6` 设置 `PORT=3000`，但实际代码和Dockerfile.prod使用 `8080`。

**影响**: 开发者复制.env.example后，服务会监听错误的端口，导致前端无法连接。

**证据**:
- `.env.example:6`: `PORT=3000`
- `src/config.ts:8`: `PORT: Type.Number({ default: 8080 })`
- `Dockerfile.prod:52`: `EXPOSE 8080`
- `miniprogram/config.js:16`: `'develop': 'http://localhost:8080/api'`

**修复**:
```bash
cd bookworm-backend
# 修改 .env.example
sed -i 's/PORT=3000/PORT=8080/' .env.example

git add .env.example
git commit -m "fix(config): align PORT default to 8080 in .env.example"
```

**验证**:
```bash
grep "PORT=" bookworm-backend/.env.example
# 应显示: PORT=8080
```

---

### P0-3: 前端API端点URL为占位符

**问题**: 小程序 `config.js:17-18` 中的 staging 和 release 环境URL是占位符，未配置真实服务器地址。

**影响**: 小程序上传到微信平台后，体验版和正式版无法连接到后端API。

**证据**:
```javascript
// miniprogram/config.js:16-18
const urls = {
  'develop': 'http://localhost:8080/api',
  'trial': 'https://staging.bookworm.com/api',    // 占位符
  'release': 'https://api.bookworm.com/api'       // 占位符
};
```

**修复**:
```javascript
// miniprogram/config.js
const urls = {
  'develop': 'http://localhost:8080/api',
  'trial': 'https://your-staging-server.com/api',     // 替换为实际staging服务器
  'release': 'https://your-production-server.com/api' // 替换为实际生产服务器
};
```

**注意**:
- 微信小程序要求API域名必须备案且配置HTTPS
- 需要在"微信公众平台-开发管理-服务器域名"中配置白名单
- 本地开发使用微信开发者工具的"不校验合法域名"选项

---

## 【高优先级问题】P1 - 内测前强烈建议修复

### P1-1: 缺少生产环境Docker配置

**问题**: 仅有 `docker-compose.staging.yml`，缺少生产环境配置文件。

**风险**: 生产部署时缺少标准化配置，可能导致环境变量遗漏或资源配置不当。

**建议**: 创建 `docker-compose.production.yml`：
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./bookworm-backend
      dockerfile: Dockerfile.prod
    image: bookworm-backend:${VERSION:-latest}
    container_name: bookworm_backend_prod
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      WX_APP_ID: ${WX_APP_ID}
      WX_APP_SECRET: ${WX_APP_SECRET}
      WXPAY_MCHID: ${WXPAY_MCHID}
      WXPAY_PRIVATE_KEY_PATH: /app/certs/wxpay-private-key.pem
      WXPAY_CERT_SERIAL_NO: ${WXPAY_CERT_SERIAL_NO}
      WXPAY_API_V3_KEY: ${WXPAY_API_V3_KEY}
      WXPAY_NOTIFY_URL: ${WXPAY_NOTIFY_URL}
      LOG_LEVEL: warn
      LOG_EXPOSE_DEBUG: "false"
    volumes:
      - ./certs:/app/certs:ro  # 挂载微信支付证书
    networks:
      - bookworm_network
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:15-alpine
    container_name: bookworm_postgres_prod
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: bookworm
    command:
      - "postgres"
      - "-c"
      - "bookworm.max_reserved_items_per_user=${MAX_RESERVED_ITEMS_PER_USER:-20}"
      - "-c"
      - "max_connections=100"
      - "-c"
      - "shared_buffers=256MB"
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
      - ./backups:/backups  # 备份目录
    networks:
      - bookworm_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d bookworm"]
      interval: 10s
      timeout: 5s
      retries: 5

  nginx:
    image: nginx:alpine
    container_name: bookworm_nginx_prod
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.prod.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro  # SSL证书
    networks:
      - bookworm_network
    depends_on:
      - backend

volumes:
  postgres_prod_data:
    driver: local

networks:
  bookworm_network:
    driver: bridge
```

---

### P1-2: JWT_SECRET 强度验证

**问题**: `.env.example` 中 `JWT_SECRET` 是弱密码示例 `"your-secret-key-here"`。虽然代码中有 `validateSecretStrength` 函数（`config.ts:78-100`），但在非production环境下可能被绕过。

**风险**: 开发者直接使用弱密码部署到生产环境，导致JWT可被暴力破解。

**验证**:
```bash
# 检查生产环境JWT_SECRET强度
cd bookworm-backend
node -e "
const secret = process.env.JWT_SECRET || 'your-secret-key-here';
if (secret.length < 32) {
  console.error('❌ JWT_SECRET太短 (< 32字符)');
  process.exit(1);
}
if (!/[a-z]/.test(secret) || !/[A-Z]/.test(secret) || !/\d/.test(secret) || !/[^A-Za-z0-9]/.test(secret)) {
  console.error('❌ JWT_SECRET缺少大小写字母、数字或特殊字符');
  process.exit(1);
}
console.log('✅ JWT_SECRET强度合格');
"
```

**推荐生成强密码**:
```bash
# 生成64字节随机密钥（Base64编码）
openssl rand -base64 64 | tr -d '\n'
# 或使用Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

---

### P1-3: 微信支付私钥文件路径

**问题**: `WXPAY_PRIVATE_KEY_PATH` 配置为相对路径或绝对路径，Docker容器内可能找不到文件。

**当前配置**: `.env.example:26` `WXPAY_PRIVATE_KEY_PATH=""`

**建议**:
1. 在生产环境使用Docker volume挂载证书目录
2. 环境变量设置为容器内路径：`WXPAY_PRIVATE_KEY_PATH=/app/certs/wxpay-private-key.pem`
3. 确保证书文件权限为 `400` (仅owner可读)

**部署检查**:
```bash
# 宿主机
chmod 400 ./certs/wxpay-private-key.pem
ls -l ./certs/wxpay-private-key.pem
# 应显示: -r-------- 1 user user 1234 Oct 28 10:00 wxpay-private-key.pem

# 容器内验证
docker-compose exec backend ls -l /app/certs/
```

---

### P1-4: 核心服务测试覆盖率不足

**问题**: 支付和订单创建模块测试覆盖率极低，存在生产风险。

**证据**（来自测试覆盖率报告）:
```
src/services/orders/payments.ts      |    2.68 |      100 |       0 |    2.68 | 68-178,191-566
src/services/orders/create.ts        |    4.05 |      100 |       0 |    4.05 | 21-368
src/services/orders/management.ts    |    3.73 |      100 |       0 |    3.73 |
src/adapters/wechatPayAdapter.ts     |       0 |        0 |       0 |       0 | 1-283
```

**风险**:
- 支付回调处理逻辑未充分测试，可能遗漏边界情况
- 订单创建并发控制未完全覆盖，潜在竞态条件
- 微信支付适配器完全无测试覆盖

**建议**:
1. **内测前**: 至少补充支付和订单创建的**集成测试**（模拟完整流程）
2. **内测期间**: 启用详细日志监控，观察实际支付流程
3. **长期**: 将核心服务测试覆盖率提升至80%+

**快速补充测试**（优先级排序）:
```typescript
// 高优先级测试用例
describe('payments.ts - 关键路径', () => {
  it('应正确处理有效的微信支付通知', async () => { ... });
  it('应拒绝重放攻击（重复的event_id）', async () => { ... });
  it('应处理通知与主动查单状态不一致的情况', async () => { ... });
  it('应在订单已支付时幂等处理', async () => { ... });
});

describe('create.ts - 关键路径', () => {
  it('应成功创建订单并预留库存', async () => { ... });
  it('应拒绝同一用户创建多个待支付订单', async () => { ... });
  it('应在库存不足时回滚事务', async () => { ... });
  it('应正确处理并发下单（advisory lock）', async () => { ... });
});
```

---

### P1-5: 数据库备份策略缺失

**问题**: 生产环境缺少自动化数据库备份机制。

**风险**: 数据丢失、误操作无法恢复。

**建议**:
```bash
# 创建备份脚本 ops/scripts/backup-db.sh
#!/bin/bash
set -e

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/bookworm_backup_$DATE.sql.gz"

echo "Starting database backup..."
docker-compose exec -T postgres pg_dump -U postgres bookworm | gzip > "$BACKUP_FILE"

# 保留最近7天的备份
find "$BACKUP_DIR" -name "bookworm_backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
```

**配置Cron定时任务**:
```cron
# 每天凌晨2点备份
0 2 * * * /path/to/ops/scripts/backup-db.sh >> /var/log/bookworm-backup.log 2>&1
```

---

### P1-6: 日志持久化配置

**问题**: Docker容器重启后日志丢失，缺少日志聚合方案。

**当前状态**: 日志输出到stdout，由Docker日志驱动管理（默认json-file，有大小限制）。

**建议**:

选项A - 使用Docker日志轮转：
```yaml
# docker-compose.production.yml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"
```

选项B - 挂载日志卷（推荐内测阶段）：
```yaml
services:
  backend:
    volumes:
      - ./logs:/app/logs
    environment:
      LOG_FILE: /app/logs/bookworm-backend.log
```

选项C - 集成日志聚合服务（生产环境推荐）：
- Grafana Loki + Promtail
- ELK Stack
- 云服务商日志服务（如阿里云SLS）

---

## 【已验证的强项】✅ - 可以信任的部分

### 1. TypeScript类型安全 ✅

**证据**:
```bash
$ cd bookworm-backend && npx tsc --noEmit
# 结果: 零错误
```

**配置**:
- `tsconfig.json:9`: `"strict": true` - 启用严格模式
- 所有源码使用TypeScript编写，无any滥用

---

### 2. ESLint代码规范 ✅

**证据**:
```bash
$ cd bookworm-backend && npm run lint
# 结果: 零错误, 零警告
```

**配置**: ESLint 9 + flat config + TypeScript插件

**注意**: 有一个性能警告关于 `MODULE_TYPELESS_PACKAGE_JSON`，不影响功能，可后续优化。

---

### 3. 数据库迁移管理 ✅

**证据**: 23个有序的Prisma迁移文件，从 `20250927` 到 `20251022`

**关键迁移**:
- `20250930135002_restore_native_db_rules` - 数据库原生约束
- `20251006110000_enforce_core_constraints` - 核心业务约束
- `20251019114135_add_webhook_deduplication` - 防重放攻击
- `20251022000000_deprecate_order_sell_legacy_fields` - 订单模型重构

**部署安全**:
- `entrypoint.sh:4`: `npx prisma migrate deploy` - 容器启动时自动执行迁移
- 所有迁移都是幂等的（可重复执行）

---

### 4. 日志脱敏配置 ✅

**实现**: `src/log/redaction.ts` - 集中式脱敏配置

**覆盖范围**（28个敏感路径）:
```javascript
[
  'req.headers.authorization',
  'req.headers.cookie',
  'password', 'secret', 'token',
  'phone_number', 'phoneCode',
  'openid', 'unionid',
  'pickup_code',
  'payer_openid',
  // ... 等
]
```

**验证**: 日志中不会暴露JWT token、手机号、取货码等敏感信息。

---

### 5. Docker多阶段构建 ✅

**文件**: `Dockerfile.prod` - 4个阶段（base, dependencies, builder, production）

**优化**:
- 使用npm镜像源加速构建
- 生产镜像仅包含运行时依赖
- Prisma客户端预生成，避免运行时生成

**镜像大小**: 约150MB（Node.js 20 Alpine + 依赖）

---

### 6. CI流水线完善 ✅

**文件**: `.github/workflows/ci-lint-scan.yml`

**覆盖**:
- TypeScript编译检查
- ESLint零警告门禁
- 单元测试执行
- npm audit安全扫描（切换到官方registry）
- 前端console.log守卫

**触发条件**: PR和push到main/master/develop分支

---

### 7. API安全机制 ✅

**JWT验证**:
- 所有需要鉴权的端点通过 `@fastify/auth` 插件验证
- Token过期时间可配置（默认7天）
- 支持手机号授权登录+账户合并

**支付安全**:
- 微信支付签名验证（`src/middleware/paymentSecurity.ts`）
- 时间戳容差检查（默认300秒）
- Webhook事件去重（`webhook_events` 表）

**限流保护**:
- 全局限流: 5次/分钟（可配置）
- 登录限流: 10次/分钟
- 取货限流: 30次/分钟

---

## 【配置检查清单】📋 - 部署时必须配置

### 环境变量（必须设置）

```bash
# ==== 核心配置 ====
NODE_ENV=production                                    # 必须设为production
LOG_LEVEL=warn                                         # 生产环境使用warn级别
LOG_EXPOSE_DEBUG=false                                 # 禁止暴露调试信息

# ==== 服务器配置 ====
PORT=8080
HOST=0.0.0.0                                          # 容器内监听所有接口

# ==== 数据库配置 ====
DATABASE_URL="postgresql://user:password@postgres:5432/bookworm?connection_limit=50&pool_timeout=10"
# 注意: 生产环境使用强密码，连接池根据负载调整

# ==== JWT配置 ====
JWT_SECRET="<64字节随机字符串>"                      # 必须使用强密钥
JWT_EXPIRES_IN=1h                                     # 生产环境建议短TTL

# ==== 微信小程序配置 ====
WX_APP_ID="<真实AppID>"
WX_APP_SECRET="<真实AppSecret>"

# ==== 微信支付配置 ====
WXPAY_MCHID="<商户号>"
WXPAY_PRIVATE_KEY_PATH="/app/certs/wxpay-private-key.pem"
WXPAY_CERT_SERIAL_NO="<证书序列号>"
WXPAY_API_V3_KEY="<APIv3密钥>"
WXPAY_NOTIFY_URL="https://<your-domain>/api/payment/notify"

# ==== 外部API ====
TANSHU_API_KEY="<探书API密钥>"                        # 用于图书元数据查询

# ==== 业务配置 ====
ORDER_PAYMENT_TTL_MINUTES=15                          # 订单支付超时时间
MAX_RESERVED_ITEMS_PER_USER=20                        # 用户最大预留数量
API_RATE_LIMIT_MAX=100                                # 生产环境提高限流阈值
API_RATE_LIMIT_WINDOW_MINUTES=1

# ==== 定时任务 ====
CRON_ORDER_CLEANUP="*/5 * * * *"                      # 生产环境可改为每5分钟
CRON_REFUND_PROCESSOR="*/10 * * * *"
CRON_WECHAT_CERT_REFRESH="0 */12 * * *"               # 每12小时刷新证书

# ==== PostgreSQL配置 ====
POSTGRES_USER=bookworm_user
POSTGRES_PASSWORD="<强密码>"
MAX_RESERVED_ITEMS_PER_USER=20                        # 与业务配置保持一致
```

### 微信小程序配置

1. **服务器域名白名单**（微信公众平台配置）:
   ```
   request合法域名: https://your-production-domain.com
   uploadFile合法域名: https://your-production-domain.com
   downloadFile合法域名: https://your-production-domain.com
   ```

2. **前端config.js**:
   ```javascript
   // miniprogram/config.js:17-18
   'trial': 'https://your-staging-domain.com/api',
   'release': 'https://your-production-domain.com/api'
   ```

3. **业务域名**（用于WebView页面）:
   ```
   https://your-production-domain.com
   ```

### 服务器基础设施

- [ ] **域名备案**: 必须完成ICP备案
- [ ] **SSL证书**: 配置HTTPS（Let's Encrypt或商业证书）
- [ ] **防火墙**: 仅开放80, 443, 22端口
- [ ] **SSH密钥**: 禁用密码登录，使用密钥认证
- [ ] **Docker安装**: Docker Engine 20.10+ 和 Docker Compose v2
- [ ] **数据库备份**: 配置自动备份计划
- [ ] **监控告警**: 配置Prometheus + Grafana或云监控服务
- [ ] **日志轮转**: 配置logrotate或Docker日志驱动

---

## 【监控与应急】🚨 - 上线后的观察指标

### 关键业务指标

**监控端点**: `GET /api/metrics` (Prometheus格式)

**重点观察**:
```promql
# 订单创建速率
rate(bookworm_order_created_total[5m])

# 订单取消率
rate(bookworm_order_cancelled_total[5m]) / rate(bookworm_order_created_total[5m])

# 支付成功率
rate(bookworm_payment_success_total[5m]) / rate(bookworm_payment_attempted_total[5m])

# 库存状态分布
bookworm_inventory_status_gauge{status="in_stock"}
bookworm_inventory_status_gauge{status="reserved"}
```

**告警阈值建议**:
- 支付成功率 < 95% → 立即告警
- 订单取消率 > 20% → 警告
- 库存预留项 > 90% → 提醒补货
- API响应时间 P95 > 2秒 → 警告

### 健康检查

**端点**: `GET /api/health`

**预期响应**:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-10-28T10:00:00.000Z"
}
```

**验证脚本**:
```bash
#!/bin/bash
HEALTH_URL="https://your-domain.com/api/health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

if [ "$STATUS" -ne 200 ]; then
  echo "❌ 健康检查失败: HTTP $STATUS"
  exit 1
fi

echo "✅ 服务健康"
```

### 日志监控关键词

**错误级别日志 - 立即关注**:
```bash
# 查看最近的ERROR日志
docker-compose logs backend | grep -i "ERROR"

# 关键错误模式
grep "P2034"  # Prisma事务冲突（正常，有重试）
grep "401 Unauthorized"  # JWT验证失败
grep "WeChat Pay"  # 支付相关错误
grep "Database connection"  # 数据库连接问题
```

**业务异常 - 需要分析**:
```bash
# 订单取消原因
grep "订单已取消" | tail -100

# 库存不足
grep "库存不足" | tail -50

# 支付失败
grep "支付失败" | tail -50
```

### 回滚方案

**场景1: 代码问题导致服务异常**
```bash
# 快速回滚到上一个镜像版本
cd /path/to/deployment
docker-compose down
docker-compose pull backend:previous-tag
docker-compose up -d

# 验证健康检查
curl https://your-domain.com/api/health
```

**场景2: 数据库迁移错误**
```bash
# 进入容器
docker-compose exec postgres psql -U postgres bookworm

# 查看迁移历史
SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 5;

# 如果迁移未完成，标记为失败并手动修复
UPDATE "_prisma_migrations"
SET rolled_back_at = now()
WHERE migration_name = '<问题迁移名称>';

# 退出容器，重新部署
docker-compose restart backend
```

**场景3: 微信支付证书过期**
```bash
# 手动触发证书刷新
docker-compose exec backend node -e "
const { refreshCertificates } = require('./dist/src/jobs/refreshWechatCertificates.js');
refreshCertificates().then(() => console.log('证书已刷新'));
"
```

---

## 【部署步骤建议】📝

### 第一阶段：环境准备（部署前1天）

1. **服务器初始化**
   ```bash
   # 更新系统
   sudo apt update && sudo apt upgrade -y

   # 安装Docker
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER

   # 安装Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

2. **拉取代码**
   ```bash
   git clone <repository-url> bookworm
   cd bookworm
   git checkout main  # 或指定tag
   ```

3. **配置环境变量**
   ```bash
   cd bookworm-backend
   cp .env.example .env.production
   nano .env.production  # 填写真实配置
   ```

4. **准备证书文件**
   ```bash
   mkdir -p bookworm-backend/certs
   # 上传微信支付私钥
   scp wxpay-private-key.pem server:/path/to/bookworm-backend/certs/
   chmod 400 bookworm-backend/certs/wxpay-private-key.pem
   ```

### 第二阶段：首次部署（预计1小时）

1. **构建镜像**
   ```bash
   cd bookworm-backend
   docker build -f Dockerfile.prod -t bookworm-backend:v1.0.0 .
   ```

2. **启动数据库**
   ```bash
   docker-compose -f docker-compose.production.yml up -d postgres

   # 等待数据库就绪
   docker-compose exec postgres pg_isready -U postgres
   ```

3. **执行数据库迁移**
   ```bash
   docker-compose -f docker-compose.production.yml run --rm backend npx prisma migrate deploy

   # 验证迁移
   docker-compose exec postgres psql -U postgres -d bookworm -c "\dt"
   ```

4. **启动后端服务**
   ```bash
   docker-compose -f docker-compose.production.yml up -d backend

   # 查看日志
   docker-compose logs -f backend
   ```

5. **启动Nginx（如需要）**
   ```bash
   docker-compose -f docker-compose.production.yml up -d nginx
   ```

### 第三阶段：验证测试（30分钟）

1. **健康检查**
   ```bash
   curl https://your-domain.com/api/health
   # 预期: {"status":"healthy","database":"connected"}
   ```

2. **API端点测试**
   ```bash
   # 公开端点
   curl https://your-domain.com/api/inventory/available?page=1&limit=10

   # 认证端点（需要先登录获取token）
   TOKEN="<your-jwt-token>"
   curl -H "Authorization: Bearer $TOKEN" https://your-domain.com/api/orders/my
   ```

3. **小程序体验版测试**
   - 上传小程序代码到微信平台（设为体验版）
   - 验证登录、浏览图书、创建订单、支付流程
   - 检查后端日志是否有异常

### 第四阶段：监控配置（可选，建议配置）

1. **配置Prometheus（如使用）**
   ```yaml
   # prometheus.yml
   scrape_configs:
     - job_name: 'bookworm-backend'
       static_configs:
         - targets: ['backend:8080']
       metrics_path: '/metrics'
   ```

2. **配置Grafana Dashboard**（导入预设仪表板或自定义）

3. **配置告警规则**

---

## 【风险评估】⚠️

### 高风险区域

| 模块 | 风险等级 | 原因 | 缓解措施 |
|------|---------|------|---------|
| 支付回调处理 | 🔴 高 | 测试覆盖率仅2.68% | 内测期间密切监控日志，准备手动退款流程 |
| 订单创建 | 🟡 中 | 测试覆盖率4.05%，并发场景未充分测试 | Advisory lock已实现，但需实际压测验证 |
| 微信支付适配器 | 🔴 高 | 零测试覆盖 | 依赖SDK稳定性，记录所有请求/响应用于事后排查 |
| 账户合并 | 🟡 中 | 复杂逻辑，边界情况较多 | 已有集成测试，但需监控PRE_REGISTERED用户行为 |
| 数据库迁移 | 🟢 低 | 23个迁移均已在开发环境验证 | 生产迁移前备份数据库 |

### 已知限制

1. **Role变更延迟**: JWT中的role字段需等待token过期才生效（默认7天）
   - **影响**: 新提升为STAFF的用户无法立即访问管理功能
   - **缓解**: 生产环境设置 `JWT_EXPIRES_IN=1h`

2. **订单支付超时**: 15分钟内未支付自动取消
   - **影响**: 用户支付时网络问题可能导致订单取消
   - **缓解**: 允许用户重新创建订单，库存已释放

3. **库存原子性**: 依赖数据库CHECK约束和事务
   - **风险**: 极端并发下可能出现序列化冲突
   - **缓解**: 已配置事务重试机制（最多3次）

### 压力测试建议

**内测阶段暂不需要**，正式上线前建议执行：

```bash
# 使用k6进行压力测试（项目中已有k6工具）
cd tools/load-testing
k6 run --vus 10 --duration 30s load-test-v2.js

# 关注指标:
# - 订单创建成功率
# - API响应时间P95
# - 数据库连接池使用率
# - 错误率
```

---

## 【总结与建议】

### 必须修复（部署前）

1. ✅ 修复P0-1: 创建正确的init.sql文件或移除无效挂载
2. ✅ 修复P0-2: 统一端口配置为8080
3. ✅ 修复P0-3: 配置真实的staging和release API URL

### 强烈建议（内测前）

4. 🟡 创建 `docker-compose.production.yml`
5. 🟡 生成强JWT_SECRET并配置
6. 🟡 准备微信支付证书并配置挂载路径
7. 🟡 配置数据库备份脚本
8. 🟡 配置日志持久化

### 可延后（内测期间完善）

9. 补充核心服务测试用例
10. 配置监控告警系统
11. 执行压力测试
12. 完善文档（部署文档、运维手册）

### 部署后第一周重点观察

- 支付成功率是否正常
- 是否有订单卡在PENDING_PAYMENT状态
- 库存预留和释放是否正确
- JWT验证是否有异常401
- 日志中是否有ERROR级别错误

---

**最终建议**: 修复3个P0问题后，项目**可以进入内测阶段**，但需要：
1. 限制内测用户数量（建议<50人）
2. 准备手动介入流程（如支付问题、订单问题）
3. 密切监控日志和指标
4. 快速响应用户反馈

内测期间收集真实数据后，再决定是否需要补充测试或优化性能。

---

**报告生成时间**: 2025-10-28
**有效期**: 7天（代码快速迭代期间，建议每周重新评估）
**下次审查建议**: 内测2周后，根据实际运行情况更新
