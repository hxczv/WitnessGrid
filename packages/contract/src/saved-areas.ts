import { z } from 'zod';

export const PolygonSchema = z
  .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
  .min(3)
  .max(500);
export type Polygon = z.infer<typeof PolygonSchema>;

export const SavedAreaCreateSchema = z.object({
  name: z.string().min(1).max(100),
  polygon: PolygonSchema,
});
export type SavedAreaCreate = z.infer<typeof SavedAreaCreateSchema>;

export const SavedAreaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  polygon: PolygonSchema,
  created_at: z.string().datetime(),
  alerts: z.number().int().nonnegative(),
});
export type SavedArea = z.infer<typeof SavedAreaSchema>;
