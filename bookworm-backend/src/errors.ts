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
