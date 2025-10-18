// src/plugins/metrics.ts
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import client from "prom-client";

// 启用默认的 Node.js 指标 (CPU, memory, etc.)
// 只在非测试环境中收集默认指标，避免重复注册错误
if (process.env.NODE_ENV !== 'test') {
  client.collectDefaultMetrics();
}

// --- 定义我们的核心业务指标 ---

// Singleton mock objects for testing - reuse instead of creating new objects
const mockIncrementer = { inc: () => {} };
const mockSetter = { set: () => {} };

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
};

async function metricsPlugin(fastify: FastifyInstance) {
  fastify.get("/metrics", async (request, reply) => {
    reply.header("Content-Type", client.register.contentType);
    reply.send(await client.register.metrics());
  });
  console.error("Metrics endpoint registered at /metrics"); // Startup log
}

export default fp(metricsPlugin);
