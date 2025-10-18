# api_contract_test

## 用法
/api_contract_test [--update]

## 目标与范围
运行API合同测试以验证公共API的JSON响应结构。

- **默认模式**：验证快照匹配，如果失败则报告差异（不自动更新）
- **更新模式** (`--update`）：更新快照以匹配当前响应（仅在Code Review通过后使用）

## 重要规则
- CI环境**禁止**使用 `--update` 参数
- 快照变更必须经过Code Review，并附上破坏性/兼容性说明
- 如果测试失败，应先修正normalize函数或测试数据工厂，而非直接更新快照

## 执行步骤

### 默认模式（验证快照）
```bash
cd bookworm-backend
npm run test:integration -- src/tests/contract/api.contract.integration.test.ts
```

### 更新模式（更新快照）
⚠️ **警告**：仅在以下情况使用此模式：
1. 你明确知道API响应结构需要变更
2. 变更已经过技术评审
3. 有完整的破坏性/兼容性分析

```bash
cd bookworm-backend
npm run test:integration -- src/tests/contract/api.contract.integration.test.ts -u
```

## 验收标准
- 默认模式：所有测试通过，无快照差异
- 更新模式：快照已更新，再次运行默认模式时测试通过

## 故障排查
1. **快照失配**：检查normalize函数是否正确处理动态字段
2. **测试数据不稳定**：确认测试数据工厂使用确定性数据（无随机数/时间戳）
3. **API响应变更**：确认这是预期的变更，并记录变更原因
