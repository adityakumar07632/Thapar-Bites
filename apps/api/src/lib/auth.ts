import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { fail } from './response';
import { JWT_SECRET } from './secret';

export type Role = 'student' | 'restaurant' | 'admin';

/**
 * Phase 2 security fix: tokens now carry an explicit `typ` claim.
 *
 * Before, `verifyToken()` was used for both access and refresh tokens, so an
 * *access* token was accepted by POST /auth/refresh — and its payload
 * (including `restaurantId`) was re-signed verbatim without re-checking that
 * the account still existed or still belonged to that restaurant.
 */
export type TokenType = 'access' | 'refresh';

export type AdminRole = 'super_admin' | 'admin';

export interface AuthPayload {
  sub: string;
  role: Role;
  restaurantId?: string; // present only for role === 'restaurant'
  adminRole?: AdminRole; // present only for role === 'admin'
}

interface TokenClaims extends AuthPayload {
  typ: TokenType;
  /** Refresh tokens only — the id of the stored, revocable token record. */
  jti?: string;
}

export const ACCESS_TOKEN_TTL = '2h';
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signAccessToken(payload: AuthPayload): string {
  const claims: TokenClaims = { ...payload, typ: 'access' };
  return jwt.sign(claims, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

/** Refresh tokens are only ever minted through lib/refreshTokens.ts, which
 * also persists the revocable record keyed by `jti`. */
export function signRefreshToken(payload: AuthPayload, jti: string): string {
  const claims: TokenClaims = { ...payload, typ: 'refresh', jti };
  return jwt.sign(claims, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL_SECONDS });
}

function verify(token: string, expected: TokenType): TokenClaims {
  const claims = jwt.verify(token, JWT_SECRET) as TokenClaims;
  // Tokens minted before this change have no `typ`; treat them as access
  // tokens so existing sessions keep working, but never as refresh tokens.
  const actual: TokenType = claims.typ ?? 'access';
  if (actual !== expected) {
    throw new Error(`Expected a ${expected} token but received a ${actual} token.`);
  }
  return claims;
}

export function verifyAccessToken(token: string): AuthPayload {
  const { sub, role, restaurantId, adminRole } = verify(token, 'access');
  const base: AuthPayload = { sub, role };
  if (restaurantId) base.restaurantId = restaurantId;
  if (adminRole) base.adminRole = adminRole;
  return base;
}

export function verifyRefreshToken(token: string): AuthPayload & { jti: string } {
  const claims = verify(token, 'refresh');
  if (!claims.jti) throw new Error('Refresh token is missing its jti claim.');
  const base: AuthPayload = { sub: claims.sub, role: claims.role };
  if (claims.restaurantId) base.restaurantId = claims.restaurantId;
  if (claims.adminRole) base.adminRole = claims.adminRole;
  return { ...base, jti: claims.jti };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

/** Ch. E.3 — protected endpoints require `Authorization: Bearer <access JWT>`. */
export function requireAuth(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return fail(res, 'AUTH_001', 'Missing or malformed Authorization header.');
    }
    let payload: AuthPayload;
    try {
      payload = verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      return fail(res, 'AUTH_002', 'Invalid or expired token.');
    }
    if (roles.length > 0 && !roles.includes(payload.role)) {
      return fail(res, 'AUTH_003', `This endpoint requires role: ${roles.join(' or ')}.`);
    }
    req.auth = payload;
    next();
  };
}
