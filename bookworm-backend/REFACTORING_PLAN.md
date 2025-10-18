# 订单服务重构计划 (Order Service Refactoring Plan)

## 执行摘要 (Executive Summary)

**目标**: 将 `src/services/purchaseOrderService.ts` (1040行) 拆分为职责单一的模块，同时保持向后兼容。

**策略**: "Never break userspace" - 保留原文件作为兼容层，所有现有导入路径继续工作。

**风险等级**: 🟡 中等（支付回调幂等性、事务边界、并发控制是关键风险点）

---

## 当前状态分析 (Current State Analysis)

### 文件结构
```
purchaseOrderService.ts (1040 lines)
├── 纯函数工具 (27 lines)
│   ├── formatCentsToYuanString()
│   └── generateUniquePickupCode()
├── 订单创建 (231 lines)
│   ├── createOrder()
│   ├── createOrderImpl()
│   ├── validateOrderInput()
│   ├── acquireOrderLocks()
│   ├── validateInventoryAndReservations()
│   ├── createOrderRecord()
│   ├── reserveInventoryItems()
│   └── createOrderItems()
├── 支付处理 (226 lines)
│   ├── preparePaymentIntent()
│   ├── buildWechatPaymentRequest()
│   ├── buildClientPaymentSignature()
│   ├── generatePaymentParams()
│   └── processPaymentNotification() [CRITICAL - 幂等性核心]
├── 订单查询 (138 lines)
│   ├── getOrdersByUserId()
│   ├── getOrderById()
│   └── getPendingPickupOrders()
├── 订单履约 (80 lines)
│   ├── fulfillOrder()
│   └── fulfillOrderImpl()
├── 状态管理 (121 lines)
│   ├── updateOrderStatus()
│   └── updateOrderStatusImpl()
└── 定时任务 (54 lines)
    └── cancelExpiredOrders()
```

### 外部依赖点 (Import Dependencies)

| 导入方 | 导入函数 | 用途 |
|--------|---------|------|
| `routes/orders.ts` | `createOrder`, `getOrdersByUserId`, `getOrderById`, `fulfillOrder`, `getPendingPickupOrders`, `updateOrderStatus`, `formatCentsToYuanString` | 订单路由 |
| `routes/payment.ts` | `buildClientPaymentSignature`, `buildWechatPaymentRequest`, `preparePaymentIntent`, `processPaymentNotification` | 支付路由 |
| `routes/sellOrders.ts` | `createAndCompleteSellOrder` | ⚠️ **不在当前文件中** |
| `jobs/cancelExpiredOrders.ts` | `cancelExpiredOrders` | 定时任务 |

---

## 目标架构 (Target Architecture)

### 新目录结构
```
src/
├── domain/
│   └── orders/
│       └── utils.ts              # 纯函数工具
├── services/
│   └── orders/
│       ├── index.ts              # 统一导出（新）
│       ├── queries.ts            # 查询模块（新）
│       ├── create.ts             # 建单模块（新）
│       ├── payments.ts           # 支付模块（新）
│       ├── fulfill.ts            # 履约模块（新）
│       ├── management.ts         # 状态管理（新）
│       └── scheduling.ts         # 调度任务（新）
└── services/
    └── purchaseOrderService.ts   # 兼容层（仅 export *）
```

### 模块拆分映射表

#### 1. `src/domain/orders/utils.ts` (纯函数，零依赖)
```typescript
export function formatCentsToYuanString(cents: number): string
export function generateUniquePickupCode(): Promise<string>
```
- **职责**: 纯计算逻辑，无副作用
- **依赖**: `crypto`, `config`
- **风险**: 🟢 无，纯函数最安全

#### 2. `src/services/orders/queries.ts` (只读查询)
```typescript
export async function getOrdersByUserId(dbCtx, userId, options)
export async function getOrderById(dbCtx, orderId, userId)
export async function getPendingPickupOrders(dbCtx)
```
- **职责**: 所有查询操作，无写入
- **依赖**: `db/views/orderView`, `db/views/inventoryView`
- **风险**: 🟢 低，只读操作无副作用

