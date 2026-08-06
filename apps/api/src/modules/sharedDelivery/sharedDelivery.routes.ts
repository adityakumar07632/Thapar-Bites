import { Router } from 'express';
import { db } from '../../db/client';
import type { CartItemRow, MatchRow, OrderItemRow, OrderRow, QueueRow, QrTokenRow, RestaurantRow } from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, created, fail, ApiError } from '../../lib/response';
import { generateId, generatePairCode } from '../../lib/ids';
import { MAX_QUEUE_WAIT_MS, QUEUE_DECISION_EXTENSION_MS, computeQueueWaitPhase } from '../matching/matchingEngine';
import { PENALTY_QUEUE_LEFT, penalizeReliability } from '../../lib/reliability';
import { mapOrder } from '../../lib/mappers';
import { notifyStudent } from '../../lib/notify';
import { logAudit } from '../../lib/audit';
import { pushToStudent } from '../../lib/eventBus';
import { queueMetricsFor } from './queueMetrics';
import { buildQrToken, getPairCodePart, pairCodeDisplay } from '../../lib/qrTokens';

interface CartSnapshotLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export const sharedDeliveryRouter = Router();
sharedDeliveryRouter.use(requireAuth('student'));

// POST /shared-delivery/queue — join the FIFO queue for the cart's restaurant.
sharedDeliveryRouter.post('/queue', (req, res) => {
  const studentId = req.auth!.sub;

  const already = db
    .prepare("SELECT * FROM shared_delivery_queue WHERE student_id = ? AND status = 'waiting'")
    .get(studentId) as QueueRow | undefined;
  if (already) return fail(res, 'CART_002', 'You are already waiting in a Shared Delivery queue.');

  const cartRows = db
    .prepare(
      `SELECT ci.*, mi.name as name, mi.price as price
       FROM cart_items ci JOIN menu_items mi ON mi.id = ci.menu_item_id
       WHERE ci.student_id = ?`,
    )
    .all(studentId) as (CartItemRow & { name: string; price: number })[];
  if (cartRows.length === 0) return fail(res, 'CART_001', 'Your cart is empty.');

  const restaurantId = cartRows[0].restaurant_id;
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId) as RestaurantRow;

  // Restaurant status enforcement: don't let students queue into a Shared
  // Delivery match for a restaurant that is CLOSED — the same status can
  // flip after the cart was assembled, so it's re-checked here as well.
  // A restaurant disabled or soft-deleted by Admin is treated the same way.
  if (restaurant.deleted_at || !restaurant.is_active || restaurant.status === 'closed') {
    return fail(res, 'CART_002', 'This restaurant is currently closed and is not accepting orders.');
  }

  const subtotal = cartRows.reduce((sum, r) => sum + r.price * r.quantity, 0);

  const eligible = subtotal >= restaurant.shared_delivery_minimum && subtotal < restaurant.minimum_order;
  if (!eligible) {
    return fail(
      res,
      'VALIDATION_001',
      `Shared Delivery needs a cart between ₹${restaurant.shared_delivery_minimum} and ₹${restaurant.minimum_order - 1} for this restaurant.`,
    );
  }

  const student = db.prepare('SELECT hostel FROM students WHERE id = ?').get(studentId) as { hostel: string };
  const now = Date.now();
  const queueId = generateId('queue');

  // The snapshot becomes the source of truth once the cart is cleared. Keep
  // both operations atomic so a write failure cannot leave the student queued
  // and still able to place a second order from the same cart.
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO shared_delivery_queue (id, student_id, restaurant_id, hostel, cart_snapshot, subtotal, joined_at, expires_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting')`,
      ).run(
        queueId,
        studentId,
        restaurantId,
        student.hostel,
        JSON.stringify(cartRows.map((r) => ({ menuItemId: r.menu_item_id, name: r.name, price: r.price, quantity: r.quantity }))),
        subtotal,
        new Date(now).toISOString(),
        new Date(now + MAX_QUEUE_WAIT_MS).toISOString(),
      );

      const cleared = db.prepare('DELETE FROM cart_items WHERE student_id = ?').run(studentId);
      if (cleared.changes !== cartRows.length) {
        throw new ApiError('CART_002', 'Your cart changed while joining the queue. Please review it and try again.');
      }
    })();
  } catch (error) {
    if (error instanceof ApiError) return fail(res, error.code, error.message);
    throw error;
  }

  return created(res, { queueId, status: 'waiting', restaurantId, subtotal, joinedAt: new Date(now).toISOString() });
});

