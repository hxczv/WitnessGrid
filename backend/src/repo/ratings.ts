import type { Incident, RatingSummary } from '@witnessgrid/contract';
import { ApiError, errorCodes } from '../errors.js';
import { q } from './shared.js';
import { getIncident } from './incidents.js';

export interface RatingInput {
  appropriateness: number;
  professionalism: number;
  safety: number;
}

const AVG_COLUMNS = `
  round(avg(appropriateness)::numeric, 2)::text AS appropriateness_avg,
  round(avg(professionalism)::numeric, 2)::text AS professionalism_avg,
  round(avg(safety)::numeric, 2)::text AS safety_avg
`;

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Aggregate-only by design: individual ratings are never exposed, and the
// caller's own rating (my) is included so the UI can show their previous vote.
export async function getRatingSummary(incidentId: string, viewerId: string | null): Promise<RatingSummary> {
  await assertVisible(incidentId, viewerId);
  const agg = await q.unsafe<Array<{ count: number; appropriateness_avg: string | null; professionalism_avg: string | null; safety_avg: string | null }>>(
    `SELECT count(*)::int AS count, ${AVG_COLUMNS} FROM ratings WHERE incident_id = $1`,
    [incidentId],
  );
  const row = agg[0];

  let my: RatingSummary['my'] = null;
  if (viewerId) {
    const mine = await q.unsafe<Array<{ appropriateness: number; professionalism: number; safety: number; created_at: Date }>>(
      'SELECT appropriateness, professionalism, safety, created_at FROM ratings WHERE incident_id = $1 AND user_id = $2',
      [incidentId, viewerId],
    );
    const own = mine[0];
    if (own) {
      my = {
        appropriateness: own.appropriateness,
        professionalism: own.professionalism,
        safety: own.safety,
        created_at: own.created_at.toISOString(),
      };
    }
  }

  return {
    incident_id: incidentId,
    count: row?.count ?? 0,
    appropriateness_avg: toNumber(row?.appropriateness_avg),
    professionalism_avg: toNumber(row?.professionalism_avg),
    safety_avg: toNumber(row?.safety_avg),
    my,
  };
}

export interface UpsertRatingResult {
  summary: RatingSummary;
  incident: Incident;
}

// Matches getIncident's visibility: non-approved incidents are invisible to
// everyone but their owner. Throwing NOT_FOUND instead of a distinct error
// avoids leaking whether a removed or pending incident exists.
async function assertVisible(incidentId: string, viewerId: string | null): Promise<void> {
  const rows = await q<{ user_id: string | null; moderation_status: string }[]>`
    SELECT user_id, moderation_status FROM incidents WHERE id = ${incidentId}
  `;
  const row = rows[0];
  if (!row) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  if (row.moderation_status !== 'approved' && row.user_id !== viewerId) {
    throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  }
}

export async function upsertRating(incidentId: string, userId: string, ratings: RatingInput): Promise<UpsertRatingResult> {
  await assertVisible(incidentId, userId);
  const ownerRows = await q<{ user_id: string | null }[]>`SELECT user_id FROM incidents WHERE id = ${incidentId}`;
  const owner = ownerRows[0];
  if (!owner) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  if (owner.user_id === userId) {
    throw new ApiError(errorCodes.CONFLICT, 'you cannot rate your own incident');
  }

  const rows = await q<{ user_id: string }[]>`
    INSERT INTO ratings (id, user_id, incident_id, appropriateness, professionalism, safety)
    VALUES (${crypto.randomUUID()}, ${userId}, ${incidentId}, ${ratings.appropriateness}, ${ratings.professionalism}, ${ratings.safety})
    ON CONFLICT (user_id, incident_id)
    DO UPDATE SET
      appropriateness = excluded.appropriateness,
      professionalism = excluded.professionalism,
      safety = excluded.safety,
      updated_at = now()
    RETURNING user_id
  `;
  if (!rows[0]) throw new ApiError(errorCodes.STORAGE, 'rating upsert returned no row');
  const incident = await getIncident(incidentId, userId, { incrementView: false });
  if (!incident) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  return { summary: await getRatingSummary(incidentId, userId), incident };
}
