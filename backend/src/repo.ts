import type {
  Incident,
  IncidentCreate,
  ListAlertsResult,
  ListIncidentsQuery,
  ListIncidentsResult,
  MediaReference,
  RatingSummary,
  SavedArea,
  SavedAreaCreate,
  StatsMe,
  StatsPublic,
} from '@witnessgrid/contract';
import { decodeCursor, encodeCursor } from '@witnessgrid/contract';
import { ApiError, errorCodes } from './errors.js';
import { db, type Db } from './db.js';
import { sendAreaAlert } from './email.js';
import { config } from './config.js';

export interface UserRow {
  id: string;
  username: string;
  email: string;
  created_at: Date;
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

interface AreaAlertEmail {
  email: string;
  areaName: string;
}

async function fireAreaAlerts(
  tx: Db,
  incidentId: string,
): Promise<AreaAlertEmail[]> {
  const tq = tx as unknown as RowQuery;
  const matches = await tq<Array<{ user_id: string; area_id: string; email: string; area_name: string }>>`
    SELECT DISTINCT ON (u.id) u.id AS user_id, sa.id AS area_id, u.email, sa.name AS area_name
    FROM saved_areas sa
    JOIN users u ON u.id = sa.user_id
    WHERE ST_Intersects(sa.bounds, (SELECT location FROM incidents WHERE id = ${incidentId}))
  `;
  const pending: AreaAlertEmail[] = [];
  for (const m of matches) {
    if (!m.email) continue;
    const inserted = await tq<{ id: string }[]>`
      INSERT INTO saved_area_alerts (id, user_id, area_id, incident_id)
      VALUES (${crypto.randomUUID()}, ${m.user_id}, ${m.area_id}, ${incidentId})
      ON CONFLICT (user_id, incident_id) DO NOTHING
      RETURNING id
    `;
    if (inserted[0]) pending.push({ email: m.email, areaName: m.area_name });
  }
  return pending;
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
  username: string | null,
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
  const pendingEmails: AreaAlertEmail[] = [];

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
    const username = userRows[0]?.username ?? null;
    pendingEmails.push(...(await fireAreaAlerts(tx, incidentId)));
    return serializeIncident(row, input.media, input.collar_numbers ?? [], username);
  };

