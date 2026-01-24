import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('\n=== 1. Idempotency-related migrations ===\n')
  
  const migrations = await prisma.$queryRaw`
    SELECT migration_name, finished_at, applied_steps_count
    FROM _prisma_migrations
    WHERE migration_name LIKE '%idempotency%'
    ORDER BY finished_at
  `
  console.table(migrations)
  
  console.log('\n=== 2. Unique constraints on user_question_attempt ===\n')
  
  const constraints = await prisma.$queryRaw`
    SELECT conname, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'user_question_attempt'
    AND c.contype = 'u'
  `
  console.table(constraints)
  
  console.log('\n=== 3. All indexes on user_question_attempt ===\n')
  
  const indexes = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'user_question_attempt'
  `
  console.table(indexes)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
