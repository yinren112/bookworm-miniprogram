# Refactoring Log

## Order/Inventory View Consolidation
- `src/services/purchaseOrderService.ts:307-325` 使用 `orderSelectPublic` 替换内联订单 `select`。
- `src/services/purchaseOrderService.ts:813-819` 使用 `inventorySelectBasic` 收敛库存查询字段。
- `src/services/purchaseOrderService.ts:912-943` 统一订单详情查询到 `orderSelectPublic`。
- `src/services/inventoryService.ts:164-168` 将 `getBookById` 查询改为 `inventorySelectBasic`。

### 验证
- `npm test`
- `npm run test:integration`

## Integration Test Isolation Hardening
- 新增 `src/tests/utils/resetDb.ts`，按 `pg_tables` 枚举业务表执行 `TRUNCATE ... RESTART IDENTITY CASCADE`。
- 调整 `src/tests/integrationSetup.ts` 在 `TEST_DB_RESET=strict` 下于 `beforeEach/afterEach` 自动调用 `resetDatabase`，并复用 Testcontainers 提供的 Prisma 客户端。
- 使用统一 reset 机制替换测试内私有清理逻辑，更新 `src/tests/globalSetup.ts` 复用同一工具。
- 改写 `src/tests/inventoryService.integration.test.ts`、`src/tests/order-status-management.integration.test.ts`、`src/tests/error-handling.integration.test.ts` 的数据准备流程，确保每个用例独立构建所需数据。
- 扩展 `vitest.integration.config.ts` 以纳入 `tests/integration/db/views/**/*.test.ts`。

### 验证
- `npm run test:integration`

## Transaction Retry Hardening
- 新增 `src/db/transaction.ts`，集中 `withTxRetry` 与 `isRetryableTxError`，并接入指标计数与序列化隔离级别。
- 更新 `src/services/purchaseOrderService.ts`、`src/services/sellOrderService.ts`、`src/services/acquisitionService.ts` 以使用新重试工具，并保留事务级超时配置。
- 改写 `src/tests/databaseRules.integration.test.ts` 为确定性的锁冲突测试，同时补充非可重试错误断言。
- 新增 `DB_RULES.md` 记录可重试错误列表、隔离级别与测试策略。

### 验证
- `npm test`
- `npm run test:integration`
