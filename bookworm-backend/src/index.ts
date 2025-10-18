// src/index.ts
import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import { createWechatPayAdapter, WechatPayAdapter } from "./adapters/wechatPayAdapter";
import { Prisma } from "@prisma/client";
import { ApiError, ServiceError } from "./errors";
import config from "./config";
import { verifyDatabaseConstraints } from "./utils/dbVerifier";
import prisma from "./db";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "./constants";
import * as fs from "fs";
import {
  isFastifyHttpError,
  isFastifyValidationError,
  getErrorMessage
} from "./utils/typeGuards";

// Plugins and Routes
import { registerPlugins } from "./plugins";
import { startCronJobs } from "./jobs";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";
import booksRoutes from "./routes/books";
import inventoryRoutes from "./routes/inventory";
import contentRoutes from "./routes/content";
import ordersRoutes from "./routes/orders";
import paymentRoutes from "./routes/payment";
import sellOrdersRoutes from "./routes/sellOrders";
import acquisitionsRoutes from "./routes/acquisitions";
import usersRoutes from "./routes/users";

// --- Type Augmentation for Fastify ---
declare module "fastify" {
  interface FastifyRequest {
    user?: { userId: number; openid: string; role?: string };
    rawBody?: string | Buffer;
  }
  export interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    requireRole: (
      role: "USER" | "STAFF",
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Pino redaction paths: 默认脱敏所有敏感字段
// 参考: https://getpino.io/#/docs/redaction
const sensitiveFields = [
  // Authorization headers
  "headers.authorization",
  "req.headers.authorization",
  "res.headers.authorization",

  // User sensitive data
  "*.phone_number",
  "*.phoneNumber",
  "*.customerPhoneNumber",
  "*.openid",
  "*.unionid",
  "*.pickup_code",
  "*.pickupCode",

  // Request/Response bodies
  "body.phoneNumber",
  "body.customerPhoneNumber",
  "body.phoneCode",
  "req.body.phoneNumber",
  "req.body.customerPhoneNumber",
  "req.body.phoneCode",
  "res.body.phoneNumber",

  // User objects in logs
  "user.phone_number",
  "user.openid",
  "user.unionid",
  "order.pickup_code",
];

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    // 仅在开发环境且明确设置 LOG_EXPOSE_DEBUG=true 时禁用 redaction
    // 生产环境 NEVER 禁用
    redact: config.LOG_EXPOSE_DEBUG && config.NODE_ENV === "development"
      ? [] // 调试模式：不脱敏（仅内存输出，见下方配置）
      : {
          paths: sensitiveFields,
          censor: "[REDACTED]",
        },
    // 在调试模式下，即使不脱敏，也不应写入文件
    // Pino 默认输出到 stdout，由部署环境决定是否落盘
  },
  ajv: {
    customOptions: {
      coerceTypes: true,
      useDefaults: true,
    },
  },
});

// --- WeChat Pay Setup ---
let wechatPayAdapter: WechatPayAdapter | null = null;
try {
  if (
    config.WXPAY_MCHID &&
    config.WXPAY_PRIVATE_KEY_PATH &&
    fs.existsSync(config.WXPAY_PRIVATE_KEY_PATH) &&
    config.WXPAY_CERT_SERIAL_NO &&
    config.WXPAY_API_V3_KEY
  ) {
    wechatPayAdapter = createWechatPayAdapter({
      appid: config.WX_APP_ID,
      mchid: config.WXPAY_MCHID,
      privateKey: fs.readFileSync(config.WXPAY_PRIVATE_KEY_PATH),
      serial_no: config.WXPAY_CERT_SERIAL_NO,
      key: config.WXPAY_API_V3_KEY,
    });
    fastify.log.info("WeChat Pay SDK initialized successfully");
  } else {
    throw new Error(
      "WeChat Pay configuration is incomplete or certificate files are missing.",
    );
  }
} catch (error) {
  console.warn(
    `!!! WARNING: Failed to initialize WeChat Pay SDK. Payment features will be disabled. Reason: ${getErrorMessage(error)}`,
  );
}

