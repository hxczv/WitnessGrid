import { describe, it, expect } from 'vitest';
import { signMediaToken, verifyMediaToken } from '../src/media/token.js';

const KEY = 'media/1f6d28fe-f284-4aae-9b3f-3a2a3f3f5b2e/clip.jpg';

describe('media upload token', () => {
  it('accepts a freshly signed token', async () => {
    const token = await signMediaToken(KEY);
    expect(token).toMatch(/^[0-9]+:[0-9a-f]{64}$/);
    expect(await verifyMediaToken(KEY, token)).toBe(true);
  });

  it('rejects a token for a different key', async () => {
    const token = await signMediaToken(KEY);
    expect(await verifyMediaToken(`${KEY}2`, token)).toBe(false);
    expect(await verifyMediaToken('media/other/file.png', token)).toBe(false);
  });

  it('rejects an expired token', async () => {
    const token = await signMediaToken(KEY, Date.now() - 5_000);
    expect(await verifyMediaToken(KEY, token)).toBe(false);
  });

  it('rejects garbage', async () => {
    expect(await verifyMediaToken(KEY, 'not-a-token')).toBe(false);
    expect(await verifyMediaToken(KEY, '')).toBe(false);
  });
});