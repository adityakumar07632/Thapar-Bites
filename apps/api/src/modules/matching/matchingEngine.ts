import { db } from '../../db/client';
import type { MatchRow, OrderRow, PaymentRow, QueueRow } from '../../db/rows';
import { generateId, generatePairCode } from '../../lib/ids';
import { notifyStudent } from '../../lib/notify';
import { logAudit } from '../../lib/audit';
import { pushToStudent } from '../../lib/eventBus';
import { PENALTY_PAYMENT_FAILED, PENALTY_SHARED_DELIVERY_ABANDONED, penalizeReliability } from '../../lib/reliability';

/**
 * Staged Shared Delivery wait (Ch. 7.8, sprint 2). The queue no longer has a
 * single flat countdown that dead-ends into a hard expiry: it walks through
 * three 5-minute stages while the matching engine keeps trying automatically,
 * and only once all three have passed with no match does the student get
 * asked to decide what happens next.
 *
 *   0–5 min   (stage 1) ─▶ no match ─▶ automatically extend
 *   5–10 min  (stage 2) ─▶ no match ─▶ automatically extend
 *   10–15 min (stage 3) ─▶ still no match ─▶ decision required:
 *       "Continue waiting" (POST /shared-delivery/continue-waiting) or
 *       "Convert to Individual Delivery" (POST /shared-delivery/convert-to-individual)
 */
export const QUEUE_STAGE_MS = 5 * 60 * 1000;
export const QUEUE_STAGE_COUNT = 3;

/** The decision point — same 15-minute value the product has always used,
 * but it no longer means "kill the queue entry." It means "the student must
 * be asked to decide." Stored in `shared_delivery_queue.expires_at`, which
 * "Continue waiting" pushes forward by another QUEUE_DECISION_EXTENSION_MS
 * each time it's reached. */
export const MAX_QUEUE_WAIT_MS = QUEUE_STAGE_MS * QUEUE_STAGE_COUNT;

/** How much extra time "Continue waiting" grants before asking again. */
export const QUEUE_DECISION_EXTENSION_MS = QUEUE_STAGE_MS;

/** PRD Ch. 7.9 / BR-033 — the payment window once a match is created. */
export const PAYMENT_WINDOW_MS = 3 * 60 * 1000;

const TICK_MS = 1200;

export interface QueueWaitPhase {
  /** Which of the 3 staged 5-minute windows the student is currently in.
   * Stays at 3 forever once past the 15-minute decision point — there's no
   * "stage 4"; from there it's just repeated decision points. */
  stage: 1 | 2 | 3;
  elapsedMs: number;
  stageElapsedMs: number;
  /** ms left in the current stage; 0 once decisionRequired is true. */
  stageRemainingMs: number;
  /** True once `expiresAt` (the current decision point) has been reached
   * with no match — the UI must offer Continue / Convert instead of just
   * showing a countdown. */
  decisionRequired: boolean;
}

/** Pure function so it's trivially testable and reusable from both
 * GET /shared-delivery/status and POST /shared-delivery/continue-waiting. */
export function computeQueueWaitPhase(joinedAt: string, expiresAt: string, now = Date.now()): QueueWaitPhase {
  const elapsedMs = Math.max(0, now - new Date(joinedAt).getTime());
  const stage = (Math.min(QUEUE_STAGE_COUNT, Math.floor(elapsedMs / QUEUE_STAGE_MS) + 1)) as 1 | 2 | 3;
  const stageElapsedMs = elapsedMs - (stage - 1) * QUEUE_STAGE_MS;
  const stageRemainingMs = Math.max(0, QUEUE_STAGE_MS - stageElapsedMs);
  const decisionRequired = now >= new Date(expiresAt).getTime();
  return { stage, elapsedMs, stageElapsedMs, stageRemainingMs, decisionRequired };
}

interface CartSnapshotLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