#### 3. `src/services/orders/create.ts` (建单核心)
```typescript
// 公开接口
export async function createOrder(dbCtx, input)

// 内部辅助函数（不导出）
async function createOrderImpl(tx, input)
async function validateOrderInput(input)
async function acquireOrderLocks(tx, userId, itemIds)
async function validateInventoryAndReservations(tx, userId, itemIds)
async function createOrderRecord(tx, userId, totalAmountCents)
async function reserveInventoryItems(tx, orderId, itemIds)
async function createOrderItems(tx, orderId, items)
```
- **职责**: 订单创建全流程
- **依赖**: `domain/orders/utils` (generateUniquePickupCode), `db/transaction`
- **风险**: 🟡 中，涉及咨询锁和事务重试

#### 4. `src/services/orders/payments.ts` (支付核心)
```typescript
// 数据结构
export interface PaymentIntentContext { ... }
interface PaymentNotificationData { ... }

// 公开接口
export async function preparePaymentIntent(prisma, orderId, userId)
export function buildWechatPaymentRequest(intent)
export function buildClientPaymentSignature(intent, prepayId, wechatPayAdapter)
export async function generatePaymentParams(prisma, wechatPayAdapter, orderId, userId)
export async function processPaymentNotification(dbCtx, wechatPayAdapter, notificationData) // CRITICAL
```
- **职责**: 支付预下单、回调处理、幂等保证
- **依赖**: `adapters/wechatPayAdapter`, `utils/retry`
- **风险**: 🔴 **高**
  - `processPaymentNotification` 包含复杂的幂等逻辑
  - 涉及原子更新（updateMany）和退款标记
  - 重放攻击防护（timestamp validation）
  - 必须保证状态机不变

#### 5. `src/services/orders/fulfill.ts` (履约核心)
```typescript
export async function fulfillOrder(dbCtx, pickupCode)
async function fulfillOrderImpl(tx, pickupCode)
```
- **职责**: 订单核销（取货完成）
- **依赖**: 无
- **风险**: 🟡 中，使用 updateMany 原子更新

#### 6. `src/services/orders/management.ts` (状态管理)
```typescript
export async function updateOrderStatus(dbCtx, orderId, newStatus, user)
async function updateOrderStatusImpl(tx, orderId, newStatus, user)
```
- **职责**: 订单状态转换（COMPLETED/CANCELLED）
- **依赖**: 无
- **风险**: 🟡 中，涉及库存释放和退款标记

#### 7. `src/services/orders/scheduling.ts` (后台任务)
```typescript
export async function cancelExpiredOrders(dbCtx)
```
- **职责**: 定时取消过期订单
- **依赖**: 无
- **风险**: 🟢 低，CTE原子操作

#### 8. `src/services/orders/index.ts` (统一出口)
```typescript
// 从各模块重新导出
export * from './queries';
export * from './create';
export * from './payments';
export * from './fulfill';
export * from './management';
export * from './scheduling';

// 从 domain 重新导出工具函数
export { formatCentsToYuanString, generateUniquePickupCode } from '../../domain/orders/utils';
```
- **职责**: 提供单一导入入口
- **风险**: 🟢 无

#### 9. `src/services/purchaseOrderService.ts` (兼容层)
```typescript
// "Never break userspace" - 保持所有现有导入路径工作
export * from './orders/index';
```
- **职责**: 向后兼容旧导入路径
- **风险**: 🟢 无

---

## 关键风险点分析 (Critical Risk Analysis)

### 🔴 风险1: 支付回调幂等性破坏
**位置**: `processPaymentNotification()` in `payments.ts`

**问题**:
- 该函数包含3个阶段：安全验证 → 外部查询 → 原子更新
- 使用 `updateMany` + count 检查来保证幂等
- 涉及 `executeInTransaction` 辅助函数（需要一同迁移）
- 涉及 `markPaymentAsFailed` 辅助函数（需要一同迁移）

