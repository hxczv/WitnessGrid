import { ApiError, errorCodes } from '../errors.js';
import { q, translateUniqueViolation } from './shared.js';

export interface UserRow {
  id: string;
  username: string;
  email: string;
  created_at: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(email: string, username: string): Promise<UserRow> {
  try {
    const rows = await q<UserRow[]>`
      INSERT INTO users (id, username, email)
      VALUES (${crypto.randomUUID()}, ${username}, ${normalizeEmail(email)})
      RETURNING id, username, email, created_at
    `;
    const row = rows[0];
    if (!row) throw new ApiError(errorCodes.STORAGE, 'user insert returned no row');
    return row;
  } catch (err) {
    translateUniqueViolation(err, 'an account with this email or username already exists');
  }
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await q<UserRow[]>`
    SELECT id, username, email, created_at FROM users WHERE email = ${normalizeEmail(email)} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const rows = await q<UserRow[]>`SELECT id, username, email, created_at FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const rows = await q<{ id: string }[]>`DELETE FROM users WHERE id = ${userId} RETURNING id`;
  if (!rows[0]) throw new ApiError(errorCodes.NOT_FOUND, 'account not found');
}
