import type { Sql } from 'postgres';
import { config } from './config.js';

export type Db = Sql;

async function selectDb(): Promise<Db> {
  if (config.PLATFORM === 'workers') {
    const { dbNeon } = await import('./db/neon.js');
    return dbNeon;
  }
  const { dbLocal } = await import('./db/local.js');
  return dbLocal;
}

export const db: Db = await selectDb();