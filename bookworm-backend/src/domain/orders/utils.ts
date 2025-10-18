// src/domain/orders/utils.ts
// Pure utility functions for order operations
// Zero dependencies on business logic or database

import * as crypto from "crypto";
import config from "../../config";

const CENTS_SCALE = 100;

/**
 * Converts cents (integer) to yuan string representation
 * Examples:
 *   1000 -> "10"
 *   1050 -> "10.5"
 *   1005 -> "10.05"
 *   -1000 -> "-10"
 *   0 -> "0"
 */
export function formatCentsToYuanString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const integerPart = Math.floor(abs / CENTS_SCALE);
  const fraction = abs % CENTS_SCALE;

  if (fraction === 0) {
    return `${negative ? "-" : ""}${integerPart}`;
  }

  const fractionString = fraction
    .toString()
    .padStart(2, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${integerPart}.${fractionString}`;
}

/**
 * Generates a unique pickup code for orders
 * Uses cryptographic random bytes for uniqueness
 *
 * Format: Uppercase hexadecimal string
 * Length: Configured via ORDER_PICKUP_CODE_LENGTH
 *
 * Example output: "A3F2E9B1C4"
 */
export async function generateUniquePickupCode(): Promise<string> {
  return crypto
    .randomBytes(config.ORDER_PICKUP_CODE_BYTES)
    .toString("hex")
    .toUpperCase()
    .substring(0, config.ORDER_PICKUP_CODE_LENGTH);
}
