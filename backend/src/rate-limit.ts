import type { Context, Next } from 'hono';
import { sha256Hex } from './auth/tokens.js';
import { ApiError, errorCodes } from './errors.js';
import { ensureRateLimitTable, rateLimitHit } from './repo.js';

let tableReady: Promise<void> | null = null;

async function readyTable(): Promise<void> {
  if (!tableReady) {
    tableReady = ensureRateLimitTable().catch((err: unknown) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  key: (c: Context) => string | Promise<string>;
}

export function rateLimit(options: RateLimitOptions): (c: Context, next: Next) => Promise<void> {
  return async (c, next) => {
    await readyTable();
    const bucket = await options.key(c);
    const { limited, retryAfterMs } = await rateLimitHit(bucket, options.windowMs, options.max);
    if (limited) {
      c.header('retry-after', String(Math.ceil(retryAfterMs / 1000)));
      throw new ApiError(errorCodes.RATE_LIMITED, 'too many requests, slow down');
    }
    await next();
  };
}

export const mutateRateLimit = rateLimit({
  max: 5,
  windowMs: 10_000,
  key: (c) => c.get('userId') ?? 'anonymous',
});

// Saved areas are created in bulk (up to 10 at once), so the shared mutation
// budget would trip on a normal onboarding flow.
export const savedAreaRateLimit = rateLimit({
  max: 30,
  windowMs: 10_000,
  key: (c) => c.get('userId') ?? 'anonymous',
});

export const magicLinkRateLimit = rateLimit({
  max: 20,
  windowMs: 10_000,
  key: async (c) => {
    const body = await c.req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email : 'unknown';
    return `magic-link:${await sha256Hex(email)}`;
  },
});