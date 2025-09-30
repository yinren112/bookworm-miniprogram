// src/tests/test-helpers/errorHelpers.ts
// Helper functions to create properly typed test errors without 'as any'

import { Prisma } from "@prisma/client";

/**
 * Create a Prisma unique constraint error for testing
 */
export function createPrismaUniqueConstraintError(
  target: string | string[] = [],
  message = "Unique constraint failed"
): Prisma.PrismaClientKnownRequestError {
  const error = new Prisma.PrismaClientKnownRequestError(
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
): Prisma.PrismaClientKnownRequestError {
  const error = new Prisma.PrismaClientKnownRequestError(
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
export function createPickupCodeConstraintError(): Prisma.PrismaClientKnownRequestError {
  return createPrismaUniqueConstraintError("pickup_code", "Unique constraint failed");
}