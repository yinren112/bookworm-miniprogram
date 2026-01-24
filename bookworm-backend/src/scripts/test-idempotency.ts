/**
 * 幂等性并发验证脚本
 * 
 * 两个并发请求提交同一 userId/sessionId/questionId
 * 预期：数据库 attempt 只新增一条，另一个请求返回同一条 attempt 的结果
 */

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// 测试数据 - 使用真实存在的用户和问题ID，或创建测试数据
const TEST_SESSION_ID = 'test-session-' + Date.now()

async function getOrCreateTestData() {
  // 获取一个真实存在的用户
  let user = await prisma.user.findFirst()
  if (!user) {
    // 创建测试用户
    user = await prisma.user.create({
      data: {
        openid: 'test-openid-' + Date.now(),
        nickname: 'Test User for Idempotency'
      }
    })
    console.log('✅ 创建测试用户:', user.id)
  }

  // 获取一个真实存在的问题
  let question = await prisma.studyQuestion.findFirst()
  if (!question) {
    console.log('❌ 没有找到任何问题，请先导入课程数据')
    process.exit(1)
  }

  return { userId: user.id, questionId: question.id }
}

async function cleanupTestAttempts(userId: number, questionId: number, sessionId: string) {
  await prisma.userQuestionAttempt.deleteMany({
    where: {
      userId,
      sessionId,
      questionId
    }
  })
  console.log('✅ 测试数据已清理')
}

async function createAttemptWithIdempotency(
  requestId: string,
  userId: number,
  questionId: number,
  sessionId: string
) {
  const startTime = Date.now()
  
  try {
    // 使用 upsert 实现幂等性 - 模拟 API 中的实际行为
    const attempt = await prisma.userQuestionAttempt.upsert({
      where: {
        sessionId_userId_questionId: {
          sessionId,
          userId,
          questionId
        }
      },
      create: {
        sessionId,
        userId,
        questionId,
        chosenAnswerJson: '["A"]',
        isCorrect: true,
        durationMs: 5000,
        attemptedAt: new Date()
      },
      update: {} // 不更新任何内容，返回现有记录
    })
    
    const duration = Date.now() - startTime
    console.log(`[${requestId}] ✅ 成功: attempt.id=${attempt.id} (耗时 ${duration}ms)`)
    return { success: true, attempt, duration }
  } catch (error) {
    const duration = Date.now() - startTime
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // 唯一约束冲突 - 这在并发场景下是预期的
      console.log(`[${requestId}] ⚠️ 唯一约束冲突 (P2002) - 正在重试获取记录... (耗时 ${duration}ms)`)
      
      // 重试获取已存在的记录
      const existing = await prisma.userQuestionAttempt.findUnique({
        where: {
          sessionId_userId_questionId: {
            sessionId,
            userId,
            questionId
          }
        }
      })
      
      if (existing) {
        console.log(`[${requestId}] ✅ 重试成功: attempt.id=${existing.id}`)
        return { success: true, attempt: existing, duration, wasRetry: true }
      }
    }
    
    console.error(`[${requestId}] ❌ 错误:`, error)
    return { success: false, error, duration }
  }
}

async function runConcurrencyTest() {
  console.log('\n🔬 开始幂等性并发测试...\n')
  
  const { userId, questionId } = await getOrCreateTestData()
  const sessionId = TEST_SESSION_ID
  
  console.log(`测试参数:`)
  console.log(`  - userId: ${userId}`)
  console.log(`  - sessionId: ${sessionId}`)
  console.log(`  - questionId: ${questionId}`)
  console.log('')
  
  await cleanupTestAttempts(userId, questionId, sessionId)
  
  // 并发执行两个请求
  console.log('\n⏱️ 同时发起 2 个并发请求...\n')
  
  const [result1, result2] = await Promise.all([
    createAttemptWithIdempotency('请求1', userId, questionId, sessionId),
    createAttemptWithIdempotency('请求2', userId, questionId, sessionId)
  ])
  
  console.log('\n📊 测试结果汇总:\n')
  
  // 检查结果
  const bothSucceeded = result1.success && result2.success
  const sameAttemptId = result1.attempt?.id === result2.attempt?.id
  
  console.log(`请求1: ${result1.success ? '✅ 成功' : '❌ 失败'} (attempt.id: ${result1.attempt?.id})`)
  console.log(`请求2: ${result2.success ? '✅ 成功' : '❌ 失败'} (attempt.id: ${result2.attempt?.id})`)
  console.log('')
  
  if (bothSucceeded && sameAttemptId) {
    console.log('🎉 测试通过！两个请求返回了同一个 attempt 记录')
  } else if (bothSucceeded && !sameAttemptId) {
    console.log('❌ 测试失败！两个请求创建了不同的 attempt 记录 - 幂等性未生效')
  } else {
    console.log('⚠️ 测试异常 - 请检查错误日志')
  }
  
  // 确认数据库中只有一条记录
  const count = await prisma.userQuestionAttempt.count({
    where: {
      userId,
      sessionId,
      questionId
    }
  })
  
  console.log(`\n📝 数据库中该组合的 attempt 记录数: ${count}`)
  
  if (count === 1) {
    console.log('✅ 正确！数据库中只有一条记录')
  } else {
    console.log(`❌ 错误！预期 1 条记录，实际 ${count} 条`)
  }
  
  // 清理测试数据
  await cleanupTestAttempts(userId, questionId, sessionId)
}

runConcurrencyTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
