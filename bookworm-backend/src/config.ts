// src/config.ts
import { envSchema } from "env-schema";
import { Static, Type } from "@sinclair/typebox";
import * as fs from "fs";

const isTestRuntime =
  process.env.NODE_ENV === "test" ||
  process.env.npm_lifecycle_event === "test" ||
  typeof process.env.VITEST !== "undefined";

const schema = Type.Object({
  // Server
  PORT: Type.Number({ default: 8080 }),
  HOST: Type.String({ default: "127.0.0.1" }),
  NODE_ENV: Type.String({
    enum: ["development", "production", "staging", "test"],
    default: "development",
  }),
  LOG_LEVEL: Type.String({ default: "info" }),

  // Database
  DATABASE_URL: Type.String(
    isTestRuntime ? { default: "postgresql://test:test@localhost:5432/test" } : {},
  ),

  // JWT
  JWT_SECRET: Type.String(isTestRuntime ? { default: "test-secret" } : {}),
  JWT_EXPIRES_IN: Type.String({ default: "7d" }),

  // WeChat Mini Program
  WX_APP_ID: Type.String(isTestRuntime ? { default: "test-app-id" } : {}),
  WX_APP_SECRET: Type.String(isTestRuntime ? { default: "test-app-secret" } : {}),

  // WeChat Pay (optional, can be empty strings in dev)
  WXPAY_MCHID: Type.String({ default: "" }),
  WXPAY_PRIVATE_KEY_PATH: Type.String({ default: "" }),
  WXPAY_CERT_SERIAL_NO: Type.String({ default: "" }),
  WXPAY_API_V3_KEY: Type.String({ default: "" }),
  WXPAY_NOTIFY_URL: Type.String({ default: "" }),

  // Tanshu API
  TANSHU_API_KEY: Type.String({ default: "" }),

  // Business Logic Constants ("Magic Numbers")
  ORDER_PAYMENT_TTL_MINUTES: Type.Number({ default: 15 }),
  ORDER_PICKUP_CODE_LENGTH: Type.Number({ default: 10 }),
  ORDER_PICKUP_CODE_BYTES: Type.Number({ default: 5 }),
  MAX_ITEMS_PER_ORDER: Type.Number({ default: 10 }),
  MAX_RESERVED_ITEMS_PER_USER: Type.Number({ default: 20 }),
  API_RATE_LIMIT_MAX: Type.Number({ default: 5 }),
  API_RATE_LIMIT_WINDOW_MINUTES: Type.Number({ default: 1 }),

  // Database Transaction Retry Configuration
  DB_TRANSACTION_RETRY_COUNT: Type.Number({ default: 3 }),
  DB_TRANSACTION_RETRY_BASE_DELAY_MS: Type.Number({ default: 20 }),
  DB_TRANSACTION_RETRY_JITTER_MS: Type.Number({ default: 40 }),
  PICKUP_CODE_RETRY_COUNT: Type.Number({ default: 5 }),

  // Payment Security
  PAYMENT_TIMESTAMP_TOLERANCE_SECONDS: Type.Number({ default: 300 }),

  // Scheduled Job Configuration
  CRON_ORDER_CLEANUP: Type.String({ default: "*/1 * * * *" }),
  CRON_INVENTORY_METRICS: Type.String({ default: "*/5 * * * *" }),
  CRON_WECHAT_CERT_REFRESH: Type.String({ default: "0 */10 * * *" }),
  CRON_REFUND_PROCESSOR: Type.String({ default: "*/10 * * * *" }),
  CRON_STUDY_REMINDER: Type.String({ default: "0 9 * * *" }),
  // Weekly reset: Monday 00:00 Beijing time (UTC+8) = Sunday 16:00 UTC
  CRON_WEEKLY_POINTS_RESET: Type.String({ default: "0 16 * * 0" }),

  // Study Reminder Template
  STUDY_REMINDER_TEMPLATE_ID: Type.String({ default: "" }),

  // API Rate Limiting
  API_LOGIN_RATE_LIMIT_MAX: Type.Number({ default: 10 }),
  API_FULFILL_RATE_LIMIT_MAX: Type.Number({ default: 30 }),

  // Logging Security
  LOG_EXPOSE_DEBUG: Type.Boolean({ default: false }), // DANGER: 仅在本地调试时设为 true，禁止在生产环境使用

  // Metrics
  METRICS_AUTH_TOKEN: Type.String({ default: "" }),
  METRICS_ALLOW_ANONYMOUS: Type.Boolean({ default: false }),

  // CORS Configuration
  // 逗号分隔的允许来源列表，例如: "https://example.com,https://app.example.com"
  // 留空表示禁用 CORS（仅限开发环境）
  CORS_ORIGIN: Type.String({ default: "" }),
});