function createOrderForMatch(entry: QueueRow, matchId: string, pairCode: string): void {
  const orderId = generateId('ord');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO orders (id, student_id, restaurant_id, delivery_type, match_id, status, subtotal, convenience_fee, pair_code, created_at, updated_at)
     VALUES (?, ?, ?, 'shared', ?, 'payment_pending', ?, 10, ?, ?, ?)`,
  ).run(orderId, entry.student_id, entry.restaurant_id, matchId, entry.subtotal, pairCode, now, now);

  const lines = JSON.parse(entry.cart_snapshot) as CartSnapshotLine[];
  const insertItem = db.prepare(
    'INSERT INTO order_items (id, order_id, menu_item_id, name, price, quantity) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const line of lines) {
    insertItem.run(generateId('oi'), orderId, line.menuItemId, line.name, line.price, line.quantity);
  }

  db.prepare(
    `INSERT INTO payments (id, order_id, student_id, restaurant_id, amount, status, transfer_status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 'not_started', ?)`,
  ).run(generateId('pay'), orderId, entry.student_id, entry.restaurant_id, entry.subtotal + 10, now);
}

function formMatches(): void {
  const waiting = db
    .prepare("SELECT * FROM shared_delivery_queue WHERE status = 'waiting' ORDER BY joined_at ASC")
    .all() as QueueRow[];

  const groups = new Map<string, QueueRow[]>();
  for (const entry of waiting) {
    const key = `${entry.restaurant_id}|${entry.hostel}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  for (const entries of groups.values()) {
    // Phase 2 bug fix: a queue entry survives the restaurant being disabled or
    // soft-deleted by Admin, so the matcher used to happily pair two students
    // into a live match — with real orders and a payment window — against a
    // restaurant that can no longer accept orders. Checkout and queue-join
    // both guarded against this; the engine did not.
    const restaurantId = entries[0]?.restaurant_id;
    if (restaurantId) {
      const restaurant = db
        .prepare("SELECT id FROM restaurants WHERE id = ? AND deleted_at IS NULL AND is_active = 1 AND status != 'closed'")
        .get(restaurantId);
      if (!restaurant) continue;
    }

    while (entries.length >= 2) {
      const a = entries.shift()!;
      const b = entries.shift()!;
      const matchId = generateId('match');
      const pairCode = generatePairCode();
      const deadline = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();

      // Phase 2 bug fix: the match row, the queue status flip and BOTH orders
      // are now one transaction. Previously a failure between them could leave
      // a match with one order, or two students marked 'matched' with no
      // orders at all — an unrecoverable state for the payment window.
      try {
        db.transaction(() => {
          db.prepare(
            `INSERT INTO matches (id, restaurant_id, student_a, student_b, pair_code, payment_deadline, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending_payment')`,
          ).run(matchId, a.restaurant_id, a.student_id, b.student_id, pairCode, deadline);

          const flipped = db
            .prepare("UPDATE shared_delivery_queue SET status = 'matched' WHERE id IN (?, ?) AND status = 'waiting'")
            .run(a.id, b.id);
          if (flipped.changes !== 2) {
            throw new Error('Queue entry was claimed concurrently — rolling back this match.');
          }

          createOrderForMatch(a, matchId, pairCode);
          createOrderForMatch(b, matchId, pairCode);
        })();
      } catch (error) {
        // One bad pair must not abort the whole tick — the remaining groups
        // still deserve a match. The rollback already undid everything.
        console.error('[matching] failed to create match, skipping pair:', error);
        continue;
      }

      notifyStudent(a.student_id, 'Match found!', 'Complete payment within 3 minutes to confirm your Shared Delivery.');
      notifyStudent(b.student_id, 'Match found!', 'Complete payment within 3 minutes to confirm your Shared Delivery.');
      pushToStudent(a.student_id, { type: 'queue_status_changed' });
      pushToStudent(b.student_id, { type: 'queue_status_changed' });

    }
  }
}

/** Pure hygiene safety net — NOT part of the staged-wait product flow above.
 * `expires_at` used to be a hard kill switch; now it's just the next
 * decision checkpoint (see computeQueueWaitPhase), and a normally-engaged
 * student is always asked to continue or convert well before this fires.
 * This only exists so a queue entry from a truly abandoned tab (closed
 * browser, dead connection, never responded to the decision prompt) doesn't
 * sit 'waiting' — and eligible for matching — forever. */
const ABANDONED_QUEUE_CEILING_MS = 2 * 60 * 60 * 1000; // 2 hours from joined_at

function expireStaleQueueEntries(): void {
  const cutoff = new Date(Date.now() - ABANDONED_QUEUE_CEILING_MS).toISOString();
  db.prepare("UPDATE shared_delivery_queue SET status = 'expired' WHERE status = 'waiting' AND joined_at < ?").run(
    cutoff,
  );
}

/** PRD Ch. 7.11 — resolves Case B (one side pays, one doesn't) and the
 * neither-pays timeout once a match's 3-minute window has passed. */
