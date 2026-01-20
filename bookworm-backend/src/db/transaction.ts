import { Prisma, PrismaClient } from "@prisma/client";
import config from "../config";
import { metrics } from "../plugins/metrics";

export interface TxRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  jitter?: boolean;
  jitterMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
  transactionOptions?: {
    maxWait?: number;
    timeout?: number;
  };
}

const DEFAULT_OPTIONS: Required<Omit<TxRetryOptions, "transactionOptions">> = {
  maxRetries: config.DB_TRANSACTION_RETRY_COUNT,
  baseDelayMs: config.DB_TRANSACTION_RETRY_BASE_DELAY_MS,
  jitter: true,
  jitterMs: config.DB_TRANSACTION_RETRY_JITTER_MS,
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

const RETRYABLE_PRISMA_CODES = new Set(["P2034"]);
const RETRYABLE_PG_CODES = new Set(["40001", "40P01", "55P03"]);

function getPgCode(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const meta = error.meta as { code?: string } | undefined;
  if (meta?.code) {
    return String(meta.code);
  }
  const match = /SQLSTATE\s+"(?<code>\w{5})"/i.exec(error.message);
  return match?.groups?.code;
}

export function isRetryableTxError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (RETRYABLE_PRISMA_CODES.has(error.code)) {
      return true;
    }

    const pgCode = getPgCode(error);
    if (pgCode && RETRYABLE_PG_CODES.has(pgCode)) {
      return true;
    }
  }

  if (typeof error === "object" && error !== null) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode && RETRYABLE_PG_CODES.has(String(pgCode))) {
      return true;
    }

    const message = (error as { message?: string }).message?.toLowerCase() ?? "";
    if (
      message.includes("deadlock detected") ||
      message.includes("could not serialize access due to") ||
      message.includes("could not serialize transaction")
    ) {
      return true;
    }
  }

  return false;
}

export async function withTxRetry<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TxRetryOptions = {},
): Promise<T> {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const { maxRetries, baseDelayMs, jitter, jitterMs, isolationLevel, transactionOptions } = merged;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(
        (tx) => fn(tx),
        {
          isolationLevel,
          ...transactionOptions,
        },
      );
    } catch (error) {
      const shouldRetry = isRetryableTxError(error);
      const lastAttempt = attempt === maxRetries;

      if (!shouldRetry || lastAttempt) {
        throw error;
      }

      metrics.dbTransactionRetries.inc();

      const retryIndex = attempt + 1;
      const backoff = baseDelayMs * Math.pow(2, retryIndex);
      const jitterOffset = jitter ? Math.random() * jitterMs : 0;
      await new Promise((resolve) => setTimeout(resolve, backoff + jitterOffset));
    }
  }

  throw new Error("withTxRetry exhausted retries without returning a result");
}
