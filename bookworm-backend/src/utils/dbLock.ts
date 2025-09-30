// src/utils/dbLock.ts

import { Prisma, PrismaClient } from "@prisma/client";
import crypto from "crypto";

import { BUSINESS_LIMITS } from "../constants";

/**
 * Derives a single 32-bit integer lock key from a string lock name.
 * Uses SHA256 hashing to ensure collision resistance.
 *
 * @param lockName A unique string identifier for the lock.
 * @returns A 32-bit signed integer suitable for pg_try_advisory_lock().
 */
function deriveLockKey(lockName: string): number {
  const hash = crypto.createHash("sha256").update(lockName).digest();
  return hash.readInt32BE(0);
}

/**
 * Executes a task while holding a PostgreSQL advisory lock.
 * Ensures that only one instance of the application can run the task at the same time.
 *
 * IMPORTANT: Advisory locks are session-scoped. This function uses a transaction
 * to guarantee that all raw queries run on the same database connection.
 *
 * @param prisma The PrismaClient instance.
 * @param lockName A unique name for the lock, e.g., 'job:cancel_expired_orders'.
 * @param task The async function to execute if the lock is acquired.
 * @returns The result of the task if the lock was acquired, otherwise null.
 */
export async function withAdvisoryLock<T>(
  prisma: PrismaClient,
  lockName: string,
  task: () => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      const lockKey = deriveLockKey(lockName);
      const result = await tx.$queryRaw<[{ lock_acquired: boolean }]>`SELECT pg_try_advisory_lock(${lockKey}::integer) as lock_acquired`;

      const lockAcquired = result[0]?.lock_acquired;

      if (!lockAcquired) {
        console.log(
          `[AdvisoryLock] Could not acquire lock for "${lockName}". Another instance is likely running.`,
        );
        return null;
      }

      console.log(
        `[AdvisoryLock] Lock acquired for "${lockName}". Running task.`,
      );
      try {
        return await task();
      } finally {
        await tx.$queryRaw`SELECT pg_advisory_unlock(${lockKey}::integer)`;
        console.log(`[AdvisoryLock] Lock released for "${lockName}".`);
      }
    },
    {
      timeout: BUSINESS_LIMITS.ADVISORY_LOCK_TIMEOUT_MS,
    },
  );
}
