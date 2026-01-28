// src/index.ts
import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { createWechatPayAdapter, WechatPayAdapter } from "./adapters/wechatPayAdapter";
import { ApiError, ServiceError } from "./errors";
import config from "./config";
import { verifyDatabaseConstraints } from "./utils/dbVerifier";
import prisma from "./db";
import { ERROR_CODES, ERROR_MESSAGES } from "./constants";
import * as fs from "fs";
import * as crypto from "crypto";
import path from "path";
import { sanitizeObject } from "./lib/logSanitizer";
import {
  isFastifyHttpError,
  isFastifyValidationError,
  getErrorMessage,
  isPrismaKnownError,
} from "./utils/typeGuards";
import { prismaErrorToApiError } from "./utils/prismaError";

// Plugins and Routes
import { registerPlugins } from "./plugins";
import { startCronJobs, stopCronJobs } from "./jobs";
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
import studyRoutes from "./routes/study";

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
  requestIdHeader: "x-request-id",
  genReqId: (req) => {
    const rawHeader = req.headers["x-request-id"];
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (typeof headerValue === "string") {
      const trimmed = headerValue.trim();
      if (trimmed) return trimmed.slice(0, 128);
    }
    return crypto.randomUUID();
  },
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

const errorLogPath = path.resolve(process.cwd(), "logs", "server-errors.log");

const sanitizePayload = (value: unknown) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== "object") return item;
      return sanitizeObject(item as Record<string, unknown>);
    });
  }
  return sanitizeObject(value as Record<string, unknown>);
};

const writeErrorLog = async (error: unknown, request: FastifyRequest) => {
  try {
    await fs.promises.mkdir(path.dirname(errorLogPath), { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      requestId: request.id,
      userId: request.user?.userId ?? null,
      params: sanitizePayload(request.params),
      query: sanitizePayload(request.query),
      body: sanitizePayload(request.body),
      statusCode: isFastifyHttpError(error) ? error.statusCode : undefined,
      code:
        error instanceof ApiError
          ? error.code
          : (error as { code?: string | undefined })?.code,
      message: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    await fs.promises.appendFile(
      errorLogPath,
      `${JSON.stringify(payload)}\n`,
      "utf8",
    );
  } catch (logError) {
    request.log.warn({ err: logError }, "Failed to write error log file");
  }
};

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
    reply.header("x-request-id", request.id);
    request.log.error(
      { err: error, req: request, requestId: request.id },
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
      // NOTE: All new ServiceError codes MUST be added here with explicit HTTP status
      const statusCodeMap: Record<string, number> = {
        // External service errors
        'METADATA_SERVICE_UNAVAILABLE': 503,
        'WECHAT_PHONE_NUMBER_UNAVAILABLE': 503,
        // Image proxy errors
        'IMAGE_PROXY_INVALID_URL': 400,
        'IMAGE_PROXY_HOST_NOT_ALLOWED': 403,
        'IMAGE_PROXY_FETCH_FAILED': 502,
        // Study module errors (StudyServiceError)
        'COURSE_NOT_FOUND': 404,
        'COURSE_NOT_PUBLISHED': 400,
        'CARD_NOT_FOUND': 404,
        'CARD_DAILY_LIMIT_REACHED': 429,
        'QUESTION_NOT_FOUND': 404,
        'FEEDBACK_TARGET_REQUIRED': 400,
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
    const prismaApiError = prismaErrorToApiError(error);
    if (prismaApiError) {
      return reply.code(prismaApiError.statusCode).send({
        code: prismaApiError.code,
        message: prismaApiError.message,
      });
    }

    if (isPrismaKnownError(error)) {
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
    await writeErrorLog(error, request);
    request.log.fatal({ err: error }, "Unhandled error in application");
    reply.code(500).send({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  },
);

const setupApplication = async () => {
  const reqStartKey = Symbol.for("reqStartNs");
  fastify.addHook("onRequest", async (request, reply) => {
    (request as unknown as Record<symbol, bigint>)[reqStartKey] = process.hrtime.bigint();
    reply.header("x-request-id", request.id);
    const remoteAddress = request.ip || request.socket.remoteAddress || "";
    fastify.log.info(
      { requestId: request.id, method: request.method, url: request.url, remoteAddress },
      "onRequest",
    );
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const start = (request as unknown as Record<symbol, bigint>)[reqStartKey];
    const durationMs = start ? Number(process.hrtime.bigint() - start) / 1e6 : null;
    fastify.log.info(
      { requestId: request.id, statusCode: reply.statusCode, durationMs },
      "onResponse",
    );
  });

  // Register CORS plugin
  // 微信小程序不受浏览器CORS限制，但Web管理后台需要
  if (config.CORS_ORIGIN) {
    await fastify.register(cors, {
      origin: config.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    });
    fastify.log.info(`CORS enabled for origins: ${config.CORS_ORIGIN}`);
  } else if (config.NODE_ENV === "development") {
    // 开发环境：允许所有来源（仅用于本地调试）
    await fastify.register(cors, { origin: true });
    fastify.log.warn("CORS enabled for all origins (development mode)");
  }

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
  await fastify.register(studyRoutes);
};

// Export function to build app for testing
export const buildApp = async () => {
  await setupApplication();
  return fastify;
};

const start = async () => {
  try {
    await verifyDatabaseConstraints(prisma);

    await setupApplication();

    await fastify.listen({ port: config.PORT, host: config.HOST });

    // Start cron jobs after server is running
    startCronJobs(fastify);

    // 注册优雅关闭处理器
    const gracefulShutdown = async (signal: string) => {
      fastify.log.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        // 1. 停止接受新请求
        await fastify.close();
        fastify.log.info("HTTP server closed");

        // 2. 停止定时任务并等待正在执行的任务完成
        await stopCronJobs();

        // 3. 关闭数据库连接
        await prisma.$disconnect();
        fastify.log.info("Database connection closed");

        fastify.log.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        fastify.log.error(error, "Error during graceful shutdown");
        process.exit(1);
      }
    };

    // 监听终止信号
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Only start the server if this file is executed directly (not imported)
if (require.main === module) {
  start();
}


