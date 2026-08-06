import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type { DeliveryRow, OrderRow } from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, fail } from '../../lib/response';
import { mapDelivery } from '../../lib/mappers';
import { pushToStudent } from '../../lib/eventBus';

export const deliveryRouter = Router();
deliveryRouter.use(requireAuth('student'));

function loadOwnedOrder(orderId: string, studentId: string): OrderRow | undefined {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow | undefined;
  return order && order.student_id === studentId ? order : undefined;
}

// GET /delivery/:orderId
deliveryRouter.get('/:orderId', (req, res) => {
  const order = loadOwnedOrder(req.params.orderId, req.auth!.sub);
  if (!order) return fail(res, 'ORDER_001', 'Order not found.');
  const delivery = db.prepare('SELECT * FROM deliveries WHERE order_id = ?').get(order.id) as
    | DeliveryRow
    | undefined;
  return ok(res, delivery ? mapDelivery(delivery) : null);
});

// PATCH /delivery/:orderId/arrived — idempotent manual confirmation.
deliveryRouter.patch('/:orderId/arrived', (req, res) => {
  const order = loadOwnedOrder(req.params.orderId, req.auth!.sub);
  if (!order) return fail(res, 'ORDER_001', 'Order not found.');

  const now = new Date().toISOString();
  db.prepare('UPDATE deliveries SET arrived_at = COALESCE(arrived_at, ?) WHERE order_id = ?').run(now, order.id);
  if (order.status === 'out_for_delivery') {
    db.prepare("UPDATE orders SET status = 'driver_arrived', updated_at = ? WHERE id = ?").run(now, order.id);
  }
  const delivery = db.prepare('SELECT * FROM deliveries WHERE order_id = ?').get(order.id) as DeliveryRow;
  return ok(res, mapDelivery(delivery));
});

// PATCH /delivery/:orderId/reveal — "Student opens PairCode" (Ch. 10, sprint
// 2). The code is never shown before this — see PAIR_CODE_VISIBLE_STATUSES
// in lib/mappers.ts. Only available once the delivery partner has actually
// arrived; moves the order into 'paircode_verification' so the code becomes
// visible on every subsequent order fetch too, not just this response.
// Idempotent: revealing again while already in that state just re-returns
// the code rather than erroring.
deliveryRouter.patch('/:orderId/reveal', (req, res) => {
  const order = loadOwnedOrder(req.params.orderId, req.auth!.sub);
  if (!order) return fail(res, 'ORDER_001', 'Order not found.');

  if (!['driver_arrived', 'paircode_verification'].includes(order.status)) {
    return fail(res, 'DELIVERY_001', 'Your PairCode can only be opened once your delivery partner has arrived.');
  }

  const now = new Date().toISOString();
  if (order.status === 'driver_arrived') {
    db.prepare("UPDATE orders SET status = 'paircode_verification', updated_at = ? WHERE id = ?").run(now, order.id);
    pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  }

  return ok(res, { pairCode: order.pair_code, orderStatus: 'paircode_verification' });
});

const verifySchema = z.object({ pairCode: z.string().min(1) });

// POST /delivery/:orderId/verify — PairCode™ Verification (Ch. 10). Requires
// the student to have already opened their PairCode (reveal, above) — the
// handover sequence is Driver Arrived → open PairCode → verify, in that
// order, not a shortcut straight from arrival to verified.
deliveryRouter.post('/:orderId/verify', (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'pairCode is required.');

  const order = loadOwnedOrder(req.params.orderId, req.auth!.sub);
  if (!order) return fail(res, 'ORDER_001', 'Order not found.');

  if (order.status !== 'paircode_verification') {
    return fail(res, 'DELIVERY_001', 'Open your PairCode before confirming handover.');
  }

  if (parsed.data.pairCode.trim().toUpperCase() !== (order.pair_code ?? '').toUpperCase()) {
    return fail(res, 'DELIVERY_001', 'That PairCode does not match this order.');
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ?").run(now, order.id);
  db.prepare('UPDATE deliveries SET delivered_at = ? WHERE order_id = ?').run(now, order.id);
  pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  // The 'delivered' → 'completed' transition is handled by the fulfillment
  // engine on its next tick (NEXT_STEP map) rather than a setTimeout, so the
  // transition survives a server restart instead of silently stalling.

  return ok(res, { verified: true, orderId: order.id });
});
