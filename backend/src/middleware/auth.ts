import type { SessionUser } from '@witnessgrid/contract';
import type { Context, Next } from 'hono';
import { verifySessionJwt } from '../auth/jwt.js';
import { ApiError, errorCodes } from '../errors.js';
import type { AppEnv } from '../env.js';

type AuthContext = Context<AppEnv>;

function bearerToken(c: AuthContext): string {
  const header = c.req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return '';
}

async function verify(c: AuthContext, token: string): Promise<void> {
  const payload = await verifySessionJwt(token);
  const sub = payload.sub;
  if (!sub || typeof payload.username !== 'string' || typeof payload.email !== 'string') {
    throw new ApiError(errorCodes.UNAUTHORIZED, 'invalid or expired token');
  }
  const user: SessionUser = { id: sub, username: payload.username, email: payload.email };
  c.set('userId', sub);
  c.set('sessionUser', user);
}

export async function requireAuth(c: AuthContext, next: Next): Promise<void> {
  const token = bearerToken(c);
  if (!token) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  try {
    await verify(c, token);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(errorCodes.UNAUTHORIZED, 'invalid or expired token');
  }
  await next();
}

export async function optionalAuth(c: AuthContext, next: Next): Promise<void> {
  const token = bearerToken(c);
  if (token) {
    try {
      await verify(c, token);
    } catch {
      // treat as guest
    }
  }
  await next();
}