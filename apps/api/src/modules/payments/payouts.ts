import { db } from '../../db/client';
import type { OrderRow, PaymentRow, RestaurantRow, RefundTrigger } from '../../db/rows';
import { logAudit } from '../../lib/audit';
import { notifyStudent, notifyRestaurant } from '../../lib/notify';
import { pushToStudent, pushToRestaurant } from '../../lib/eventBus';
import { logPaymentEvent, adminName } from '../../lib/paymentLog';

/**
 * Phase 6A/6B — the payout gate.
 *
 * Thapar Bites sits between the student and the restaurant. Money arrives
 * from the student first (`payments.status = 'successful'`), and only once the
 * onward transfer to the restaurant is confirmed
 * (`payments.transfer_status = 'confirmed'`) may the restaurant see the order.
 *
 * Until then the order rests in 'awaiting_restaurant_payment', which is
 * deliberately NOT in the restaurant dashboard's visible statuses — so there
 * is exactly one code path that can expose an order to a kitchen, and it runs
 * after the transfer, never before.
 *
 * Phase 6B makes that release ADMIN-DRIVEN: the auto-settling worker is off by
 * default, so a human confirms every payout from the Ops dashboard and every
 * action lands in `payment_logs`.
 */

/**
 * Phase 6B: automatic settlement is opt-in only (demo/load-testing). With it
 * off — the default — nothing releases an order except an admin.
 */
const AUTO_PAYOUT = process.env.CAMPUS_BITES_AUTO_PAYOUT === 'true';
/** Simulated settlement delay used only when AUTO_PAYOUT is enabled. */
const PAYOUT_DELAY_MS = Number(process.env.CAMPUS_BITES_PAYOUT_DELAY_MS) || 6000;
const TICK_MS = 1500;

export interface Actor {
  type: 'admin' | 'system';
  id?: string | null;
}

/** Marks the student -> Thapar Bites leg done and opens the payout leg. */
export function openTransfer(paymentId: string, now: string): void {
  db.prepare(
    `UPDATE payments
        SET status = 'successful', paid_at = ?, transfer_status = 'pending'
      WHERE id = ? AND status = 'pending'`,
  ).run(now, paymentId);
}

function reload(paymentId: string): PaymentRow {
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as PaymentRow;
}

/**
 * Confirms the Thapar Bites -> restaurant transfer and releases the order to
 * the kitchen. Idempotent: a payment whose transfer is already confirmed is
 * left alone, so a retried webhook (or an admin clicking twice) can't double
 * push an order.
 */
export function confirmRestaurantTransfer(
  paymentId: string,
  actor: 'system' | 'admin',
  actorId?: string,
): { released: boolean; payment: PaymentRow } {
  const payment = reload(paymentId);
  // Phase 6D — duplicate-transfer / refunded-order guards. These are the last
  // line of defence before money leaves Thapar Bites, so they live here rather
  // than only in the admin route: a retried webhook, a double click and the
  // auto-payout worker all pass through this function.
  if (payment.status !== 'successful') return { released: false, payment };
  if (payment.transfer_status === 'confirmed') return { released: false, payment };
  if (payment.refund_status === 'pending' || payment.refund_status === 'completed') {
    return { released: false, payment };
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE payments
        SET transfer_status = 'confirmed',
            transfer_confirmed_at = ?,
            transfer_failure_reason = NULL,
            transfer_attempts = transfer_attempts + 1
      WHERE id = ?`,
  ).run(now, paymentId);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id) as OrderRow | undefined;
  let released = false;

  if (order && order.status === 'awaiting_restaurant_payment') {
    // THIS is the release: the order becomes visible to the kitchen, the
    // restaurant is notified, and the student's tracker flips to confirmed.
    db.prepare("UPDATE orders SET status = 'order_received', updated_at = ? WHERE id = ?").run(now, order.id);
    notifyStudent(
      order.student_id,
      'Order confirmed',
      'We have paid the restaurant — your order has been sent to the kitchen.',
    );
    notifyRestaurant(
      order.restaurant_id,
      'New order received',
      `Payment for order #${order.id.slice(-6)} has been settled by Thapar Bites. Please start preparing.`,
      order.id,
    );
    pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
    pushToRestaurant(order.restaurant_id, { type: 'new_order', orderId: order.id });
    released = true;
  } else if (order) {
    pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  }

  logAudit(
    actor,
    actorId ?? null,
    'payment.restaurant_transfer_confirmed',
    `payment ${paymentId} / order ${payment.order_id} / ₹${payment.amount}`,
  );
  logPaymentEvent({
    paymentId,
    orderId: payment.order_id,
    action: 'transfer_confirmed',
    transferStatus: 'confirmed',
    amount: payment.amount,
    actorType: actor,
    actorId: actorId ?? null,
    actorName: actor === 'admin' ? adminName(actorId) : 'Thapar Bites system',
    note: released ? 'Order released to the restaurant.' : 'Transfer confirmed (order already released).',
  });

  return { released, payment: reload(paymentId) };
}

