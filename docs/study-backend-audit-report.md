# 学习模块后端代码审计报告

**审计日期**: 2026-01-31  
**审计范围**: bookworm-backend/src/services/study/ 目录  
**审查文件数**: 9个核心服务文件  
**发现问题数**: 3个（1个中风险，2个低风险）  

---

## 执行摘要

本次审计针对微信小程序学习模块的后端服务代码进行了深度静态分析。发现了3个需要关注的问题，主要集中在：
1. 事务上下文兼容性设计缺陷
2. 类型定义一致性问题  
3. 并发场景下的竞态条件

所有问题均为代码质量问题，暂无安全漏洞或数据完整性风险。

---

## 详细问题清单

### 🔴 问题1: activityService.ts - 事务上下文兼容性设计缺陷

**风险等级**: 中  
**文件路径**: src/services/study/activityService.ts  
**代码位置**: 第27-59行  

**问题代码**:
```typescript
export async function recordDailyStudyDuration(
  db: DbCtx,  // 第28行：接受联合类型
  input: {
    userId: number;
    activityDate: Date;
    type: StudyActivityType;
    totalDurationSeconds: number;
  },
): Promise<void> {
  const cardSeconds = input.type === "card" ? input.totalDurationSeconds : 0;
  const quizSeconds = input.type === "quiz" ? input.totalDurationSeconds : 0;
  const cheatsheetSeconds = input.type === "cheatsheet" ? input.totalDurationSeconds : 0;

  await db.$executeRawUnsafe(  // 第40行：危险！TransactionClient不支持
    `
INSERT INTO "public"."daily_study_activity"
  ("user_id", "date", "card_duration_seconds", "quiz_duration_seconds", "cheatsheet_duration_seconds", "updated_at")
VALUES
  ($1::int4, $2::date, $3::int4, $4::int4, $5::int4, CURRENT_TIMESTAMP)
ON CONFLICT ("user_id", "date")
DO UPDATE SET
  "card_duration_seconds" = GREATEST("daily_study_activity"."card_duration_seconds", EXCLUDED."card_duration_seconds"),
  "quiz_duration_seconds" = GREATEST("daily_study_activity"."quiz_duration_seconds", EXCLUDED."quiz_duration_seconds"),
  "cheatsheet_duration_seconds" = GREATEST("daily_study_activity"."cheatsheet_duration_seconds", EXCLUDED."cheatsheet_duration_seconds"),
  "updated_at" = CURRENT_TIMESTAMP
    `,
    input.userId,
    input.activityDate,
    cardSeconds,
    quizSeconds,
    cheatsheetSeconds,
  );
}
```

**问题分析**:
- 函数签名使用 `DbCtx = PrismaClient | TransactionClient`（第8行定义）
- 但函数内部调用 `$executeRawUnsafe`，这是 `PrismaClient` 的专有方法
- `Prisma.TransactionClient` 类型不包含此方法，会导致运行时错误

**当前状态**:
- ✅ 当前调用正常：routes/study.ts:1167 传入的是全局 `prisma` 实例
- ⚠️ 潜在风险：若未来在事务上下文中调用此函数会崩溃

**影响场景**:
```typescript
// 假设未来代码：
await prisma.$transaction(async (tx) => {
  await recordDailyStudyDuration(tx, {...});  // ❌ TypeError!
});
```

**修复方案**:

**方案A - 类型收缩（推荐）**:
```typescript
// 修改函数签名，只接受 PrismaClient
export async function recordDailyStudyDuration(
  db: PrismaClient,  // 不再接受 TransactionClient
  input: {...}
): Promise<void> {
  // 保持现有实现
}
```

**方案B - 运行时检查**:
```typescript
export async function recordDailyStudyDuration(
  db: DbCtx,
  input: {...}
): Promise<void> {
  if (!('$executeRawUnsafe' in db)) {
    throw new Error('recordDailyStudyDuration requires PrismaClient, not TransactionClient');
  }
  // 继续执行
}
```

**方案C - 使用 Prisma 标准 API**:
```typescript
// 重构为使用 upsert 而非原始 SQL
await db.dailyStudyActivity.upsert({
  where: {
    userId_date: {
      userId: input.userId,
      date: input.activityDate,
    },
  },
  create: {
    userId: input.userId,
    date: input.activityDate,
    cardDurationSeconds: cardSeconds,
    quizDurationSeconds: quizSeconds,
    cheatsheetDurationSeconds: cheatsheetSeconds,
  },
  update: {
    cardDurationSeconds: { set: { gt: cardSeconds } }, // 需要自定义逻辑
    // ... 其他字段
  },
});
```

**测试建议**:
```typescript
// 添加集成测试验证事务兼容性
test('recordDailyStudyDuration should work in transaction context', async () => {
  await prisma.$transaction(async (tx) => {
    // 应当抛出明确错误而非 TypeError
    await expect(recordDailyStudyDuration(tx, {...}))
      .rejects.toThrow('requires PrismaClient');
  });
});
```

---

### 🟡 问题2: DbCtx 类型定义不一致

**风险等级**: 低  
**影响文件**: 4个文件  
**问题类型**: 代码一致性  

**类型定义对比**:

| 文件 | 行号 | 定义方式 | 推荐程度 |
|------|------|----------|----------|
| courseService.ts | 18 | `Prisma.TransactionClient` | ✅ 推荐 |
| starService.ts | 7 | `Prisma.TransactionClient` | ✅ 推荐 |
| dashboardService.ts | 10 | `Prisma.TransactionClient` | ✅ 推荐 |
| cardScheduler.ts | 17 | `Prisma.TransactionClient` | ✅ 推荐 |
| importService.ts | 20 | `Prisma.TransactionClient` | ✅ 推荐 |
| **quizService.ts** | 18 | `Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]` | ❌ 复杂 |
| **feedbackService.ts** | 8 | `Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]` | ❌ 复杂 |
| **streakService.ts** | 12 | `Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]` | ❌ 复杂 |
| **activityService.ts** | 8 | `Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]` | ❌ 复杂 |

