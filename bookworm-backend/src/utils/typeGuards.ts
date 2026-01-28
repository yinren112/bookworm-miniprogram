// src/utils/typeGuards.ts
// Type guards for safe error handling without 'as any'

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { ApiError } from "../errors";
import { RETRYABLE_PG_CODES, RETRYABLE_PG_MESSAGES, RETRYABLE_PRISMA_CODES } from "./prismaRetryPolicy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Type guard for Fastify HTTP errors with statusCode
 */
export interface FastifyHttpError {
  statusCode: number;
  code?: string;
  message?: string;
  validation?: unknown[];
}

export function isFastifyHttpError(error: unknown): error is FastifyHttpError {
  if (!isRecord(error)) {
    return false;
  }

  return typeof error.statusCode === "number";
}

/**
 * Type guard for Fastify validation errors
 */
export interface FastifyValidationError extends FastifyHttpError {
  statusCode: 400;
  validation: unknown[];
}

export function isFastifyValidationError(error: unknown): error is FastifyValidationError {
  return isFastifyHttpError(error) && error.statusCode === 400 && Array.isArray(error.validation);
}

/**
 * Type guard for Prisma known request errors
 */
export function isPrismaKnownError(error: unknown): error is PrismaClientKnownRequestError {
  if (error instanceof PrismaClientKnownRequestError) {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeError = error as {
    code?: unknown;
    name?: unknown;
  };

  return (
    typeof maybeError.code === "string" &&
    maybeError.name === "PrismaClientKnownRequestError"
  );
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
    if (RETRYABLE_PG_MESSAGES.some((fragment) => lower.includes(fragment))) {
      return true;
    }
  }

  return false;
}

/**
 * Type guard for Prisma unique constraint errors
 */
export function isPrismaUniqueConstraintError(error: unknown): error is PrismaClientKnownRequestError & { code: "P2002" } {
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
    data?: unknown;
  };
  message: string;
}

export function isAxiosError(error: unknown): error is AxiosError {
  if (!isRecord(error)) {
    return false;
  }

  return error.isAxiosError === true && typeof error.message === "string";
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
  if (isRecord(error) && "message" in error) {
    return String(error.message);
  }
  return 'Unknown error';
}
