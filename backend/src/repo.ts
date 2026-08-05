import type {
  Incident,
  IncidentCreate,
  ListIncidentsQuery,
  ListIncidentsResult,
  MediaReference,
} from '@witnessgrid/contract';
import { decodeCursor, encodeCursor } from '@witnessgrid/contract';
import { ApiError, errorCodes } from './errors.js';
import { db, type Db } from './db.js';

export interface UserRow {
  id: string;
  username: string;
  email: string;
  created_at: Date;
}

export interface IncidentBaseRow {
  id: string;
  user_id: string;
  client_id: string;
  incident_type: string;
  police_force: string;
  timestamp: Date;
  description: string;
  officer_count: number | null;
  created_at: Date;
  view_count: number;
  moderation_status: string;
  longitude: number;
  latitude: number;
}

interface MediaRow {
  key: string;
  type: MediaReference['type'];
  hash: string;
  thumbnail_key: string | null;
}

interface OfficerRow {
  collar_number: string;
}

function isPostgresError(err: unknown): err is { code: string; constraint_name?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

function translateUniqueViolation(err: unknown, message: string): never {
  if (isPostgresError(err) && err.code === '23505') {
    throw new ApiError(errorCodes.CONFLICT, message);
  }
  throw err;
}

type Beginable = { begin<T>(fn: (tx: Db) => Promise<T>): Promise<T> };
function hasBegin(d: Db): d is Db & Beginable {
  return typeof (d as unknown as Partial<Beginable>).begin === 'function';
}

// porsager's template-tag inference cannot resolve complex queries (aliased
// columns, ST_ functions), so rows are typed explicitly against the known
// schema through this wrapper.
interface RowQuery {
  <T>(strings: TemplateStringsArray, ...params: readonly unknown[]): Promise<T>;
  unsafe<T>(query: string, params?: readonly unknown[]): Promise<T>;
}
const q: RowQuery = db as unknown as RowQuery;

// --- users ----------------------------------------------------------------

export async function createUser(email: string, username: string): Promise<UserRow> {
  try {
    const rows = await q<UserRow[]>`
      INSERT INTO users (id, username, email)
      VALUES (${crypto.randomUUID()}, ${username}, ${email})
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
  const rows = await q<UserRow[]>`SELECT id, username, email, created_at FROM users WHERE email = ${email} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const rows = await q<UserRow[]>`SELECT id, username, email, created_at FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

// --- magic-link tokens ----------------------------------------------------

export async function createMagicToken(
  userId: string,
  email: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
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

// --- incidents ------------------------------------------------------------

function serializeIncident(
  row: IncidentBaseRow,
  media: MediaReference[],
  collarNumbers: string[],
  username: string,
): Incident {
  return {
    id: row.id,
    user_id: row.user_id,
    client_id: row.client_id,
    incident_type: row.incident_type as Incident['incident_type'],
    police_force: row.police_force as Incident['police_force'],
    timestamp: row.timestamp.toISOString(),
    description: row.description,
    ...(row.officer_count !== null && { officer_count: row.officer_count }),
    ...(collarNumbers.length > 0 && { collar_numbers: collarNumbers }),
    media,
    created_at: row.created_at.toISOString(),
    view_count: row.view_count,
    moderation_status: row.moderation_status as Incident['moderation_status'],
    latitude: row.latitude,
    longitude: row.longitude,
    username,
  };
}

export async function createIncident(input: IncidentCreate, userId: string): Promise<Incident> {
  const incidentId = crypto.randomUUID();

  const run = async (tx: Db): Promise<Incident> => {
    const tq = tx as unknown as RowQuery;
    const rows = await tq<IncidentBaseRow[]>`
      INSERT INTO incidents (id, user_id, client_id, type, police_force, location, location_accuracy_m, "timestamp", description, officer_count)
      VALUES (
        ${incidentId}, ${userId}, ${input.client_id}, ${input.incident_type}, ${input.police_force},
        ST_SetSRID(ST_MakePoint(${input.location.lon}, ${input.location.lat}), 4326)::geography,
        ${input.location_accuracy_m ?? null}, ${input.timestamp}, ${input.description}, ${input.officer_count ?? null}
      )
      RETURNING id, user_id, client_id, type AS incident_type, police_force, "timestamp", description,
        officer_count, created_at, view_count, moderation_status,
        ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
    `;
    const row = rows[0];
    if (!row) throw new ApiError(errorCodes.STORAGE, 'incident insert returned no row');

    for (const media of input.media) {
      await tx`
        INSERT INTO media (id, incident_id, url, type, sha256, thumbnail_url)
        VALUES (${crypto.randomUUID()}, ${incidentId}, ${media.key}, ${media.type}, ${media.hash}, ${media.thumbnail_key})
      `;
    }
    for (const collar of input.collar_numbers ?? []) {
      await tx`
        INSERT INTO officers (id, incident_id, collar_number)
        VALUES (${crypto.randomUUID()}, ${incidentId}, ${collar})
      `;
    }
    const userRows = await tq<{ username: string }[]>`SELECT username FROM users WHERE id = ${userId}`;
    const username = userRows[0]?.username ?? '';
    return serializeIncident(row, input.media, input.collar_numbers ?? [], username);
  };

  try {
    if (hasBegin(db)) {
      return await db.begin(async (tx) => run(tx as unknown as Db));
    }
    // neon adapter (Workers) has no interactive `.begin`; run sequentially and
    // rely on the unique client_id constraint to guarantee idempotency.
    return await run(db);
  } catch (err) {
    if (isPostgresError(err) && err.code === '23505') {
      if (err.constraint_name === 'incidents_client_id_key') {
        throw new ApiError(errorCodes.CONFLICT, 'an incident with this client_id already exists');
      }
      if (err.constraint_name === 'media_sha256_key') {
        throw new ApiError(
          errorCodes.VALIDATION,
          'media with this content hash has already been recorded',
        );
      }
    }
    throw err;
  }
}

export async function getIncident(id: string, userId: string | null): Promise<Incident | null> {
  const rows = await q<Array<IncidentBaseRow & { username: string }>>`
    SELECT i.id, i.user_id, i.client_id, i.type AS incident_type, i.police_force,
      i."timestamp", i.description, i.officer_count, i.created_at, i.view_count, i.moderation_status,
      ST_X(i.location::geometry) AS longitude, ST_Y(i.location::geometry) AS latitude,
      u.username
    FROM incidents i
    JOIN users u ON u.id = i.user_id
    WHERE i.id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.moderation_status !== 'approved' && row.user_id !== userId) return null;

  const viewRows = await q<{ view_count: number }[]>`
    UPDATE incidents SET view_count = view_count + 1 WHERE id = ${id} RETURNING view_count
  `;
  if (viewRows[0]) row.view_count = viewRows[0].view_count;

  const mediaRows = await q<MediaRow[]>`
    SELECT url AS key, type, sha256 AS hash, thumbnail_url AS thumbnail_key
    FROM media WHERE incident_id = ${id} ORDER BY url
  `;
  const officerRows = await q<OfficerRow[]>`SELECT collar_number FROM officers WHERE incident_id = ${id}`;
  return serializeIncident(row, mediaRows, officerRows.map((o) => o.collar_number), row.username);
}

export async function listIncidents(query: ListIncidentsQuery): Promise<ListIncidentsResult> {
  const conditions: string[] = ["i.moderation_status = 'approved'"];
  const params: unknown[] = [];

  const addBound = (sql: string, value: unknown): void => {
    params.push(value);
    conditions.push(`${sql} $${params.length}`);
  };

  const { minLon, minLat, maxLon, maxLat, startDate, endDate, type, policeForce, cursor, limit } = query;

  let limitWithProbe = limit;
  if (minLon !== undefined && minLat !== undefined && maxLon !== undefined && maxLat !== undefined) {
    const bbox = `ST_Intersects(i.location, ST_MakeEnvelope($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, 4326))`;
    params.push(minLon, minLat, maxLon, maxLat);
    conditions.push(bbox);
  }
  if (startDate !== undefined) addBound('i."timestamp" >=', startDate);
  if (endDate !== undefined) addBound('i."timestamp" <=', endDate);
  if (type !== undefined) addBound('i.type =', type);
  if (policeForce !== undefined) addBound('i.police_force =', policeForce);
  if (cursor !== undefined) {
    const decoded = decodeCursor(cursor);
    addBound('(i.created_at <', decoded.createdAtIso);
    params.push(decoded.id);
    conditions[conditions.length - 1] = `(i.created_at < $${params.length - 1} OR (i.created_at = $${params.length - 1} AND i.id < $${params.length}))`;
  }

  const sqlText = `
    SELECT i.id, i.user_id, i.client_id, i.type AS incident_type, i.police_force,
      i."timestamp", i.description, i.officer_count, i.created_at, i.view_count, i.moderation_status,
      ST_X(i.location::geometry) AS longitude, ST_Y(i.location::geometry) AS latitude,
      u.username
    FROM incidents i
    JOIN users u ON u.id = i.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT ${limitWithProbe + 1}
  `;
  const rows = await q.unsafe<Array<IncidentBaseRow & { username: string }>>(sqlText, params);

  const pageRows = rows.length > limitWithProbe ? rows.slice(0, limitWithProbe) : rows;
  const ids = pageRows.map((r) => r.id);

  const mediaByIncident = new Map<string, MediaReference[]>();
  const officersByIncident = new Map<string, string[]>();
  if (ids.length > 0) {
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const mediaRows = await q.unsafe<Array<{ incident_id: string } & MediaRow>>(
      `SELECT incident_id, url AS key, type, sha256 AS hash, thumbnail_url AS thumbnail_key FROM media WHERE incident_id IN (${placeholders}) ORDER BY url`,
      ids,
    );
    for (const m of mediaRows) {
      const list = mediaByIncident.get(m.incident_id) ?? [];
      list.push({ key: m.key, type: m.type as MediaReference['type'], hash: m.hash, thumbnail_key: m.thumbnail_key });
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
  }

  const items = pageRows.map((row) =>
    serializeIncident(
      row,
      mediaByIncident.get(row.id) ?? [],
      officersByIncident.get(row.id) ?? [],
      row.username,
    ),
  );

  let nextCursor: string | null = null;
  if (rows.length > limitWithProbe) {
    const last = pageRows.at(-1);
    if (last) nextCursor = encodeCursor(last.created_at.toISOString(), last.id);
  }

  return { items, next_cursor: nextCursor };
}

export async function listUserIncidents(
  userId: string,
  query: { cursor?: string; limit?: number },
): Promise<ListIncidentsResult> {
  const limit = query.limit ?? 25;
  const conditions: string[] = ['i.user_id = $1'];
  const params: unknown[] = [userId];
  if (query.cursor !== undefined) {
    const decoded = decodeCursor(query.cursor);
    params.push(decoded.createdAtIso, decoded.id);
    conditions.push('(i.created_at < $2 OR (i.created_at = $2 AND i.id < $3))');
  }

  const sqlText = `
    SELECT i.id, i.user_id, i.client_id, i.type AS incident_type, i.police_force,
      i."timestamp", i.description, i.officer_count, i.created_at, i.view_count, i.moderation_status,
      ST_X(i.location::geometry) AS longitude, ST_Y(i.location::geometry) AS latitude,
      u.username
    FROM incidents i
    JOIN users u ON u.id = i.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT ${limit + 1}
  `;
  const rows = await q.unsafe<Array<IncidentBaseRow & { username: string }>>(sqlText, params);

  const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
  const ids = pageRows.map((r) => r.id);

  const mediaByIncident = new Map<string, MediaReference[]>();
  const officersByIncident = new Map<string, string[]>();
  if (ids.length > 0) {
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const mediaRows = await q.unsafe<Array<{ incident_id: string } & MediaRow>>(
      `SELECT incident_id, url AS key, type, sha256 AS hash, thumbnail_url AS thumbnail_key FROM media WHERE incident_id IN (${placeholders}) ORDER BY url`,
      ids,
    );
    for (const m of mediaRows) {
      const list = mediaByIncident.get(m.incident_id) ?? [];
      list.push({ key: m.key, type: m.type as MediaReference['type'], hash: m.hash, thumbnail_key: m.thumbnail_key });
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
  }

  const items = pageRows.map((row) =>
    serializeIncident(
      row,
      mediaByIncident.get(row.id) ?? [],
      officersByIncident.get(row.id) ?? [],
      row.username,
    ),
  );

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const last = pageRows.at(-1);
    if (last) nextCursor = encodeCursor(last.created_at.toISOString(), last.id);
  }

  return { items, next_cursor: nextCursor };
}

export async function deleteIncident(id: string, userId: string): Promise<string[]> {
  const rows = await q<{ user_id: string }[]>`SELECT user_id FROM incidents WHERE id = ${id}`;
  const row = rows[0];
  if (!row) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  if (row.user_id !== userId) throw new ApiError(errorCodes.FORBIDDEN, 'you do not own this incident');

  const mediaRows = await q<{ url: string }[]>`SELECT url FROM media WHERE incident_id = ${id}`;
  await db`DELETE FROM incidents WHERE id = ${id}`;
  return mediaRows.map((m) => m.url);
}

// --- report flags ---------------------------------------------------------

export async function createReportFlag(
  incidentId: string,
  userId: string,
  reason: string,
  detail: string,
): Promise<void> {
  try {
    await db`
      INSERT INTO report_flags (id, incident_id, user_id, reason, detail)
      VALUES (${crypto.randomUUID()}, ${incidentId}, ${userId}, ${reason}, ${detail})
    `;
  } catch (err) {
    if (isPostgresError(err) && err.code === '23503') {
      throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
    }
    throw err;
  }
}

// --- views ----------------------------------------------------------------

export async function incrementView(id: string): Promise<number | null> {
  const rows = await q<{ view_count: number }[]>`
    UPDATE incidents SET view_count = view_count + 1 WHERE id = ${id} RETURNING view_count
  `;
  return rows[0]?.view_count ?? null;
}

// --- rate limiting --------------------------------------------------------

export async function ensureRateLimitTable(): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS rate_limit (
      bucket text PRIMARY KEY,
      count integer NOT NULL DEFAULT 0,
      reset_at timestamptz NOT NULL
    )
  `;
}

export interface RateLimitResult {
  limited: boolean;
  count: number;
  retryAfterMs: number;
}

export async function rateLimitHit(bucket: string, windowMs: number, max: number): Promise<RateLimitResult> {
  const windowSecs = windowMs / 1000;
  const rows = await q<{ count: number; reset_at: Date }[]>`
    INSERT INTO rate_limit (bucket, count, reset_at)
    VALUES (${bucket}, 1, now() + make_interval(secs => ${windowSecs}))
    ON CONFLICT (bucket) DO UPDATE SET
      count = CASE WHEN rate_limit.reset_at <= now() THEN 1 ELSE rate_limit.count + 1 END,
      reset_at = CASE WHEN rate_limit.reset_at <= now() THEN now() + make_interval(secs => ${windowSecs}) ELSE rate_limit.reset_at END
    RETURNING count, reset_at
  `;
  const row = rows[0];
  if (!row) return { limited: false, count: 0, retryAfterMs: 0 };
  const remainingMs = row.reset_at.getTime() - Date.now();
  return {
    limited: remainingMs > 0 && row.count > max,
    count: row.count,
    retryAfterMs: Math.max(0, remainingMs),
  };
}