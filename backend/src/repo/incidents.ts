import type {
  Incident,
  IncidentCreate,
  ListIncidentsQuery,
  ListIncidentsResult,
  MediaReference,
} from '@witnessgrid/contract';
import { decodeCursor, encodeCursor } from '@witnessgrid/contract';
import type { Db } from '../db.js';
import { db } from '../db.js';
import { config } from '../config.js';
import { ApiError, errorCodes } from '../errors.js';
import { sendAreaAlert } from '../email.js';
import {
  hydrateIncidentExtras,
  INCIDENT_SELECT,
  isPostgresError,
  q,
  rowQuery,
  withTx,
  type IncidentBaseRow,
} from './shared.js';
import { consumeGrants, validateGrantsForIncident } from './upload-grants.js';

interface AreaAlertEmail {
  email: string;
  areaName: string;
}

async function fireAreaAlerts(tx: Db, incidentId: string): Promise<AreaAlertEmail[]> {
  const tq = rowQuery(tx);
  const matches = await tq<Array<{ user_id: string; area_id: string; email: string; area_name: string }>>`
    SELECT DISTINCT ON (u.id) u.id AS user_id, sa.id AS area_id, u.email, sa.name AS area_name
    FROM saved_areas sa
    JOIN users u ON u.id = sa.user_id
    WHERE ST_Intersects(sa.bounds, (SELECT location FROM incidents WHERE id = ${incidentId}))
    ORDER BY u.id, sa.created_at, sa.id
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
    ...(row.location_accuracy_m !== null && { location_accuracy_m: row.location_accuracy_m }),
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

export function parseCursor(cursor: string): { createdAtIso: string; id: string } {
  try {
    const decoded = decodeCursor(cursor);
    const parsed = new Date(decoded.createdAtIso);
    if (Number.isNaN(parsed.getTime())) throw new Error('cursor date is not a valid date');
    return decoded;
  } catch {
    throw new ApiError(errorCodes.VALIDATION, 'invalid cursor');
  }
}

export async function createIncident(input: IncidentCreate, userId: string): Promise<Incident> {
  const incidentId = crypto.randomUUID();
  const pendingEmails: AreaAlertEmail[] = [];

  const incident = await withTx(async (tx) => {
    const tq = rowQuery(tx);
    await validateGrantsForIncident(
      tx,
      userId,
      input.media.map((m) => ({ key: m.key, declaredHash: m.hash })),
    );

    const rows = await tq<IncidentBaseRow[]>`
      INSERT INTO incidents (id, user_id, client_id, type, police_force, location, location_accuracy_m, "timestamp", description, officer_count, moderation_tsv)
      VALUES (
        ${incidentId}, ${userId}, ${input.client_id}, ${input.incident_type}, ${input.police_force},
        ST_SetSRID(ST_MakePoint(${input.location.lon}, ${input.location.lat}), 4326)::geography,
        ${input.location_accuracy_m ?? null}, ${input.timestamp}, ${input.description}, ${input.officer_count ?? null},
        to_tsvector('english', coalesce(${input.description}, ''))
      )
      RETURNING id, user_id, client_id, type AS incident_type, police_force, "timestamp", description,
        officer_count, location_accuracy_m, created_at, view_count, moderation_status,
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
    await consumeGrants(tx, input.media.map((m) => m.key));

    const userRows = await tq<{ username: string }[]>`SELECT username FROM users WHERE id = ${userId}`;
    const username = userRows[0]?.username ?? null;
    pendingEmails.push(...(await fireAreaAlerts(tx, incidentId)));
    return serializeIncident(row, input.media, input.collar_numbers ?? [], username);
  }).catch((err) => {
    if (isPostgresError(err) && err.code === '23505' && err.constraint_name === 'incidents_client_id_key') {
      throw new ApiError(errorCodes.CONFLICT, 'an incident with this client_id already exists');
    }
    if (isPostgresError(err) && err.code === '23505' && err.constraint_name === 'media_incident_sha256_key') {
      throw new ApiError(errorCodes.VALIDATION, 'the same file is attached to this incident twice');
    }
    throw err;
  });

  for (const alert of pendingEmails) {
    try {
      await sendAreaAlert(alert.email, alert.areaName, `${config.PUBLIC_ORIGIN}/incident/${incidentId}`);
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
  const rows = await q.unsafe<Array<IncidentBaseRow & { username: string | null }>>(
    `${INCIDENT_SELECT} WHERE i.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.moderation_status !== 'approved' && row.user_id !== userId) return null;

  if (opts.incrementView !== false) {
    const viewRows = await q<{ view_count: number }[]>`
      UPDATE incidents SET view_count = view_count + 1 WHERE id = ${id} RETURNING view_count
    `;
    if (viewRows[0]) row.view_count = viewRows[0].view_count;
  }

  const { mediaByIncident, officersByIncident } = await hydrateIncidentExtras([id]);
  return serializeIncident(
    row,
    (mediaByIncident.get(id) ?? []).map((m) => ({
      key: m.key,
      type: m.type as MediaReference['type'],
      hash: m.hash,
      thumbnail_key: m.thumbnail_key,
    })),
    officersByIncident.get(id) ?? [],
    row.username,
  );
}

async function pageIncidents(
  conditions: string[],
  params: unknown[],
  limit: number,
): Promise<ListIncidentsResult> {
  // created_at is selected twice: postgres.js parses timestamptz into JS Dates,
  // which truncate microseconds, so the cursor must be built from the raw text
  // form (to_char) or keyset pagination silently drops rows that share a
  // millisecond with the page boundary. The session timezone may not be UTC,
  // so the wall-clock conversion must be explicit.
  const sqlText = `
    SELECT page.*, to_char(page.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_iso
    FROM (
      ${INCIDENT_SELECT}
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${limit + 1}
    ) page
    ORDER BY page.created_at DESC, page.id DESC
  `;
  const rows = await q.unsafe<
    Array<IncidentBaseRow & { username: string | null; created_at_iso: string }>
  >(sqlText, params);

  const pageRows = rows.slice(0, limit);
  const { mediaByIncident, officersByIncident } = await hydrateIncidentExtras(pageRows.map((r) => r.id));

  const items = pageRows.map((row) =>
    serializeIncident(
      row,
      (mediaByIncident.get(row.id) ?? []).map((m) => ({
        key: m.key,
        type: m.type as MediaReference['type'],
        hash: m.hash,
        thumbnail_key: m.thumbnail_key,
      })),
      officersByIncident.get(row.id) ?? [],
      row.username,
    ),
  );

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const last = pageRows.at(-1);
    if (last) nextCursor = encodeCursor(last.created_at_iso, last.id);
  }
  return { items, next_cursor: nextCursor };
}

export async function listIncidents(query: ListIncidentsQuery): Promise<ListIncidentsResult> {
  const conditions: string[] = ["i.moderation_status = 'approved'"];
  const params: unknown[] = [];

  const addBound = (sql: string, value: unknown): void => {
    params.push(value);
    conditions.push(`${sql} $${params.length}`);
  };

  const { minLon, minLat, maxLon, maxLat, startDate, endDate, type, policeForce, q: search, cursor, limit } = query;

  if (minLon !== undefined && minLat !== undefined && maxLon !== undefined && maxLat !== undefined) {
    params.push(minLon, minLat, maxLon, maxLat);
    conditions.push(
      `ST_Intersects(i.location, ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326))`,
    );
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
    const decoded = parseCursor(cursor);
    params.push(decoded.createdAtIso, decoded.id);
    conditions.push(`(i.created_at < ($${params.length - 1}::text)::timestamptz OR (i.created_at = ($${params.length - 1}::text)::timestamptz AND i.id < $${params.length}))`);
  }

  return pageIncidents(conditions, params, limit);
}

export async function listUserIncidents(
  userId: string,
  query: { cursor?: string; limit?: number },
): Promise<ListIncidentsResult> {
  const limit = query.limit ?? 25;
  const conditions: string[] = ['i.user_id = $1'];
  const params: unknown[] = [userId];
  if (query.cursor !== undefined) {
    const decoded = parseCursor(query.cursor);
    params.push(decoded.createdAtIso, decoded.id);
    conditions.push(`(i.created_at < ($2::text)::timestamptz OR (i.created_at = ($2::text)::timestamptz AND i.id < $3))`);
  }
  return pageIncidents(conditions, params, limit);
}

// Deletes the incident and returns its object keys for physical removal.
// Media rows cascade with the incident, and upload grants guarantee each key
// belongs to exactly one incident, so these keys cannot be referenced
// elsewhere once the delete commits.
export async function deleteIncident(id: string, userId: string): Promise<string[]> {
  const rows = await q<{ user_id: string | null }[]>`SELECT user_id FROM incidents WHERE id = ${id}`;
  const row = rows[0];
  if (!row) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  if (row.user_id !== userId) throw new ApiError(errorCodes.FORBIDDEN, 'you do not own this incident');

  const mediaRows = await q<{ url: string }[]>`SELECT url FROM media WHERE incident_id = ${id}`;
  await db`DELETE FROM incidents WHERE id = ${id}`;
  return mediaRows.map((m) => m.url);
}
