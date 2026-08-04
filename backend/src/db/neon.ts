import { neon } from '@neondatabase/serverless';
import type { Sql } from 'postgres';
import { config } from '../config.js';

// @neondatabase/serverless exposes the same tagged-template query call shape as
// porsager's `postgres` (plus a `.transaction()` helper, which we type away so
// both adapters share the `Sql` surface used by the rest of the service).
const query = neon(config.DATABASE_URL);

export const dbNeon = query as unknown as Sql;