// src/config.ts
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const config = {
  // Server config
  port: process.env.PORT || 3000,
  
  // JWT config
  jwtSecret: process.env.JWT_SECRET || 'default-secret-for-dev',

  // WeChat Mini Program config
  wxAppId: process.env.WX_APP_ID || 'YOUR_APP_ID',
  wxAppSecret: process.env.WX_APP_SECRET || 'YOUR_APP_SECRET',

  // WeChat Pay config
  wxPayMchId: process.env.WXPAY_MCHID,
  wxPayPrivateKeyPath: process.env.WXPAY_PRIVATE_KEY_PATH,
  wxPayPrivateKey: (() => {
    const keyPath = process.env.WXPAY_PRIVATE_KEY_PATH;
    if (!keyPath || keyPath === 'C:\\path\\to\\your\\apiclient_key.pem' || keyPath === '/path/to/your/apiclient_key.pem') {
      return undefined;
    }
    try {
      return fs.readFileSync(keyPath);
    } catch (error) {
      console.warn(`!!! WARNING: Cannot read WeChat Pay private key from ${keyPath}:`, (error as Error).message);
      return undefined;
    }
  })(),
  wxPayPublicKeyPath: process.env.WXPAY_PUBLIC_KEY_PATH,
  wxPayCertSerialNo: process.env.WXPAY_CERT_SERIAL_NO,
  wxPayApiV3Key: process.env.WXPAY_API_V3_KEY,
  wxPayNotifyUrl: process.env.WXPAY_NOTIFY_URL,

  // Database URL is read by Prisma from .env directly
};

// Validate essential configs
if (config.jwtSecret === 'default-secret-for-dev') {
    console.warn('!!! WARNING: Using default JWT_SECRET. Please set it in .env file for production.');
}
if (config.wxAppId === 'YOUR_APP_ID' || config.wxAppSecret === 'YOUR_APP_SECRET') {
    console.warn('!!! WARNING: WX_APP_ID or WX_APP_SECRET are not configured in .env file.');
}
if (!config.wxPayMchId || !config.wxPayPrivateKey || !config.wxPayCertSerialNo || !config.wxPayApiV3Key) {
    console.warn('!!! WARNING: WeChat Pay configuration is incomplete. Payment features will not work.');
}

export default config;