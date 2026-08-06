# Phase 9B — Authentication Polish

## Summary

Implemented a complete authentication polish layer: forgot-password / reset-password
flows with expiring single-use tokens, a change-password screen for logged-in students,
password strength validation, and updated login UI. All three user types (student,
restaurant manager, admin) are supported at the API level.

---

## Files Modified

### Backend (`apps/api`)

| File | Change |
|------|--------|
| `src/db/schema.sql` | Added `password_reset_tokens` table (hashed, single-use, expiring tokens) with index |
| `src/modules/auth/auth.routes.ts` | Added `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password` |

### Student App (`apps/student-app`)

| File | Change |
|------|--------|
| `src/features/auth/screens/ForgotPasswordScreen.tsx` | **New.** Email form → success state with clickable reset link (demo: no email service) |
| `src/features/auth/screens/ResetPasswordScreen.tsx` | **New.** Reads `?token=` from URL, validates & sets new password, live strength indicators |
| `src/features/auth/screens/ChangePasswordScreen.tsx` | **New.** Requires current password + new + confirm, strength hints, in-app screen |
| `src/App.tsx` | Added routes `/forgot-password`, `/reset-password`, `/change-password` |
| `src/features/auth/screens/LoginScreen.tsx` | Added **Forgot password?** link below the password field |
| `src/features/profile/screens/ProfileScreen.tsx` | Added **Change password** button above Log out |

---

## API Endpoints

### `POST /auth/forgot-password`
- Accepts `{ email }`. Searches students → restaurant_owners → admins.
- Generates a 64-hex raw token, stores its SHA-256 hash with 1-hour expiry.
- Invalidates any prior outstanding token for the same user (one active at a time).
- Returns `{ sent: true, resetToken: "<raw>" }` — in production the token would be emailed; in demo it is returned directly so the UI can render a link.
- Always returns the same success shape regardless of whether the email exists (prevents email enumeration).
- Rate-limited by the existing `loginRateLimit` middleware.

### `POST /auth/reset-password`
- Accepts `{ token, newPassword }`.
- Hashes the raw token and looks it up — invalid or missing = 401.
- Rejects already-used tokens (`used_at IS NOT NULL`) and expired tokens (`expires_at < now()`).
- Updates the password hash, marks the token as used, and revokes all active sessions for the user.
- Password validated with full rules (8+ chars, upper, lower, digit).

### `POST /auth/change-password` *(requires auth)*
- Accepts `{ currentPassword, newPassword }`.
- Verifies `currentPassword` against the stored bcrypt hash before updating.
- Works for all three roles (student, restaurant, admin).
- Logs the change to the audit log.
- Password validated with full rules.

---

## Security Properties

| Property | Implementation |
|----------|---------------|
| Passwords hashed | bcrypt (already present, untouched) |
| Reset tokens | SHA-256 hash stored, raw token never persisted |
| Token expiry | Hard-coded 60-minute TTL |
| Single-use | `used_at` timestamp set on consumption; reuse is rejected |
| Token invalidation | All sessions revoked after successful reset |
| Enumeration protection | Forgot-password always returns `{ sent: true }` |
| Audit logging | Password changes and resets logged via `logAudit()` |
| Rate limiting | Forgot/reset endpoints use existing `loginRateLimit` |

---

## Password Validation Rules (all three screens)

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

Live strength hints shown as the user types (green ✓ / grey ✗ per rule).

---

## Not Implemented (out of scope)

- Email delivery (no SMTP service configured — token returned in API response for demo).
- Change-password UI for restaurant managers and admins in the Ops Dashboard (spec says do not modify those dashboards).
- OTP / 2FA flows.

---

## Remaining Work / Next Phases

- Wire up a real email service (SendGrid, Resend, etc.) and remove `resetToken` from the API response.
- Ops Dashboard change-password modal for restaurant managers and admins.
- Account lockout after N failed login attempts.