/**
 * Phase 6B — marks a payout attempt as failed. Kept separate from confirm so a
 * failed transfer stays visible (and retryable) on the pending screen instead
 * of silently disappearing.
 */
export function markTransferFailed(paymentId: string, reason: string, actor: Actor): PaymentRow {
  const payment = reload(paymentId);
  db.prepare(
    `UPDATE payments
        SET transfer_status = 'failed',
            transfer_failure_reason = ?,
            transfer_attempts = transfer_attempts + 1
      WHERE id = ?`,
  ).run(reason, paymentId);

  logPaymentEvent({
    paymentId,
    orderId: payment.order_id,
    action: 'transfer_failed',
    transferStatus: 'failed',
    amount: payment.amount,
    actorType: actor.type,
    actorId: actor.id ?? null,
    actorName: actor.type === 'admin' ? adminName(actor.id) : 'Thapar Bites system',
    note: reason,
  });

  // Phase 6D — a failed transfer means Thapar Bites still holds money for an
  // order the restaurant will never cook. Return it automatically.
  initiateRefund(
    paymentId,
    'transfer_failed',
    `Restaurant payment failed: ${reason}`,
    actor,
  );

  return reload(paymentId);
}

/**
 * Phase 6B — "Retry Transfer". Puts a failed payout back in the pending queue
 * so it can be confirmed again. It does NOT release the order: only an
 * explicit confirmation ever does that.
 */
export function retryRestaurantTransfer(paymentId: string, actor: Actor): PaymentRow {
  const payment = reload(paymentId);
  db.prepare(
    `UPDATE payments SET transfer_status = 'pending', transfer_failure_reason = NULL WHERE id = ?`,
  ).run(paymentId);

  logAudit(actor.type, actor.id ?? null, 'payment.transfer_retried', `payment ${paymentId}`);
  logPaymentEvent({
    paymentId,
    orderId: payment.order_id,
    action: 'transfer_retried',
    transferStatus: 'pending',
    amount: payment.amount,
    actorType: actor.type,
    actorId: actor.id ?? null,
    actorName: actor.type === 'admin' ? adminName(actor.id) : 'Thapar Bites system',
    note: payment.transfer_failure_reason
      ? `Retried after failure: ${payment.transfer_failure_reason}`
      : 'Transfer queued for another attempt.',
  });
  return reload(paymentId);
}

/**
 * ==========================================================================
 * Phase 6D — the refund engine.
 * ==========================================================================
 * Thapar Bites is holding the student's money whenever an order dies before
 * the restaurant is paid, so EVERY such path must return it. There is exactly
 * one function that moves money back — automatic triggers (restaurant closed,
 * restaurant rejected, transfer failed, admin cancelled) and the manual admin
 * button all call it — which is what makes "no double refunds" enforceable in
 * a single place.
 *
 * The refund runs in two recorded steps so a stuck refund is visible instead
 * of silent: `refund_status = 'pending'` (Refund Initiated) and then
 * `refund_status = 'completed'` (Refund Completed).
 */

