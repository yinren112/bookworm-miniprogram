# API Contract Testing

## 概述

本项目使用 **API Contract Tests** (API 合同测试) 来冻结公共 API 的 JSON 响应结构，防止意外的破坏性变更。

合同测试使用 Vitest 的快照功能，将每个 API 端点的响应格式固化为快照文件。任何响应格式的变更都会导致测试失败，从而确保 API 的向后兼容性。

---

## 文件结构

```
bookworm-backend/
├── src/tests/contract/
│   ├── api.contract.integration.test.ts    # 合同测试主文件
│   └── __snapshots__/
│       └── api.contract.integration.test.ts.snap  # 快照文件（自动生成）
└── CONTRACT_README.md                       # 本文档
```

---

## 覆盖的 API 端点

### 认证 (Authentication)
- `POST /api/auth/login` - 用户登录

### 库存 (Inventory)
- `GET /api/inventory/available` - 获取可用库存列表
- `GET /api/inventory/item/:id` - 获取单个库存详情

### 订单 (Orders)
- `POST /api/orders/create` - 创建订单
- `GET /api/orders/:id` - 获取订单详情
- `GET /api/orders/my` - 获取用户订单列表

### 推荐 (Recommendations)
- `GET /api/books/recommendations` - 获取推荐书籍

### 内容 (Content)
- `GET /api/content/:slug` - 获取静态内容

### 用户 (User)
- `GET /api/users/me` - 获取当前用户信息

### 错误响应 (Error Responses)

#### HTTP 状态码语义契约

本项目严格遵循以下 HTTP 状态码语义，确保前后端对错误的理解一致：

- **401 Unauthorized** - 未认证
  - **触发条件**：缺少 `Authorization` header，或 token 无效/过期/格式错误
  - **响应格式**：`{ "code": "UNAUTHORIZED", "message": "..." }`
  - **客户端行为**：应跳转到登录页面或触发重新登录流程
  - **示例场景**：访问 `/api/users/me` 时未携带 token

- **403 Forbidden** - 已认证但无权限
  - **触发条件**：token 有效（用户已登录），但角色不足以访问该资源
  - **响应格式**：`{ "code": "FORBIDDEN", "message": "..." }`
  - **客户端行为**：显示"权限不足"提示，**不应**跳转到登录页面
  - **示例场景**：普通用户（role=USER）访问 `/api/orders/fulfill`（需要 role=STAFF）

- **404 Not Found** - 资源不存在
  - **响应格式**：`{ "code": "NOT_FOUND", "message": "..." }`

- **400 Bad Request** - 请求参数验证失败
  - **响应格式**：`{ "code": "BAD_REQUEST", "message": "...", "details": [...] }`

- **409 Conflict** - 业务规则冲突
  - **响应格式**：`{ "code": "CONFLICT", "message": "..." }`
  - **示例场景**：用户已有待支付订单，无法创建新订单

**重要提醒**：前端必须区分 401 和 403，不要将两者混为一谈。401 是身份问题（需要重新登录），403 是权限问题（已登录但无权访问）。

---

## 运行合同测试

### 本地运行（验证快照）

```bash
# 运行合同测试（使用现有快照）
npm run test:integration -- src/tests/contract/api.contract.integration.test.ts
```

**预期输出：**
```
✓ src/tests/contract/api.contract.integration.test.ts (15 tests)
  ✓ API Contract Tests > Authentication APIs > POST /api/auth/login - 登录成功返回token和userId
  ✓ API Contract Tests > Inventory APIs > GET /api/inventory/available - 获取可用库存列表
  ...
```

### 更新快照（需要评审）

**⚠️ 警告：** 更新快照是一个敏感操作，必须经过代码审查。

```bash
# 更新快照（仅在响应格式变更后使用）
npm run test:integration -- src/tests/contract/api.contract.integration.test.ts -u
```

**更新快照后必须：**
1. 仔细检查 `git diff` 中的快照变更
2. 在 Pull Request 中附上 **破坏性/兼容性说明**
3. 获得至少一名审核者的批准

