import { ApiError, errorCodes } from '../errors.js';
import { db, type Db } from '../db.js';

export function isPostgresError(err: unknown): err is { code: string; constraint_name?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

export function translateUniqueViolation(err: unknown, message: string): never {
  if (isPostgresError(err) && err.code === '23505') {
    throw new ApiError(errorCodes.CONFLICT, message);
  }
  throw err;
}

// porsager's template-tag inference cannot resolve complex queries (aliased
// columns, ST_ functions), so rows are typed explicitly against the known
// schema through this wrapper.
export interface RowQuery {
  <T>(strings: TemplateStringsArray, ...params: readonly unknown[]): Promise<T>;
  unsafe<T>(query: string, params?: readonly unknown[]): Promise<T>;
}

export const q: RowQuery = db as unknown as RowQuery;
export const rowQuery = (tx: Db): RowQuery => tx as unknown as RowQuery;

type Beginable = { begin<T>(fn: (tx: Db) => Promise<T>): Promise<T> };

export function hasBegin(d: Db): d is Db & Beginable {
  return typeof (d as unknown as Partial<Beginable>).begin === 'function';
}

// Runs `fn` in a transaction when the driver supports one (porsager on Node);
// the Neon HTTP driver on Workers has no interactive transactions, so the
// statements run sequentially there. Callers rely on idempotency keys
// (incidents.client_id) rather than atomicity on that path.
export async function withTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  if (hasBegin(db)) return db.begin(fn);
  return fn(db);
}

export interface IncidentBaseRow {
  id: string;
  user_id: string | null;
  client_id: string;
  incident_type: string;
  police_force: string;
  timestamp: Date;
  description: string;
  officer_count: number | null;
  location_accuracy_m: number | null;
  created_at: Date;
  view_count: number;
  moderation_status: string;
  longitude: number;
  latitude: number;
}

export interface MediaRow {
  key: string;
  type: string;
  hash: string;
  thumbnail_key: string | null;
}

export interface OfficerRow {
  collar_number: string;
}

export const INCIDENT_SELECT = `
  SELECT i.id, i.user_id, i.client_id, i.type AS incident_type, i.police_force,
    i."timestamp", i.description, i.officer_count, i.location_accuracy_m, i.created_at, i.view_count, i.moderation_status,
    ST_X(i.location::geometry) AS longitude, ST_Y(i.location::geometry) AS latitude,
    u.username
  FROM incidents i
  LEFT JOIN users u ON u.id = i.user_id
`;

// Loads media and officer rows for a page of incidents in two queries and
// returns them keyed by incident id.
export async function hydrateIncidentExtras(ids: string[]): Promise<{
  mediaByIncident: Map<string, MediaRow[]>;
  officersByIncident: Map<string, string[]>;
}> {
  const mediaByIncident = new Map<string, MediaRow[]>();
  const officersByIncident = new Map<string, string[]>();
  if (ids.length === 0) return { mediaByIncident, officersByIncident };

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
  const mediaRows = await q.unsafe<Array<{ incident_id: string } & MediaRow>>(
    `SELECT incident_id, url AS key, type, sha256 AS hash, thumbnail_url AS thumbnail_key
     FROM media WHERE incident_id IN (${placeholders}) ORDER BY url`,
    ids,
  );
  for (const m of mediaRows) {
    const list = mediaByIncident.get(m.incident_id) ?? [];
    list.push(m);
    mediaByIncident.set(m.incident_id, list);
  }
  const officerRows = await q.unsafe<Array<{ incident_id: string } & OfficerRow>>(
    `SELECT incident_id, collar_number FROM officers WHERE incident_id IN (${placeholders}) ORDER BY collar_number`,
    ids,
  );
  for (const o of officerRows) {
    const list = officersByIncident.get(o.incident_id) ?? [];
    list.push(o.collar_number);
    officersByIncident.set(o.incident_id, list);
  }
  return { mediaByIncident, officersByIncident };
}
