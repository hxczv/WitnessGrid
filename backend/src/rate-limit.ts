import type { Context, MiddlewareHandler } from 'hono';
import { createHash } from 'node:crypto';
import type { AppEnv } from './env.js';
import { ApiError, errorCodes } from './errors.js';
import { rateLimitHit } from './repo/rate-limit-store.js';

// Fixed-window rate limiting backed by Postgres, so dev (no Redis) and prod
// share one implementation. Buckets are keyed by user id, client ip, or a
// hash of the target email depending on what is being limited.

function clientIp(c: Context<AppEnv>): string {
  const direct = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return direct ?? 'unknown';
}

export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

async function limit(bucket: string, maxHits: number, windowSeconds: number): Promise<void> {
  const { hits } = await rateLimitHit(bucket, windowSeconds);
  if (hits > maxHits) throw new ApiError(errorCodes.RATE_LIMITED, 'rate limit exceeded');
}

export const mutateRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  await limit(`user:${userId}`, 5, 10);
  await next();
};

export const savedAreaRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  await limit(`user:${userId}:saved-area`, 30, 10);
  await next();
};

// Magic links: a small cap per target address stops the endpoint from being
// used to spam someone's inbox, and a per-ip cap bounds anonymous abuse.
export const magicLinkRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  let email = '';
  try {
    const body = (await c.req.json()) as { email?: unknown };
    if (typeof body?.email === 'string') email = body.email;
  } catch {
    // An unparseable body fails schema validation in the route; nothing to bucket.
  }
  await limit(`ip:${clientIp(c)}:magic-link`, 10, 600);
  if (email !== '') await limit(`email:${emailHash(email)}:magic-link`, 3, 600);
  await next();
};

export const verifyRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  await limit(`ip:${clientIp(c)}:auth-verify`, 20, 600);
  await next();
};
