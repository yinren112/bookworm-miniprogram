// src/utils/prismaRetryPolicy.ts
// Shared retry policy for Prisma/PostgreSQL transient errors

export const RETRYABLE_PRISMA_CODES = new Set([
  "P2034", // Transaction failed due to a write conflict or a deadlock
  "P1008", // Operations timed out (potentially transient)
]);

export const RETRYABLE_PG_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
]);

export const RETRYABLE_PG_MESSAGES = [
  "deadlock detected",
  "could not serialize access due to",
  "could not serialize transaction",
];
