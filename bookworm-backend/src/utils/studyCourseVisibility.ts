// src/utils/studyCourseVisibility.ts
import { ApiError } from "../errors";

export function assertIncludeUnpublishedAllowed(includeUnpublished: boolean, nodeEnv: string): void {
  if (includeUnpublished && nodeEnv === "production") {
    throw new ApiError(
      403,
      "includeUnpublished is not allowed in production",
      "INCLUDE_UNPUBLISHED_FORBIDDEN",
    );
  }
}

export function shouldIncludeUnpublishedFallback(includeUnpublished: boolean, nodeEnv: string): boolean {
  return includeUnpublished && nodeEnv !== "production";
}
