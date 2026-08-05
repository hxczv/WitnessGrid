import { describe, expect, it } from 'vitest';
import {
  IncidentCreateSchema,
  IncidentSchema,
  ListAlertsResultSchema,
  ListIncidentsQuerySchema,
  MagicLinkRequestSchema,
  MediaReferenceSchema,
  PolygonSchema,
  RatingCreateSchema,
  RatingSummarySchema,
  ReportFlagCreateSchema,
  SavedAreaAlertSchema,
  SavedAreaCreateSchema,
  SavedAreaSchema,
  SessionSchema,
  StatsMeSchema,
  StatsPublicSchema,
  StatsQuerySchema,
  UploadRequestSchema,
  UploadResponseSchema,
  encodeCursor,
  decodeCursor,
} from '../src/index.js';

const validMedia = () => ({
  key: 'media/inc1/' + 'a'.repeat(64) + '.jpg',
  type: 'image/jpeg' as const,
  hash: 'a'.repeat(64),
  thumbnail_key: 'media/inc1/' + 'b'.repeat(64) + '.webp',
});

const validIncident = () => ({
  incident_type: 'use_of_force' as const,
  police_force: 'metropolitan' as const,
  timestamp: '2026-08-01T12:00:00.000Z',
  location: { lon: -0.1276, lat: 51.5072 },
  description: 'A stop on the High Street',
  officer_count: 3,
  collar_numbers: ['AB12'],
  media: [validMedia()],
  client_id: '5d8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
});

describe('MediaReferenceSchema', () => {
  it('accepts a valid reference', () => {
    expect(MediaReferenceSchema.safeParse(validMedia()).success).toBe(true);
  });

  it('rejects a bad hash', () => {
    expect(MediaReferenceSchema.safeParse({ ...validMedia(), hash: 'xyz' }).success).toBe(false);
  });

  it('rejects an unsupported content type', () => {
    expect(
      MediaReferenceSchema.safeParse({ ...validMedia(), type: 'text/html' }).success,
    ).toBe(false);
  });
});

