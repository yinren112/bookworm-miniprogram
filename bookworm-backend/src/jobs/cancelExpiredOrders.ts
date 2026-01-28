import { Prisma } from "@prisma/client";
import { cancelExpiredOrders } from "../services/orderService";
import prisma from "../db";
import { log } from "../lib/logger";

const LOCK_NAMESPACE_JOBS = 100;
const LOCK_JOB_CANCEL_EXPIRED = 1;

async function main() {
  const jobName = "cancelExpiredOrders";
  log.info({ jobName }, "Starting cancelExpiredOrders job with advisory lock...");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [lockResult] = await tx.$queryRaw<[{ pg_try_advisory_xact_lock: boolean }]>(
        Prisma.sql`SELECT pg_try_advisory_xact_lock(${LOCK_NAMESPACE_JOBS}, ${LOCK_JOB_CANCEL_EXPIRED})`,
      );

      if (!lockResult.pg_try_advisory_xact_lock) {
        log.warn({ jobName }, "Another instance is already running the job. Skipping.");
        return null;
      }

      log.info({ jobName }, "Lock acquired. Running cancelExpiredOrders job...");
      return await cancelExpiredOrders(tx);
    });

    if (result && result.cancelledCount > 0) {
      log.info(
        { jobName, cancelledCount: result.cancelledCount },
        "Job completed successfully",
      );
    } else if (result) {
      log.info({ jobName }, "Job completed successfully. No expired orders found.");
    }

  } catch (error) {
    log.error({ jobName, err: error }, "Job failed");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
