import type { IncidentType, PoliceForce, StatsMe, StatsPeriod, StatsPublic } from '@witnessgrid/contract';
import { q } from './shared.js';

function periodToDays(period: StatsPeriod): number | null {
  if (period === '30d') return 30;
  if (period === '90d') return 90;
  return null;
}

function timeFilter(days: number | null): string {
  return days !== null ? ` AND i."timestamp" >= now() - make_interval(days => ${days})` : '';
}

// avg()::numeric can serialize as a string depending on driver version, so
// averages are cast to text and parsed defensively.
function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getStatsPublic(period: StatsPeriod = '30d'): Promise<StatsPublic> {
  const days = periodToDays(period);
  const tf = timeFilter(days);

  const totals = await q.unsafe<Array<{ total_incidents: number; total_views: number }>>(
    `SELECT count(*)::int AS total_incidents, coalesce(sum(i.view_count), 0)::int AS total_views
     FROM incidents i WHERE i.moderation_status = 'approved'${tf}`,
  );
  const byType = await q.unsafe<Array<{ type: string; count: number }>>(
    `SELECT i.type, count(*)::int AS count FROM incidents i
     WHERE i.moderation_status = 'approved'${tf}
     GROUP BY i.type ORDER BY count DESC, i.type ASC`,
  );
  const byForce = await q.unsafe<Array<{ police_force: string; count: number }>>(
    `SELECT i.police_force, count(*)::int AS count FROM incidents i
     WHERE i.moderation_status = 'approved'${tf}
     GROUP BY i.police_force ORDER BY count DESC, i.police_force ASC`,
  );
  // The daily series always covers the last 30 days regardless of period.
  const series = await q.unsafe<Array<{ day: Date; count: number }>>(
    `SELECT day::date AS day, count(i.id)::int AS count
     FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS day
     LEFT JOIN incidents i ON i.moderation_status = 'approved' AND date_trunc('day', i."timestamp") = day
     GROUP BY day
     ORDER BY day ASC`,
  );
  const rating = await q.unsafe<Array<{ avg: string | null }>>(
    `SELECT round(avg((r.appropriateness + r.professionalism + r.safety) / 3.0)::numeric, 2)::text AS avg
     FROM ratings r
     JOIN incidents i ON i.id = r.incident_id
     WHERE i.moderation_status = 'approved'${tf}`,
  );

  return {
    total_incidents: totals[0]?.total_incidents ?? 0,
    total_views: totals[0]?.total_views ?? 0,
    by_type: byType.map((row) => ({ type: row.type as IncidentType, count: row.count })),
    by_force: byForce.map((row) => ({ force: row.police_force as PoliceForce, count: row.count })),
    series_30d: series.map((row) => ({ day: row.day.toISOString().slice(0, 10), count: row.count })),
    avg_rating: toNumber(rating[0]?.avg),
  };
}

export async function getStatsMe(userId: string): Promise<StatsMe> {
  const incidents = await q.unsafe<Array<{ total_incidents: number; approved_incidents: number; total_views: number }>>(
    `SELECT count(*)::int AS total_incidents,
       count(*) FILTER (WHERE moderation_status = 'approved')::int AS approved_incidents,
       coalesce(sum(view_count), 0)::int AS total_views
     FROM incidents WHERE user_id = $1`,
    [userId],
  );
  const ratingsGiven = await q.unsafe<Array<{ ratings_given: number }>>(
    'SELECT count(*)::int AS ratings_given FROM ratings WHERE user_id = $1',
    [userId],
  );
  const ratingReceived = await q.unsafe<Array<{ avg: string | null }>>(
    `SELECT round(avg((r.appropriateness + r.professionalism + r.safety) / 3.0)::numeric, 2)::text AS avg
     FROM ratings r JOIN incidents i ON i.id = r.incident_id
     WHERE i.user_id = $1`,
    [userId],
  );
  const areas = await q.unsafe<Array<{ saved_areas: number }>>(
    'SELECT count(*)::int AS saved_areas FROM saved_areas WHERE user_id = $1',
    [userId],
  );
  const alerts = await q.unsafe<Array<{ alerts_received: number }>>(
    'SELECT count(*)::int AS alerts_received FROM saved_area_alerts WHERE user_id = $1',
    [userId],
  );

  return {
    total_incidents: incidents[0]?.total_incidents ?? 0,
    approved_incidents: incidents[0]?.approved_incidents ?? 0,
    total_views: incidents[0]?.total_views ?? 0,
    ratings_given: ratingsGiven[0]?.ratings_given ?? 0,
    avg_rating_received: toNumber(ratingReceived[0]?.avg),
    saved_areas: areas[0]?.saved_areas ?? 0,
    alerts_received: alerts[0]?.alerts_received ?? 0,
  };
}
