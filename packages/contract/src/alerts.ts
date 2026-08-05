import { z } from 'zod';
import { IncidentSchema } from './incidents';

export const SavedAreaAlertSchema = z.object({
  id: z.string().uuid(),
  incident_id: z.string().uuid(),
  area_id: z.string().uuid(),
  area_name: z.string().min(1),
  incident: IncidentSchema,
  created_at: z.string().datetime(),
});
export type SavedAreaAlert = z.infer<typeof SavedAreaAlertSchema>;

export const ListAlertsResultSchema = z.object({
  items: z.array(SavedAreaAlertSchema),
});
export type ListAlertsResult = z.infer<typeof ListAlertsResultSchema>;
