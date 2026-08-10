import { db } from '../db.js';
import { ApiError, errorCodes } from '../errors.js';

export async function createReportFlag(
  incidentId: string,
  userId: string | null,
  reason: string,
  detail: string | null,
): Promise<void> {
  const rows = await db<{ id: string }[]>`SELECT id FROM incidents WHERE id = ${incidentId}`;
  if (!rows[0]) throw new ApiError(errorCodes.NOT_FOUND, 'incident not found');
  await db`
    INSERT INTO report_flags (id, incident_id, user_id, reason, detail)
    VALUES (${crypto.randomUUID()}, ${incidentId}, ${userId}, ${reason}, ${detail})
  `;
}
