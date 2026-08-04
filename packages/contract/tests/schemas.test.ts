import { describe, expect, it } from 'vitest';
import {
  IncidentCreateSchema,
  ListIncidentsQuerySchema,
  MagicLinkRequestSchema,
  MediaReferenceSchema,
  ReportFlagCreateSchema,
  SessionSchema,
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
