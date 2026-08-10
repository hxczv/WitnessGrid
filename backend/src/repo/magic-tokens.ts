import { db } from '../db.js';
import { q } from './shared.js';

let lastPrune = 0;

export async function pruneExpiredMagicTokens(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastPrune < 10 * 60 * 1000) return;
  lastPrune = now;
  await db`
    DELETE FROM magic_link_tokens
    WHERE used_at IS NOT NULL OR expires_at < now() - interval '1 hour'
  `;
}

export async function createMagicToken(
  userId: string,
  email: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await pruneExpiredMagicTokens();
  await db`
    INSERT INTO magic_link_tokens (token_hash, user_id, email, expires_at)
    VALUES (${tokenHash}, ${userId}, ${email}, ${expiresAt})
  `;
}

export async function consumeMagicToken(
  tokenHash: string,
): Promise<{ user_id: string; email: string } | null> {
  const rows = await q<{ user_id: string; email: string }[]>`
    UPDATE magic_link_tokens
    SET used_at = now()
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
    RETURNING user_id, email
  `;
  return rows[0] ?? null;
}
