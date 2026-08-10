import type { Context, MiddlewareHandler } from 'hono';
import type { SessionUser } from '@witnessgrid/contract';
import type { AppEnv } from '../env.js';
import { ApiError, errorCodes } from '../errors.js';
import { verifySessionJwt } from '../auth/jwt.js';
import { getUserById } from '../repo/users.js';

// Reads the bearer token and confirms the user still exists. Without the DB
// check, a deleted account's token (valid up to 30 days) would authenticate
// and then fail on foreign keys when writing.

async function sessionFromToken(c: Context<AppEnv>): Promise<SessionUser | null> {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifySessionJwt(header.slice(7));
    if (typeof payload.sub !== 'string') return null;
    const user = await getUserById(payload.sub);
    if (!user) return null;
    return { id: user.id, username: user.username, email: user.email };
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string' &&
      (err as { code: string }).code.startsWith('ERR_JWT')
    ) {
      return null;
    }
    throw err;
  }
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await sessionFromToken(c);
  if (!user) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  c.set('userId', user.id);
  c.set('sessionUser', user);
  await next();
};

export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await sessionFromToken(c);
  if (user) {
    c.set('userId', user.id);
    c.set('sessionUser', user);
  }
  await next();
};

// After requireAuth, userId is always set; this accessor encodes that.
export function authedUserId(c: Context<AppEnv>): string {
  const userId = c.get('userId');
  if (!userId) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  return userId;
}
