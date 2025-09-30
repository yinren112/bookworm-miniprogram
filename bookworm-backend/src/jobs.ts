// src/jobs.ts
import { FastifyInstance } from "fastify";
import * as cron from "node-cron";
import { withAdvisoryLock } from "./utils/dbLock";
import { cancelExpiredOrders } from "./services/orderService";
import { metrics } from "./plugins/metrics";
import { processRefundQueue } from "./jobs/refundProcessor";
import config from "./config";
import prisma from "./db";

export function startCronJobs(fastify: FastifyInstance): void {
  // --- START OF FIX: 添加订单清理定时任务 ---

  // 注意：'*/1 * * * *' (每分钟执行) 适用于开发和测试。
  // 在生产环境中，应通过 config.ts 配置为更合理的频率，例如 '*/5 * * * *' (每5分钟)。
  cron.schedule(config.CRON_ORDER_CLEANUP, async () => {
    await withAdvisoryLock(prisma, "job:cancel_expired_orders", async () => {
      fastify.log.info("Running scheduled job: CancelExpiredOrders");
      try {
        // 在一个 try...catch 块中安全地调用它
        const result = await prisma.$transaction(async (tx) => {
          return cancelExpiredOrders(tx);
        });

        // 记录有意义的日志
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
        // 捕获并记录任何潜在的错误，防止搞垮主进程
        console.error(
          'CRITICAL: The "CancelExpiredOrders" job failed:',
          error,
        );
      }
    });
  });

  // --- END OF FIX ---

  // Schedule a job to update inventory gauge metrics every 5 minutes.
  cron.schedule(config.CRON_INVENTORY_METRICS, async () => {
    await withAdvisoryLock(
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
          console.error(
            'CRITICAL: The "updateInventoryMetrics" job failed:',
            error,
          );
        }
      },
    );
  });

  // Schedule refund processing job every 10 minutes
  cron.schedule(config.CRON_REFUND_PROCESSOR, async () => {
    await withAdvisoryLock(
      prisma,
      "job:process_refunds",
      async () => {
        fastify.log.info("Running scheduled job to process pending refunds");
        try {
          await processRefundQueue();
        } catch (error) {
          console.error(
            'CRITICAL: The "processRefunds" job failed:',
            error,
          );
        }
      },
    );
  });
}