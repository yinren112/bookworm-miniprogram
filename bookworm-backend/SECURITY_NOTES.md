# 日志安全规范 (Log Security Guidelines)

## 核心原则：默认安全 (Secure by Default)

系统采用多层防护机制，确保敏感信息（手机号、OpenID、取货码）不会出现在日志中。

---

## 敏感字段定义

以下字段被视为敏感信息，**禁止**在日志中以明文形式输出：

| 字段名 | 类型 | 脱敏规则 | 示例 |
|-------|------|---------|------|
| `phone_number` / `phoneNumber` | 手机号 | 保留前3位和后4位 | `138****8000` |
| `customerPhoneNumber` | 客户手机号 | 同上 | `139****9000` |
| `openid` | 微信用户标识 | 仅保留前6个字符 | `oABC12***` |
| `unionid` | 微信联合标识 | 仅保留前6个字符 | `o6_bmj***` |
| `pickup_code` / `pickupCode` | 订单取货码 | 完全隐藏 | `[REDACTED]` |

---

## 三层防护机制

### 第一层：Pino 全局 Redaction（框架级）

在 `src/index.ts` 中配置 Fastify/Pino，自动脱敏所有日志输出中的敏感字段。

**生效范围：** 所有通过 `request.log.*()` 输出的日志。

**配置：**
```typescript
logger: {
  redact: {
    paths: [
      "*.phone_number",
      "*.phoneNumber",
      "*.openid",
      "*.unionid",
      "*.pickup_code",
      // ... 更多路径
    ],
    censor: "[REDACTED]",
  },
}
```

**注意：** Pino redaction 使用通配符 `*` 匹配嵌套对象，但无法完全覆盖所有场景。因此需要第二层防护。

---

### 第二层：业务层脱敏工具（应用级）

使用 `src/lib/logSanitizer.ts` 提供的工具函数，在记录日志前主动脱敏。

**工具函数：**

| 函数名 | 用途 | 示例 |
|-------|------|------|
| `maskPhoneNumber(phone)` | 脱敏手机号 | `maskPhoneNumber('13800138000')` → `'138****8000'` |
| `maskOpenId(openid)` | 脱敏 OpenID | `maskOpenId('oABC123')` → `'oABC12***'` |
| `maskPickupCode(code)` | 脱敏取货码 | `maskPickupCode('ABC123')` → `'[REDACTED]'` |
| `sanitizeUser(user)` | 脱敏用户对象 | 自动处理所有敏感字段 |
| `sanitizeOrder(order)` | 脱敏订单对象 | 自动处理取货码 |
| `sanitizeObject(obj)` | 通用对象脱敏 | 递归检测并脱敏敏感字段 |

**使用示例：**

```typescript
// ❌ 错误：直接记录敏感信息
request.log.info({ phoneNumber }, "User phone authorized");

// ✅ 正确：使用脱敏工具
import { maskPhoneNumber } from "../lib/logSanitizer";
request.log.info(
  { phoneNumber: maskPhoneNumber(phoneNumber) },
  "User phone authorized"
);
```

```typescript
// ✅ 脱敏整个用户对象
import { sanitizeUser } from "../lib/logSanitizer";
request.log.debug(
  { user: sanitizeUser(user) },
  "User data fetched"
);
```

---

### 第三层：ESLint 强制规则（编译时检查）

在 `eslint.config.js` 中配置 `no-console` 规则，禁止在生产代码中使用 `console.log`。

**规则：**
```javascript
'no-console': ['error', {
  allow: ['warn', 'error'], // 仅允许 console.warn/error
}]
```

**违规示例：**
```typescript
// ❌ ESLint 错误：Unexpected console statement
console.log(`User phone: ${phoneNumber}`);
```

**合规替代：**
```typescript
// ✅ 使用 Fastify logger + 脱敏工具
request.log.info(
  { phoneNumber: maskPhoneNumber(phoneNumber) },
  "User phone authorized"
);
```

**例外：** 测试文件 (`src/tests/**/*.ts`, `src/**/*.test.ts`) 中允许 `console.log`。

---

## 开发调试模式（仅本地）

### 临时禁用脱敏（谨慎使用！）

在本地调试时，如果需要查看完整日志：

1. **设置环境变量：**
   ```bash
   LOG_EXPOSE_DEBUG=true npm run dev
   ```

2. **生效条件：**
   - 必须同时满足：`LOG_EXPOSE_DEBUG=true` **且** `NODE_ENV=development`
   - 生产/预发布环境启动时会强制检查并拒绝启动

3. **安全约束：**
   - ❌ **禁止**在 `.env` 中写入 `LOG_EXPOSE_DEBUG=true`
   - ❌ **禁止**在生产环境设置此变量（启动时会报错并退出）
   - ⚠️ 即使禁用脱敏，日志也仅输出到 stdout（内存），不应落盘

---

## 禁止的日志模式

