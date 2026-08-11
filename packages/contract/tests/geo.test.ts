import { describe, expect, it } from 'vitest';
import { IncidentCreateSchema, UK_IE_BOUNDS } from '../src';

const validBase = {
  incident_type: 'stop_and_search',
  police_force: 'metropolitan',
  timestamp: '2026-08-11T12:00:00Z',
  description: '',
  officer_count: 2,
  collar_numbers: [],
  media: [
    {
      key: 'm/abc.png',
      type: 'image/png',
      hash: 'a'.repeat(64),
      thumbnail_key: 'm/abc_thumb.png',
    },
  ],
  client_id: '00000000-0000-4000-8000-000000000000',
};

describe('UK_IE_BOUNDS', () => {
  it('is a valid, non-empty box covering the UK and Ireland', () => {
    expect(UK_IE_BOUNDS.west).toBeLessThan(UK_IE_BOUNDS.east);
    expect(UK_IE_BOUNDS.south).toBeLessThan(UK_IE_BOUNDS.north);
    expect(UK_IE_BOUNDS.south).toBeLessThan(52);
    expect(UK_IE_BOUNDS.north).toBeGreaterThan(56);
    expect(UK_IE_BOUNDS.west).toBeLessThan(-10);
    expect(UK_IE_BOUNDS.east).toBeGreaterThan(1);
  });
});

describe('IncidentCreateSchema geofence', () => {
  it('accepts coordinates in London', () => {
    const input = { ...validBase, location: { lon: -0.1276, lat: 51.5072 } };
    expect(IncidentCreateSchema.safeParse(input).success).toBe(true);
  });

  it('accepts coordinates in Dublin', () => {
    const input = { ...validBase, location: { lon: -6.2603, lat: 53.3498 } };
    expect(IncidentCreateSchema.safeParse(input).success).toBe(true);
  });

  it('rejects coordinates in Paris', () => {
    const input = { ...validBase, location: { lon: 2.3522, lat: 48.8566 } };
    expect(IncidentCreateSchema.safeParse(input).success).toBe(false);
  });

  it('rejects coordinates in Tokyo', () => {
    const input = { ...validBase, location: { lon: 139.6917, lat: 35.6895 } };
    expect(IncidentCreateSchema.safeParse(input).success).toBe(false);
  });

  it('rejects coordinates just past each edge of the box', () => {
    const cases = [
      { lon: UK_IE_BOUNDS.west - 0.1, lat: 54 },
      { lon: UK_IE_BOUNDS.east + 0.1, lat: 54 },
      { lon: -4, lat: UK_IE_BOUNDS.south - 0.1 },
      { lon: -4, lat: UK_IE_BOUNDS.north + 0.1 },
    ];
    for (const location of cases) {
      expect(IncidentCreateSchema.safeParse({ ...validBase, location }).success).toBe(false);
    }
  });

  it('accepts coordinates exactly on the box edges', () => {
    const cases = [
      { lon: UK_IE_BOUNDS.west, lat: 54 },
      { lon: UK_IE_BOUNDS.east, lat: 54 },
      { lon: -4, lat: UK_IE_BOUNDS.south },
      { lon: -4, lat: UK_IE_BOUNDS.north },
    ];
    for (const location of cases) {
      expect(IncidentCreateSchema.safeParse({ ...validBase, location }).success).toBe(true);
    }
  });
});