// DELETE /shared-delivery/queue — leave the queue voluntarily.
sharedDeliveryRouter.delete('/queue', (req, res) => {
  const result = db
    .prepare("UPDATE shared_delivery_queue SET status = 'cancelled' WHERE student_id = ? AND status = 'waiting'")
    .run(req.auth!.sub);

  // Reliability: only penalize an actual leave (a row really was waiting and
  // got cancelled), not a no-op call with nothing to leave. Kept small on
  // its own so it's the repeated pattern of leaving that adds up, not any
  // single leave.
  if (result.changes > 0) {
    penalizeReliability(req.auth!.sub, PENALTY_QUEUE_LEFT);
  }

  return ok(res, { left: true });
});

// GET /shared-delivery/status — poll target while waiting.
sharedDeliveryRouter.get('/status', (req, res) => {
  const entry = db
    .prepare('SELECT * FROM shared_delivery_queue WHERE student_id = ? ORDER BY joined_at DESC LIMIT 1')
    .get(req.auth!.sub) as QueueRow | undefined;
  if (!entry) return ok(res, { status: 'none' });

  const restaurantName = (
    db.prepare('SELECT name FROM restaurants WHERE id = ?').get(entry.restaurant_id) as
      | { name: string }
      | undefined
  )?.name ?? null;

  if (entry.status !== 'waiting') {
    return ok(res, {
      status: entry.status,
      restaurantId: entry.restaurant_id,
      restaurantName,
      hostel: entry.hostel,
      subtotal: entry.subtotal,
      joinedAt: entry.joined_at,
      expiresAt: entry.expires_at,
    });
  }

  // Staged wait (Ch. 7.8, sprint 2) — see computeQueueWaitPhase for the
  // 0–5 / 5–10 / 10–15 min staging and the 15-minute decision point.
  const phase = computeQueueWaitPhase(entry.joined_at, entry.expires_at);
  // Phase 4: the Queue screen shows position / people waiting / ETA. These are
  // derived read-only from rows the matching engine already writes.
  const metrics = queueMetricsFor(entry);
  return ok(res, {
    status: entry.status,
    restaurantId: entry.restaurant_id,
    restaurantName,
    hostel: entry.hostel,
    subtotal: entry.subtotal,
    joinedAt: entry.joined_at,
    expiresAt: entry.expires_at,
    position: metrics.position,
    waitingCount: metrics.groupWaitingCount,
    totalWaitingCount: metrics.totalWaitingCount,
    estimatedWaitMs: metrics.estimatedWaitMs,
    stage: phase.stage,
    elapsedMs: phase.elapsedMs,
    stageRemainingMs: phase.stageRemainingMs,
    decisionRequired: phase.decisionRequired,
  });
});

// POST /shared-delivery/continue-waiting — the student's answer to the
// 15-minute decision prompt when they'd rather keep waiting than convert.
// Grants another QUEUE_DECISION_EXTENSION_MS before the prompt reappears;
// `joined_at` (and therefore FIFO position + displayed stage) is untouched.
sharedDeliveryRouter.post('/continue-waiting', (req, res) => {
  const entry = db
    .prepare("SELECT * FROM shared_delivery_queue WHERE student_id = ? AND status = 'waiting'")
    .get(req.auth!.sub) as QueueRow | undefined;
  if (!entry) return fail(res, 'MATCH_001', 'You are not currently waiting in a Shared Delivery queue.');

  const nextExpiry = new Date(Date.now() + QUEUE_DECISION_EXTENSION_MS).toISOString();
  db.prepare('UPDATE shared_delivery_queue SET expires_at = ? WHERE id = ?').run(nextExpiry, entry.id);

  const phase = computeQueueWaitPhase(entry.joined_at, nextExpiry);
  const metrics = queueMetricsFor(entry);
  return ok(res, {
    status: 'waiting',
    restaurantId: entry.restaurant_id,
    joinedAt: entry.joined_at,
    expiresAt: nextExpiry,
    position: metrics.position,
    waitingCount: metrics.groupWaitingCount,
    totalWaitingCount: metrics.totalWaitingCount,
    estimatedWaitMs: metrics.estimatedWaitMs,
    stage: phase.stage,
    elapsedMs: phase.elapsedMs,
    stageRemainingMs: phase.stageRemainingMs,
    decisionRequired: phase.decisionRequired,
  });
});