  let incident: Incident;
  try {
    if (hasBegin(db)) {
      incident = await db.begin(async (tx) => run(tx as unknown as Db));
    } else {
      // neon adapter (Workers) has no interactive `.begin`; run sequentially and
      // rely on the unique client_id constraint to guarantee idempotency.
      incident = await run(db);
    }
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

  for (const alert of pendingEmails) {
    try {
      await sendAreaAlert(
        alert.email,
        alert.areaName,
        `${config.PUBLIC_ORIGIN}/incident/${incidentId}`,
      );
    } catch (err) {
      console.error('[email] failed to send saved-area alert', err);
    }
  }
  return incident;
}

export async function getIncident(
  id: string,
  userId: string | null,
  opts: { incrementView?: boolean } = {},
): Promise<Incident | null> {
  const rows = await q<Array<IncidentBaseRow & { username: string | null }>>`
    SELECT i.id, i.user_id, i.client_id, i.type AS incident_type, i.police_force,
      i."timestamp", i.description, i.officer_count, i.created_at, i.view_count, i.moderation_status,
      ST_X(i.location::geometry) AS longitude, ST_Y(i.location::geometry) AS latitude,
      u.username
    FROM incidents i
    LEFT JOIN users u ON u.id = i.user_id
    WHERE i.id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.moderation_status !== 'approved') {
    if (row.user_id === null || row.user_id !== userId) return null;
  }

  if (opts.incrementView !== false) {
    const viewRows = await q<{ view_count: number }[]>`
      UPDATE incidents SET view_count = view_count + 1 WHERE id = ${id} RETURNING view_count
    `;
    if (viewRows[0]) row.view_count = viewRows[0].view_count;
  }

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

  const { minLon, minLat, maxLon, maxLat, startDate, endDate, type, policeForce, q: search, cursor, limit } = query;

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
  if (search !== undefined && search.trim() !== '') {
    params.push(search.trim());
    conditions.push(`i.moderation_tsv @@ websearch_to_tsquery('english', $${params.length})`);
  }
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
    LEFT JOIN users u ON u.id = i.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT ${limitWithProbe + 1}
  `;
  const rows = await q.unsafe<Array<IncidentBaseRow & { username: string | null }>>(sqlText, params);

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
    LEFT JOIN users u ON u.id = i.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT ${limit + 1}
  `;
  const rows = await q.unsafe<Array<IncidentBaseRow & { username: string | null }>>(sqlText, params);

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

// --- ratings --------------------------------------------------------------

export async function getRatingSummary(
  incidentId: string,
  userId: string | null,
): Promise<RatingSummary> {
  const aggRows = await q<{
    count: number;
    appropriateness_avg: number | null;
    professionalism_avg: number | null;
    safety_avg: number | null;
  }[]>`
    SELECT count(*)::int AS count,
      avg(appropriateness)::float8 AS appropriateness_avg,
      avg(professionalism)::float8 AS professionalism_avg,
      avg(safety)::float8 AS safety_avg
    FROM ratings
    WHERE incident_id = ${incidentId}
  `;
  const agg = aggRows[0];

  let my: RatingSummary['my'] = null;
  if (userId !== null) {
    const myRows = await q<{ appropriateness: number; professionalism: number; safety: number; created_at: Date }[]>`
      SELECT appropriateness, professionalism, safety, created_at
      FROM ratings
      WHERE incident_id = ${incidentId} AND user_id = ${userId}
      LIMIT 1
    `;
    const mine = myRows[0];
    if (mine) {
      my = {
        appropriateness: mine.appropriateness,
        professionalism: mine.professionalism,
        safety: mine.safety,
        created_at: mine.created_at.toISOString(),
      };
    }
  }

  return {
    incident_id: incidentId,
    count: agg?.count ?? 0,
    appropriateness_avg: agg?.appropriateness_avg ?? null,
    professionalism_avg: agg?.professionalism_avg ?? null,
    safety_avg: agg?.safety_avg ?? null,
    my,
  };
}

export async function upsertRating(
  incidentId: string,
  userId: string,
  rating: { appropriateness: number; professionalism: number; safety: number },
): Promise<{ incident: Incident | null; summary: RatingSummary }> {
  const incidentRows = await q<{ user_id: string | null; moderation_status: string }[]>`
    SELECT user_id, moderation_status FROM incidents WHERE id = ${incidentId}
  `;
  const incidentRow = incidentRows[0];
  if (!incidentRow) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  if (incidentRow.user_id === userId) {
    throw new ApiError(errorCodes.CONFLICT, 'you cannot rate your own incident');
  }

  try {
    await db`
      INSERT INTO ratings (id, incident_id, user_id, appropriateness, professionalism, safety)
      VALUES (
        ${crypto.randomUUID()}, ${incidentId}, ${userId},
        ${rating.appropriateness}, ${rating.professionalism}, ${rating.safety}
      )
      ON CONFLICT (user_id, incident_id) DO UPDATE SET
        appropriateness = EXCLUDED.appropriateness,
        professionalism = EXCLUDED.professionalism,
        safety = EXCLUDED.safety
    `;
  } catch (err) {
    if (isPostgresError(err) && err.code === '23503') {
      throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
    }
    throw err;
  }

  const visible =
    incidentRow.moderation_status === 'approved'
      ? await getIncident(incidentId, userId, { incrementView: false })
      : null;
  return { incident: visible, summary: await getRatingSummary(incidentId, userId) };
}

// --- saved areas ----------------------------------------------------------

interface SavedAreaRow {
  id: string;
  name: string;
  created_at: Date;
  geojson: { type: string; coordinates: number[][][] };
  alerts: number;
}

function toSavedArea(row: SavedAreaRow): SavedArea {
  const ring = row.geojson.coordinates[0] ?? [];
  return {
    id: row.id,
    name: row.name,
    polygon: ring as [number, number][],
    created_at: row.created_at.toISOString(),
    alerts: row.alerts,
  };
}

export async function listSavedAreas(userId: string): Promise<SavedArea[]> {
  const rows = await q<SavedAreaRow[]>`
    SELECT s.id, s.name, ST_AsGeoJSON(s.bounds)::jsonb AS geojson, s.created_at,
      (SELECT count(*)::int FROM saved_area_alerts a WHERE a.area_id = s.id) AS alerts
    FROM saved_areas s
    WHERE s.user_id = ${userId}
    ORDER BY s.created_at DESC, s.id DESC
  `;
  return rows.map(toSavedArea);
}

export async function createSavedArea(userId: string, input: SavedAreaCreate): Promise<SavedArea> {
  const ring = [...input.polygon];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first);
  const wkt = `SRID=4326;POLYGON((${ring.map((p) => `${p[0]} ${p[1]}`).join(',')}))`;

  const run = async (tx: Db): Promise<SavedArea> => {
    const tq = tx as unknown as RowQuery;
    const countRows = await tq<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_areas WHERE user_id = ${userId}`;
    if (countRows[0] && countRows[0].n >= 10) {
      throw new ApiError(errorCodes.CONFLICT, 'you can save at most 10 areas');
    }
    const rows = await tq<SavedAreaRow[]>`
      INSERT INTO saved_areas (id, user_id, name, bounds)
      VALUES (${crypto.randomUUID()}, ${userId}, ${input.name}, ST_GeogFromText(${wkt}))
      RETURNING id, name, ST_AsGeoJSON(bounds)::jsonb AS geojson, created_at,
        (SELECT count(*)::int FROM saved_area_alerts a WHERE a.area_id = saved_areas.id) AS alerts
    `;
    const row = rows[0];
    if (!row) throw new ApiError(errorCodes.STORAGE, 'saved area insert returned no row');
    return toSavedArea(row);
  };