---

## 快照更新流程（重要）

### 何时更新快照？

仅在以下情况下更新快照：

1. **有意的 API 变更**：添加新字段、修改响应结构（需要评审）
2. **修复 Bug**：修复错误的响应格式（需要评审）
3. **新增 API**：添加新的 API 端点并编写合同测试

**禁止的情况：**
- ❌ 测试失败时随意更新快照
- ❌ 在 CI 中自动更新快照
- ❌ 未经审查的快照变更

### 更新步骤

1. **修改 API 代码**（如果需要）
   ```typescript
   // 例如：在 orders 响应中添加新字段
   reply.send({
     ...order,
     newField: 'value'  // 新增字段
   });
   ```

2. **运行测试（会失败）**
   ```bash
   npm run test:integration -- src/tests/contract/api.contract.integration.test.ts
   ```

3. **检查失败原因**
   ```
   Snapshot `API Contract Tests > Order APIs > GET /api/orders/:id` mismatched

   - Expected:
   + Received:

   {
     id: '[DYNAMIC_ID]',
     ...
   + newField: 'value'
   }
   ```

4. **更新快照**
   ```bash
   npm run test:integration -- src/tests/contract/api.contract.integration.test.ts -u
   ```

5. **验证变更**
   ```bash
   git diff src/tests/contract/__snapshots__/
   ```

6. **提交 Pull Request**
   - 标题示例：`feat: Add newField to order response [Breaking Change]`
   - 说明：
     ```markdown
     ## 变更摘要
     在订单响应中添加 `newField` 字段

     ## 破坏性/兼容性评估
     - ✅ **向后兼容**：仅添加新字段，不删除或修改现有字段
     - 客户端可以安全忽略新字段

     ## 快照变更
     - 更新了 `GET /api/orders/:id` 的快照
     - 新增字段: `newField: 'value'`
     ```

---

## 动态字段规范化

合同测试使用 `normalize()` 函数去除动态字段，以便快照测试更稳定。

### 被规范化的字段

以下字段会被替换为 `[DYNAMIC_<FIELD_NAME>]`：

- **时间戳**：`createdAt`, `updatedAt`, `paymentExpiresAt`, `paid_at`, `cancelled_at`
- **令牌**：`token`, `access_token`, `refresh_token`
- **签名**：`signature`, `nonce`, `noncestr`
- **取货码**：`pickupCode`, `pickup_code`（每次生成不同）

### 被手动规范化的字段

某些字段在测试中被手动替换：

- **ID 字段**：`id`, `user_id`, `order_id`, `sku_id` 等（替换为 `[DYNAMIC_ID]` 等）
- **游标**：`nextCursor`（替换为 `[DYNAMIC_CURSOR]` 或 `null`）

### 示例

**原始响应：**
```json
{
  "id": 123,
  "userId": 456,
  "status": "PENDING_PAYMENT",
  "totalAmount": 10000,
  "createdAt": "2025-10-18T10:00:00.000Z",
  "paymentExpiresAt": "2025-10-18T10:15:00.000Z",
  "pickupCode": "ABC123XYZ"
}
```

**规范化后（保存在快照中）：**
```json
{
  "id": "[DYNAMIC_ID]",
  "userId": "[DYNAMIC_USER_ID]",
  "status": "PENDING_PAYMENT",
  "totalAmount": 10000,
  "createdAt": "[DYNAMIC_CREATEDAT]",
  "paymentExpiresAt": "[DYNAMIC_PAYMENTEXPIRESAT]",
  "pickupCode": "[DYNAMIC_PICKUPCODE]"
}
```

---

## CI 集成

### 禁止自动更新快照

在 CI 环境中，快照更新被严格禁止。如果快照不匹配，CI 将失败并提示开发者手动审查。

**CI 配置示例（.github/workflows/test.yml）：**
```yaml
- name: Run Contract Tests
  run: npm run test:integration -- src/tests/contract/api.contract.integration.test.ts
  # 不使用 -u 标志
  env:
    CI: true
```

