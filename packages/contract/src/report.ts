import { z } from 'zod';
import { REPORT_REASONS } from './enums';

export const ReportFlagCreateSchema = z.object({
  incident_id: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(2000).optional().default(''),
});
export type ReportFlagCreate = z.infer<typeof ReportFlagCreateSchema>;
