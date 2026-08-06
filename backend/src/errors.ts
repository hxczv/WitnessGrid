import { errorCodes, type ErrorCode } from '@witnessgrid/contract';
import type { ZodError } from 'zod';

export { errorCodes };

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  [errorCodes.UNAUTHORIZED]: 401,
  [errorCodes.FORBIDDEN]: 403,
  [errorCodes.NOT_FOUND]: 404,
  [errorCodes.VALIDATION]: 400,
  [errorCodes.RATE_LIMITED]: 429,
  [errorCodes.CONFLICT]: 409,
  [errorCodes.STORAGE]: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

export function validationError(error: ZodError): ApiError {
  const first = error.issues[0];
  const message = first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'invalid request body';
  return new ApiError(errorCodes.VALIDATION, message);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route params are compared against uuid columns; rejecting malformed ids
// here turns what would be a Postgres cast error (500) into a 400.
export function assertUuid(value: string, label = 'id'): string {
  if (!UUID_PATTERN.test(value)) throw new ApiError(errorCodes.VALIDATION, `invalid ${label}`);
  return value;
}