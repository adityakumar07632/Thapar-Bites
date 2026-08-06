/**
 * Phase 4 — read-only Shared Delivery queue metrics.
 *
 * Everything in here is derived from rows the existing matching engine
 * already writes (`shared_delivery_queue`, `matches`). No schema change, no
 * new writes, no change to how matching itself behaves — this module only
 * answers "where am I in the queue, how long is this likely to take, and how
 * is the queue doing overall" for the student Queue screen and the Admin
 * queue monitor.
 */
import { db } from '../../db/client';
import type { QueueRow } from '../../db/rows';

/** Fallback used before the platform has any matched history to learn from. */
export const DEFAULT_ESTIMATED_WAIT_MS = 5 * 60 * 1000;

export interface QueueMetrics {
  /** 1-based FIFO position inside this student's (restaurant, hostel) group. */
  position: number;
  /** How many students are waiting in the same (restaurant, hostel) group. */
  groupWaitingCount: number;
  /** How many students are waiting across the whole platform. */
  totalWaitingCount: number;
  /** Best guess at remaining wait, in ms. Never negative. */
  estimatedWaitMs: number;
}

/**
 * Average time between joining the queue and being matched, learned from
 * completed matches. `matches.created_at` is the moment the pair was formed,
 * so it doubles as the queue entry's match timestamp.
 */
export function averageMatchWaitMs(): number | null {
  const row = db
    .prepare(
      `SELECT AVG((julianday(m.created_at) - julianday(q.joined_at)) * 86400000.0) AS avgMs
         FROM shared_delivery_queue q
         JOIN matches m ON (m.student_a = q.student_id OR m.student_b = q.student_id)
        WHERE q.status = 'matched'
          -- Timestamps are written in two formats (ISO-8601 from the app,
          -- 'YYYY-MM-DD HH:MM:SS' from SQLite defaults), so they must be
          -- compared as julian days rather than as strings.
          AND julianday(m.created_at) >= julianday(q.joined_at)`,
    )
    .get() as { avgMs: number | null };
  if (row.avgMs === null || !Number.isFinite(row.avgMs) || row.avgMs <= 0) return null;
  return Math.round(row.avgMs);
}

export function queueMetricsFor(entry: QueueRow, now = Date.now()): QueueMetrics {
  const group = db
    .prepare(
      `SELECT COUNT(*) AS n FROM shared_delivery_queue
        WHERE status = 'waiting' AND restaurant_id = ? AND hostel = ?`,
    )
    .get(entry.restaurant_id, entry.hostel) as { n: number };

  const ahead = db
    .prepare(
      `SELECT COUNT(*) AS n FROM shared_delivery_queue
        WHERE status = 'waiting' AND restaurant_id = ? AND hostel = ? AND joined_at < ?`,
    )
    .get(entry.restaurant_id, entry.hostel, entry.joined_at) as { n: number };

  const total = db
    .prepare("SELECT COUNT(*) AS n FROM shared_delivery_queue WHERE status = 'waiting'")
    .get() as { n: number };

  const elapsedMs = Math.max(0, now - new Date(entry.joined_at).getTime());
  const baseline = averageMatchWaitMs() ?? DEFAULT_ESTIMATED_WAIT_MS;
  // Someone else is already waiting in the same group, so the next engine
  // tick (~1.2s) will pair them — don't quote five minutes in that case.
  const estimatedWaitMs =
    group.n >= 2 ? 15_000 : Math.max(30_000, baseline - elapsedMs);

  return {
    position: ahead.n + 1,
    groupWaitingCount: group.n,
    totalWaitingCount: total.n,
    estimatedWaitMs,
  };
}

export interface QueueStatistics {
  waitingNow: number;
  activeMatches: number;
  matchedTotal: number;
  cancelledTotal: number;
  expiredTotal: number;
  joinedTotal: number;
  /** matched / (matched + cancelled + expired), as a 0–100 percentage. */
  matchSuccessRate: number;
  /** Average observed wait before a match, in ms (null with no history). */
  averageWaitMs: number | null;
  /** Longest current wait among students still queued, in ms. */
  longestCurrentWaitMs: number;
}

export function queueStatistics(now = Date.now()): QueueStatistics {
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'waiting'   THEN 1 ELSE 0 END) AS waiting,
         SUM(CASE WHEN status = 'matched'   THEN 1 ELSE 0 END) AS matched,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN status = 'expired'   THEN 1 ELSE 0 END) AS expired,
         COUNT(*) AS total
       FROM shared_delivery_queue`,
    )
    .get() as { waiting: number | null; matched: number | null; cancelled: number | null; expired: number | null; total: number };

  const waiting = counts.waiting ?? 0;
  const matched = counts.matched ?? 0;
  const cancelled = counts.cancelled ?? 0;
  const expired = counts.expired ?? 0;
  const resolved = matched + cancelled + expired;

  const activeMatches = db
    .prepare("SELECT COUNT(*) AS n FROM matches WHERE status IN ('pending_payment', 'confirmed')")
    .get() as { n: number };

  const oldest = db
    .prepare("SELECT MIN(joined_at) AS t FROM shared_delivery_queue WHERE status = 'waiting'")
    .get() as { t: string | null };

  return {
    waitingNow: waiting,
    activeMatches: activeMatches.n,
    matchedTotal: matched,
    cancelledTotal: cancelled,
    expiredTotal: expired,
    joinedTotal: counts.total,
    matchSuccessRate: resolved === 0 ? 0 : Math.round((matched / resolved) * 100),
    averageWaitMs: averageMatchWaitMs(),
    longestCurrentWaitMs: oldest.t ? Math.max(0, now - new Date(oldest.t).getTime()) : 0,
  };
}