**问题说明**:
- 复杂定义：`Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]`
- 简单定义：`Prisma.TransactionClient`
- 两者在 TypeScript 层面最终等价，但复杂定义：
  1. 可读性差
  2. 依赖 Prisma 内部实现细节，版本升级可能失效
  3. 违反 AGENTS.md 代码风格一致性原则

**修复方案**:

**步骤1 - 创建统一类型文件**:
```typescript
// src/types/dbContext.ts
import { PrismaClient, Prisma } from '@prisma/client';

export type DbCtx = PrismaClient | Prisma.TransactionClient;
```

**步骤2 - 批量替换**:
```bash
# 替换复杂定义
sed -i 's/type DbCtx = PrismaClient | Parameters<Parameters<PrismaClient\["\$transaction"\]>\[0\]>\[0\];/type DbCtx = PrismaClient | Prisma.TransactionClient;/g' \
  src/services/study/quizService.ts \
  src/services/study/feedbackService.ts \
  src/services/study/streakService.ts \
  src/services/study/activityService.ts
```

---

### 🟡 问题3: quizService.ts - 幂等性处理竞态条件

**风险等级**: 低  
**文件路径**: src/services/study/quizService.ts  
**代码位置**: 第271-302行  

**问题代码**:
```typescript
async function createAttemptRecord(
  db: DbCtx,
  userId: number,
  questionId: number,
  sessionId: string,
  chosenAnswer: string,
  isCorrect: boolean,
  durationMs?: number,
): Promise<{ idempotent: false } | { idempotent: true; isCorrect: boolean }> {
  try {
    await db.userQuestionAttempt.create({
      data: {
        userId,
        questionId,
        sessionId,
        chosenAnswerJson: chosenAnswer,
        isCorrect,
        durationMs,
      },
    });
    return { idempotent: false };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const attempt = await db.userQuestionAttempt.findUnique({
        where: { sessionId_userId_questionId: { sessionId, userId, questionId } },
      });
      if (attempt) {
        return { idempotent: true, isCorrect: attempt.isCorrect };
      }
      // ⚠️ 问题：如果 attempt 为 null，会继续执行到 throw error
    }
    throw error;  // 第300行
  }
}
```

**竞态条件场景**:

```
时间线:
T1: 请求A尝试创建记录，触发唯一约束冲突（记录已存在）
T2: 请求B删除了该记录（虽然业务上罕见但技术上可能）
T3: 请求A查询记录，返回 null
T4: 请求A执行到第300行，抛出原错误（唯一约束错误）
```

**预期行为 vs 实际行为**:
- **预期**: 幂等操作应返回已存在的记录状态
- **实际**: 可能抛出唯一约束错误，调用方无法正确处理

**修复方案**:

**方案A - 完善 null 处理**:
```typescript
} catch (error) {
  if (isPrismaUniqueConstraintError(error)) {
    const attempt = await db.userQuestionAttempt.findUnique({
      where: { sessionId_userId_questionId: { sessionId, userId, questionId } },
    });
    if (attempt) {
      return { idempotent: true, isCorrect: attempt.isCorrect };
    }
    // 记录被并发删除，视为创建成功但数据丢失
    // 或者抛出明确的业务错误
    throw new StudyServiceError(
      StudyErrorCodes.ATTEMPT_RECORD_RACE_CONDITION,
      '答题记录被并发删除，请重试'
    );
  }
  throw error;
}
```

**方案B - 使用事务包裹（更严谨）**:
```typescript
async function createAttemptRecord(...) {
  return db.$transaction(async (tx) => {
    try {
      const created = await tx.userQuestionAttempt.create({...});
      return { idempotent: false };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const attempt = await tx.userQuestionAttempt.findUnique({...});
        if (attempt) {
          return { idempotent: true, isCorrect: attempt.isCorrect };
        }
        // 在事务中，这种情况几乎不可能发生
        // 如果发生，让事务回滚
      }
      throw error;
    }
  }, {
    isolationLevel: 'Serializable', // 最高隔离级别防止竞态
  });
}
```

---

## 修复优先级建议

| 优先级 | 问题 | 理由 |
|--------|------|------|
| P1 | activityService.ts 设计缺陷 | 影响未来扩展性，可能在事务场景下崩溃 |
| P2 | quizService.ts 竞态条件 | 并发场景下的数据一致性问题 |
| P3 | DbCtx 类型统一 | 代码质量改进，降低维护成本 |

## 回归测试清单

修复后需验证：

- [ ] `npm run test:integration` 全部通过
- [ ] 学习活动记录功能正常（热力图数据准确）
- [ ] 刷题提交功能正常（错题本、连续答对计数正确）
- [ ] 并发场景测试（同时提交相同答案）

## 附录

### 相关文件链接

- [activityService.ts](../bookworm-backend/src/services/study/activityService.ts)
- [quizService.ts](../bookworm-backend/src/services/study/quizService.ts)
- [routes/study.ts](../bookworm-backend/src/routes/study.ts)
- [AGENTS.md](../AGENTS.md) - 代码风格规范

### 参考文档

- [Prisma Transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [Prisma Client Reference](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)

---

**报告生成**: Linus Torvalds 代码审查模式  
**审查原则**: 数据库即法律、零废话、零情绪
