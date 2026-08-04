import { config } from '../config.js';

const TOKEN_TTL_MS = 5 * 60 * 1000;

async function hmacSha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signMediaToken(key: string, expiresAtMs: number = Date.now() + TOKEN_TTL_MS): Promise<string> {
  const hmac = await hmacSha256Hex(`${key}:${expiresAtMs}`);
  return `${expiresAtMs}:${hmac}`;
}

export async function verifyMediaToken(key: string, token: string): Promise<boolean> {
  const separator = token.lastIndexOf(':');
  if (separator === -1) return false;
  const expiresAtMs = Number(token.slice(0, separator));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;
  const expected = await hmacSha256Hex(`${key}:${expiresAtMs}`);
  return timingSafeEqualHex(expected, token.slice(separator + 1));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}