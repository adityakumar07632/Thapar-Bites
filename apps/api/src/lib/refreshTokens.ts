import { db } from '../db/client';
import { generateId } from './ids';
import { sha256 } from './secret';
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AuthPayload,
  type Role,
} from './auth';
import type { AdminRow, RestaurantOwnerRow, StudentRow } from '../db/rows';
import { logAudit } from './audit';

/**
 * Phase 2 security fix — refresh-token storage, rotation and revocation.
 *
 * Previously refresh tokens were pure stateless JWTs with a 30-day TTL and
 * `POST /auth/logout` was a no-op, so a stolen refresh token stayed valid for
 * a month with no way to revoke it.
 *
 * Now every refresh token has a database record (`refresh_tokens`) holding a
 * SHA-256 hash of the token, so:
 *   - logout can revoke it (single device or all devices),
 *   - refreshing ROTATES it: the old record is revoked and a new one issued,
 *   - replaying an already-rotated (or revoked) token is detected as theft
 *     and revokes the entire token family for that account.
 *
 * The token string itself is never stored, only its hash — a database leak
 * does not yield usable tokens.
 */

export interface RefreshTokenRow {
  id: string;
  subject_id: string;
  role: Role;
  restaurant_id: string | null;
  token_hash: string;
  family_id: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Mint an access + refresh pair and persist the revocable refresh record. */
export function issueTokenPair(payload: AuthPayload, familyId?: string): TokenPair {
  const jti = generateId('rt');
  const family = familyId ?? generateId('fam');
  const refreshToken = signRefreshToken(payload, jti);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

  db.prepare(
    `INSERT INTO refresh_tokens
       (id, subject_id, role, restaurant_id, token_hash, family_id, issued_at, expires_at, revoked_at, replaced_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
  ).run(
    jti,
    payload.sub,
    payload.role,
    payload.restaurantId ?? null,
    sha256(refreshToken),
    family,
    nowIso(),
    expiresAt,
  );

  return { accessToken: signAccessToken(payload), refreshToken };
}

function findRecord(jti: string): RefreshTokenRow | undefined {
  return db.prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(jti) as RefreshTokenRow | undefined;
}

function revokeRecord(jti: string, replacedBy: string | null = null): void {
  db.prepare('UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ? AND revoked_at IS NULL').run(
    nowIso(),
    replacedBy,
    jti,
  );
}

/** Revoke every live token in a family — used on replay/theft detection. */
export function revokeFamily(familyId: string): void {
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL').run(
    nowIso(),
    familyId,
  );
}

/** Revoke every live token for an account — "sign out of all devices". */
export function revokeAllForSubject(subjectId: string): number {
  const result = db
    .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE subject_id = ? AND revoked_at IS NULL')
    .run(nowIso(), subjectId);
  return result.changes;
}

export type RevokeOutcome = 'revoked' | 'unknown';

/** Logout for a single device. Returns 'unknown' for a token we can't place,
 * which the caller still reports as success (logout must never leak whether
 * a token was real). */
export function revokeRefreshToken(token: string): RevokeOutcome {
  let jti: string;
  try {
    jti = verifyRefreshToken(token).jti;
  } catch {
    return 'unknown';
  }
  const record = findRecord(jti);
  if (!record) return 'unknown';
  revokeRecord(jti);
  return 'revoked';
}

export type RotateResult =
  | { ok: true; tokens: TokenPair }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'account_gone' };

/**
 * Rotate a refresh token. Claims are re-derived from the database rather than
 * copied from the presented token, so a stale `restaurantId` (or an account
 * that has since been deleted) can never be re-signed.
 */
export function rotateRefreshToken(token: string): RotateResult {
  let claims: AuthPayload & { jti: string };
  try {
    claims = verifyRefreshToken(token);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const record = findRecord(claims.jti);
  if (!record) return { ok: false, reason: 'invalid' };
  if (record.token_hash !== sha256(token)) return { ok: false, reason: 'invalid' };

  if (record.revoked_at) {
    // Replay of a token we already rotated or revoked. Treat the whole family
    // as compromised: every sibling token dies, forcing a fresh login.
    revokeFamily(record.family_id);
    logAudit(
      'system',
      record.subject_id,
      'refresh_token_replay_detected',
      JSON.stringify({ familyId: record.family_id, tokenId: record.id }),
    );

    return { ok: false, reason: 'revoked' };
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    revokeRecord(record.id);
    return { ok: false, reason: 'expired' };
  }

  const fresh = currentClaimsFor(record.subject_id, record.role);
  if (!fresh) {
    revokeFamily(record.family_id);
    return { ok: false, reason: 'account_gone' };
  }

  // Insert-new-then-revoke-old inside one transaction so a crash mid-rotation
  // can never leave the caller with no usable token.
  const rotate = db.transaction((): TokenPair => {
    const tokens = issueTokenPair(fresh, record.family_id);
    const newJti = verifyRefreshToken(tokens.refreshToken).jti;
    revokeRecord(record.id, newJti);
    return tokens;
  });

  return { ok: true, tokens: rotate() };
}

/** Re-read the account to build claims from current state, not from the token. */
export function currentClaimsFor(subjectId: string, role: Role): AuthPayload | null {
  if (role === 'student') {
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(subjectId) as
      | Pick<StudentRow, 'id'>
      | undefined;
    return student ? { sub: student.id, role: 'student' } : null;
  }
  if (role === 'restaurant') {
    const owner = db.prepare('SELECT id, restaurant_id FROM restaurant_owners WHERE id = ?').get(subjectId) as
      | Pick<RestaurantOwnerRow, 'id' | 'restaurant_id'>
      | undefined;
    if (!owner) return null;
    // The restaurant must still exist and not be soft-deleted, otherwise the
    // manager's session should end rather than be silently renewed.
    const restaurant = db
      .prepare('SELECT id FROM restaurants WHERE id = ? AND deleted_at IS NULL')
      .get(owner.restaurant_id);
    if (!restaurant) return null;
    return { sub: owner.id, role: 'restaurant', restaurantId: owner.restaurant_id };
  }
  // A disabled admin must not be able to renew a session either.
  const admin = db.prepare('SELECT id, role, status FROM admins WHERE id = ?').get(subjectId) as
    | Pick<AdminRow, 'id' | 'role' | 'status'>
    | undefined;
  if (!admin || admin.status === 'disabled') return null;
  return { sub: admin.id, role: 'admin', adminRole: admin.role };
}

/** Housekeeping: drop records that are long past use. Called on a slow timer. */
export function purgeExpiredRefreshTokens(): number {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(cutoff).changes;
}