// POST /shared-delivery/convert-to-individual — the student's other answer
// to the 15-minute decision prompt. Only available once the decision point
// has actually been reached (not a general-purpose "skip the queue" escape
// hatch). Places the frozen cart snapshot as an Individual Delivery order —
// deliberately bypassing the usual individual minimum-order check, since the
// entire point is rescuing a cart that was, by definition, in the Shared
// Delivery band (below that minimum) when it was queued.
sharedDeliveryRouter.post('/convert-to-individual', (req, res) => {
  const studentId = req.auth!.sub;
  const entry = db
    .prepare("SELECT * FROM shared_delivery_queue WHERE student_id = ? AND status = 'waiting'")
    .get(studentId) as QueueRow | undefined;
  if (!entry) return fail(res, 'MATCH_001', 'You are not currently waiting in a Shared Delivery queue.');

  const phase = computeQueueWaitPhase(entry.joined_at, entry.expires_at);
  if (!phase.decisionRequired) {
    return fail(
      res,
      'VALIDATION_001',
      "Converting to Individual Delivery is available once you've waited 15 minutes without a match.",
    );
  }

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(entry.restaurant_id) as
    | RestaurantRow
    | undefined;
  if (!restaurant) return fail(res, 'ORDER_001', 'Restaurant not found.');
  if (restaurant.deleted_at || !restaurant.is_active || restaurant.status === 'closed') {
    return fail(res, 'CART_002', 'This restaurant is currently closed and is not accepting orders.');
  }

  const lines = JSON.parse(entry.cart_snapshot) as CartSnapshotLine[];

  // Phase 2 fix: all writes are in a single transaction so a crash between
  // any two inserts cannot leave an order without a payment (or vice-versa).
  const orderRow = db.transaction(() => {
    db.prepare("UPDATE shared_delivery_queue SET status = 'cancelled' WHERE id = ?").run(entry.id);

    const orderId = generateId('ord');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO orders (id, student_id, restaurant_id, delivery_type, status, subtotal, convenience_fee, pair_code, created_at, updated_at)
       VALUES (?, ?, ?, 'individual', 'payment_pending', ?, 0, ?, ?, ?)`,
    ).run(orderId, studentId, entry.restaurant_id, entry.subtotal, generatePairCode(), now, now);

    const insertItem = db.prepare(
      'INSERT INTO order_items (id, order_id, menu_item_id, name, price, quantity) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const line of lines) {
      insertItem.run(generateId('oi'), orderId, line.menuItemId, line.name, line.price, line.quantity);
    }

    db.prepare(
      `INSERT INTO payments (id, order_id, student_id, restaurant_id, amount, status, transfer_status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 'not_started', ?)`,
    ).run(generateId('pay'), orderId, studentId, entry.restaurant_id, entry.subtotal, now);

    return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow;
  })();

  logAudit('student', studentId, 'shared_delivery.converted_to_individual', `order ${orderRow.id}`);
  notifyStudent(studentId, 'Switched to Individual Delivery', 'No match came through in time, so we moved your order to Individual Delivery.');
  pushToStudent(studentId, { type: 'order_updated', orderId: orderRow.id });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderRow.id) as OrderItemRow[];
  return created(res, mapOrder(orderRow, items));
});

// GET /shared-delivery/match — details of the current match, if any. Never
// exposes the other student's identity (Ch. 7.13 privacy rules).
sharedDeliveryRouter.get('/match', (req, res) => {
  const studentId = req.auth!.sub;
  const match = db
    .prepare(
      `SELECT * FROM matches WHERE (student_a = ? OR student_b = ?) ORDER BY created_at DESC LIMIT 1`,
    )
    .get(studentId, studentId) as MatchRow | undefined;
  if (!match) return fail(res, 'MATCH_001', 'No match found.');

  const myOrder = db
    .prepare('SELECT * FROM orders WHERE match_id = ? AND student_id = ?')
    .get(match.id, studentId) as OrderRow | undefined;

  // Phase 4 — the Match Found screen needs enough context to explain the
  // match: the pair code both students share, what the shared fee is, and
  // what it saved versus paying the restaurant's own delivery fee alone.
  // The partner is still never identified (Ch. 7.13) — only their hostel,
  // which is by definition the same as this student's.
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(match.restaurant_id) as
    | RestaurantRow
    | undefined;

  const partnerId = match.student_a === studentId ? match.student_b : match.student_a;
  const partner = db.prepare('SELECT hostel FROM students WHERE id = ?').get(partnerId) as
    | { hostel: string }
    | undefined;

  const sharedFee = myOrder?.convenience_fee ?? 10;
  const individualFee = restaurant?.delivery_fee ?? 0;
  const savings = Math.max(0, individualFee - sharedFee);

  // Phase 13 — QR Verification. Determine which half of the pair code this
  // student owns, then lazily create (or fetch) their encrypted QR token.
  const part: 'A' | 'B' = match.student_a === studentId ? 'A' : 'B';
  const verificationPart = getPairCodePart(match.pair_code, part);
  const verificationDisplay = pairCodeDisplay(match.pair_code, part);

  let qrPayload: string | null = null;
  if (myOrder) {
    let token = db
      .prepare('SELECT * FROM shared_delivery_qr_tokens WHERE order_id = ? AND student_id = ?')
      .get(myOrder.id, studentId) as QrTokenRow | undefined;

    if (!token) {
      const tokenId = generateId('qrt');
      const built = buildQrToken({
        tokenId,
        matchId: match.id,
        orderId: myOrder.id,
        studentId,
        restaurantId: match.restaurant_id,
        part,
        verificationPart,
      });
      db.prepare(
        `INSERT OR IGNORE INTO shared_delivery_qr_tokens
           (id, match_id, order_id, student_id, restaurant_id, part, payload, payload_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        tokenId,
        match.id,
        myOrder.id,
        studentId,
        match.restaurant_id,
        part,
        built.payload,
        built.payloadHash,
        built.expiresAt,
      );
      // Re-fetch in case INSERT OR IGNORE hit a race; return stored payload.
      token = db
        .prepare('SELECT * FROM shared_delivery_qr_tokens WHERE order_id = ? AND student_id = ?')
        .get(myOrder.id, studentId) as QrTokenRow | undefined;
    }

    // Only return a usable QR payload when the token has not been consumed.
    if (token && !token.used_at) {
      qrPayload = token.payload;
    }
  }

  return ok(res, {
    matchId: match.id,
    restaurantId: match.restaurant_id,
    restaurantName: restaurant?.name ?? null,
    etaMinutes: restaurant?.eta_minutes ?? null,
    status: match.status,
    pairCode: match.pair_code,
    paymentDeadline: match.payment_deadline,
    matchedAt: match.created_at,
    orderId: myOrder?.id ?? null,
    orderStatus: myOrder?.status ?? null,
    subtotal: myOrder?.subtotal ?? null,
    sharedFee,
    individualFee,
    savings,
    partner: { hostel: partner?.hostel ?? null },
    // Phase 13 — QR / split pair-code fields
    verificationPart,     // student's half of the pair code (plain text)
    verificationDisplay,  // display string with blanks, e.g. "AB___"
    qrPayload,            // encrypted QR payload — null once token consumed
  });
});
