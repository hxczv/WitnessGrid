import type { Incident, ListAlertsResult, SavedArea, SavedAreaCreate } from '@witnessgrid/contract';
import { db } from '../db.js';
import { ApiError, errorCodes } from '../errors.js';
import { q } from './shared.js';
import { getIncidentsByIds } from './incidents.js';

const AREA_LIMIT = 10;

export async function listSavedAreas(userId: string): Promise<SavedArea[]> {
  const rows = await q<
    Array<{ id: string; name: string; created_at: Date; polygon: string; alerts: number }>
  >`
    SELECT sa.id, sa.name, sa.created_at,
      ST_AsGeoJSON(sa.bounds::geometry) AS polygon,
      count(a.id)::int AS alerts
    FROM saved_areas sa
    LEFT JOIN saved_area_alerts a ON a.area_id = sa.id
    WHERE sa.user_id = ${userId}
    GROUP BY sa.id, sa.name, sa.created_at, sa.bounds
    ORDER BY sa.created_at DESC, sa.id DESC
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    polygon: geoJsonToPolygon(row.polygon),
    created_at: row.created_at.toISOString(),
    alerts: row.alerts,
  }));
}

export async function createSavedArea(userId: string, input: SavedAreaCreate): Promise<SavedArea> {
  const countRows = await q<{ count: number }[]>`SELECT count(*)::int AS count FROM saved_areas WHERE user_id = ${userId}`;
  if ((countRows[0]?.count ?? 0) >= AREA_LIMIT) {
    throw new ApiError(errorCodes.CONFLICT, `saved area limit of ${AREA_LIMIT} reached`);
  }

  const ring = input.polygon.map(([lon, lat]) => `${lon} ${lat}`).join(',');
  const first = input.polygon[0];
  if (!first) throw new ApiError(errorCodes.VALIDATION, 'polygon needs at least 3 vertices');
  const wkt = `SRID=4326;POLYGON((${ring},${first[0]} ${first[1]}))`;
  const id = crypto.randomUUID();
  const rows = await q<Array<{ id: string; name: string; created_at: Date; polygon: string }>>`
    INSERT INTO saved_areas (id, user_id, name, bounds)
    VALUES (${id}, ${userId}, ${input.name}, ST_GeomFromEWKT(${wkt})::geography)
    RETURNING id, name, created_at, ST_AsGeoJSON(bounds::geometry) AS polygon
  `;
  const row = rows[0];
  if (!row) throw new ApiError(errorCodes.STORAGE, 'saved area insert returned no row');

  return {
    id: row.id,
    name: row.name,
    polygon: geoJsonToPolygon(row.polygon),
    created_at: row.created_at.toISOString(),
    alerts: 0,
  };
}

function geoJsonToPolygon(geojson: string): Array<[number, number]> {
  try {
    const parsed = JSON.parse(geojson) as { type: string; coordinates: unknown };
    if (parsed.type !== 'Polygon' || !Array.isArray(parsed.coordinates)) return [];
    const ring = parsed.coordinates[0];
    if (!Array.isArray(ring)) return [];
    const coords = ring as Array<[number, number]>;
    // GeoJSON polygons repeat the first coordinate at the end; the API shape does not.
    const firstPoint = coords[0];
    const lastPoint = coords[coords.length - 1];
    if (firstPoint && lastPoint && coords.length > 1 && firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1]) {
      coords.pop();
    }
    return coords;
  } catch {
    return [];
  }
}

export async function deleteSavedArea(id: string, userId: string): Promise<void> {
  const rows = await db`DELETE FROM saved_areas WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  if (!rows[0]) throw new ApiError(errorCodes.NOT_FOUND, 'saved area not found');
}

export async function listAlerts(userId: string, limit = 100): Promise<ListAlertsResult> {
  const rows = await q<Array<{ id: string; incident_id: string; area_id: string; area_name: string; created_at: Date }>>`
    SELECT a.id, a.incident_id, a.area_id, sa.name AS area_name, a.created_at
    FROM saved_area_alerts a
    JOIN saved_areas sa ON sa.id = a.area_id
    WHERE a.user_id = ${userId}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${limit}
  `;

  const incidents = await getIncidentsByIds(rows.map((r) => r.incident_id), userId);

  const items: ListAlertsResult['items'] = [];
  for (const row of rows) {
    const incident = incidents.get(row.incident_id);
    if (!incident) continue;
    items.push({
      id: row.id,
      incident_id: row.incident_id,
      area_id: row.area_id,
      area_name: row.area_name,
      incident: incident satisfies Incident,
      created_at: row.created_at.toISOString(),
    });
  }
  return { items };
}