export const REFUND_TRIGGER_LABEL: Record<RefundTrigger, string> = {
  restaurant_closed: 'Restaurant closed',
  restaurant_rejected: 'Restaurant rejected the order',
  transfer_failed: 'Restaurant payment failed',
  admin_cancelled: 'Cancelled by Thapar Bites',
  admin_manual: 'Refunded by Thapar Bites',
  student_cancelled: 'Cancelled by student',
};

export interface RefundResult {
  ok: boolean;
  /** Set when the refund was refused — e.g. it had already been issued. */
  error?: string;
  payment: PaymentRow;
  order: OrderRow | undefined;
}

/**
 * Triggers that must refund the student even when the restaurant has already
 * been paid. A restaurant that rejects an order it was paid for still owes the
 * money back — the student cannot be left out of pocket for food that will
 * never be cooked — so Thapar Bites refunds and recovers the payout from the
 * restaurant's next settlement.
 */
const REFUND_AFTER_TRANSFER: RefundTrigger[] = ['restaurant_rejected', 'admin_manual'];

/** True when this payment must not be refunded again. */
export function isRefundBlocked(payment: PaymentRow, trigger?: RefundTrigger): string | null {
  if (payment.status === 'refunded') return 'This payment has already been refunded.';
  if (payment.refund_status === 'completed') return 'This payment has already been refunded.';
  if (payment.refund_status === 'pending') return 'A refund for this payment is already in progress.';
  if (payment.status !== 'successful') return 'Only a successful payment can be refunded.';
  if (payment.transfer_status === 'confirmed' && !(trigger && REFUND_AFTER_TRANSFER.includes(trigger))) {
    return 'The restaurant has already been paid for this order; it cannot be auto-refunded.';
  }
  return null;
}

function loadOrder(orderId: string): OrderRow | undefined {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow | undefined;
}

/**
 * Refunds the student and cancels the order. Idempotent by construction: the
 * blocking check and the 'pending' write happen in the same transaction, so
 * two concurrent triggers can never both open a refund.
 */
export function initiateRefund(
  paymentId: string,
  trigger: RefundTrigger,
  reason: string,
  actor: Actor,
): RefundResult {
  const existing = reload(paymentId);
  if (!existing) {
    return { ok: false, error: 'Payment not found.', payment: existing, order: undefined };
  }

  const blocked = isRefundBlocked(existing, trigger);
  if (blocked) {
    return { ok: false, error: blocked, payment: existing, order: loadOrder(existing.order_id) };
  }

  const now = new Date().toISOString();
  const actorName = actor.type === 'admin' ? adminName(actor.id) : 'Thapar Bites system';

  // --- Step 1: Refund Initiated -------------------------------------------
  const opened = db.transaction(() => {
    const changes = db
      .prepare(
        `UPDATE payments
            SET refund_status = 'pending',
                refund_reason = ?,
                refund_trigger = ?,
                refund_amount = amount,
                refund_initiated_at = ?,
                refund_failure_reason = NULL,
                transfer_status = CASE WHEN transfer_status = 'confirmed' THEN transfer_status ELSE 'not_started' END
          WHERE id = ?
            AND status = 'successful'
            AND refund_status NOT IN ('pending', 'completed')`,
      )
      .run(reason, trigger, now, paymentId).changes;
    return changes === 1;
  })();

  if (!opened) {
    const current = reload(paymentId);
    return {
      ok: false,
      error: isRefundBlocked(current, trigger) ?? 'This refund could not be started.',
      payment: current,
      order: loadOrder(current.order_id),
    };
  }

  logPaymentEvent({
    paymentId,
    orderId: existing.order_id,
    action: 'refund_initiated',
    transferStatus: 'not_started',
    amount: existing.amount,
    actorType: actor.type,
    actorId: actor.id ?? null,
    actorName,
    note: `${REFUND_TRIGGER_LABEL[trigger]} — ${reason}`,
  });

  // --- Step 2: settle the refund and close the order ------------------------
  db.transaction(() => {
    db.prepare(
      `UPDATE payments
          SET status = 'refunded',
              refund_status = 'completed',
              refund_completed_at = ?
        WHERE id = ?`,
    ).run(now, paymentId);

    const order = loadOrder(existing.order_id);
    if (order && !['cancelled', 'completed'].includes(order.status)) {
      // A refunded order must never reach a kitchen, so it is cancelled in the
      // same transaction that returns the money.
      db.prepare("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?").run(
        reason,
        now,
        order.id,
      );
    }
  })();

  const order = loadOrder(existing.order_id);
  if (order) {
    notifyStudent(
      order.student_id,
      'Refund completed',
      `Thapar Bites has refunded ₹${existing.amount} for your order. ${reason}`,
    );
    pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  }

  logAudit(actor.type, actor.id ?? null, 'payment.student_refunded', `payment ${paymentId} / ₹${existing.amount} / ${trigger}`);
  logPaymentEvent({
    paymentId,
    orderId: existing.order_id,
    action: 'refund_completed',
    transferStatus: 'not_started',
    amount: existing.amount,
    actorType: actor.type,
    actorId: actor.id ?? null,
    actorName,
    note: `Refund of ₹${existing.amount} completed.`,
  });

  return { ok: true, payment: reload(paymentId), order };
}

