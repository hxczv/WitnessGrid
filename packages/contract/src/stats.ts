import { z } from 'zod';
import { INCIDENT_TYPES, POLICE_FORCES } from './enums';

export const StatsQuerySchema = z.object({
  period: z.enum(['30d', '90d', 'all']).default('30d'),
});
export type StatsQuery = z.infer<typeof StatsQuerySchema>;
export type StatsPeriod = StatsQuery['period'];

export const StatsPublicSchema = z.object({
  total_incidents: z.number().int().nonnegative(),
  by_type: z.array(
    z.object({
      type: z.enum(INCIDENT_TYPES),
      count: z.number().int().nonnegative(),
    }),
  ),
  by_force: z.array(
    z.object({
      force: z.enum(POLICE_FORCES),
      count: z.number().int().nonnegative(),
    }),
  ),
  series_30d: z.array(
    z.object({
      day: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  avg_rating: z.number().nullable(),
});
export type StatsPublic = z.infer<typeof StatsPublicSchema>;

export const StatsMeSchema = z.object({
  total_incidents: z.number().int().nonnegative(),
  approved_incidents: z.number().int().nonnegative(),
  total_views: z.number().int().nonnegative(),
  ratings_given: z.number().int().nonnegative(),
  avg_rating_received: z.number().nullable(),
  saved_areas: z.number().int().nonnegative(),
  alerts_received: z.number().int().nonnegative(),
});
export type StatsMe = z.infer<typeof StatsMeSchema>;