以下模式**严格禁止**在代码中出现：

### ❌ 模式 1：直接输出敏感字段
```typescript
request.log.info({ phoneNumber }, "User phone");
console.log(`OpenID: ${user.openid}`);
```

### ❌ 模式 2：使用 console.log 替代 logger
```typescript
console.log("Processing order:", order); // 可能包含 pickup_code
```

### ❌ 模式 3：在错误消息中暴露敏感信息
```typescript
throw new Error(`Invalid phone: ${phoneNumber}`);
```

---

## 推荐的日志模式

### ✅ 模式 1：使用脱敏工具 + Fastify Logger
```typescript
import { maskPhoneNumber, sanitizeUser } from "../lib/logSanitizer";

// 记录单个字段
request.log.info(
  { phoneNumber: maskPhoneNumber(phoneNumber) },
  "User authorized phone"
);

// 记录整个对象
request.log.debug(
  { user: sanitizeUser(user) },
  "User data fetched"
);
```

### ✅ 模式 2：仅记录统计信息（不记录敏感值）
```typescript
// 记录操作结果，不记录具体值
request.log.info("Phone number authorization succeeded");

// 记录聚合数据
request.log.info({ userCount: users.length }, "User batch processed");
```

### ✅ 模式 3：使用业务 ID 替代敏感信息
```typescript
// 使用用户 ID，而非 OpenID/手机号
request.log.info({ userId: user.id }, "User login successful");

// 使用订单 ID，而非取货码
request.log.info({ orderId: order.id }, "Order fulfilled");
```

---

## 验证与审计

### 自动化检查

1. **单元测试：**
   ```bash
   npm test -- src/lib/logSanitizer.test.ts
   ```
   验证脱敏函数正确性。

2. **ESLint 检查：**
   ```bash
   npm run lint
   ```
   确保没有违规的 `console.log` 语句。

### 手动审计

定期执行以下命令，检查是否有遗漏的敏感日志点：

```bash
# 搜索可能泄露手机号的日志
grep -rn "log.*phone" src/routes src/services | grep -v maskPhoneNumber

# 搜索可能泄露 OpenID 的日志
grep -rn "log.*openid" src/routes src/services | grep -v maskOpenId

# 搜索可能泄露取货码的日志
grep -rn "log.*pickup" src/routes src/services | grep -v maskPickupCode
```

**预期结果：** 应该没有输出（或仅输出已脱敏的代码）。

---

## 常见问题 (FAQ)

### Q1: 为什么需要三层防护？

**A:** 多层防护确保安全性：
- Pino redaction 是最后一道防线（但无法覆盖所有场景）
- 业务层脱敏确保主动控制敏感数据
- ESLint 规则在编译时拦截不规范代码

### Q2: 响应数据（发给客户端）需要脱敏吗？

**A:** **不需要**。响应数据本身可能包含用户自己的手机号（如 `/api/users/me`），这是业务需求。

但要确保：
1. 响应数据不会被 **日志** 记录（已由 Pino redaction 处理）
2. API 权限控制正确，不泄露其他用户的敏感信息

### Q3: 如何记录支付相关日志？

**A:** 支付日志中可能包含敏感信息（如 `payer.openid`），建议：
```typescript
// ❌ 错误
request.log.info({ payer }, "Payment received");

// ✅ 正确：仅记录非敏感字段
request.log.info(
  {
    transaction_id: paymentResult.transaction_id,
    amount: paymentResult.amount,
    // 不记录 payer.openid
  },
  "Payment received"
);
```

### Q4: 启动时的 console.error/warn 会泄露信息吗？

**A:** 启动脚本（如 `src/config.ts`, `src/index.ts`）中的 `console.error/warn` 主要用于配置验证，不涉及用户数据，是安全的。

但如果需要记录运行时错误，应使用 Fastify logger：
```typescript
// ❌ 运行时不应使用 console
console.error("Error:", error);

// ✅ 使用 Fastify logger
request.log.error({ err: error }, "Operation failed");
```

---

## 安全事件响应

如果发现日志中出现明文敏感信息：

1. **立即行动：**
   - 删除包含敏感信息的日志文件
   - 轮转日志文件（防止继续泄露）

2. **根因分析：**
   - 定位泄露点（哪行代码输出了敏感信息）
   - 确认影响范围（泄露了多少用户数据）

3. **修复验证：**
   - 添加脱敏逻辑
   - 添加单元测试验证修复
   - Code Review 确认无遗漏

4. **预防措施：**
   - 更新 `SECURITY_NOTES.md` 记录案例
   - 团队培训，避免重复错误

---

## 更新日志

| 日期 | 变更 | 负责人 |
|------|------|--------|
| 2025-01-XX | 初版：建立日志脱敏系统 | Claude Code |

---

**记住：日志泄露不是"如果"的问题，而是"何时"的问题。保持警惕。**
