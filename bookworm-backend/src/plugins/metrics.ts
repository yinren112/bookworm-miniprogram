// src/plugins/metrics.ts
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import client from "prom-client";
import config from "../config";

// 启用默认的 Node.js 指标 (CPU, memory, etc.)
// 只在非测试环境中收集默认指标，避免重复注册错误
if (process.env.NODE_ENV !== 'test') {
  client.collectDefaultMetrics();
}

// --- 定义我们的核心业务指标 ---

// Singleton mock objects for testing - reuse instead of creating new objects
const mockIncrementer = { inc: () => {} };
const mockSetter = { set: () => {} };

function getOrCreateCounter(name: string, help: string) {
  const existing = client.register.getSingleMetric(name);
  if (existing) {
    return existing as client.Counter<string>;
  }
  return new client.Counter({ name, help });
}

// Only create metrics in non-test environments to avoid conflicts
export const metrics = process.env.NODE_ENV !== 'test' ? {
  ordersCreated: new client.Counter({
    name: "bookworm_orders_created_total",
    help: "Total number of orders created",
  }),
  ordersCompleted: new client.Counter({
    name: "bookworm_orders_completed_total",
    help: "Total number of orders successfully fulfilled (picked up)",
  }),
  ordersCancelled: new client.Counter({
    name: "bookworm_orders_cancelled_total",
    help: "Total number of orders cancelled due to expiration",
  }),
  paymentsProcessed: new client.Counter({
    name: "bookworm_payments_processed_total",
    help: "Total number of payment notifications processed",
    labelNames: ["status", "result"], // status: 'success'|'failure'|'refund_required', result: 'processed'|'invalid_signature'|'order_not_found'
  }),
  dbTransactionRetries: new client.Counter({
    name: "bookworm_db_transaction_retries_total",
    help: "Total number of database transaction retries due to serialization conflicts",
  }),
  inventoryStatus: new client.Gauge({
    name: "bookworm_inventory_items_count",
    help: "Current number of inventory items by status",
    labelNames: ["status"], // 'in_stock', 'reserved', 'sold', etc.
  }),
  usersLoggedInTotal: new client.Gauge({
    name: "bookworm_users_logged_in_total",
    help: "Total number of unique users who have logged in",
  }),
  orderFulfillmentDurationSeconds: new client.Histogram({
    name: "bookworm_order_fulfillment_duration_seconds",
    help: "Histogram of the time taken from payment to fulfillment for an order",
    buckets: [60, 300, 900, 1800, 3600, 7200, 86400], // 1min, 5min, 15min, 30min, 1hr, 2hr, 1day
  }),
  operationLatency: new client.Histogram({
    name: "bookworm_operation_latency_seconds",
    help: "Latency of critical business operations in seconds",
    labelNames: ["operation"], // 'create_order', 'process_payment', etc.
    buckets: [0.1, 0.5, 1, 2, 5],
  }),
  amountMismatchDetected: new client.Counter({
    name: "bookworm_amount_mismatch_total",
    help: "Total number of critical amount mismatches detected. THIS SHOULD ALWAYS BE ZERO.",
  }),
  courseScopeRequiredTotal: getOrCreateCounter(
    "bookworm_course_scope_required_total",
    "Total number of requests rejected due to missing course scope.",
  ),
  coursePublishArchiveFailedTotal: getOrCreateCounter(
    "bookworm_course_publish_archive_failed_total",
    "Total number of failures archiving old published course versions.",
  ),
  enrollmentActiveConflictTotal: getOrCreateCounter(
    "bookworm_enrollment_active_conflict_total",
    "Total number of detected conflicts with multiple active enrollments per user and courseKey.",
  ),
} : {
  // Mock metrics for testing - reuse singleton objects
  ordersCreated: { labels: () => mockIncrementer, inc: () => {} },
  ordersCompleted: { labels: () => mockIncrementer, inc: () => {} },
  ordersCancelled: { labels: () => mockIncrementer, inc: () => {} },
  paymentsProcessed: { labels: () => mockIncrementer, inc: () => {} },
  dbTransactionRetries: { labels: () => mockIncrementer, inc: () => {} },
  inventoryStatus: { labels: () => mockSetter },
  usersLoggedInTotal: { set: () => {}, inc: () => {} },
  orderFulfillmentDurationSeconds: { observe: () => {} },
  operationLatency: { startTimer: () => () => {}, labels: () => ({ startTimer: () => () => {} }) },
  amountMismatchDetected: mockIncrementer,
  courseScopeRequiredTotal: mockIncrementer,
  coursePublishArchiveFailedTotal: mockIncrementer,
  enrollmentActiveConflictTotal: mockIncrementer,
};

async function metricsPlugin(fastify: FastifyInstance) {
  fastify.get("/metrics", async (request, reply) => {
    if (!config.METRICS_ALLOW_ANONYMOUS) {
      const expected = config.METRICS_AUTH_TOKEN;
      const actual = request.headers.authorization;
      if (!expected || actual !== `Bearer ${expected}`) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Unauthorized" });
      }
    }
    reply.header("Content-Type", client.register.contentType);
    reply.send(await client.register.metrics());
  });
}

export default fp(metricsPlugin);