### 快照变更检测

**CI 行为：**
- ✅ **快照匹配**：测试通过，继续流水线
- ❌ **快照不匹配**：测试失败，显示 diff，阻止合并

**失败示例：**
```
❌ Snapshot mismatch detected!

Expected snapshot to match, but received:
  + newField: 'unexpected value'

To update snapshots, run locally:
  npm run test:integration -- src/tests/contract/api.contract.integration.test.ts -u

⚠️ WARNING: Snapshot changes must be reviewed before merging.
```

---

## 最佳实践

### 1. 优先向后兼容

- ✅ **添加**新字段（客户端可以忽略）
- ✅ **标记字段为可选**（使用 `field?: type`）
- ❌ **删除**现有字段（会破坏客户端）
- ❌ **重命名**字段（会破坏客户端）
- ❌ **改变类型**（如 `string` → `number`）

### 2. 版本化 API

如果必须进行破坏性变更：

- 创建新版本的 API（如 `/api/v2/orders`）
- 保留旧版本 API 至少 3 个月
- 在文档中标记废弃

### 3. 编写清晰的合同测试

```typescript
it("POST /api/orders/create - 创建订单", async () => {
  // 1. 准备测试数据
  const inventoryItemIds = await createTestInventoryItems(2);

  // 2. 发送请求
  const res = await request(app.server)
    .post("/api/orders/create")
    .set("Authorization", `Bearer ${userToken}`)
    .send({ inventoryItemIds });

  // 3. 验证状态码
  expect(res.status).toBe(201);

  // 4. 规范化响应并快照测试
  const normalizedBody = {
    ...normalize(res.body),
    id: '[DYNAMIC_ID]',
    userId: '[DYNAMIC_USER_ID]'
  };

  expect(normalizedBody).toMatchSnapshot();
});
```

### 4. 定期审查快照

- 每月审查一次快照文件
- 确保快照反映当前的 API 设计
- 清理过时的快照

---

## 常见问题

### Q: 为什么测试失败了？

**A:** 有三种可能：

1. **代码变更导致响应格式改变**
   - 检查最近的代码变更
   - 判断是否是有意的 API 变更
   - 如果是，更新快照并提交 PR

2. **测试环境问题**
   - 确保数据库迁移已运行
   - 确保测试数据创建成功

3. **快照文件损坏**
   - 重新生成快照：`npm run test:integration -- <test-file> -u`
   - 检查 git diff 确认变更合理

### Q: 如何添加新 API 的合同测试？

**A:** 按以下步骤操作：

1. 在 `api.contract.integration.test.ts` 中添加新测试
2. 运行测试并生成快照：`npm run test:integration -- <test-file> -u`
3. 验证快照内容正确
4. 提交代码和快照文件

### Q: 快照文件可以手动编辑吗？

**A:** ❌ **不推荐！**

快照文件应该由测试框架自动生成。手动编辑可能导致不一致。如果需要修改快照，应该：

1. 修改 API 代码或测试代码
2. 重新运行测试生成快照
3. 验证生成的快照正确

### Q: 如何处理大量快照变更？

**A:**

1. **分批审查**：将变更分解为多个 PR
2. **自动化验证**：使用脚本验证快照格式
3. **团队评审**：至少两人审查大规模快照变更

---

## 参考资料

- [Vitest Snapshot Testing](https://vitest.dev/guide/snapshot.html)
- [API Versioning Best Practices](https://www.troyhunt.com/your-api-versioning-is-wrong-which-is/)
- [Semantic Versioning](https://semver.org/)

---

## 支持

如有问题，请联系：

- **技术负责人**：[项目维护者]
- **文档更新**：2025-10-18
- **下次审查**：2025-11-18

---

**重要提醒：**

> ⚠️ **快照变更 = API 变更 = 客户端影响**
>
> 任何快照变更都必须经过严格评审。在不确定时，优先选择向后兼容的方案。

