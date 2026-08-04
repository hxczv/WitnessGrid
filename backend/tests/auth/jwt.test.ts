import { describe, it, expect } from 'vitest';
import { signSessionJwt, verifySessionJwt } from '../../src/auth/jwt.js';

const user = {
  sub: '7033168f-cb3f-4e31-b2af-9fd39d863e2b',
  username: 'test_user',
  email: 'test@example.com',
};

describe('jwt auth', () => {
  it('signs and verifies with matching claims', async () => {
    const token = await signSessionJwt(user);
    const payload = await verifySessionJwt(token);
    expect(payload.sub).toBe(user.sub);
    expect(payload.username).toBe(user.username);
    expect(payload.email).toBe(user.email);
  });

  it('rejects a tampered token', async () => {
    const token = await signSessionJwt(user);
    const [header, payload, signature] = token.split('.') as [string, string, string];
    const flipped = signature[10] === 'a' ? 'b' : 'a';
    const tampered = `${header}.${payload}.${signature.slice(0, 10)}${flipped}${signature.slice(11)}`;
    await expect(verifySessionJwt(tampered)).rejects.toThrow();
    await expect(verifySessionJwt(`${token}extra`)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signSessionJwt(user, Math.floor(Date.now() / 1000) - 10);
    await expect(verifySessionJwt(token)).rejects.toThrow();
  });
});