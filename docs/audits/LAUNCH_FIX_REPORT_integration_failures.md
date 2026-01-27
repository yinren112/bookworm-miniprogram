# LAUNCH_FIX_REPORT_integration_failures

## 【执行结果】
✓ 4 passed, ❌ 0 failed, ⏭️ 4 total

## 【变更摘要】
- 新增 Prisma 错误翻译器 `prismaErrorToApiError` 并接入全局错误处理与订单/收购路径
- 强化 Prisma 错误识别（覆盖 `instanceof` 失效场景）
- 修复 `withTxRetry` 对 PG 锁/序列化冲突的重试判定
- 刷题并发幂等改为稳定识别 P2002 并回读已存在记录
- 新增 `PHONE_NUMBER_CONFLICT` 错误码常量

## 修复前失败清单（9项）
1. `src/tests/concurrent-order-control.integration.test.ts`  
   - 数据库层面：部分唯一索引规则 → 应该防止同一用户创建多个PENDING_PAYMENT订单（Prisma P2002 未映射为 ApiError）
2. `src/tests/concurrent-order-control.integration.test.ts`  
   - 数据库层面：部分唯一索引规则 → 并发竞争同一库存时应仅一笔成功（失败分支抛出 Prisma 错误而非 ApiError）
3. `src/tests/concurrent-order-control.integration.test.ts`  
   - 应用层面：总库存上限检查 → 应该通过部分唯一索引防止用户创建多个pending订单（P2002 未映射）
4. `src/tests/concurrent-order-control.integration.test.ts`  
   - 双重保护机制协同工作 → 两个规则应该独立工作，不互相干扰（P2002 未映射）
5. `src/tests/databaseRules.integration.test.ts`  
   - withTxRetry → retries deterministically on serialization conflicts（未识别可重试的 PG 锁/序列化错误）
6. `src/tests/profile-and-recommendations.integration.test.ts`  
   - POST /api/acquisitions → 应该拒绝手机号被其他用户占用的收购（P2002 变 500）
7. `src/tests/quiz-idempotency.integration.test.ts`  
   - 幂等提交 → 并发重复提交抛 P2002（未走幂等分支）
8. `src/tests/contract/api.contract.integration.test.ts`  
   - 409 Conflict → 业务冲突应为 409（P2002 被 500）
9. `src/tests/services/create.integration.test.ts`  
   - createOrder 并发保护 → should throw 409 when user already has pending payment order（P2002 未映射为 ApiError）

## 修复后结果
- `npm run test:integration`：`29 passed / 184 passed / 1 skipped`，0 failed

## 根因与修复点（逐条对应）
1. 并发订单 P2002 未统一映射  
   - 根因：`PrismaClientKnownRequestError` 在部分场景 `instanceof` 失效，P2002 直接外抛。  
   - 修复：新增 `prismaErrorToApiError`，在 `createOrder` 中统一转换 P2002 → `CONCURRENT_PENDING_ORDER`，返回 409。

2. 并发抢库存失败分支未保证 ApiError  
   - 根因：P2002 直接透传，`failures[0]` 不是 `ApiError`。  
   - 修复：同上，P2002 统一转换为 `ApiError`，保证失败分支类型稳定。

3. 部分唯一索引规则未被解释为业务冲突  
   - 根因：P2002 没进入业务错误链路。  
   - 修复：订单创建路径引入 `prismaErrorToApiError`，确保 P2002 → 409 + 业务码。

4. 双重保护机制测试依赖一致错误类型  
   - 根因：同一 P2002 触发路径未返回 `ApiError`。  
   - 修复：订单创建路径统一转换，确保规则互不干扰。

5. withTxRetry 未识别可重试 PG 错误  
   - 根因：仅在 `instanceof` 命中时解析 `meta.code`；NOWAIT/序列化冲突未被识别为可重试。  
   - 修复：改为对 `meta.code`/`message` 做通用解析，覆盖 40001、40P01、55P03 与 P2034。

6. 号码冲突未回 409  
   - 根因：手机号更新 P2002 未被识别，直接 500。  
   - 修复：`acquisitionService` 使用 `prismaErrorToApiError` + 冲突用户校验，映射 `PHONE_NUMBER_CONFLICT`。

7. 刷题幂等并发 P2002 未走回读  
   - 根因：`instanceof` 失败导致 P2002 未触发幂等分支。  
   - 修复：使用 `isPrismaUniqueConstraintError`（增强的 type guard）确保重复提交回读已存在结果。

8. 合约测试 409 结构不一致  
   - 根因：全局错误处理中 P2002 默认映射为 `DUPLICATE_RECORD` 或 500。  
   - 修复：全局错误处理接入 `prismaErrorToApiError`，订单冲突走 `CONCURRENT_PENDING_ORDER`。

9. createOrder 并发保护测试  
   - 根因：订单创建外层未统一处理 P2002。  
   - 修复：同第 1 条，统一转换后返回 `ApiError(409)`。

## 关键改动文件
- `bookworm-backend/src/utils/prismaError.ts`
- `bookworm-backend/src/utils/typeGuards.ts`
- `bookworm-backend/src/services/orders/create.ts`
- `bookworm-backend/src/services/acquisitionService.ts`
- `bookworm-backend/src/services/study/quizService.ts`
- `bookworm-backend/src/db/transaction.ts`
- `bookworm-backend/src/index.ts`
- `bookworm-backend/src/constants.ts`

## 回归验证结果
- `npm run lint`：通过（ESLint 提示 `eslint.config.js` 为 ES module 的警告）
- `npm run build`：通过（Prisma config deprecation 警告）
- `npm test`：通过（测试日志与 WeChat Pay 配置警告属预期）
- `npm run test:integration`：通过（29 files / 184 tests / 1 skipped）

## 风险评估与后续建议
- 风险：`prismaErrorToApiError` 当前仅覆盖 P2002，其他 Prisma 错误仍走默认处理；若未来新增唯一约束，需补充映射。  
- 风险：`withTxRetry` 放宽错误识别逻辑，若有非事务错误误判为可重试，可能导致额外重试开销。  
- 建议：补齐“错误码字典”文档与映射规则；对新增唯一索引补充合约测试。  
- 建议：为 `withTxRetry` 增加更多数据库异常回归用例（尤其是不同驱动/错误格式）。
