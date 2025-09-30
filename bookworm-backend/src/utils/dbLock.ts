// src/utils/dbLock.ts

import { Prisma, PrismaClient } from "@prisma/client";
import crypto from "crypto";

import { BUSINESS_LIMITS } from "../constants";

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
function deriveLockKeys(lockName: string): [number, number] {
  const digest = crypto.createHash("sha256").update(lockName).digest();
  const key1 = digest.readInt32BE(0);
  const key2 = digest.readInt32BE(4);
  return [key1, key2];
}

export async function withAdvisoryLock<T>(
  prisma: PrismaClient,
  lockName: string,
  task: () => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      const [key1, key2] = deriveLockKeys(lockName);
      const result = await tx.$queryRaw<{ pg_try_advisory_lock: boolean }[]>(
        Prisma.sql`SELECT pg_try_advisory_lock(${key1}, ${key2})`,
      );

      const lockAcquired = result[0]?.pg_try_advisory_lock;

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
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_unlock(${key1}, ${key2})`);
        console.log(`[AdvisoryLock] Lock released for "${lockName}".`);
      }
    },
    {
      timeout: BUSINESS_LIMITS.ADVISORY_LOCK_TIMEOUT_MS,
    },
  );
}
