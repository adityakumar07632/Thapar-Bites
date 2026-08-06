import { db } from '../db/client';

/**
 * BR — Reliability score.
 *
 * The Profile screen has long promised "Reliability score decreases if...";
 * this module is the implementation behind that promise. `reliability_score`
 * lives on `students`, defaults to 100 (see schema.sql), and is only ever
 * moved by the penalties below — it is never manually edited elsewhere.
 *
 * Penalty amounts are intentionally modest. A single voluntary queue leave
 * or one bad match shouldn't tank a student's score; a *pattern* of the
 * behaviour should. Values are clamped to [0, 100] so repeated penalties
 * can never push the score negative.
 */

export const RELIABILITY_MIN = 0;
export const RELIABILITY_MAX = 100;

/** A student's Shared Delivery match fell through because they either never
 * paid, or paid but their partner didn't and they left the created order to
 * lapse rather than trying again promptly. Also used for outright payment
 * failure on a Shared Delivery leg. */
export const PENALTY_SHARED_DELIVERY_ABANDONED = 6;

/** A payment attempt failed / expired outright (order-level, not specific to
 * which side of a match it was). */
export const PENALTY_PAYMENT_FAILED = 6;

/** Voluntarily leaving a Shared Delivery queue after joining it. Kept small
 * on its own — it's the repetition that should add up and matter, not any
 * single leave. */
export const PENALTY_QUEUE_LEFT = 2;

function clamp(score: number): number {
  return Math.min(RELIABILITY_MAX, Math.max(RELIABILITY_MIN, score));
}

/** Decrease `studentId`'s reliability score by `amount`, clamped to
 * [RELIABILITY_MIN, RELIABILITY_MAX]. Safe to call at high frequency from
 * the matching engine tick. */
export function penalizeReliability(studentId: string, amount: number): void {
  const row = db.prepare('SELECT reliability_score FROM students WHERE id = ?').get(studentId) as
    | { reliability_score: number }
    | undefined;
  if (!row) return;

  const next = clamp(row.reliability_score - amount);
  db.prepare('UPDATE students SET reliability_score = ? WHERE id = ?').run(next, studentId);
}
