import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type { OrderRow, PaymentRow } from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, created, fail } from '../../lib/response';
import { mapPayment } from '../../lib/mappers';
import { notifyStudent } from '../../lib/notify';
import { pushToStudent } from '../../lib/eventBus';
import { openTransfer } from './payouts';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth('student'));

const createSchema = z.object({
  orderId: z.string(),
  method: z.enum(['upi', 'debit_card', 'credit_card', 'net_banking', 'wallet']),
});

// POST /payments — step 1: initiate. Mirrors handing off to a real gateway.
paymentsRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'orderId and method are required.');
  const { orderId, method } = parsed.data;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow | undefined;
  if (!order || order.student_id !== req.auth!.sub) return fail(res, 'ORDER_001', 'Order not found.');
  if (!['payment_pending', 'awaiting_partner_payment'].includes(order.status)) {
    return fail(res, 'PAYMENT_001', `This order is not awaiting payment (status: ${order.status}).`);
  }

  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId) as PaymentRow;
  if (payment.status === 'successful') {
    return ok(res, mapPayment(payment));
  }
  db.prepare('UPDATE payments SET method = ? WHERE id = ?').run(method, payment.id);

  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id) as PaymentRow;
  return created(res, mapPayment(updated));
});

const verifySchema = z.object({ paymentId: z.string() });

// POST /payments/verify — step 2: the (simulated) gateway confirms success.
paymentsRouter.post('/verify', (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'paymentId is required.');

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(parsed.data.paymentId) as
    | PaymentRow
    | undefined;
  if (!payment) return fail(res, 'ORDER_001', 'Payment not found.');

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id) as OrderRow;
  if (order.student_id !== req.auth!.sub) return fail(res, 'ORDER_001', 'Payment not found.');

  if (order.status === 'payment_expired' || order.status === 'cancelled') {
    return fail(res, 'PAYMENT_002', 'This payment window has expired.');
  }

  const now = new Date().toISOString();

  /**
   * Phase 6A — the student's money has now reached Thapar Bites, NOT the
   * restaurant. `openTransfer` records the successful student leg and opens
   * the payout leg ('waiting for restaurant payment'). The order deliberately
   * does NOT become 'order_received' here: that only happens once the onward
   * transfer to the restaurant is confirmed, in payouts.ts. This is the single
   * rule that keeps a kitchen from ever seeing an unfunded order.
   */
  openTransfer(payment.id, now);

  if (order.delivery_type === 'individual') {
    db.prepare("UPDATE orders SET status = 'awaiting_restaurant_payment', updated_at = ? WHERE id = ?").run(
      now,
      order.id,
    );
    notifyStudent(
      order.student_id,
      'Payment successful',
      'Thapar Bites has received your payment. We are now paying the restaurant.',
    );
    pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  } else {
    finalizeIfBothPaid(order, now);
  }

  const finalOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as OrderRow;
  const finalPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id) as PaymentRow;
  return ok(res, { payment: mapPayment(finalPayment), orderStatus: finalOrder.status });
});

function finalizeIfBothPaid(order: OrderRow, now: string): void {
  const sibling = db
    .prepare('SELECT * FROM orders WHERE match_id = ? AND student_id != ?')
    .get(order.match_id, order.student_id) as OrderRow | undefined;
  const siblingPayment = sibling
    ? (db.prepare('SELECT * FROM payments WHERE order_id = ?').get(sibling.id) as PaymentRow)
    : undefined;

  if (sibling && siblingPayment?.status === 'successful') {
    // Both students have paid Thapar Bites. Phase 6A: the pair still waits on
    // the restaurant payout before the kitchen is told anything.
    db.prepare("UPDATE orders SET status = 'awaiting_restaurant_payment', updated_at = ? WHERE id IN (?, ?)").run(
      now,
      order.id,
      sibling.id,
    );
    db.prepare("UPDATE matches SET status = 'confirmed' WHERE id = ?").run(order.match_id);
    const body = 'Both sides have paid. Thapar Bites is now paying the restaurant.';
    notifyStudent(order.student_id, 'Payment successful', body);
    notifyStudent(sibling.student_id, 'Payment successful', body);
    pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
    pushToStudent(sibling.student_id, { type: 'order_updated', orderId: sibling.id });
  } else {
    db.prepare("UPDATE orders SET status = 'awaiting_partner_payment', updated_at = ? WHERE id = ?").run(
      now,
      order.id,
    );
    pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  }
}

/**
 * GET /payments/history — Phase 6A payment history for the signed-in student:
 * amount, date and status (both legs), newest first. Scoped to
 * `student_id` so a student can only ever see their own payments.
 */
paymentsRouter.get('/history', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, r.name AS restaurant_name, o.delivery_type AS delivery_type, o.status AS order_status
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN restaurants r ON r.id = COALESCE(p.restaurant_id, o.restaurant_id)
        WHERE COALESCE(p.student_id, o.student_id) = ?
        ORDER BY COALESCE(p.paid_at, p.created_at, o.created_at) DESC
        LIMIT 100`,
    )
    .all(req.auth!.sub) as (PaymentRow & {
    restaurant_name: string | null;
    delivery_type: 'individual' | 'shared';
    order_status: string;
  })[];

  return ok(
    res,
    rows.map((row) => ({
      ...mapPayment(row),
      restaurantName: row.restaurant_name,
      deliveryType: row.delivery_type,
      orderStatus: row.order_status,
    })),
  );
});

// GET /payments/:id
paymentsRouter.get('/:id', (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as PaymentRow | undefined;
  if (!payment) return fail(res, 'ORDER_001', 'Payment not found.');
  const order = db.prepare('SELECT student_id FROM orders WHERE id = ?').get(payment.order_id) as {
    student_id: string;
  };
  if (order.student_id !== req.auth!.sub) return fail(res, 'ORDER_001', 'Payment not found.');
  return ok(res, mapPayment(payment));
});

// GET /payments/refund/:id — :id is a payment id.
paymentsRouter.get('/refund/:id', (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as PaymentRow | undefined;
  if (!payment) return fail(res, 'ORDER_001', 'Payment not found.');

  // Security fix: this endpoint previously returned refund details for ANY
  // payment id with no ownership check — a textbook IDOR (a student could
  // enumerate payment ids and read other students' refund status/amount).
  // Mirror the ownership check already used by GET /payments/:id above, and
  // return the same 404 (not 403) for a payment that exists but isn't
  // theirs, so the response can't be used to enumerate valid payment ids.
  const order = db.prepare('SELECT student_id FROM orders WHERE id = ?').get(payment.order_id) as {
    student_id: string;
  };
  if (order.student_id !== req.auth!.sub) return fail(res, 'ORDER_001', 'Payment not found.');

  // Phase 6D — the student's refund detail: why, when, and how much.
  const refunded = payment.status === 'refunded' || payment.refund_status === 'completed';
  return ok(res, {
    paymentId: payment.id,
    refunded,
    amount: refunded ? (payment.refund_amount ?? payment.amount) : 0,
    refundStatus: payment.refund_status ?? 'none',
    refundReason: payment.refund_reason,
    refundTrigger: payment.refund_trigger,
    refundInitiatedAt: payment.refund_initiated_at,
    refundCompletedAt: payment.refund_completed_at,
    refundFailureReason: payment.refund_failure_reason,
    timeline: mapPayment(payment).timeline,
  });
});
