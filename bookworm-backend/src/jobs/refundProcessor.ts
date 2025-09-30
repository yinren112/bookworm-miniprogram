// src/jobs/refundProcessor.ts
import db from '../db';
import config from '../config';
import { processPendingRefunds } from '../services/refundService';
import { createWechatPayAdapter } from '../adapters/wechatPayAdapter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Background job to process pending refunds
 * This job runs periodically to handle refunds for cancelled orders
 */
export async function processRefundQueue(): Promise<void> {
  try {
    console.log('Starting refund processing job...');

    // Skip if WeChat Pay is not configured
    if (!config.WXPAY_MCHID || !config.WXPAY_PRIVATE_KEY_PATH) {
      console.log('WeChat Pay not configured, skipping refund processing');
      return;
    }

    // Initialize WeChat Pay adapter
    let privateKeyBuffer: Buffer;
    try {
      const keyPath = path.resolve(config.WXPAY_PRIVATE_KEY_PATH);
      privateKeyBuffer = fs.readFileSync(keyPath);
    } catch (error) {
      console.error('Failed to read WeChat Pay private key file:', error);
      return;
    }

    const wechatPayAdapter = createWechatPayAdapter({
      appid: config.WX_APP_ID,
      mchid: config.WXPAY_MCHID,
      privateKey: privateKeyBuffer,
      serial_no: config.WXPAY_CERT_SERIAL_NO,
      key: config.WXPAY_API_V3_KEY,
    });

    // Process refunds
    const result = await processPendingRefunds(db, wechatPayAdapter);

    console.log(`Refund processing completed: ` +
      `Processed ${result.processedCount} records, ` +
      `${result.successCount} successful, ` +
      `${result.failureCount} failed`);

    if (result.failureCount > 0) {
      console.warn(`${result.failureCount} refunds failed. Reasons:`, result.failures);
    }

  } catch (error) {
    console.error('Refund processing job failed:', error);
    // Don't re-throw to prevent job scheduler from crashing
  }
}
