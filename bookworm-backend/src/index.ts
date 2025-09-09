// src/index.ts (fully replaced with parser fix)
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fastifyStatic from '@fastify/static';
import config from './config';
import { addBookToInventory, getAvailableBooks, getBookById, getBookMetadata } from './services/inventoryService';
import { createOrder, getOrdersByUserId, fulfillOrder, generatePaymentParams, processPaymentNotification, ItemNotAvailableError, FulfillmentError } from './services/orderService';
import { wxLogin } from './services/authService';
import WechatPay from 'wechatpay-node-v3';
import { Prisma } from '@prisma/client';
import fs from 'fs';

const fastify = Fastify({ logger: true });

fastify.register(fastifyStatic, { root: path.join(__dirname, '..', 'public'), prefix: '/admin/' });

// --- Wechat Pay Setup ---
let pay: WechatPay | null = null;
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

    // Handle specific business logic errors
    if (error instanceof ItemNotAvailableError || error instanceof FulfillmentError) {
        return reply.code(409).send({ error: error.message });
    }

    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.code(404).send({ error: 'Record not found.' });
    }

    // For all other unknown errors, send a generic 500 response
    reply.code(500).send({ error: 'Internal Server Error' });
});

// --- API Routes ---

// Auth
fastify.post('/api/auth/login', async (request, reply) => {
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

// Inventory
fastify.get('/api/inventory/available', async (request, reply) => {
    const query = request.query as { search?: string };
    const books = await getAvailableBooks(query.search);
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
fastify.post('/api/inventory/add', async (request, reply) => {
    console.log('DEBUG: request.body =', request.body);
    console.log('DEBUG: request.body type =', typeof request.body);
    const newItem = await addBookToInventory(request.body as any);
    reply.code(201).send(newItem);
});

// Orders
fastify.post('/api/orders/create', async (request, reply) => {
    const order = await createOrder(request.body as any);
    reply.code(201).send(order);
});
fastify.get('/api/orders/user/:userId', async (request, reply) => {
    const params = request.params as { userId: string };
    const userId = parseInt(params.userId, 10);
    if (isNaN(userId)) { return reply.code(400).send({ error: 'Invalid user ID.' }); }
    const orders = await getOrdersByUserId(userId);
    reply.send(orders);
});
fastify.post('/api/orders/fulfill', async (request, reply) => {
    const { pickupCode } = request.body as { pickupCode: string };
    if (!pickupCode) { return reply.code(400).send({ error: 'pickupCode is required.' }); }
    const order = await fulfillOrder(pickupCode.toUpperCase());
    reply.send(order);
});

// Generate payment parameters for an order
fastify.post('/api/orders/:orderId/pay', async (request, reply) => {
    if (!pay) {
        return reply.code(503).send({ error: 'Payment service is not configured.' });
    }
    
    const params = request.params as { orderId: string };
    const orderId = parseInt(params.orderId, 10);
    if (isNaN(orderId)) { return reply.code(400).send({ error: 'Invalid order ID.' }); }
    
    const { openid } = request.body as { openid: string };
    if (!openid) { return reply.code(400).send({ error: 'openid is required.' }); }
    
    const paymentData = await generatePaymentParams(orderId, openid);
    reply.send(paymentData);
});

// Payment Notification Webhook
// We create a custom content-type for WeChat Pay to avoid conflicts
fastify.addContentTypeParser('application/wechat-pay', { parseAs: 'buffer' }, (request, payload, done) => {
    done(null, payload);
});

fastify.post('/api/payment/notify', { config: { rawBody: true } }, async (request, reply) => {
    if (!pay) {
        request.log.error('WeChat Pay is not configured, cannot process notification.');
        return reply.code(503).send({ error: 'Payment service unavailable.' });
    }

    try {
        // Convert Buffer to string for processing
        const rawBody = (request.body as Buffer).toString('utf8');

        // Step 1: Verify the signature
        const isVerified = pay.verifySign({
            timestamp: request.headers['wechatpay-timestamp'] as string,
            nonce: request.headers['wechatpay-nonce'] as string,
            body: rawBody, // Now string type, compatible with verifySign
            signature: request.headers['wechatpay-signature'] as string,
            serial: request.headers['wechatpay-serial'] as string,
        });

        if (!isVerified) {
            request.log.warn('Payment notification signature verification failed.');
            return reply.code(400).send({ code: 'FAIL', message: '验签失败' });
        }

        // Step 2: Parse JSON to get encrypted resource
        const requestData = JSON.parse(rawBody);
        const { resource } = requestData;
        
        // Step 3: Decrypt the notification content
        const decryptedData = pay.decipher_gcm(
            resource.ciphertext,
            resource.associated_data,
            resource.nonce,
            config.wxPayApiV3Key!
        );
        
        // Step 4: Parse decrypted data with type assertion
        const notificationData = JSON.parse(decryptedData as string);

        // Step 5: Process the business logic
        if (notificationData.trade_state === 'SUCCESS') {
            await processPaymentNotification(notificationData);
        }

        reply.code(200).send({ code: 'SUCCESS', message: '成功' });

    } catch (e) {
        request.log.error({ err: e }, 'Payment notification processing failed');
        reply.code(400).send({ code: 'FAIL', message: '处理失败' });
    }
});

const start = async () => {
    try {
        await fastify.listen({ port: config.port as number, host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();