type Schema = Static<typeof schema>;

// The `dotenv: true` option will automatically load the .env file
const config = envSchema<Schema>({
  schema,
  dotenv: !isTestRuntime,
});

// Strong secret validation helper
function validateSecretStrength(name: string, value: string): string[] {
  const errors: string[] = [];
  const weakPatterns = ['secret', 'password', 'changeme', '123456', 'jwtsecret', 'default'];

  if (value.length < 32) {
    errors.push(`${name} must be at least 32 characters long (current: ${value.length})`);
  }

  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSpecial = /[^A-Za-z0-9]/.test(value);

  if (!(hasLower && hasUpper && hasDigit && hasSpecial)) {
    errors.push(`${name} must contain lowercase, uppercase, digits, and special characters`);
  }

  const lowerValue = value.toLowerCase();
  for (const pattern of weakPatterns) {
    if (lowerValue.includes(pattern)) {
      errors.push(`${name} contains weak pattern: "${pattern}"`);
      break;
    }
  }

  return errors;
}

// Production validation
if (config.NODE_ENV === "production" || config.NODE_ENV === "staging") {
  const errors: string[] = [];

  // JWT Configuration with strength validation
  if (!config.JWT_SECRET || config.JWT_SECRET === "default-secret-for-dev") {
    errors.push("JWT_SECRET must be set to a strong secret in production.");
  } else {
    errors.push(...validateSecretStrength('JWT_SECRET', config.JWT_SECRET));
  }

  // Database Configuration
  if (!config.DATABASE_URL) {
    errors.push("DATABASE_URL must be set in production.");
  }

  // WeChat Mini Program Configuration
  if (!config.WX_APP_ID || config.WX_APP_ID === "test-app-id") {
    errors.push(
      "WX_APP_ID must be set to a valid WeChat app ID in production.",
    );
  } else if (config.WX_APP_ID.startsWith("dummy")) {
    errors.push(
      "WX_APP_ID must not use dummy values in production.",
    );
  }
  if (!config.WX_APP_SECRET || config.WX_APP_SECRET === "test-app-secret") {
    errors.push(
      "WX_APP_SECRET must be set to a valid WeChat app secret in production.",
    );
  } else if (config.WX_APP_SECRET.startsWith("dummy")) {
    errors.push(
      "WX_APP_SECRET must not use dummy values in production.",
    );
  }

  // WeChat Pay Configuration (only required in production, not staging)
  if (config.NODE_ENV === "production") {
    if (!config.WXPAY_MCHID) {
      errors.push("WXPAY_MCHID must be set in production.");
    }
    if (!config.WXPAY_PRIVATE_KEY_PATH) {
      errors.push("WXPAY_PRIVATE_KEY_PATH must be set in production.");
    } else if (!fs.existsSync(config.WXPAY_PRIVATE_KEY_PATH)) {
      errors.push(
        `WXPAY_PRIVATE_KEY_PATH does not exist: ${config.WXPAY_PRIVATE_KEY_PATH}`,
      );
    }
    if (!config.WXPAY_CERT_SERIAL_NO) {
      errors.push("WXPAY_CERT_SERIAL_NO must be set in production.");
    }
    if (!config.WXPAY_API_V3_KEY) {
      errors.push("WXPAY_API_V3_KEY must be set in production.");
    }
    if (!config.WXPAY_NOTIFY_URL) {
      errors.push("WXPAY_NOTIFY_URL must be set in production.");
    }
  }

  // Logging Security Validation
  if (config.LOG_EXPOSE_DEBUG) {
    errors.push(
      "LOG_EXPOSE_DEBUG must be false in production. This setting exposes sensitive data in logs."
    );
  }

  if (!config.METRICS_ALLOW_ANONYMOUS && !config.METRICS_AUTH_TOKEN) {
    errors.push(
      "METRICS_AUTH_TOKEN must be set in production/staging (or set METRICS_ALLOW_ANONYMOUS=true and restrict /metrics at the network layer).",
    );
  }

  // Network binding must be reachable in production/staging
  if (!config.HOST || config.HOST === "127.0.0.1" || config.HOST === "localhost") {
    errors.push("HOST must be set to 0.0.0.0 (or a routable address) in production.");
  }

  // CORS must be explicitly configured for web admin
  if (!config.CORS_ORIGIN) {
    errors.push("CORS_ORIGIN must be set in production.");
  }

  if (errors.length > 0) {
    console.error("FATAL: Production configuration validation failed:");
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }
}

export default config;
