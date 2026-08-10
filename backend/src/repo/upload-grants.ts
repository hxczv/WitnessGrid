import type { Db } from '../db.js';
import { db } from '../db.js';
import { ApiError, errorCodes } from '../errors.js';
import { rowQuery } from './shared.js';

// Upload grants bind every issued object key to the user who requested it.
// Incident creation consumes the grants, so a user can only attach media they
// uploaded themselves, and each uploaded object can back exactly one incident.

export async function createUploadGrant(key: string, userId: string, contentType: string): Promise<void> {
  await db`
    INSERT INTO media_grants (key, user_id, content_type)
    VALUES (${key}, ${userId}, ${contentType})
    ON CONFLICT (key) DO NOTHING
  `;
}

// Records the server-computed content hash once the bytes have arrived
// (local store mode). In R2 mode the server never sees the bytes, so the
// client-declared hash is trusted and this stays NULL.
export async function setUploadGrantHash(key: string, sha256: string): Promise<void> {
  await db`UPDATE media_grants SET sha256 = ${sha256} WHERE key = ${key}`;
}

export async function getUploadGrant(key: string): Promise<{ content_type: string } | null> {
  const rows = await db<{ content_type: string }[]>`
    SELECT content_type FROM media_grants WHERE key = ${key}
  `;
  return rows[0] ?? null;
}

export interface GrantCheckItem {
  key: string;
  declaredHash: string;
}

// Validates that every key was uploaded by `userId`, is not already attached
// to another incident, and matches the server-computed hash when one exists.
export async function validateGrantsForIncident(
  tx: Db,
  userId: string,
  items: GrantCheckItem[],
): Promise<void> {
  const tq = rowQuery(tx);
  const keys = items.map((i) => i.key);

  const grants = await tq.unsafe<Array<{ key: string; user_id: string; sha256: string | null }>>(
    'SELECT key, user_id, sha256 FROM media_grants WHERE key = ANY($1)',
    [keys],
  );
  const byKey = new Map(grants.map((g) => [g.key, g]));
  for (const item of items) {
    const grant = byKey.get(item.key);
    if (!grant || grant.user_id !== userId) {
      throw new ApiError(errorCodes.VALIDATION, 'media was not uploaded by this account');
    }
    if (grant.sha256 !== null && grant.sha256 !== item.declaredHash) {
      throw new ApiError(errorCodes.VALIDATION, 'media content does not match its declared hash');
    }
  }

  const existing = await tq.unsafe<Array<{ url: string }>>(
    'SELECT url FROM media WHERE url = ANY($1)',
    [keys],
  );
  if (existing.length > 0) {
    throw new ApiError(errorCodes.VALIDATION, 'media already attached to another incident');
  }
}

export async function consumeGrants(tx: Db, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await rowQuery(tx).unsafe('DELETE FROM media_grants WHERE key = ANY($1)', [keys]);
}