  if (hasBegin(db)) {
    return await db.begin(async (tx) => run(tx as unknown as Db));
  }
  return await run(db);
}

export async function deleteSavedArea(id: string, userId: string): Promise<void> {
  const rows = await q<{ id: string }[]>`
    DELETE FROM saved_areas WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  if (!rows[0]) throw new ApiError(errorCodes.NOT_FOUND, 'saved area not found');
}

// --- saved-area alerts ----------------------------------------------------

interface AlertIncidentJson {
  id: string;
  user_id: string | null;
  client_id: string;
  incident_type: string;
  police_force: string;
  timestamp: string;
  description: string;
  officer_count: number | null;
  created_at: string;
  view_count: number;
  moderation_status: string;
  latitude: number;
  longitude: number;
  username: string | null;
  media: MediaReference[];
}

function normalizeAlertIncident(raw: AlertIncidentJson): Incident {
  return {
    id: raw.id,
    user_id: raw.user_id,
    client_id: raw.client_id,
    incident_type: raw.incident_type as Incident['incident_type'],
    police_force: raw.police_force as Incident['police_force'],
    timestamp: raw.timestamp,
    description: raw.description,
    ...(raw.officer_count !== null && { officer_count: raw.officer_count }),
    media: raw.media,
    created_at: raw.created_at,
    view_count: raw.view_count,
    moderation_status: raw.moderation_status as Incident['moderation_status'],
    latitude: raw.latitude,
    longitude: raw.longitude,
    username: raw.username,
  };
}

export async function listAlerts(userId: string): Promise<ListAlertsResult> {
  const rows = await q<Array<{
    id: string;
    incident_id: string;
    area_id: string;
    area_name: string;
    created_at: Date;
    incident: AlertIncidentJson;
  }>>`
    SELECT a.id, a.incident_id, a.area_id, sa.name AS area_name, a.created_at,
      jsonb_build_object(
        'id', i.id,
        'user_id', i.user_id,
        'client_id', i.client_id,
        'incident_type', i.type,
        'police_force', i.police_force,
        'timestamp', i."timestamp",
        'description', i.description,
        'officer_count', i.officer_count,
        'created_at', i.created_at,
        'view_count', i.view_count,
        'moderation_status', i.moderation_status,
        'latitude', ST_Y(i.location::geometry),
        'longitude', ST_X(i.location::geometry),
        'username', u.username,
        'media', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('key', m.url, 'type', m.type, 'hash', m.sha256, 'thumbnail_key', m.thumbnail_url) ORDER BY m.url)
          FROM media m WHERE m.incident_id = i.id
        ), '[]'::jsonb)
      ) AS incident
    FROM saved_area_alerts a
    JOIN saved_areas sa ON sa.id = a.area_id
    JOIN incidents i ON i.id = a.incident_id
    LEFT JOIN users u ON u.id = i.user_id
    WHERE a.user_id = ${userId}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 100
  `;
  return {
    items: rows.map((r) => ({
      id: r.id,
      incident_id: r.incident_id,
      area_id: r.area_id,
      area_name: r.area_name,
      incident: normalizeAlertIncident(r.incident),
      created_at: r.created_at.toISOString(),
    })),
  };
}

// --- stats ----------------------------------------------------------------

export type StatsPeriod = '30d' | '90d' | 'all';

export async function getStatsPublic(period: StatsPeriod): Promise<StatsPublic> {
  const sinceIso =
    period === 'all' ? null : new Date(Date.now() - (period === '30d' ? 30 : 90) * 86400000).toISOString();

  const totalRows = await q<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM incidents
    WHERE moderation_status = 'approved' AND (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
  `;
  const total = totalRows[0]?.total ?? 0;

  const typeRows = await q.unsafe<{ type: string; count: number }[]>(
    `SELECT type, count(*)::int AS count
     FROM incidents
     WHERE moderation_status = 'approved' AND ($1::timestamptz IS NULL OR created_at >= $1)
     GROUP BY type ORDER BY count DESC, type`,
    [sinceIso],
  );

  const forceRows = await q.unsafe<{ force: string; count: number }[]>(
    `SELECT police_force AS force, count(*)::int AS count
     FROM incidents
     WHERE moderation_status = 'approved' AND ($1::timestamptz IS NULL OR created_at >= $1)
     GROUP BY police_force ORDER BY count DESC, police_force`,
    [sinceIso],
  );

  const seriesRows = await q<{ day: string; count: number }[]>`
    SELECT to_char(d.day AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(i.id)::int AS count
    FROM generate_series(now() - interval '29 days', now(), interval '1 day') AS d(day)
    LEFT JOIN incidents i
      ON i.created_at >= d.day AND i.created_at < d.day + interval '1 day'
      AND i.moderation_status = 'approved'
    GROUP BY d.day
    ORDER BY d.day
  `;

  const ratingRows = await q.unsafe<{ avg_rating: number | null }[]>(
    `SELECT avg(v)::float8 AS avg_rating
     FROM ratings r
     JOIN incidents i ON i.id = r.incident_id
     CROSS JOIN LATERAL (VALUES (r.appropriateness), (r.professionalism), (r.safety)) t(v)
     WHERE i.moderation_status = 'approved' AND ($1::timestamptz IS NULL OR i.created_at >= $1)`,
    [sinceIso],
  );

  return {
    total_incidents: total,
    by_type: typeRows.map((r) => ({
      type: r.type as StatsPublic['by_type'][number]['type'],
      count: r.count,
    })),
    by_force: forceRows.map((r) => ({
      force: r.force as StatsPublic['by_force'][number]['force'],
      count: r.count,
    })),
    series_30d: seriesRows.map((r) => ({ day: r.day, count: r.count })),
    avg_rating: ratingRows[0]?.avg_rating ?? null,
  };
}