/**
 * Phase 6D — marks a refund attempt as failed so it lands on the Failed
 * Refunds tab instead of disappearing. Used by the retry path when the money
 * movement itself doesn't go through.
 */
export function markRefundFailed(paymentId: string, reason: string, actor: Actor): PaymentRow {
  const payment = reload(paymentId);
  db.prepare(
    `UPDATE payments SET refund_status = 'failed', refund_failure_reason = ? WHERE id = ? AND refund_status != 'completed'`,
  ).run(reason, paymentId);
  logPaymentEvent({
    paymentId,
    orderId: payment.order_id,
    action: 'refund_failed',
    transferStatus: payment.transfer_status,
    amount: payment.amount,
    actorType: actor.type,
    actorId: actor.id ?? null,
    actorName: actor.type === 'admin' ? adminName(actor.id) : 'Thapar Bites system',
    note: reason,
  });
  return reload(paymentId);
}

/**
 * Phase 6D — retries a refund that previously failed. Only a `failed` refund
 * can be retried, so this can never create a second refund for a payment that
 * already completed one.
 */
export function retryRefund(paymentId: string, actor: Actor): RefundResult {
  const payment = reload(paymentId);
  if (!payment) return { ok: false, error: 'Payment not found.', payment, order: undefined };
  if (payment.refund_status !== 'failed') {
    return {
      ok: false,
      error: 'Only a failed refund can be retried.',
      payment,
      order: loadOrder(payment.order_id),
    };
  }
  // Reopen the refund so the engine's normal guards apply again.
  db.prepare(`UPDATE payments SET refund_status = 'none' WHERE id = ?`).run(paymentId);
  return initiateRefund(
    paymentId,
    payment.refund_trigger ?? 'admin_manual',
    payment.refund_reason ?? 'Refund retried by Thapar Bites admin.',
    actor,
  );
}

/**
 * Phase 6B API kept intact — the admin "Refund Student" button. Phase 6D
 * routes it through the single refund engine so the manual path and the
 * automatic paths behave identically.
 */
export function refundStudentPayment(
  paymentId: string,
  actor: Actor,
  reason: string,
  trigger: RefundTrigger = 'admin_manual',
): { payment: PaymentRow; order: OrderRow | undefined; ok: boolean; error?: string } {
  const result = initiateRefund(paymentId, trigger, reason, actor);
  return { payment: result.payment, order: result.order, ok: result.ok, error: result.error };
}

/**
 * Phase 6D — is this restaurant able to receive an order right now? Used
 * before a payout releases an order: a closed (or deactivated) restaurant
 * means the order can never be fulfilled, so the student is refunded instead.
 */
