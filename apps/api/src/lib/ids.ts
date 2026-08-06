import { randomInt, randomUUID } from 'node:crypto';

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Ch. 10 PairCode™ — short, unambiguous handover code (no 0/O/1/I).
 *
 * Phase 2 security fix: this used `Math.random()`, which is not a CSPRNG.
 * A PairCode is the physical proof of handover between two students, and a
 * temp password below is an account credential, so both must come from
 * `crypto.randomInt` — otherwise the sequence is predictable from prior
 * observations.
 */
export function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}

/** Admin Restaurant Management — a one-time temporary password handed to a
 * new or reset Restaurant Manager account. Mixed-case + digits, no
 * ambiguous characters, long enough to be a reasonable first-login secret
 * that the manager is expected to change. */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 14; i++) {
    pwd += chars[randomInt(chars.length)];
  }
  return pwd;
}