**缓解措施**:
1. 整块迁移所有辅助函数到 `payments.ts`
2. 确保 `executeInTransaction` 逻辑不变（检查 `$transaction` in dbCtx）
3. 创建契约测试验证以下场景：
   - 重复回调幂等性
   - 订单已取消时的退款标记
   - 时间戳验证（未来时间、过期时间）
   - 签名验证失败

### 🟡 风险2: 事务边界变化
**位置**: 所有 `*Impl` 函数

**问题**:
- 所有 `*Impl` 函数接受 `Prisma.TransactionClient`
- 公开函数检查 `'$connect' in dbCtx` 来决定是否创建新事务
- 如果拆分时导入关系错误，可能导致事务嵌套

**缓解措施**:
1. 所有 `*Impl` 函数保持为 `async function`（非 export）
2. 公开函数统一模式：
```typescript
export async function xxx(dbCtx: PrismaClient | Prisma.TransactionClient, ...) {
  if ('$connect' in dbCtx) {
    return (dbCtx as PrismaClient).$transaction((tx) => xxxImpl(tx, ...));
  }
  return xxxImpl(dbCtx as Prisma.TransactionClient, ...);
}
```

### 🟡 风险3: 咨询锁顺序
**位置**: `acquireOrderLocks()` in `create.ts`

**问题**:
- 使用 PostgreSQL advisory locks 防止死锁
- 必须保持锁获取顺序：用户级锁 → 商品级锁（排序后）
- 锁的 namespace 编码（1 = user, 2 = item）

**缓解措施**:
1. 保持 `acquireOrderLocks` 函数完整不变
2. 添加注释说明锁顺序的重要性

### 🟢 风险4: 导入循环依赖
**位置**: `orders/index.ts` 和各模块

**问题**:
- 如果模块间相互导入可能形成循环

**缓解措施**:
- 严格单向依赖：`utils` ← `各模块` ← `index.ts`
- 禁止模块间相互导入
- 共享类型放在单独的 `types.ts`（如 `PaymentIntentContext`）

---

## 执行步骤 (Execution Steps)

### Phase 0: 准备（保护性测试）
```bash
# 1. 创建契约测试保护现有行为
bookworm-backend/tests/contract/orders/
├── create.contract.test.ts         # createOrder 端到端测试
├── payments.contract.test.ts       # 支付回调幂等性测试
└── lifecycle.contract.test.ts      # 完整生命周期测试

# 2. 运行现有测试确保基线
npm run test:integration
```

### Phase 1: 提取纯函数（最安全）
```bash
# 1. 创建 src/domain/orders/utils.ts
# 2. 迁移 formatCentsToYuanString, generateUniquePickupCode
# 3. 运行测试
```

### Phase 2: 拆分查询模块（只读，安全）
```bash
# 1. 创建 src/services/orders/queries.ts
# 2. 迁移 getOrdersByUserId, getOrderById, getPendingPickupOrders
# 3. 运行测试
```

### Phase 3: 拆分建单模块（涉及锁）
```bash
# 1. 创建 src/services/orders/create.ts
# 2. 迁移 createOrder + 所有内部辅助函数
# 3. 从 domain/orders/utils 导入 generateUniquePickupCode
# 4. 运行测试（重点关注并发测试）
```

### Phase 4: 拆分支付模块（高风险）
```bash
# 1. 创建 src/services/orders/payments.ts
# 2. 迁移所有支付函数（包括辅助函数 executeInTransaction, markPaymentAsFailed）
# 3. 运行契约测试（payments.contract.test.ts）
# 4. 验证幂等性逻辑未变化
```

### Phase 5: 拆分履约和管理模块
```bash
# 1. 创建 src/services/orders/fulfill.ts
# 2. 创建 src/services/orders/management.ts
# 3. 运行测试
```

### Phase 6: 拆分调度模块
```bash
# 1. 创建 src/services/orders/scheduling.ts
# 2. 迁移 cancelExpiredOrders
# 3. 运行测试
```

### Phase 7: 创建统一导出和兼容层
```bash
# 1. 创建 src/services/orders/index.ts
# 2. 改造 purchaseOrderService.ts 为 `export * from './orders/index'`
# 3. 验证所有路由导入仍然工作
# 4. 运行全量测试
```

