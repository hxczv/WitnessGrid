import { db } from '../db.js';

export async function createReportFlag(
  incidentId: string,
  userId: string | null,
  reason: string,
  detail: string | null,
): Promise<void> {
  await db`
    INSERT INTO report_flags (id, incident_id, user_id, reason, detail)
    VALUES (${crypto.randomUUID()}, ${incidentId}, ${userId}, ${reason}, ${detail})
  `;
}
