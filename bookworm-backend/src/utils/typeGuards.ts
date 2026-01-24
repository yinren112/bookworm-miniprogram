// src/utils/typeGuards.ts
// Type guards for safe error handling without 'as any'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Prisma } from "@prisma/client";
import { ApiError } from "../errors";

/**
 * Type guard for Fastify HTTP errors with statusCode
 */
export interface FastifyHttpError {
  statusCode: number;
  code?: string;
  message?: string;
  validation?: any[];
}

export function isFastifyHttpError(error: unknown): error is FastifyHttpError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as any).statusCode === 'number'
  );
}

/**
 * Type guard for Fastify validation errors
 */
export interface FastifyValidationError extends FastifyHttpError {
  statusCode: 400;
  validation: any[];
}

export function isFastifyValidationError(error: unknown): error is FastifyValidationError {
  return (
    isFastifyHttpError(error) &&
    error.statusCode === 400 &&
    Array.isArray((error as any).validation)
  );
}

/**
 * Type guard for Prisma known request errors
 */
export function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/**
 * Type guard for Prisma serialization errors
 */
export function isPrismaSerializationError(error: unknown): boolean {
  return (
    isPrismaKnownError(error) &&
    (error.code === "P2034" || error.message?.includes("could not serialize"))
  );
}

// A set of Prisma error codes known to be potentially transient and safe to retry.
// P2034: Transaction failed due to a write conflict or a deadlock. Please retry your transaction.
// P1008: Operations timed out. (Potentially transient)
// 40P01: Deadlock detected (PostgreSQL specific error code, might appear in meta)
const RETRYABLE_PRISMA_CODES = new Set(["P2034", "P1008"]);
const RETRYABLE_PG_CODES = new Set(["40001", "40P01", "55P03"]);

/**
 * Type guard for Prisma errors that are safe to retry.
 */
export function isPrismaRetryableError(error: unknown): boolean {
  if (!isPrismaKnownError(error)) {
    return false;
  }

  if (RETRYABLE_PRISMA_CODES.has(error.code)) {
    return true;
  }

  const pgCode = (error.meta as { code?: string } | undefined)?.code;
  if (pgCode && RETRYABLE_PG_CODES.has(pgCode)) {
    return true;
  }

  if (typeof error.message === "string") {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("deadlock detected") ||
      lower.includes("could not serialize access due to") ||
      lower.includes("could not serialize transaction")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Type guard for Prisma unique constraint errors
 */
export function isPrismaUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError & { code: "P2002" } {
  return isPrismaKnownError(error) && error.code === "P2002";
}

/**
 * Check if a Prisma unique constraint error is specifically for pickup_code
 */
export function isPickupCodeConstraintError(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) return false;

  const meta = error.meta as { target?: string[] } | undefined;
  return meta?.target?.includes("pickup_code") === true;
}

/**
 * Type guard for API errors
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard for standard Error objects
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard for Axios errors
 */
export interface AxiosError {
  isAxiosError: true;
  response?: {
    status: number;
    data?: any;
  };
  message: string;
}

export function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as any).isAxiosError === true &&
    typeof (error as any).message === 'string'
  );
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as any).message);
  }
  return 'Unknown error';
}