describe('IncidentCreateSchema', () => {
  it('accepts a valid create payload', () => {
    const result = IncidentCreateSchema.safeParse(validIncident());
    expect(result.success).toBe(true);
  });

  it('rejects invalid lat/lon', () => {
    expect(
      IncidentCreateSchema.safeParse({
        ...validIncident(),
        location: { lon: 200, lat: 51 },
      }).success,
    ).toBe(false);
    expect(
      IncidentCreateSchema.safeParse({
        ...validIncident(),
        location: { lon: 0, lat: -91 },
      }).success,
    ).toBe(false);
  });

  it('rejects non-uuid client_id', () => {
    expect(IncidentCreateSchema.safeParse({ ...validIncident(), client_id: 'nope' }).success).toBe(
      false,
    );
  });

  it('rejects unknown police force', () => {
    expect(
      IncidentCreateSchema.safeParse({ ...validIncident(), police_force: 'sheriff' }).success,
    ).toBe(false);
  });

  it('rejects oversized description', () => {
    expect(
      IncidentCreateSchema.safeParse({ ...validIncident(), description: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });

  it('rejects missing media', () => {
    expect(IncidentCreateSchema.safeParse({ ...validIncident(), media: [] }).success).toBe(false);
  });

  it('rejects too many media items', () => {
    const media = Array.from({ length: 21 }, () => validMedia());
    expect(IncidentCreateSchema.safeParse({ ...validIncident(), media }).success).toBe(false);
  });
});

describe('ListIncidentsQuerySchema', () => {
  it('coerces string numbers for limit', () => {
    const result = ListIncidentsQuerySchema.safeParse({ limit: '10' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.limit).toBe(10);
  });

  it('caps limit at 50 and floors at 1', () => {
    expect(ListIncidentsQuerySchema.safeParse({ limit: 500 }).success && 0).toBeFalsy();
    const ok = ListIncidentsQuerySchema.safeParse({ limit: 500 });
    expect(ok.success).toBe(false);
    const bad = ListIncidentsQuerySchema.safeParse({ limit: 0 });
    expect(bad.success).toBe(false);
  });

  it('accepts empty query with defaults', () => {
    const result = ListIncidentsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(25);
  });

  it('accepts a search term', () => {
    expect(ListIncidentsQuerySchema.safeParse({ q: 'high street' }).success).toBe(true);
  });

  it('rejects an oversized search term', () => {
    expect(ListIncidentsQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('IncidentSchema nullability', () => {
  const base = {
    incident_type: 'use_of_force' as const,
    police_force: 'metropolitan' as const,
    timestamp: '2026-08-01T12:00:00.000Z',
    description: '',
    media: [validMedia()],
    client_id: '5d8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
    id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
    user_id: '5d8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
    created_at: '2026-08-01T12:00:00.000Z',
    view_count: 0,
    moderation_status: 'pending' as const,
    latitude: 51.5072,
    longitude: -0.1276,
    username: 'witness_01',
  };

  it('accepts a null username (author deleted)', () => {
    expect(IncidentSchema.safeParse({ ...base, username: null }).success).toBe(true);
  });

  it('accepts a null user_id (author deleted)', () => {
    expect(IncidentSchema.safeParse({ ...base, user_id: null }).success).toBe(true);
  });

  it('rejects missing username', () => {
    expect(IncidentSchema.safeParse({ ...base, username: undefined }).success).toBe(false);
  });
});

describe('Rating schemas', () => {
  it('accepts a valid rating', () => {
    expect(
      RatingCreateSchema.safeParse({
        incident_id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        appropriateness: 4,
        professionalism: 3,
        safety: 5,
      }).success,
    ).toBe(true);
  });

  it('rejects out-of-range scores', () => {
    expect(
      RatingCreateSchema.safeParse({
        incident_id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        appropriateness: 6,
        professionalism: 3,
        safety: 5,
      }).success,
    ).toBe(false);
  });

  it('rejects non-integer scores', () => {
    expect(
      RatingCreateSchema.safeParse({
        incident_id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        appropriateness: 4.5,
        professionalism: 3,
        safety: 5,
      }).success,
    ).toBe(false);
  });

  it('accepts a summary with null averages and no own rating', () => {
    expect(
      RatingSummarySchema.safeParse({
        incident_id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        count: 0,
        appropriateness_avg: null,
        professionalism_avg: null,
        safety_avg: null,
        my: null,
      }).success,
    ).toBe(true);
  });

  it('accepts a summary with averages and an own rating', () => {
    expect(
      RatingSummarySchema.safeParse({
        incident_id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        count: 3,
        appropriateness_avg: 4,
        professionalism_avg: 3.5,
        safety_avg: 5,
        my: {
          appropriateness: 4,
          professionalism: 3,
          safety: 5,
          created_at: '2026-08-01T12:00:00.000Z',
        },
      }).success,
    ).toBe(true);
  });
});

describe('Saved area schemas', () => {
  const polygon = [
    [-0.2, 51.4],
    [-0.1, 51.4],
    [-0.1, 51.5],
  ];

  it('accepts a valid polygon', () => {
    expect(PolygonSchema.safeParse(polygon).success).toBe(true);
  });

  it('rejects a polygon with fewer than 3 points', () => {
    expect(PolygonSchema.safeParse([polygon[0], polygon[1]]).success).toBe(false);
  });

  it('rejects points outside lat/lon bounds', () => {
    expect(PolygonSchema.safeParse([[-200, 51.4], polygon[1], polygon[2]]).success).toBe(false);
  });

  it('accepts a valid saved area create payload', () => {
    expect(
      SavedAreaCreateSchema.safeParse({ name: 'My street', polygon }).success,
    ).toBe(true);
  });

  it('rejects a saved area with an empty name', () => {
    expect(SavedAreaCreateSchema.safeParse({ name: '', polygon }).success).toBe(false);
  });

  it('accepts a stored saved area', () => {
    expect(
      SavedAreaSchema.safeParse({
        id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        name: 'My street',
        polygon,
        created_at: '2026-08-01T12:00:00.000Z',
        alerts: 2,
      }).success,
    ).toBe(true);
  });
});

describe('Alert schemas', () => {
  const incident = {
    incident_type: 'use_of_force' as const,
    police_force: 'metropolitan' as const,
    timestamp: '2026-08-01T12:00:00.000Z',
    description: 'A stop on the High Street',
    media: [validMedia()],
    client_id: '5d8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
    id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
    user_id: null,
    created_at: '2026-08-01T12:00:00.000Z',
    view_count: 0,
    moderation_status: 'pending' as const,
    latitude: 51.5,
    longitude: -0.15,
    username: null,
  };

  it('accepts a saved-area alert', () => {
    expect(
      SavedAreaAlertSchema.safeParse({
        id: '7e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        incident_id: incident.id,
        area_id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        area_name: 'My street',
        incident,
        created_at: '2026-08-01T12:05:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('accepts an alerts list result', () => {
    expect(
      ListAlertsResultSchema.safeParse({
        items: [
          {
            id: '7e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
            incident_id: incident.id,
            area_id: '6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
            area_name: 'My street',
            incident,
            created_at: '2026-08-01T12:05:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('Stats schemas', () => {
  it('accepts a public stats payload', () => {
    expect(
      StatsPublicSchema.safeParse({
        total_incidents: 12,
        total_views: 480,
        by_type: [{ type: 'arrest', count: 4 }],
        by_force: [{ force: 'other', count: 2 }],
        series_30d: [{ day: '2026-08-01', count: 3 }],
        avg_rating: 4.2,
      }).success,
    ).toBe(true);
  });

  it('accepts a public stats payload with no ratings yet', () => {
    expect(
      StatsPublicSchema.safeParse({
        total_incidents: 12,
        total_views: 0,
        by_type: [],
        by_force: [],
        series_30d: [],
        avg_rating: null,
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown incident type in stats', () => {
    expect(
      StatsPublicSchema.safeParse({
        total_incidents: 1,
        total_views: 0,
        by_type: [{ type: 'riot', count: 1 }],
        by_force: [],
        series_30d: [],
        avg_rating: null,
      }).success,
    ).toBe(false);
  });

  it('accepts a stats query with default period', () => {
    expect(StatsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a me stats payload', () => {
    expect(
      StatsMeSchema.safeParse({
        total_incidents: 2,
        approved_incidents: 1,
        total_views: 10,
        ratings_given: 3,
        avg_rating_received: 4.5,
        saved_areas: 2,
        alerts_received: 1,
      }).success,
    ).toBe(true);
  });
});

describe('Upload schemas', () => {
  it('accepts valid upload request', () => {
    expect(
      UploadRequestSchema.safeParse({ filename: 'clip.webm', contentType: 'video/webm' }).success,
    ).toBe(true);
  });

  it('rejects upload with unsupported type', () => {
    expect(
      UploadRequestSchema.safeParse({ filename: 'x.exe', contentType: 'application/x-msdownload' })
        .success,
    ).toBe(false);
  });

  it('accepts valid upload response', () => {
    expect(
      UploadResponseSchema.safeParse({
        key: 'media/inc1/abc.jpg',
        upload_url: 'https://bucket.example/put',
        headers: { 'Content-Type': 'image/jpeg' },
      }).success,
    ).toBe(true);
  });
});

describe('cursor helpers', () => {
  it('round-trips an encoded cursor', () => {
    const iso = '2026-08-01T12:00:00.000Z';
    const id = '5d8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f';
    expect(decodeCursor(encodeCursor(iso, id))).toEqual({ createdAtIso: iso, id });
  });

  it('throws on malformed cursor', () => {
    expect(() => decodeCursor('no-separator')).toThrow();
  });
});

describe('auth + report schemas', () => {
  it('accepts valid magic-link request with username', () => {
    expect(
      MagicLinkRequestSchema.safeParse({ email: 'a@b.co', username: 'witness_01' }).success,
    ).toBe(true);
  });

  it('rejects invalid username', () => {
    expect(
      MagicLinkRequestSchema.safeParse({ email: 'a@b.co', username: 'Bad Name!' }).success,
    ).toBe(false);
  });

  it('accepts valid session', () => {
    expect(
      SessionSchema.safeParse({
        token: 'eyJhbGciOiJIUzI1NiJ9.abc.def',
        user: { id: '5d8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f', username: 'witness_01', email: 'a@b.co' },
      }).success,
    ).toBe(true);
  });

  it('accepts valid report flag', () => {
    expect(
      ReportFlagCreateSchema.safeParse({
        incident_id: '5d8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f',
        reason: 'illegal_content',
        detail: 'contains personal address',
      }).success,
    ).toBe(true);
  });
});
