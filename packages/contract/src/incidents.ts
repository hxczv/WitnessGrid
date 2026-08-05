import { z } from 'zod';
import { INCIDENT_TYPES, MODERATION_STATUSES, POLICE_FORCES } from './enums';

export const MediaTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/webm',
  'video/mp4',
]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MediaReferenceSchema = z.object({
  key: z.string().min(1),
  type: MediaTypeSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  thumbnail_key: z.string().min(1).nullable(),
});
export type MediaReference = z.infer<typeof MediaReferenceSchema>;

export const LocationSchema = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
export type Location = z.infer<typeof LocationSchema>;

export const IncidentCreateSchema = z.object({
  incident_type: z.enum(INCIDENT_TYPES),
  police_force: z.enum(POLICE_FORCES),
  timestamp: z.string().datetime(),
  location: LocationSchema,
  location_accuracy_m: z.number().nonnegative().nullable().optional(),
  description: z.string().max(2000).optional().default(''),
  officer_count: z.number().int().min(0).max(100).nullable().optional(),
  collar_numbers: z.array(z.string().min(1).max(12)).max(5).optional(),
  media: z.array(MediaReferenceSchema).min(1).max(20),
  client_id: z.string().uuid(),
});
export type IncidentCreate = z.infer<typeof IncidentCreateSchema>;

export const IncidentSchema = IncidentCreateSchema.extend({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
  view_count: z.number().int().nonnegative(),
  moderation_status: z.enum(MODERATION_STATUSES),
  latitude: z.number(),
  longitude: z.number(),
  username: z.string().nullable(),
})
  .omit({ location: true })
  .partial({ officer_count: true, collar_numbers: true });
export type Incident = z.infer<typeof IncidentSchema>;

export const ListIncidentsQuerySchema = z.object({
  minLon: z.coerce.number().min(-180).max(180).optional(),
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLon: z.coerce.number().min(-180).max(180).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  type: z.enum(INCIDENT_TYPES).optional(),
  policeForce: z.enum(POLICE_FORCES).optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export type ListIncidentsQuery = z.infer<typeof ListIncidentsQuerySchema>;

export const ListIncidentsResultSchema = z.object({
  items: z.array(IncidentSchema),
  next_cursor: z.string().nullable(),
});
export type ListIncidentsResult = z.infer<typeof ListIncidentsResultSchema>;

export const UploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: MediaTypeSchema,
});
export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export const UploadResponseSchema = z.object({
  key: z.string().min(1),
  upload_url: z.string().min(1),
  headers: z.record(z.string()),
});
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

export function encodeCursor(createdAtIso: string, id: string): string {
  return `${encodeURIComponent(createdAtIso)}:${id}`;
}

export function decodeCursor(cursor: string): { createdAtIso: string; id: string } {
  const idx = cursor.lastIndexOf(':');
  if (idx === -1) throw new Error('malformed cursor');
  return { createdAtIso: decodeURIComponent(cursor.slice(0, idx)), id: cursor.slice(idx + 1) };
}
