// src/config.ts
import { envSchema } from "env-schema";
import { Static, Type } from "@sinclair/typebox";


const schema = Type.Object({
  // Server
  PORT: Type.Number({ default: 8080 }),
  HOST: Type.String({ default: "127.0.0.1" }),
  NODE_ENV: Type.String({
    enum: ["development", "production", "test"],
    default: "development",
  }),
  LOG_LEVEL: Type.String({ default: "info" }),

  // Database
  DATABASE_URL: Type.String(),

  // JWT
  JWT_SECRET: Type.String(),
  JWT_EXPIRES_IN: Type.String({ default: "7d" }),

  // WeChat Mini Program
  WX_APP_ID: Type.String(),
  WX_APP_SECRET: Type.String(),

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

  // API Rate Limiting
  API_LOGIN_RATE_LIMIT_MAX: Type.Number({ default: 10 }),
  API_FULFILL_RATE_LIMIT_MAX: Type.Number({ default: 30 }),
});

type Schema = Static<typeof schema>;

// The `dotenv: true` option will automatically load the .env file
const config = envSchema<Schema>({
  schema,
  dotenv: true,
});

// Production validation
if (config.NODE_ENV === "production") {
  if (!config.JWT_SECRET || config.JWT_SECRET === "default-secret-for-dev") {
    console.error(
      "FATAL: JWT_SECRET must be set to a strong secret in production.",
    );
    process.exit(1);
  }
  if (!config.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL must be set in production.");
    process.exit(1);
  }
  // Add other critical production checks here
}

export default config;
