// src/errors.ts

export class ApiError extends Error {
  public statusCode: number;
  public errorCode: string;

  constructor(statusCode: number, message: string, errorCode: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    
    Error.captureStackTrace(this, this.constructor);
  }
}