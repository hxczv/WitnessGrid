import { z } from 'zod';

export const RATING_DIMENSIONS = ['appropriateness', 'professionalism', 'safety'] as const;
export type RatingDimension = (typeof RATING_DIMENSIONS)[number];

export const RatingCreateSchema = z.object({
  incident_id: z.string().uuid(),
  appropriateness: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
  safety: z.number().int().min(1).max(5),
});
export type RatingCreate = z.infer<typeof RatingCreateSchema>;

export const RatingSummarySchema = z.object({
  incident_id: z.string().uuid(),
  count: z.number().int().nonnegative(),
  appropriateness_avg: z.number().nullable(),
  professionalism_avg: z.number().nullable(),
  safety_avg: z.number().nullable(),
  my: z
    .object({
      appropriateness: z.number().int().min(1).max(5),
      professionalism: z.number().int().min(1).max(5),
      safety: z.number().int().min(1).max(5),
      created_at: z.string().datetime(),
    })
    .nullable(),
});
export type RatingSummary = z.infer<typeof RatingSummarySchema>;