function expirePaymentWindows(): void {
  const now = new Date().toISOString();
  const stale = db
    .prepare("SELECT * FROM matches WHERE status = 'pending_payment' AND payment_deadline < ?")
    .all(now) as MatchRow[];

  for (const match of stale) {
    const orders = db.prepare('SELECT * FROM orders WHERE match_id = ?').all(match.id) as OrderRow[];
    const withPayments = orders.map((order) => ({
      order,
      payment: db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id) as PaymentRow,
    }));
    const paid = withPayments.filter((p) => p.payment.status === 'successful');
    const unpaid = withPayments.filter((p) => p.payment.status !== 'successful');

    if (paid.length === 1 && unpaid.length === 1) {
      // BR-037 — the student who paid returns to the front of the queue with
      // their original timestamp; the match is void either way.
      const payer = paid[0];
      db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?").run(payer.payment.id);
      db.prepare(
        "UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?",
      ).run('Delivery partner did not complete payment in time — you were requeued.', now, payer.order.id);

      const priorEntry = db
        .prepare(
          'SELECT * FROM shared_delivery_queue WHERE student_id = ? AND restaurant_id = ? ORDER BY joined_at DESC LIMIT 1',
        )
        .get(payer.order.student_id, match.restaurant_id) as QueueRow;

      // BR-037 fix: `joined_at` is preserved verbatim so the student keeps
      // their original FIFO priority in formMatches()'s `ORDER BY joined_at
      // ASC` — they still requeue ahead of anyone who joined after them.
      // `expires_at`, however, MUST be computed from *now*, not from the
      // stale original `joined_at`. The old code derived it as
      // `joined_at + MAX_QUEUE_WAIT_MS`, which — for any student who had
      // already waited close to (or past) the 15-minute ceiling before a
      // match even formed — landed in the past the instant the row was
      // inserted, so the very next expireStaleQueueEntries() tick expired
      // it immediately. A requeue caused by someone else's non-payment is
      // not the student's fault, so they always get a fresh, full waiting
      // window from the moment of requeue. This also composes correctly
      // across multiple consecutive requeues, since each one again reads
      // the previous entry's original joined_at and grants a fresh window.
      db.prepare(
        `INSERT INTO shared_delivery_queue (id, student_id, restaurant_id, hostel, cart_snapshot, subtotal, joined_at, expires_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting')`,
      ).run(
        generateId('queue'),
        payer.order.student_id,
        match.restaurant_id,
        priorEntry.hostel,
        priorEntry.cart_snapshot,
        priorEntry.subtotal,
        priorEntry.joined_at,
        new Date(Date.now() + MAX_QUEUE_WAIT_MS).toISOString(),
      );

      db.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(unpaid[0].payment.id);
      db.prepare("UPDATE orders SET status = 'payment_expired', updated_at = ? WHERE id = ?").run(
        now,
        unpaid[0].order.id,
      );
      // Reliability: this student left their delivery partner stranded by
      // not completing payment in time — an abandoned Shared Delivery.
      penalizeReliability(unpaid[0].order.student_id, PENALTY_SHARED_DELIVERY_ABANDONED);

      notifyStudent(
        payer.order.student_id,
        'Match fell through',
        'Your delivery partner didn\u2019t complete payment in time. Nothing was charged, and you\u2019re back at the front of the queue.',
      );
      logAudit('system', match.id, 'match.partner_no_pay_requeue', `order ${payer.order.id} requeued`);
      pushToStudent(payer.order.student_id, { type: 'order_updated', orderId: payer.order.id });
      pushToStudent(unpaid[0].order.student_id, { type: 'order_updated', orderId: unpaid[0].order.id });
    } else if (paid.length === 0) {
      // Neither side paid — both simply expire, no requeue.
      for (const { order, payment } of withPayments) {
        db.prepare("UPDATE payments SET status = 'expired' WHERE id = ?").run(payment.id);
        db.prepare("UPDATE orders SET status = 'payment_expired', updated_at = ? WHERE id = ?").run(now, order.id);
        // Reliability: neither side paid, so both share the fault equally.
        penalizeReliability(order.student_id, PENALTY_PAYMENT_FAILED);
        pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
      }
      logAudit('system', match.id, 'match.both_expired', 'neither student paid within the window');
    }
    // If both already paid, the payments route already flipped this match to
    // 'confirmed' before the deadline check ever saw it here.

    db.prepare("UPDATE matches SET status = 'expired' WHERE id = ?").run(match.id);
  }
}

export function startMatchingEngine(): void {
  setInterval(() => {
    try {
      formMatches();
      expireStaleQueueEntries();
      expirePaymentWindows();
    } catch (err) {
      console.error('[matching-engine] tick error:', err);
    }
  }, TICK_MS);
  console.log(`[matching-engine] started — checking every ${TICK_MS}ms`);
}
