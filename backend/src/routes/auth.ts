import { Hono } from 'hono';
import { MagicLinkRequestSchema, VerifyTokenSchema } from '@witnessgrid/contract';
import { createMagicLink } from '../auth/magic-link.js';
import { signSessionJwt } from '../auth/jwt.js';
import { sha256Hex } from '../auth/tokens.js';
import { sendMagicLink } from '../email.js';
import { ApiError, errorCodes, validationError } from '../errors.js';
import { jsonBodyLimit } from '../middleware/body-limit.js';
import { requireAuth } from '../middleware/auth.js';
import { magicLinkRateLimit } from '../rate-limit.js';
import { consumeMagicToken, createUser, getUserByEmail, getUserById } from '../repo.js';
import type { AppEnv } from '../env.js';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/auth/magic-link', magicLinkRateLimit, jsonBodyLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = MagicLinkRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  const { email, username } = parsed.data;
  let user = await getUserByEmail(email);
  if (!user) {
    if (!username) {
      throw new ApiError(errorCodes.VALIDATION, 'username required for new account');
    }
    try {
      user = await createUser(email, username);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === errorCodes.CONFLICT)) throw err;
      user = await getUserByEmail(email);
    }
  }
  if (!user) throw new ApiError(errorCodes.STORAGE, 'could not resolve account');

  const url = await createMagicLink(user.id, email);
  await sendMagicLink(email, url);
  return c.json({ ok: true });
});

authRoutes.post('/auth/verify', jsonBodyLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyTokenSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);

  const tokenHash = await sha256Hex(parsed.data.token);
  const consumed = await consumeMagicToken(tokenHash);
  if (!consumed) throw new ApiError(errorCodes.VALIDATION, 'invalid or expired token');
  const user = await getUserById(consumed.user_id);
  if (!user) throw new ApiError(errorCodes.VALIDATION, 'invalid or expired token');

  const jwt = await signSessionJwt({ sub: user.id, username: user.username, email: user.email });
  return c.json({
    token: jwt,
    user: { id: user.id, username: user.username, email: user.email },
  });
});

authRoutes.get('/auth/me', requireAuth, async (c) => {
  const user = c.get('sessionUser');
  if (!user) throw new ApiError(errorCodes.UNAUTHORIZED, 'authentication required');
  return c.json(user);
});