### Phase 8: 清理和文档
```bash
# 1. 更新 CHANGELOG.md
# 2. 更新 CLAUDE.md 中的架构说明
# 3. 删除不必要的注释
```

---

## 回滚策略 (Rollback Strategy)

### 即时回滚（任何阶段失败）
```bash
# 1. 使用 git 恢复原文件
git checkout HEAD -- src/services/purchaseOrderService.ts

# 2. 删除新创建的文件
rm -rf src/services/orders
rm -rf src/domain/orders
rm -rf tests/contract/orders

# 3. 验证测试通过
npm run test:integration
```

### 部分回滚（某个模块有问题）
```bash
# 例如：支付模块有问题
# 1. 将该模块的代码复制回 purchaseOrderService.ts
# 2. 从 orders/index.ts 中移除该模块的导出
# 3. 直接从 purchaseOrderService.ts 导出该函数
```

---

## 验收标准 (Acceptance Criteria)

### 功能验收
- [ ] 所有现有集成测试 100% 通过
- [ ] 新增契约测试覆盖关键路径：
  - [ ] 订单创建 → 支付 → 履约 完整流程
  - [ ] 支付回调幂等性（重复调用同一结果）
  - [ ] 并发建单不超过预留上限
  - [ ] 过期订单自动取消释放库存
  - [ ] 订单取消后支付到账触发退款标记

### 代码质量验收
- [ ] 每个新模块不超过 300 行
- [ ] 没有循环依赖（`madge --circular src/services/orders` 通过）
- [ ] TypeScript 编译无警告
- [ ] ESLint 无错误

### 兼容性验收
- [ ] 所有路由文件无需修改导入路径
- [ ] 所有 jobs 文件无需修改导入路径
- [ ] `import * from 'services/purchaseOrderService'` 仍然工作

---

## 时间估算 (Time Estimation)

| 阶段 | 预计时间 | 风险缓冲 |
|------|---------|---------|
| Phase 0: 契约测试 | 2h | +1h |
| Phase 1: 纯函数 | 0.5h | +0.5h |
| Phase 2: 查询模块 | 1h | +0.5h |
| Phase 3: 建单模块 | 2h | +1h |
| Phase 4: 支付模块 | 3h | +2h（高风险） |
| Phase 5-6: 其他模块 | 2h | +1h |
| Phase 7: 导出层 | 1h | +0.5h |
| Phase 8: 文档 | 1h | - |
| **总计** | **12.5h** | **+6.5h (缓冲)** |

---

## 依赖检查清单 (Dependency Checklist)

### 已存在的基础设施 ✅
- [x] `src/db/transaction.ts` - withTxRetry 已实现
- [x] `src/db/views/orderView.ts` - orderSelectPublic 已定义
- [x] `src/db/views/inventoryView.ts` - inventorySelectBasic 已定义
- [x] `src/utils/retry.ts` - retryAsync 已实现
- [x] `src/adapters/wechatPayAdapter.ts` - 支付适配器已封装

### 需要创建 📋
- [ ] `src/domain/orders/utils.ts`
- [ ] `src/services/orders/*.ts` (7个文件)
- [ ] `tests/contract/orders/*.test.ts` (3个测试文件)

---

## 后续优化建议 (Future Improvements)

1. **日志注入**: 将 `console.log/error` 替换为 Fastify logger（通过依赖注入）
2. **类型提取**: 将 `PaymentIntentContext` 等类型移到 `src/types/orders.ts`
3. **度量优化**: 将 `metrics` 调用集中到装饰器或中间件
4. **测试隔离**: 将测试辅助函数从 `globalSetup.ts` 移到专门的 test utils

---

## 签名 (Sign-off)

**计划创建日期**: 2025-10-18
**批准状态**: 待审核
**执行者**: Claude Code (AI Assistant)
**审核者**: 项目负责人

---

**Linus 评论**:
> "这个计划遵循了'好品味'原则：一次只做一件事，每个模块职责清晰。支付模块的幂等性是关键，必须保证原子更新逻辑不变。记住：测试是唯一的真相，契约测试必须先行。Never break userspace."
