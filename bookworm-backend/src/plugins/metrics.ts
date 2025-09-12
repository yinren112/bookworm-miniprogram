// src/plugins/metrics.ts
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import client from 'prom-client';

// 启用默认的 Node.js 指标 (CPU, memory, etc.)
client.collectDefaultMetrics();

// --- 定义我们的核心业务指标 ---

export const metrics = {
  ordersCreated: new client.Counter({
    name: 'bookworm_orders_created_total',
    help: 'Total number of orders created',
  }),
  ordersCompleted: new client.Counter({
    name: 'bookworm_orders_completed_total',
    help: 'Total number of orders successfully fulfilled (picked up)',
  }),
  paymentsProcessed: new client.Counter({
    name: 'bookworm_payments_processed_total',
    help: 'Total number of payment notifications processed',
    labelNames: ['status'], // 'success', 'refund_required', 'failure'
  }),
  dbTransactionRetries: new client.Counter({
    name: 'bookworm_db_transaction_retries_total',
    help: 'Total number of database transaction retries due to serialization conflicts',
  }),
  inventoryStatus: new client.Gauge({
    name: 'bookworm_inventory_items_count',
    help: 'Current number of inventory items by status',
    labelNames: ['status'], // 'in_stock', 'reserved', 'sold', etc.
  }),
};

async function metricsPlugin(fastify: FastifyInstance) {
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', client.register.contentType);
    reply.send(await client.register.metrics());
  });
  console.log('Metrics endpoint registered at /metrics');
}

export default fp(metricsPlugin);