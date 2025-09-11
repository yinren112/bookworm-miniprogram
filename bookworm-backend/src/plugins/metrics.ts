import fp from 'fastify-plugin';
import * as promClient from 'prom-client';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Create metrics
const register = promClient.register;
const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'status_code', 'route']
});
const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'status_code', 'route']
});

// Collect default metrics (memory, CPU, etc.)
promClient.collectDefaultMetrics({ register });

export default fp(async function metricsPlugin(fastify: FastifyInstance) {
    // Add metrics collection hooks
    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        (request as any).startTime = Date.now();
    });

    fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
        const duration = (Date.now() - (request as any).startTime) / 1000;
        const route = request.routeOptions?.url || request.url;
        
        httpRequestsTotal.labels(request.method, reply.statusCode.toString(), route).inc();
        httpRequestDuration.labels(request.method, reply.statusCode.toString(), route).observe(duration);
    });

    // Add metrics endpoint
    fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
        reply.type('text/plain').send(await register.metrics());
    });
});