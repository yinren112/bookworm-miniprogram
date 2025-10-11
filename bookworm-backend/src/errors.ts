// src/errors.ts

export class ApiError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, message: string, code: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class WechatPayError extends Error {
  constructor(
    public code: string, // e.g., 'ORDER_NOT_FOUND', 'SERVER_ERROR', 'INVALID_REQUEST'
    public isRetryable: boolean,
    message: string,
    public originalError?: unknown // Optional: store the original error for logging
  ) {
    super(message);
    this.name = 'WechatPayError';
  }
}

export class PaymentQueryError extends Error {
  constructor(
    public code: string,
    public originalError?: unknown
  ) {
    super(`Payment query failed: ${code}`);
    this.name = 'PaymentQueryError';
  }
}

/**
 * ServiceError: Pure business logic error without HTTP coupling.
 * Use this in service layer instead of ApiError.
 * Route handlers should catch this and map to appropriate HTTP status codes.
 */
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ServiceError';
    Error.captureStackTrace(this, this.constructor);
  }
}
