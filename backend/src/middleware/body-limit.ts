import type { Context, Next } from 'hono';
import { ApiError, errorCodes } from '../errors.js';

const MAX_JSON_BYTES = 1024 * 1024;

export async function jsonBodyLimit(c: Context, next: Next): Promise<void> {
  const length = Number(c.req.header('content-length') ?? '0');
  if (length > MAX_JSON_BYTES) {
    throw new ApiError(errorCodes.VALIDATION, `request body too large (max ${MAX_JSON_BYTES} bytes)`);
  }
  await next();
}