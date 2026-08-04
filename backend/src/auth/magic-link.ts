import { config } from '../config.js';
import { createMagicToken } from '../repo.js';
import { generateToken, sha256Hex } from './tokens.js';

export async function createMagicLink(userId: string, email: string): Promise<string> {
  const rawToken = generateToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + config.MAGIC_LINK_TTL_MINUTES * 60_000);
  await createMagicToken(userId, email, tokenHash, expiresAt);
  return `${config.BASE_URL}/auth/verify?token=${encodeURIComponent(rawToken)}`;
}