export async function getStatsMe(userId: string): Promise<StatsMe> {
  const rows = await q<{
    total_incidents: number;
    approved_incidents: number;
    total_views: number;
    ratings_given: number;
    avg_rating_received: number | null;
    saved_areas: number;
    alerts_received: number;
  }[]>`
    SELECT
      count(*)::int AS total_incidents,
      count(*) FILTER (WHERE moderation_status = 'approved')::int AS approved_incidents,
      coalesce(sum(view_count), 0)::int AS total_views,
      (SELECT count(*)::int FROM ratings WHERE user_id = ${userId}) AS ratings_given,
      (SELECT avg(v)::float8 FROM ratings r
         JOIN incidents i ON i.id = r.incident_id
         CROSS JOIN LATERAL (VALUES (r.appropriateness), (r.professionalism), (r.safety)) t(v)
         WHERE i.user_id = ${userId} AND i.moderation_status = 'approved') AS avg_rating_received,
      (SELECT count(*)::int FROM saved_areas WHERE user_id = ${userId}) AS saved_areas,
      (SELECT count(*)::int FROM saved_area_alerts WHERE user_id = ${userId}) AS alerts_received
    FROM incidents
    WHERE user_id = ${userId}
  `;
  const row = rows[0];
  return {
    total_incidents: row?.total_incidents ?? 0,
    approved_incidents: row?.approved_incidents ?? 0,
    total_views: row?.total_views ?? 0,
    ratings_given: row?.ratings_given ?? 0,
    avg_rating_received: row?.avg_rating_received ?? null,
    saved_areas: row?.saved_areas ?? 0,
    alerts_received: row?.alerts_received ?? 0,
  };
}

// --- account deletion -----------------------------------------------------

export async function deleteUserAccount(userId: string): Promise<void> {
  const rows = await q<{ id: string }[]>`DELETE FROM users WHERE id = ${userId} RETURNING id`;
  if (!rows[0]) throw new ApiError(errorCodes.NOT_FOUND, 'account not found');
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