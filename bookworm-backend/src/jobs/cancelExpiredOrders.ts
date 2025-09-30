import { Prisma } from "@prisma/client";
import { cancelExpiredOrders } from "../services/orderService";
import prisma from "../db";

const LOCK_NAMESPACE_JOBS = 100;
const LOCK_JOB_CANCEL_EXPIRED = 1;

async function main() {
  console.log("Starting cancelExpiredOrders job with advisory lock...");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [lockResult] = await tx.$queryRaw<[{ pg_try_advisory_xact_lock: boolean }]>(
        Prisma.sql`SELECT pg_try_advisory_xact_lock(${LOCK_NAMESPACE_JOBS}, ${LOCK_JOB_CANCEL_EXPIRED})`,
      );

      if (!lockResult.pg_try_advisory_xact_lock) {
        console.log("Another instance is already running the job. Skipping.");
        return null;
      }

      console.log("Lock acquired. Running cancelExpiredOrders job...");
      return await cancelExpiredOrders(tx);
    });

    if (result && result.cancelledCount > 0) {
      console.log(`Job completed successfully. Cancelled ${result.cancelledCount} expired orders.`);
    } else if (result) {
      console.log("Job completed successfully. No expired orders found.");
    }

  } catch (error) {
    console.error("Job failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
