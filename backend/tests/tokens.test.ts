import { describe, it, expect } from 'vitest';
import { generateToken, sha256Hex } from '../src/auth/tokens.js';

describe('tokens', () => {
  it('generates a 64-char hex token', () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes to 64 hex chars and is not reversible', async () => {
    const token = generateToken();
    const hash = await sha256Hex(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
  });

  it('produces different hashes for different tokens', async () => {
    const a = await sha256Hex(generateToken());
    const b = await sha256Hex(generateToken());
    expect(a).not.toBe(b);
  });

  it('is deterministic for the same input', async () => {
    const input = 'same-input';
    expect(await sha256Hex(input)).toBe(await sha256Hex(input));
  });
});