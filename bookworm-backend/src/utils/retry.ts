import { BUSINESS_LIMITS } from "../constants";

/**
 * A simple utility to retry an async function with exponential backoff.
 * @param fn The async function to retry.
 * @param attempts The maximum number of attempts.
 * @param delay The initial delay in ms.
 * @returns The result of the async function if it succeeds.
 * @throws The error of the last attempt if all attempts fail.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  attempts: number = BUSINESS_LIMITS.DEFAULT_RETRY_ATTEMPTS,
  delay: number = BUSINESS_LIMITS.DEFAULT_RETRY_DELAY_MS,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === attempts - 1) {
        // This was the last attempt, re-throw the error.
        throw error;
      }
      // Wait for an exponentially increasing amount of time.
      const backoffDelay = delay * Math.pow(2, i);
      console.log(
        `Attempt ${i + 1}/${attempts} failed. Retrying in ${backoffDelay}ms...`,
      );
      await new Promise((res) => setTimeout(res, backoffDelay));
    }
  }
  // This line should theoretically be unreachable.
  throw new Error("Retry logic failed unexpectedly.");
}
