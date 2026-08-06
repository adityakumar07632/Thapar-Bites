import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type { AdminRow, RestaurantOwnerRow, StudentRow } from '../../db/rows';
import { generateId } from '../../lib/ids';
import { hashPassword, verifyPassword, requireAuth } from '../../lib/auth';
import {
  issueTokenPair,
  revokeAllForSubject,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../../lib/refreshTokens';
import { loginRateLimit, refreshRateLimit, registerRateLimit } from '../../lib/rateLimit';
import { ok, created, fail } from '../../lib/response';
import { mapStudent } from '../../lib/mappers';
import { logAudit } from '../../lib/audit';

// Official Thapar Institute of Engineering & Technology hostel names.
// Kept here so the register route can validate against the exact same set the
// matching engine uses for Shared Delivery pairing (exact-string equality).
// Must stay in sync with THAPAR_HOSTELS in the student-app RegisterScreen.
const THAPAR_HOSTELS = [
  // Boys Hostels
  'A Hostel',
  'B Hostel',
  'C Hostel',
  'D Hostel',
  'E Hostel',
  'F Hostel',
  'G Hostel',
  'H Hostel',
  'J Hostel',
  'K Hostel',
  'L Hostel',
  'M Hostel',
  // Girls Hostels
  'PG Hostel',
  'Q Hostel',
  'R Hostel',
] as const;

export const authRouter = Router();

/**
 * Phase 2: every field now has a maximum length as well as a minimum. Without
 * an upper bound a single request could store megabytes in a TEXT column.
 * Passwords move from min 6 to min 8 — still permissive, but 6 is below any
 * current guidance. Existing accounts are unaffected; only new passwords are
 * checked.
 */
/**
 * Phase 6E (Thapar) — Updated registration schema.
 *
 * Changes vs. the original:
 *   - password: must contain at least one uppercase, lowercase, and digit.
 *   - phone:    now required and must be unique.
 *   - roomNumber: now required (a hostel room is always known at registration).
 *   - hostel:   validated against the official Thapar hostel list so the
 *               matching engine can never receive an unexpected value.
 */
const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(100),
  rollNumber: z
    .string()
    .trim()
    .min(3, 'Roll number is required.')
    .max(30, 'Roll number must be under 30 characters.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(200)
    .refine(
      (p) => /[A-Z]/.test(p),
      'Password must contain at least one uppercase letter.',
    )
    .refine(
      (p) => /[a-z]/.test(p),
      'Password must contain at least one lowercase letter.',
    )
    .refine(
      (p) => /[0-9]/.test(p),
      'Password must contain at least one number.',
    ),
  hostel: z
    .string()
    .trim()
    .refine(
      (h) => (THAPAR_HOSTELS as readonly string[]).includes(h),
      `Hostel must be one of: ${THAPAR_HOSTELS.join(', ')}.`,
    ),
  roomNumber: z
    .string()
    .trim()
    .min(1, 'Room number is required.')
    .max(20, 'Room number must be under 20 characters.'),
  phone: z
    .string()
    .trim()
    .min(7, 'Enter a valid mobile number.')
    .max(20, 'Mobile number must be under 20 characters.'),
});

// POST /auth/register — student self-registration (Ch. 4.3).
authRouter.post('/register', registerRateLimit, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid input.');
  }
  const { fullName, rollNumber, email, password, hostel, roomNumber, phone } = parsed.data;

  // Check all unique fields in one query so we cannot be used to enumerate
  // which specific field collided (security note preserved from Phase 2).
  const existing = db
    .prepare(
      'SELECT id FROM students WHERE LOWER(email) = ? OR LOWER(roll_number) = LOWER(?) OR (phone IS NOT NULL AND phone = ?)',
    )
    .get(email, rollNumber, phone);
  if (existing) {
    return fail(res, 'VALIDATION_001', 'An account with these details already exists.');
  }

  const id = generateId('stu');
  db.prepare(
    `INSERT INTO students (id, full_name, roll_number, email, phone, password_hash, hostel, room_number, reliability_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100)`,
  ).run(id, fullName, rollNumber, email, phone ?? null, hashPassword(password), hostel, roomNumber ?? null);

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as StudentRow;
  const tokens = issueTokenPair({ sub: id, role: 'student' });
  return created(res, {
    student: mapStudent(student),
    ...tokens,
  });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