// --- Global Error Handler ---
fastify.setErrorHandler(
  async (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(
      { err: error, req: request },
      "An error occurred during the request",
    );

    // Layer 1: Authentication/Authorization errors (401/403)
    if (isFastifyHttpError(error) && (error.statusCode === 401 || error.statusCode === 403)) {
      return reply.code(error.statusCode).send({
        code:
          error.code ||
          (error.statusCode === 401 ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.FORBIDDEN),
        message:
          error.message ||
          (error.statusCode === 401
            ? ERROR_MESSAGES.AUTHENTICATION_REQUIRED
            : ERROR_MESSAGES.ACCESS_DENIED),
      });
    }

    // Layer 2: Request validation errors (400)
    if (isFastifyValidationError(error)) {
      return reply.code(400).send({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: ERROR_MESSAGES.VALIDATION_FAILED,
        details: error.validation,
      });
    }

    // Layer 3: Rate limiting errors (429)
    if (isFastifyHttpError(error) && error.statusCode === 429) {
      return reply.code(429).send({
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: error.message || "Too many requests, please try again later",
      });
    }

    // Layer 4a: Service layer errors (ServiceError) - map to HTTP status codes
    if (error instanceof ServiceError) {
      // Map service error codes to HTTP status codes
      const statusCodeMap: Record<string, number> = {
        'METADATA_SERVICE_UNAVAILABLE': 503,
        // Add more mappings as needed
      };
      const statusCode = statusCodeMap[error.code] || 500;

      return reply.code(statusCode).send({
        code: error.code,
        message: error.message,
      });
    }

    // Layer 4b: HTTP-aware business logic errors (ApiError)
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
      });
    }

    // Layer 5: Prisma database errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return reply.code(404).send({
          code: ERROR_CODES.RECORD_NOT_FOUND,
          message: ERROR_MESSAGES.RECORD_NOT_FOUND,
        });
      }
      if (error.code === "P2002") {
        return reply.code(409).send({
          code: ERROR_CODES.DUPLICATE_RECORD,
          message: ERROR_MESSAGES.DUPLICATE_RECORD,
        });
      }
    }

    // Layer 6: Generic schema validation errors (from Fastify)
    if (isFastifyHttpError(error) && error.statusCode === 400) {
      return reply.code(400).send({
        code: ERROR_CODES.BAD_REQUEST,
        message: error.message || "Invalid request format",
      });
    }

    // Layer 7: Catch-all for unknown errors (500)
    request.log.fatal({ err: error }, "Unhandled error in application");
    reply.code(500).send({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  },
);

// Production configuration validation
const validateProductionConfig = () => {
  if (process.env.NODE_ENV !== "production") {
    return; // Only validate in production
  }

  const criticalMissingConfigs: string[] = [];

  // JWT Secret validation
  if (config.JWT_SECRET === "default-secret-for-dev" || !config.JWT_SECRET) {
    criticalMissingConfigs.push("JWT_SECRET");
  }

  // WeChat App validation
  if (config.WX_APP_ID === "YOUR_APP_ID" || !config.WX_APP_ID) {
    criticalMissingConfigs.push("WX_APP_ID");
  }
  if (config.WX_APP_SECRET === "YOUR_APP_SECRET" || !config.WX_APP_SECRET) {
    criticalMissingConfigs.push("WX_APP_SECRET");
  }

  // Database URL validation
  if (!process.env.DATABASE_URL) {
    criticalMissingConfigs.push("DATABASE_URL");
  }

  if (criticalMissingConfigs.length > 0) {
    console.error("");
    console.error(
      "🚨 FATAL ERROR: Critical configuration missing in production environment!",
    );
    console.error("❌ Missing required environment variables:");
    criticalMissingConfigs.forEach((config) => {
      console.error(`   - ${config}`);
    });
    console.error("");
    console.error(
      "📋 Please set these environment variables and restart the application.",
    );
    console.error(
      "🛑 Shutting down to prevent production deployment with insecure configuration.",
    );
    console.error("");
    process.exit(1);
  }

  console.error("✅ Production configuration validation passed"); // Startup log
};

const setupApplication = async () => {
  // Register all plugins
  await registerPlugins(fastify);

  // Register all routes
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(usersRoutes);
  await fastify.register(booksRoutes);
  await fastify.register(acquisitionsRoutes);
  await fastify.register(inventoryRoutes);
  await fastify.register(contentRoutes);
  await fastify.register(sellOrdersRoutes);
  await fastify.register(ordersRoutes);
  await fastify.register(paymentRoutes, { wechatPayAdapter });
};

// Export function to build app for testing
export const buildApp = async () => {
  await setupApplication();
  return fastify;
};

const start = async () => {
  try {
    validateProductionConfig();
    await verifyDatabaseConstraints(prisma);

    await setupApplication();

    await fastify.listen({ port: config.PORT, host: config.HOST });

    // Start cron jobs after server is running
    startCronJobs(fastify);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Only start the server if this file is executed directly (not imported)
if (require.main === module) {
  start();
}