export function restaurantClosedReason(restaurantId: string | null | undefined): string | null {
  if (!restaurantId) return null;
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId) as
    | RestaurantRow
    | undefined;
  if (!restaurant) return 'The restaurant is no longer available.';
  if (restaurant.deleted_at || !restaurant.is_active) return 'The restaurant is no longer available.';
  if (restaurant.status === 'closed') return 'The restaurant is closed and cannot take this order.';
  return null;
}

/**
 * Phase 6B — "Cancel Order". Used when the order should not go ahead but the
 * money question is handled separately (e.g. the student never paid, or the
 * refund was already issued). Only orders that have not yet been released to a
 * kitchen can be cancelled here.
 */
export function cancelOrderForPayment(
  paymentId: string,
  actor: Actor,
  reason: string,
): { payment: PaymentRow; order: OrderRow | undefined; refunded: boolean } {
  const payment = reload(paymentId);

  // Phase 6D — cancelling BEFORE the restaurant payment is confirmed means the
  // student's money is still with Thapar Bites: refund it in the same action
  // rather than leaving it to a second manual step.
  if (payment.status === 'successful' && payment.transfer_status !== 'confirmed' && !isRefundBlocked(payment)) {
    const refund = initiateRefund(paymentId, 'admin_cancelled', reason, actor);
    if (refund.ok) return { payment: refund.payment, order: refund.order, refunded: true };
  }

  const now = new Date().toISOString();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id) as OrderRow | undefined;

  if (order) {
    db.prepare("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?").run(
      reason,
      now,
      order.id,
    );
    notifyStudent(order.student_id, 'Order cancelled', reason);
    pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  }
  // The payout leg is closed so a cancelled order can never be settled later.
  db.prepare(`UPDATE payments SET transfer_status = 'not_started' WHERE id = ? AND transfer_status != 'confirmed'`).run(
    paymentId,
  );

  logAudit(actor.type, actor.id ?? null, 'order.cancelled_by_admin', `order ${payment.order_id}: ${reason}`);
  logPaymentEvent({
    paymentId,
    orderId: payment.order_id,
    action: 'order_cancelled',
    transferStatus: reload(paymentId).transfer_status,
    amount: payment.amount,
    actorType: actor.type,
    actorId: actor.id ?? null,
    actorName: actor.type === 'admin' ? adminName(actor.id) : 'Thapar Bites system',
    note: reason,
  });

  return {
    payment: reload(paymentId),
    order: db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id) as OrderRow | undefined,
    refunded: false,
  };
}

/**
 * Optional auto-settlement (CAMPUS_BITES_AUTO_PAYOUT=true), kept for demos and
 * load tests. Phase 6B leaves it OFF: an admin confirms every payout from
 * /admin/payouts, which is the only path that releases an order.
 */
export function startPayoutEngine(): void {
  if (!AUTO_PAYOUT) {
    console.log('[payouts] admin-confirmation mode: orders release only when an admin confirms the transfer.');
    return;
  }
  setInterval(() => {
    try {
      const cutoff = new Date(Date.now() - PAYOUT_DELAY_MS).toISOString();
      const due = db
        .prepare(
          `SELECT * FROM payments
            WHERE status = 'successful' AND transfer_status = 'pending' AND COALESCE(paid_at, created_at) < ?`,
        )
        .all(cutoff) as PaymentRow[];

      for (const payment of due) {
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id) as
          | OrderRow
          | undefined;
        // A cancelled/expired order must not be paid onward to the restaurant.
        if (!order || ['cancelled', 'payment_expired'].includes(order.status)) continue;
        // Phase 6D — never pay (or release to) a closed restaurant: refund.
        const closed = restaurantClosedReason(order.restaurant_id);
        if (closed) {
          initiateRefund(payment.id, 'restaurant_closed', closed, { type: 'system' });
          continue;
        }
        confirmRestaurantTransfer(payment.id, 'system');
      }
    } catch (err) {
      console.error('[payouts] tick failed:', err);
    }
  }, TICK_MS).unref?.();
}