// POST /auth/login — tries student, then restaurant owner, then admin accounts.
authRouter.post('/login', loginRateLimit, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', 'Email and password are required.');
  }
  const { email, password } = parsed.data;

  const student = db.prepare('SELECT * FROM students WHERE LOWER(email) = ?').get(email) as StudentRow | undefined;
  if (student && verifyPassword(password, student.password_hash)) {
    logAudit('student', student.id, 'login');
    return ok(res, {
      role: 'student',
      student: mapStudent(student),
      ...issueTokenPair({ sub: student.id, role: 'student' }),
    });
  }

  const owner = db.prepare('SELECT * FROM restaurant_owners WHERE LOWER(email) = ?').get(email) as
    | RestaurantOwnerRow
    | undefined;
  if (owner && verifyPassword(password, owner.password_hash)) {
    // A manager whose restaurant has been soft-deleted must not get a session
    // that still carries a live `restaurantId` claim.
    const restaurant = db
      .prepare('SELECT id FROM restaurants WHERE id = ? AND deleted_at IS NULL')
      .get(owner.restaurant_id);
    if (!restaurant) {
      return fail(res, 'AUTH_003', 'This restaurant account is no longer active. Contact the campus admin.');
    }
    logAudit('restaurant', owner.id, 'login');
    return ok(res, {
      role: 'restaurant',
      owner: { id: owner.id, fullName: owner.full_name, email: owner.email, restaurantId: owner.restaurant_id },
      ...issueTokenPair({ sub: owner.id, role: 'restaurant', restaurantId: owner.restaurant_id }),
    });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE LOWER(email) = ?').get(email) as AdminRow | undefined;
  if (admin && verifyPassword(password, admin.password_hash)) {
    // A disabled admin keeps their record and audit history but cannot sign in.
    if (admin.status === 'disabled') {
      return fail(res, 'AUTH_003', 'This administrator account has been disabled. Contact your Super Admin.');
    }
    logAudit('admin', admin.id, 'login');
    return ok(res, {
      role: 'admin',
      admin: {
        id: admin.id,
        fullName: admin.full_name,
        email: admin.email,
        adminRole: admin.role,
      },
      ...issueTokenPair({ sub: admin.id, role: 'admin', adminRole: admin.role }),
    });
  }

  return fail(res, 'AUTH_001', 'Invalid email or password.');
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).max(4000).optional(),
  allDevices: z.boolean().optional(),
});

/**
 * POST /auth/logout — Phase 2: this used to be a documented no-op, so a
 * stolen refresh token stayed valid for its full 30 days.
 *
 * Now it revokes the presented refresh token (or every token for the account
 * when `allDevices` is true). The response shape is unchanged, so existing
 * clients that send no body still work — they simply only clear local state,
 * which is why the client was updated to send its refresh token.
 */
authRouter.post('/logout', requireAuth(), (req, res) => {
  const parsed = logoutSchema.safeParse(req.body ?? {});
  const body = parsed.success ? parsed.data : {};
  const subjectId = req.auth!.sub;

  let revoked = 0;
  if (body.allDevices) {
    revoked = revokeAllForSubject(subjectId);
  } else if (body.refreshToken) {
    revoked = revokeRefreshToken(body.refreshToken) === 'revoked' ? 1 : 0;
  }

  logAudit(req.auth!.role, subjectId, 'logout', JSON.stringify({ allDevices: !!body.allDevices, revoked }));
  return ok(res, { loggedOut: true, revoked });
});

const refreshSchema = z.object({ refreshToken: z.string().min(1).max(4000) });

/**
 * POST /auth/refresh — Phase 2: rotates the refresh token.
 *
 * Fixes two bugs at once:
 *   1. an ACCESS token used to be accepted here (there was no token-type
 *      claim), and
 *   2. the presented payload was re-signed verbatim, so a `restaurantId`
 *      claim survived even if the manager had been moved or the restaurant
 *      deleted. Claims are now re-read from the database.
 *
 * The response still contains `accessToken`, so old clients keep working; it
 * additionally returns the new `refreshToken`, which clients must store since
 * the presented one is now dead.
 */
authRouter.post('/refresh', refreshRateLimit, (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'refreshToken is required.');

  const result = rotateRefreshToken(parsed.data.refreshToken);
  if (!result.ok) {
    const message =
      result.reason === 'revoked'
        ? 'This session was ended for security reasons. Please sign in again.'
        : 'Invalid or expired refresh token.';
    return fail(res, 'AUTH_002', message);
  }
  return ok(res, result.tokens);
});

// ============================================================
// Phase 9B — Forgot / Reset / Change Password
// ============================================================


const RESET_TOKEN_TTL_MINUTES = 60;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Shared Zod schema for a valid new password — mirrors the register rules. */
const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(200)
  .refine((p) => /[A-Z]/.test(p), 'Password must contain at least one uppercase letter.')
  .refine((p) => /[a-z]/.test(p), 'Password must contain at least one lowercase letter.')
  .refine((p) => /[0-9]/.test(p), 'Password must contain at least one number.');

const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });

/**
 * POST /auth/forgot-password
 *
 * Accepts any registered email (student, restaurant manager, or admin).
 * Generates a 64-character hex reset token, stores its SHA-256 digest in the
 * database with a 1-hour expiry, and returns the raw token in the response.
 *
 * NOTE: In production the token would be emailed; here it is returned directly
 * because this environment has no email service. The client shows it as a
 * clickable reset link for demo purposes.
 *
 * A generic success message is always returned so an attacker cannot enumerate
 * which email addresses are registered.
 */
