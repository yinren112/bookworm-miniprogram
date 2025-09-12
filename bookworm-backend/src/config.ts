// src/config.ts
import { envSchema } from 'env-schema';
import { Static, Type } from '@sinclair/typebox';

const schema = Type.Object({
    // Server
    PORT: Type.Number({ default: 3000 }),
    HOST: Type.String({ default: '0.0.0.0' }),
    NODE_ENV: Type.String({ enum: ['development', 'production', 'test'], default: 'development' }),
    LOG_LEVEL: Type.String({ default: 'info' }),

    // Database
    DATABASE_URL: Type.String(),

    // JWT
    JWT_SECRET: Type.String(),
    JWT_EXPIRES_IN: Type.String({ default: '7d' }),

    // WeChat Mini Program
    WX_APP_ID: Type.String(),
    WX_APP_SECRET: Type.String(),

    // WeChat Pay (optional, can be empty strings in dev)
    WXPAY_MCHID: Type.String({ default: '' }),
    WXPAY_PRIVATE_KEY_PATH: Type.String({ default: '' }),
    WXPAY_CERT_SERIAL_NO: Type.String({ default: '' }),
    WXPAY_API_V3_KEY: Type.String({ default: '' }),
    WXPAY_NOTIFY_URL: Type.String({ default: '' }),
    
    // Tanshu API
    TANSHU_API_KEY: Type.String({ default: '' }),

    // Business Logic Constants ("Magic Numbers")
    ORDER_PAYMENT_TTL_MINUTES: Type.Number({ default: 15 }),
    ORDER_PICKUP_CODE_LENGTH: Type.Number({ default: 8 }),
    ORDER_PICKUP_CODE_BYTES: Type.Number({ default: 5 }),
    MAX_PENDING_ORDERS_PER_USER: Type.Number({ default: 3 }),
    MAX_ITEMS_PER_ORDER: Type.Number({ default: 10 }),
    API_RATE_LIMIT_MAX: Type.Number({ default: 5 }),
    API_RATE_LIMIT_WINDOW_MINUTES: Type.Number({ default: 1 }),
});

type Schema = Static<typeof schema>;

// The `dotenv: true` option will automatically load the .env file
const config = envSchema<Schema>({
    schema,
    dotenv: true
});

// Production validation
if (config.NODE_ENV === 'production') {
    if (!config.JWT_SECRET || config.JWT_SECRET === 'default-secret-for-dev') {
        console.error('FATAL: JWT_SECRET must be set to a strong secret in production.');
        process.exit(1);
    }
    if (!config.DATABASE_URL) {
        console.error('FATAL: DATABASE_URL must be set in production.');
        process.exit(1);
    }
    // Add other critical production checks here
}

export default config;