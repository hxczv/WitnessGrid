import { config } from '../config.js';
import { consumeMagicToken, createMagicToken } from '../repo/magic-tokens.js';
import { generateToken, sha256Hex } from './tokens.js';

const TTL_MS = config.MAGIC_LINK_TTL_MINUTES * 60 * 1000;

// The link targets the web app's sign-in page, which auto-verifies the token.
// The API itself only exposes POST /auth/verify for programmatic exchange.
export async function createMagicLink(userId: string, email: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await createMagicToken(userId, email, await sha256Hex(token), expiresAt);
  return `${config.PUBLIC_ORIGIN}/signin?token=${token}`;
}

export async function verifyMagicToken(token: string): Promise<{ userId: string; email: string } | null> {
  const row = await consumeMagicToken(await sha256Hex(token));
  if (!row) return null;
  return { userId: row.user_id, email: row.email };
}
