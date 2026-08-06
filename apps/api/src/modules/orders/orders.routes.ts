import { Router } from 'express';
import { db } from '../../db/client';
import type { DeliveryRow, OrderItemRow, OrderRow, PaymentRow } from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, fail } from '../../lib/response';
import { mapDelivery, mapOrder, mapPayment } from '../../lib/mappers';
import { initiateRefund } from '../payments/payouts';

export const ordersRouter = Router();
ordersRouter.use(requireAuth('student'));

/** Any order in one of these statuses is "in flight" — the student has a
 * live Individual or Shared Delivery order that hasn't reached a terminal
 * state yet. Exported so other modules (e.g. the hostel-change guard in
 * students.routes.ts) share this single definition rather than each
 * maintaining their own copy that can drift out of sync.
 * Includes 'paircode_verification' (Ch. 10, sprint 2) — the brief window
 * after a student has revealed their PairCode but before the delivery
 * partner has verified it. */
export const ACTIVE_ORDER_STATUSES = [
  'payment_pending',
  'awaiting_partner_payment',
  // Phase 6A: paid by the student, waiting on the Thapar Bites -> restaurant
  // transfer. Very much an active order — the kitchen just can't see it yet.
  'awaiting_restaurant_payment',
  'order_received',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'collected',
  'out_for_delivery',
  'driver_arrived',
  'paircode_verification',
];

const ACTIVE_STATUSES = ACTIVE_ORDER_STATUSES;

function fullOrder(order: OrderRow) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) as OrderItemRow[];
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id) as PaymentRow | undefined;
  const delivery = db.prepare('SELECT * FROM deliveries WHERE order_id = ?').get(order.id) as
    | DeliveryRow
    | undefined;
  return {
    ...mapOrder(order, items),
    payment: payment ? mapPayment(payment) : null,
    delivery: delivery ? mapDelivery(delivery) : null,
  };
}

// GET /orders/current — the student's active order, if any.
ordersRouter.get('/current', (req, res) => {
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(', ');
  const order = db
    .prepare(
      `SELECT * FROM orders WHERE student_id = ? AND status IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`,
    )
    .get(req.auth!.sub, ...ACTIVE_STATUSES) as OrderRow | undefined;
  if (!order) return ok(res, null);
  return ok(res, fullOrder(order));
});

// GET /orders/:id
ordersRouter.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as OrderRow | undefined;
  if (!order || order.student_id !== req.auth!.sub) return fail(res, 'ORDER_001', 'Order not found.');
  return ok(res, fullOrder(order));
});

// PATCH /orders/:id/cancel
ordersRouter.patch('/:id/cancel', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as OrderRow | undefined;
  if (!order || order.student_id !== req.auth!.sub) return fail(res, 'ORDER_001', 'Order not found.');

  const cancellable = [
    'payment_pending',
    'awaiting_partner_payment',
    'awaiting_restaurant_payment',
    'order_received',
  ];
  if (!cancellable.includes(order.status)) {
    return fail(res, 'VALIDATION_001', `Orders can no longer be cancelled once the restaurant is preparing them.`);
  }

  const now = new Date().toISOString();
  /**
   * Phase 6A/6D: cancelling before the restaurant payout means Thapar Bites is
   * still holding the student's money. It goes back through the single refund
   * engine (which records the reason, amount and timeline, and refuses a
   * second refund) rather than a bare status UPDATE.
   */
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id) as
    | PaymentRow
    | undefined;
  if (payment && payment.status === 'successful' && payment.transfer_status !== 'confirmed') {
    initiateRefund(payment.id, 'student_cancelled', 'You cancelled this order before it reached the restaurant.', {
      type: 'system',
    });
  }
  db.prepare("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?").run(
    'Cancelled by student.',
    now,
    order.id,
  );
  const refreshed = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as OrderRow;
  return ok(res, fullOrder(refreshed));
});
