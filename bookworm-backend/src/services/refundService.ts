import { PrismaClient, Prisma } from "@prisma/client";
import { WechatPayAdapter } from "../adapters/wechatPayAdapter";
import * as crypto from "crypto";
import { BUSINESS_LIMITS } from "../constants";
import { log } from "../lib/logger";
import { paymentRecordRefundProcessView } from "../db/views";

export async function processPendingRefunds(
  dbCtx: PrismaClient, // This job should use the global client
  wechatPayAdapter: WechatPayAdapter
) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  const recordsToProcess = await dbCtx.paymentRecord.findMany({
    where: {
      refund_attempts: { lt: BUSINESS_LIMITS.MAX_REFUND_ATTEMPTS },
      OR: [
        { status: 'REFUND_REQUIRED' },
        {
          status: 'REFUND_PROCESSING',
          updatedAt: { lt: thirtyMinutesAgo },
        },
      ],
    },
    take: BUSINESS_LIMITS.REFUND_BATCH_SIZE,
  });

  if (recordsToProcess.length === 0) {
    return { processedCount: 0, successCount: 0, failureCount: 0 };
  }

  let successCount = 0;
  let failureCount = 0;
  const failures: { id: number; outTradeNo: string; reason: string }[] = [];

  type LockedPaymentRecord = {
    id: number;
    out_trade_no: string;
    amount_total: number;
    refund_attempts: number;
  };

  const lockedRecords: LockedPaymentRecord[] = [];

  for (const record of recordsToProcess) {
    const locked = await dbCtx.paymentRecord.updateMany({
      where: {
        id: record.id,
        status: record.status,
        updatedAt: record.updatedAt,
      },
      data: {
        status: "REFUND_PROCESSING",
        refund_attempts: { increment: 1 },
      },
    });

    if (locked.count === 0) {
      log.info(`Refund record ${record.id} changed state before locking. Skipping.`);
      continue;
    }

    const refreshedRecord = await dbCtx.paymentRecord.findUnique({
      where: { id: record.id },
      select: paymentRecordRefundProcessView,
    });

    if (!refreshedRecord) {
      log.warn(`Refund record ${record.id} missing after lock acquisition. Skipping.`);
      continue;
    }

    lockedRecords.push({
      id: refreshedRecord.id,
      out_trade_no: refreshedRecord.out_trade_no,
      amount_total: refreshedRecord.amount_total,
      refund_attempts: refreshedRecord.refund_attempts,
    });
  }

  for (const lockedRecord of lockedRecords) {
    try {
      const refundIdHash = crypto
        .createHash('md5')
        .update(`${lockedRecord.out_trade_no}_${lockedRecord.id}`)
        .digest('hex')
        .slice(0, 8);
      const out_refund_no = `RF_${lockedRecord.out_trade_no}_${refundIdHash}`;

      await wechatPayAdapter.createRefund({
        out_trade_no: lockedRecord.out_trade_no,
        out_refund_no,
        amount: {
          refund: lockedRecord.amount_total,
          total: lockedRecord.amount_total,
          currency: 'CNY',
        },
        reason: '订单取消后支付成功',
      });

      await dbCtx.paymentRecord.update({
        where: { id: lockedRecord.id },
        data: {
          status: 'REFUNDED',
          refunded_at: new Date(),
          refund_id: out_refund_no,
        },
      });
      successCount++;
    } catch (error) {
      const outTradeNo = lockedRecord.out_trade_no;
      log.error(`Failed to process refund for out_trade_no: ${outTradeNo}`, error);
      failureCount++;
      const failureReason = error instanceof Error ? error.message : 'Unknown refund failure';
      failures.push({ id: lockedRecord.id, outTradeNo, reason: failureReason });

      const attempts = lockedRecord.refund_attempts;
      const reachedLimit = attempts >= BUSINESS_LIMITS.MAX_REFUND_ATTEMPTS;
      try {
        await dbCtx.paymentRecord.update({
          where: { id: lockedRecord.id },
          data: {
            status: reachedLimit ? 'FAILED' : 'REFUND_REQUIRED',
          },
        });
        if (reachedLimit) {
          log.error(
            `Refund permanently failed after ${BUSINESS_LIMITS.MAX_REFUND_ATTEMPTS} attempts for out_trade_no: ${outTradeNo}`,
          );
        }
      } catch (updateError) {
        log.error(
          `Failed to update status after refund failure for out_trade_no: ${outTradeNo}`,
          updateError,
        );
        throw updateError;
      }
    }
  }

  return {
    processedCount: recordsToProcess.length,
    successCount,
    failureCount,
    failures,
  };
}

export async function markPaymentForRefund(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  outTradeNo: string,
): Promise<void> {
  const updated = await dbCtx.paymentRecord.updateMany({
    where: {
      out_trade_no: outTradeNo,
      status: 'SUCCESS', // Only refund payments that are currently marked as SUCCESS
    },
    data: {
      status: 'REFUND_REQUIRED',
    },
  });

  if (updated.count === 0) {
    log.warn(`No successful payment record found for out_trade_no: ${outTradeNo} - it may have already been refunded or is not in SUCCESS state`);
    // Don't throw error - this is expected behavior for idempotent refund requests
  }
}
