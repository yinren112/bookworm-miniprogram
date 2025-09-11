import { PrismaClient } from '@prisma/client';
import { cancelExpiredOrders } from '../services/orderService';

const prisma = new PrismaClient();

async function main() {
  const lockId = 123456789; // 用于此任务的唯一锁ID
  
  try {
    // 尝试获取PostgreSQL咨询锁，如果锁已被占用，pg_try_advisory_lock 会返回 false
    const result = await prisma.$queryRaw<[{ lock_acquired: boolean }]>`SELECT pg_try_advisory_lock(${lockId}) as lock_acquired`;

    if (result[0].lock_acquired) {
      console.log('Lock acquired. Running cancelExpiredOrders job...');
      
      try {
        const jobResult = await cancelExpiredOrders();
        
        if (jobResult.cancelledCount > 0) {
          console.log(`Job completed successfully. Cancelled ${jobResult.cancelledCount} expired orders.`);
        } else {
          console.log('Job completed successfully. No expired orders found.');
        }
      } finally {
        // 确保任务完成后释放锁
        await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${lockId})`);
        console.log('Lock released.');
      }
    } else {
      console.log('Another instance is already running the job. Skipping.');
    }
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();