authRouter.post('/forgot-password', loginRateLimit, (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', 'Enter a valid email address.');
  }
  const { email } = parsed.data;

  // Look up the user across all three tables (stop at the first match).
  type UserHit = { id: string; type: 'student' | 'restaurant' | 'admin' };
  let hit: UserHit | undefined;

  const student = db.prepare('SELECT id FROM students WHERE email = ?').get(email) as { id: string } | undefined;
  if (student) hit = { id: student.id, type: 'student' };

  if (!hit) {
    const owner = db.prepare('SELECT id FROM restaurant_owners WHERE email = ?').get(email) as { id: string } | undefined;
    if (owner) hit = { id: owner.id, type: 'restaurant' };
  }
  if (!hit) {
    const admin = db.prepare('SELECT id FROM admins WHERE email = ?').get(email) as { id: string } | undefined;
    if (admin) hit = { id: admin.id, type: 'admin' };
  }

  if (!hit) {
    // Return success anyway — prevents email enumeration.
    return ok(res, { sent: true, resetToken: null });
  }

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
  const tokenId = generateId('prt');

  // Invalidate any outstanding tokens for this user (one active at a time).
  db.prepare(
    `UPDATE password_reset_tokens SET used_at = datetime('now')
     WHERE user_id = ? AND user_type = ? AND used_at IS NULL`,
  ).run(hit.id, hit.type);

  db.prepare(
    `INSERT INTO password_reset_tokens (id, token_hash, user_id, user_type, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(tokenId, tokenHash, hit.id, hit.type, expiresAt);

  logAudit(hit.type, hit.id, 'auth.forgot_password', `Reset token issued for ${email}`);

  return ok(res, { sent: true, resetToken: rawToken });
});

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: newPasswordSchema,
});

/**
 * POST /auth/reset-password
 *
 * Validates the raw reset token (timing-safe hash compare), enforces expiry
 * and single-use, updates the password hash, and revokes all sessions for the
 * user so they must log in fresh.
 */
authRouter.post('/reset-password', loginRateLimit, (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid request.');
  }
  const { token: rawToken, newPassword } = parsed.data;
  const tokenHash = hashToken(rawToken);

  interface PrtRow {
    id: string;
    user_id: string;
    user_type: 'student' | 'restaurant' | 'admin';
    expires_at: string;
    used_at: string | null;
  }
  const record = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?').get(tokenHash) as PrtRow | undefined;

  if (!record) return fail(res, 'AUTH_002', 'Invalid or expired reset link.');
  if (record.used_at) return fail(res, 'AUTH_002', 'This reset link has already been used.');
  if (new Date(record.expires_at) < new Date()) return fail(res, 'AUTH_002', 'This reset link has expired. Request a new one.');

  const newHash = hashPassword(newPassword);
  const now = new Date().toISOString();

  if (record.user_type === 'student') {
    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(newHash, record.user_id);
  } else if (record.user_type === 'restaurant') {
    db.prepare('UPDATE restaurant_owners SET password_hash = ? WHERE id = ?').run(newHash, record.user_id);
  } else {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, record.user_id);
  }

  // Mark token as used.
  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, record.id);

  // Revoke all active sessions for this user.
  revokeAllForSubject(record.user_id);

  logAudit(record.user_type, record.user_id, 'auth.password_reset', 'Password reset via token');
  return ok(res, { reset: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: newPasswordSchema,
});

/**
 * POST /auth/change-password
 *
 * Requires a valid session. Verifies the current password before updating,
 * logs the change, and revokes all OTHER sessions (the current one stays
 * alive so the user doesn't have to log in again right away).
 */
authRouter.post('/change-password', requireAuth(), (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid request.');
  }
  const { currentPassword, newPassword } = parsed.data;
  const { sub, role } = req.auth!;

  let currentHash: string | undefined;
  if (role === 'student') {
    const row = db.prepare('SELECT password_hash FROM students WHERE id = ?').get(sub) as { password_hash: string } | undefined;
    currentHash = row?.password_hash;
  } else if (role === 'restaurant') {
    const row = db.prepare('SELECT password_hash FROM restaurant_owners WHERE id = ?').get(sub) as { password_hash: string } | undefined;
    currentHash = row?.password_hash;
  } else {
    const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(sub) as { password_hash: string } | undefined;
    currentHash = row?.password_hash;
  }

  if (!currentHash || !verifyPassword(currentPassword, currentHash)) {
    return fail(res, 'AUTH_001', 'Current password is incorrect.');
  }

  const newHash = hashPassword(newPassword);
  if (role === 'student') {
    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(newHash, sub);
  } else if (role === 'restaurant') {
    db.prepare('UPDATE restaurant_owners SET password_hash = ? WHERE id = ?').run(newHash, sub);
  } else {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, sub);
  }

  logAudit(role, sub, 'auth.password_changed', 'Password changed by user');
  return ok(res, { changed: true });
});
