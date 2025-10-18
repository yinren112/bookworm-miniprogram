# Database Transaction Rules

## 可重试错误集合
- Prisma `P2034`：序列化冲突/死锁
- PostgreSQL `40001` (`serialization_failure`)
- PostgreSQL `40P01` (`deadlock_detected`)
- PostgreSQL `55P03` (`lock_not_available`)
- 消息包含 `deadlock detected`、`could not serialize access due to` 或 `could not serialize transaction`

命中上述任意条件时，`withTxRetry` 会执行指数退避重试；否则立即抛出，避免掩盖真实业务问题。

## 事务隔离级别
- 重试封装默认使用 `SERIALIZABLE`，由 Postgres 负责检测并发冲突。
- 允许调用方通过 `transactionOptions` 传入额外参数（如 `timeout`），但隔离级别保持 `SERIALIZABLE`。

## 确定性冲突测试策略
- 利用 `SELECT ... FOR UPDATE` 与 `SELECT ... FOR UPDATE NOWAIT` 构造 `55P03` 锁冲突，确保首个事务持锁，重试逻辑在第二次尝试中成功提交。
- 避免依赖随机调度导致的不稳定冲突，从而保证 CI 可重复。
