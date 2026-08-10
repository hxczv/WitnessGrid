import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config.js';

const secretKey = new TextEncoder().encode(config.JWT_SECRET);
const ALG = 'HS256';
const ISS = 'witnessgrid';
const AUD = 'witnessgrid-web';

export interface SessionClaims {
  sub: string;
  username: string;
  email: string;
}

export async function signSessionJwt(user: SessionClaims, expiresIn: string | number = '30d'): Promise<string> {
  return new SignJWT({ username: user.username, email: user.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.sub)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifySessionJwt(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    algorithms: [ALG],
    issuer: ISS,
    audience: AUD,
  });
  return payload;
}