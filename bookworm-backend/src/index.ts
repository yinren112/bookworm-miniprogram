// src/index.ts (fully replaced with parser fix)
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import fastifyStatic from '@fastify/static';
import config from './config';
import { addBookToInventory, getAvailableBooks, getBookById } from './services/inventoryService';
import { getBookMetadata } from './services/bookMetadataService';
import { getContentBySlug } from './services/contentService';
import { createOrder, getOrdersByUserId, getOrderById, fulfillOrder, generatePaymentParams, processPaymentNotification, getPendingPickupOrders } from './services/orderService';
import { ApiError } from './errors';
import { wxLogin } from './services/authService';
import authPlugin from './plugins/auth';
import metricsPlugin from './plugins/metrics';
import fastifyRawBody from 'fastify-raw-body';
import rateLimit from '@fastify/rate-limit';
const WechatPay = require('wechatpay-node-v3');
import { Prisma } from '@prisma/client';
import prisma from './db';
import * as fs from 'fs';
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    redact: ['headers.authorization', 'req.headers.authorization']
  }
});

// --- Wechat Pay Setup ---
let pay: any | null = null;
try {
    if (
        config.wxPayMchId &&
        config.wxPayPrivateKeyPath && fs.existsSync(config.wxPayPrivateKeyPath) &&
        config.wxPayPublicKeyPath && fs.existsSync(config.wxPayPublicKeyPath) &&
        config.wxPayCertSerialNo &&
        config.wxPayApiV3Key
    ) {
        pay = new WechatPay({
            appid: config.wxAppId!,
            mchid: config.wxPayMchId!,
            privateKey: fs.readFileSync(config.wxPayPrivateKeyPath!),
            publicKey: fs.readFileSync(config.wxPayPublicKeyPath!), // <-- Added missing public key
            serial_no: config.wxPayCertSerialNo!,
            key: config.wxPayApiV3Key!,
        });
        console.log("WeChat Pay SDK initialized successfully.");
    } else {
        throw new Error("WeChat Pay configuration is incomplete or certificate files are missing.");
    }
} catch (error) {
    console.warn(`!!! WARNING: Failed to initialize WeChat Pay SDK. Payment features will be disabled. Reason: ${(error as Error).message}`);
}

// REMOVED: The global content type parser is gone.
// fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, ...);

// --- Global Error Handler ---
fastify.setErrorHandler(async (error: Error, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error({ err: error, req: request }, 'An error occurred during the request');

    // Handle ApiError - our standardized business logic errors
    if (error instanceof ApiError) {
        return reply.code(error.statusCode).send({ 
            error: error.message, 
            errorCode: error.errorCode 
        });
    }

    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.code(404).send({ 
            error: 'Record not found.', 
            errorCode: 'RECORD_NOT_FOUND' 
        });
    }

    // For all other unknown errors, send a generic 500 response
    reply.code(500).send({ 
        error: 'Internal Server Error', 
        errorCode: 'INTERNAL_ERROR' 
    });
});

// Production configuration validation
const validateProductionConfig = () => {
    if (process.env.NODE_ENV !== 'production') {
        return; // Only validate in production
    }

    const criticalMissingConfigs: string[] = [];

    // JWT Secret validation
    if (config.jwtSecret === 'default-secret-for-dev' || !config.jwtSecret) {
        criticalMissingConfigs.push('JWT_SECRET');
    }

    // WeChat App validation
    if (config.wxAppId === 'YOUR_APP_ID' || !config.wxAppId) {
        criticalMissingConfigs.push('WX_APP_ID');
    }
    if (config.wxAppSecret === 'YOUR_APP_SECRET' || !config.wxAppSecret) {
        criticalMissingConfigs.push('WX_APP_SECRET');
    }

    // Database URL validation
    if (!process.env.DATABASE_URL) {
        criticalMissingConfigs.push('DATABASE_URL');
    }

    if (criticalMissingConfigs.length > 0) {
        console.error('');
        console.error('🚨 FATAL ERROR: Critical configuration missing in production environment!');
        console.error('❌ Missing required environment variables:');
        criticalMissingConfigs.forEach(config => {
            console.error(`   - ${config}`);
        });
        console.error('');
        console.error('📋 Please set these environment variables and restart the application.');
        console.error('🛑 Shutting down to prevent production deployment with insecure configuration.');
        console.error('');
        process.exit(1);
    }

    console.log('✅ Production configuration validation passed');
};

