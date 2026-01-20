// src/jobs.ts
import { FastifyInstance } from "fastify";
import * as cron from "node-cron";
import { withAdvisoryLock } from "./utils/dbLock";
import { cancelExpiredOrders } from "./services/orderService";
import { metrics } from "./plugins/metrics";
import { processRefundQueue } from "./jobs/refundProcessor";
import { resetWeeklyPoints } from "./services/study/streakService";
import config from "./config";
import prisma from "./db";

// 存储所有定时任务，用于优雅关闭
const scheduledTasks: cron.ScheduledTask[] = [];
// 追踪当前正在执行的任务（允许返回null，因为withAdvisoryLock可能返回null）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runningJobs = new Set<Promise<any>>();
// 是否正在关闭
let isShuttingDown = false;

/**
 * 优雅关闭所有定时任务
 * 停止调度新任务，等待正在执行的任务完成
 */
export async function stopCronJobs(): Promise<void> {
  isShuttingDown = true;

  // 停止所有定时任务调度
  for (const task of scheduledTasks) {
    task.stop();
  }

  // 等待所有正在执行的任务完成
  if (runningJobs.size > 0) {
    console.warn(`Waiting for ${runningJobs.size} running job(s) to complete...`);
    await Promise.all(runningJobs);
  }

  scheduledTasks.length = 0;
  console.warn("All cron jobs stopped gracefully");
}

export function startCronJobs(fastify: FastifyInstance): void {
  // 测试环境不启动定时任务，避免污染测试结果
  if (config.NODE_ENV === "test") {
    fastify.log.info("Skipping cron jobs in test environment");
    return;
  }

  // 注意：'*/1 * * * *' (每分钟执行) 适用于开发和测试。
  // 在生产环境中，应通过 config.ts 配置为更合理的频率，例如 '*/5 * * * *' (每5分钟)。
  const orderCleanupTask = cron.schedule(config.CRON_ORDER_CLEANUP, async () => {
    if (isShuttingDown) return;
    const jobPromise = withAdvisoryLock(prisma, "job:cancel_expired_orders", async () => {
      fastify.log.info("Running scheduled job: CancelExpiredOrders");
      try {
        const result = await prisma.$transaction(async (tx) => {
          return cancelExpiredOrders(tx);
        });
        if (result.cancelledCount > 0) {
          fastify.log.info(
            `CancelExpiredOrders job finished: ${result.cancelledCount} order(s) cancelled`,
          );
        } else {
          fastify.log.info(
            "CancelExpiredOrders job finished: No expired orders found",
          );
        }
      } catch (error) {
        fastify.log.error(error, 'CRITICAL: The "CancelExpiredOrders" job failed');
      }
    });
    runningJobs.add(jobPromise);
    jobPromise.finally(() => runningJobs.delete(jobPromise));
  });
  scheduledTasks.push(orderCleanupTask);

  // Schedule a job to update inventory gauge metrics every 5 minutes.
  const metricsTask = cron.schedule(config.CRON_INVENTORY_METRICS, async () => {
    if (isShuttingDown) return;
    const jobPromise = withAdvisoryLock(
      prisma,
      "job:update_inventory_metrics",
      async () => {
        fastify.log.info("Running scheduled job to update inventory metrics");
        try {
          const inventoryCounts = await prisma.inventoryItem.groupBy({
            by: ["status"],
            _count: {
              id: true,
            },
          });
          inventoryCounts.forEach((item) => {
            metrics.inventoryStatus.labels(item.status).set(item._count.id);
          });
        } catch (error) {
          fastify.log.error(error, 'CRITICAL: The "updateInventoryMetrics" job failed');
        }
      },
    );
    runningJobs.add(jobPromise);
    jobPromise.finally(() => runningJobs.delete(jobPromise));
  });
  scheduledTasks.push(metricsTask);

  // Schedule refund processing job every 10 minutes
  const refundTask = cron.schedule(config.CRON_REFUND_PROCESSOR, async () => {
    if (isShuttingDown) return;
    const jobPromise = withAdvisoryLock(
      prisma,
      "job:process_refunds",
      async () => {
        fastify.log.info("Running scheduled job to process pending refunds");
        try {
          await processRefundQueue();
        } catch (error) {
          fastify.log.error(error, 'CRITICAL: The "processRefunds" job failed');
        }
      },
    );
    runningJobs.add(jobPromise);
    jobPromise.finally(() => runningJobs.delete(jobPromise));
  });
  scheduledTasks.push(refundTask);

  // Schedule weekly points reset (Monday 00:00 Beijing time = Sunday 16:00 UTC)
  const weeklyResetTask = cron.schedule(config.CRON_WEEKLY_POINTS_RESET, async () => {
    if (isShuttingDown) return;
    const jobPromise = withAdvisoryLock(
      prisma,
      "job:reset_weekly_points",
      async () => {
        fastify.log.info("Running scheduled job to reset weekly points");
        try {
          const resetCount = await prisma.$transaction(async (tx) => {
            return resetWeeklyPoints(tx);
          });
          fastify.log.info(
            `WeeklyPointsReset job finished: ${resetCount} user(s) reset`,
          );
        } catch (error) {
          fastify.log.error(error, 'CRITICAL: The "WeeklyPointsReset" job failed');
        }
      },
    );
    runningJobs.add(jobPromise);
    jobPromise.finally(() => runningJobs.delete(jobPromise));
  });
  scheduledTasks.push(weeklyResetTask);

  fastify.log.info(`Started ${scheduledTasks.length} cron jobs`);
}