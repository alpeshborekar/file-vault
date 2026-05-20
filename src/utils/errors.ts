export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Convenience factory methods
export const Errors = {
  notFound:      (msg?: string) => new AppError('NOT_FOUND',           404, msg),
  unauthorized:  (msg?: string) => new AppError('UNAUTHORIZED',        401, msg),
  forbidden:     (msg?: string) => new AppError('FORBIDDEN',           403, msg),
  conflict:      (msg?: string) => new AppError('CONFLICT',            409, msg),
  badRequest:    (msg?: string) => new AppError('BAD_REQUEST',         400, msg),
  gone:          (msg?: string) => new AppError('GONE',                410, msg),
  tooLarge:      (msg?: string) => new AppError('PAYLOAD_TOO_LARGE',   413, msg),
  unsupported:   (msg?: string) => new AppError('UNSUPPORTED_TYPE',    415, msg),
  rateLimited:   (msg?: string) => new AppError('RATE_LIMITED',        429, msg),
  internal:      (msg?: string) => new AppError('INTERNAL_ERROR',      500, msg),
};