const setupPluginsAndRoutes = async () => {
    // Register plugins first - MUST be awaited in correct order
    await fastify.register(fastifyStatic, { root: path.join(__dirname, '..', 'public'), prefix: '/admin/' });
    await fastify.register(authPlugin);
    await fastify.register(metricsPlugin);
    await fastify.register(fastifyRawBody, {
        field: 'rawBody',
        global: false, // 只在需要的路由上启用
        encoding: 'utf8',
        runFirst: true
    });
    await fastify.register(rateLimit, {
        global: false, // 我们按路由单独配置
    });

    // Now all routes can be defined safely
    setupRoutes();
};

const setupRoutes = () => {
    // Health Check Endpoint
    fastify.get('/api/health', async (request, reply) => {
        const checks: { [key: string]: string } = {};
        let allHealthy = true;

        // Database connectivity check
        try {
            await prisma.$queryRaw`SELECT 1`;
            checks.database = 'ok';
        } catch (error) {
            request.log.error(error, 'Database health check failed');
            checks.database = 'failed';
            allHealthy = false;
        }

        if (allHealthy) {
            reply.send({
                status: 'ok',
                timestamp: new Date().toISOString(),
                checks
            });
        } else {
            reply.code(503).send({
                status: 'error',
                timestamp: new Date().toISOString(),
                checks
            });
        }
    });

    // Auth routes
    fastify.post('/api/auth/login', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
    }, async (request, reply) => {
        const { code } = request.body as { code: string };
        if (!code) { return reply.code(400).send({ error: 'Code is required.' }); }
        const { token, user } = await wxLogin(code);
        reply.send({ token, userId: user.id });
    });

    // Books metadata
    fastify.get('/api/books/meta', async (request, reply) => {
        const query = request.query as { isbn?: string };
        if (!query.isbn) { 
            return reply.code(400).send({ error: 'ISBN parameter is required.' }); 
        }
        
        const metadata = await getBookMetadata(query.isbn);
        if (!metadata) { 
            return reply.code(404).send({ error: 'Book metadata not found.' }); 
        }
        
        reply.send(metadata);
    });

    // Inventory routes
    fastify.get('/api/inventory/available', async (request, reply) => {
        const query = request.query as { search?: string; page?: string; limit?: string };
        const books = await getAvailableBooks({
            searchTerm: query.search,
            page: query.page ? parseInt(query.page, 10) : undefined,
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
        });
        reply.send(books);
    });
    
    fastify.get('/api/inventory/item/:id', async (request, reply) => {
        const params = request.params as { id: string };
        const id = parseInt(params.id, 10);
        if (isNaN(id)) { return reply.code(400).send({ error: 'Invalid item ID.' }); }
        const book = await getBookById(id);
        if (!book) { return reply.code(404).send({ error: 'Book not found.' }); }
        reply.send(book);
    });
    
    fastify.post('/api/inventory/add', { preHandler: [fastify.authenticate, fastify.requireRole('STAFF')] }, async (request, reply) => {
        const newItem = await addBookToInventory(request.body as any);
        reply.code(201).send(newItem);
    });

    // Content Management
    fastify.get('/api/content/:slug', async (request, reply) => {
        const params = request.params as { slug: string };
        const content = await getContentBySlug(params.slug);
        reply.send(content);
    });

    // Order routes
    fastify.post('/api/orders/create', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { inventoryItemIds } = request.body as { inventoryItemIds: number[] };
        const order = await createOrder({ userId: request.user!.userId, inventoryItemIds });
        reply.code(201).send(order);
    });

    fastify.get('/api/orders/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const orderId = parseInt(id, 10);
        if (isNaN(orderId)) return reply.code(400).send({ error: 'Invalid order ID' });
        const order = await getOrderById(orderId);
        const user = await prisma.user.findUnique({ where: { id: request.user!.userId }, select: { role: true } });
        if (order.user_id !== request.user!.userId && user?.role !== 'STAFF') {
            return reply.code(403).send({ error: 'Forbidden' });
        }
        reply.send(order);
    });

    fastify.get('/api/orders/user/:userId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        if (parseInt(userId, 10) !== request.user!.userId) {
            return reply.code(403).send({ error: 'Forbidden' });
        }
        const orders = await getOrdersByUserId(request.user!.userId);
        reply.send(orders);
    });

    fastify.post('/api/orders/fulfill', {
        preHandler: [fastify.authenticate, fastify.requireRole('STAFF')],
        config: {
            rateLimit: {
                max: 30,
                timeWindow: '1 minute',
                keyGenerator: (req) => req.user?.userId.toString() || req.ip
            }
        }
    }, async (request, reply) => {
        const { pickupCode } = request.body as { pickupCode: string };
        if (!pickupCode) { return reply.code(400).send({ error: 'pickupCode is required.' }); }
        const order = await fulfillOrder(pickupCode.toUpperCase());
        reply.send(order);
    });

    fastify.get('/api/orders/pending-pickup', { preHandler: [fastify.authenticate, fastify.requireRole('STAFF')] }, async (request, reply) => {
        const orders = await getPendingPickupOrders();
        reply.send(orders);
    });

    fastify.post('/api/orders/:orderId/pay', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        if (!pay) return reply.code(503).send({ error: 'Payment service is not configured.' });
        const { orderId } = request.params as { orderId: string };
        const paymentParams = await generatePaymentParams(pay, parseInt(orderId, 10), request.user!.userId);
        reply.send(paymentParams);
    });

    // Payment callback
    fastify.post('/api/payment/notify', { config: { rawBody: true } }, async (request, reply) => {
        if (!pay) {
            request.log.error('WeChat Pay is not configured, cannot process notification.');
            return reply.code(503).send({ error: 'Payment service unavailable.' });
        }

        try {
            const rawBody = (request as any).rawBody as string;
            if (!rawBody) {
                throw new Error("Missing raw body for payment notification");
            }

            const isVerified = pay.verifySign({
                timestamp: request.headers['wechatpay-timestamp'] as string,
                nonce: request.headers['wechatpay-nonce'] as string,
                body: rawBody,
                signature: request.headers['wechatpay-signature'] as string,
                serial: request.headers['wechatpay-serial'] as string,
            });

            if (!isVerified) {
                request.log.warn('Payment notification signature verification failed.');
                return reply.code(400).send({ code: 'FAIL', message: '验签失败' });
            }

            const { resource } = JSON.parse(rawBody);
            const decryptedData = pay.decipher_gcm(
                resource.ciphertext,
                resource.associated_data,
                resource.nonce,
                config.wxPayApiV3Key!
            );
            
            const notificationData = JSON.parse(decryptedData as string);

            if (notificationData.trade_state === 'SUCCESS') {
                await processPaymentNotification(notificationData);
            }

            reply.code(200).send({ code: 'SUCCESS', message: '成功' });

        } catch (e) {
            request.log.error({ err: e }, 'Payment notification processing failed');
            reply.code(400).send({ code: 'FAIL', message: '处理失败' });
        }
    });
};

const start = async () => {
    try {
        validateProductionConfig();
        await setupPluginsAndRoutes();
        await fastify.listen({ port: config.port as number, host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();