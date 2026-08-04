import { describe, it, expect } from 'vitest';
import { decodeCursor, encodeCursor } from '@witnessgrid/contract';

const ID = 'e0a1b2c3-4d5e-4f60-817a-2f8e9d0c1b2a';

describe('cursor encoding', () => {
  it('round-trips an ISO timestamp with colons', () => {
    const iso = '2026-08-04T12:34:56.789Z';
    const cursor = encodeCursor(iso, ID);
    expect(decodeCursor(cursor)).toEqual({ createdAtIso: iso, id: ID });
  });

  it('round-trips timestamps containing URL-unsafe characters', () => {
    const iso = '2024-01-02T03:04:05.000Z';
    const cursor = encodeCursor(iso, ID);
    const decoded = decodeCursor(cursor);
    expect(decoded.createdAtIso).toBe(iso);
    expect(decoded.id).toBe(ID);
  });

  it('handles long cursor values without error', () => {
    const longIso = `2026-08-04T${'1'.repeat(40)}:00:00.000Z`;
    const cursor = encodeCursor(longIso, ID);
    const decoded = decodeCursor(cursor);
    expect(decoded.createdAtIso).toBe(longIso);
    expect(decoded.id).toBe(ID);
  });

  it('throws on a malformed cursor', () => {
    expect(() => decodeCursor('no-separator-here')).toThrow();
  });
});