// src/tests/test-helpers/errorHelpers.ts
// Helper functions to create properly typed test errors without 'as any'

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

/**
 * Create a Prisma unique constraint error for testing
 */
export function createPrismaUniqueConstraintError(
  target: string | string[] = [],
  message = "Unique constraint failed"
): PrismaClientKnownRequestError {
  const error = new PrismaClientKnownRequestError(
    message,
    {
      code: "P2002",
      clientVersion: "test",
      meta: { target: Array.isArray(target) ? target : [target] }
    }
  );
  return error;
}

/**
 * Create a Prisma serialization error for testing
 */
export function createPrismaSerializationError(
  message = "could not serialize access due to concurrent update"
): PrismaClientKnownRequestError {
  const error = new PrismaClientKnownRequestError(
    message,
    {
      code: "P2034",
      clientVersion: "test",
    }
  );
  return error;
}

/**
 * Create a pickup code constraint error for testing
 */
export function createPickupCodeConstraintError(): PrismaClientKnownRequestError {
  return createPrismaUniqueConstraintError("pickup_code", "Unique constraint failed");
}
