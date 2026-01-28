// src/jobs/refundProcessor.ts
import db from '../db';
import config from '../config';
import { log } from "../lib/logger";
import { processPendingRefunds } from '../services/refundService';
import { createWechatPayAdapter } from '../adapters/wechatPayAdapter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Background job to process pending refunds
 * This job runs periodically to handle refunds for cancelled orders
 */
export async function processRefundQueue(): Promise<void> {
  const jobName = "refundProcessor";
  try {
    log.info({ jobName }, "Starting refund processing job...");

    // Skip if WeChat Pay is not configured
    if (!config.WXPAY_MCHID || !config.WXPAY_PRIVATE_KEY_PATH) {
      log.warn({ jobName }, "WeChat Pay not configured, skipping refund processing");
      return;
    }

    // Initialize WeChat Pay adapter
    let privateKeyBuffer: Buffer;
    try {
      const keyPath = path.resolve(config.WXPAY_PRIVATE_KEY_PATH);
      privateKeyBuffer = fs.readFileSync(keyPath);
    } catch (error) {
      log.error({ jobName, err: error }, "Failed to read WeChat Pay private key file");
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

    log.info(
      {
        jobName,
        processedCount: result.processedCount,
        successCount: result.successCount,
        failureCount: result.failureCount,
      },
      "Refund processing completed",
    );

    if (result.failureCount > 0) {
      log.warn(
        { jobName, failureCount: result.failureCount, failures: result.failures },
        "Some refunds failed",
      );
    }

  } catch (error) {
    log.error({ jobName, err: error }, "Refund processing job failed");
    // Don't re-throw to prevent job scheduler from crashing
  }
}
