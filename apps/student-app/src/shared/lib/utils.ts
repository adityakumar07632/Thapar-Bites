/**
 * Student-app formatting helpers.
 *
 * Cross-product primitives (cn, formatINR, formatCountdown) now live in the
 * shared design system — re-exported here so existing imports keep working.
 */
export { cn, formatINR, formatCountdown, timeAgo } from '@campus-bites/ui';

/** A short id generator for local-only demo entities (carts, matches, orders). */
export function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * PRD Appendix D.12 `pair_code` — a short handover code shown to both
 * students and the delivery partner at pickup (Ch. 10, PairCode™ Verification).
 * Uppercase alphanumeric, unambiguous character set (no 0/O/1/I).
 */
export function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
