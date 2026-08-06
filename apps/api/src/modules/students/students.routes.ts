import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type {
  FavoriteRow,
  MenuItemRow,
  OrderItemRow,
  OrderRow,
  PaymentRow,
  QueueRow,
  RestaurantRow,
  StudentRow,
} from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, fail } from '../../lib/response';
import { mapMenuItem, mapOrder, mapPayment, mapRestaurant, mapStudent } from '../../lib/mappers';
import { PAYMENT_OUTCOME_LABEL, paymentOutcome } from '../../lib/paymentStage';
import { generateId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { ACTIVE_ORDER_STATUSES } from '../orders/orders.routes';

export const studentsRouter = Router();
// Official Thapar Institute of Engineering & Technology hostel names.
// Must stay in sync with THAPAR_HOSTELS in auth.routes.ts and the student-app
// RegisterScreen so new registrations and hostel-change requests use the same set.
const THAPAR_HOSTELS = [
  // Boys Hostels
  'A Hostel',
  'B Hostel',
  'C Hostel',
  'D Hostel',
  'E Hostel',
  'F Hostel',
  'G Hostel',
  'H Hostel',
  'J Hostel',
  'K Hostel',
  'L Hostel',
  'M Hostel',
  // Girls Hostels
  'PG Hostel',
  'Q Hostel',
  'R Hostel',
] as const;



studentsRouter.use(requireAuth('student'));

// GET /students/profile
studentsRouter.get('/profile', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.auth!.sub) as StudentRow | undefined;
  if (!student) return fail(res, 'ORDER_001', 'Student not found.');
  return ok(res, mapStudent(student));
});

const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  roomNumber: z.string().optional(),
  // Phase 5: profile picture. Stored as a URL (http/https or a data: URL from
  // an in-browser crop) — there is no file-upload pipeline in this build, so
  // the client sends an already-encoded image or a hosted link.
  avatarUrl: z.string().max(2_000_000).nullable().optional(),
});

// PATCH /students/profile
studentsRouter.patch('/profile', (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'Invalid profile update.');

  const current = db.prepare('SELECT * FROM students WHERE id = ?').get(req.auth!.sub) as StudentRow | undefined;
  if (!current) return fail(res, 'ORDER_001', 'Student not found.');

  const next = { ...current, ...parsed.data };
  db.prepare(
    'UPDATE students SET full_name = ?, phone = ?, room_number = ?, avatar_url = ? WHERE id = ?',
  ).run(
    next.fullName ?? current.full_name,
    parsed.data.phone ?? current.phone,
    parsed.data.roomNumber ?? current.room_number,
    parsed.data.avatarUrl === undefined ? current.avatar_url : parsed.data.avatarUrl,
    current.id,
  );
  const updated = db.prepare('SELECT * FROM students WHERE id = ?').get(current.id) as StudentRow;
  return ok(res, mapStudent(updated));
});

const hostelSchema = z.object({
  hostel: z
    .string()
    .trim()
    .refine(
      (h) => (THAPAR_HOSTELS as readonly string[]).includes(h),
      `Hostel must be one of: ${THAPAR_HOSTELS.join(', ')}.`,
    ),
});

// PATCH /students/hostel — Hostel Management (sprint 2). A student may only
// switch hostels when nothing is currently riding on their current one:
// no active order (payment window, restaurant preparing, out for delivery,
// PairCode handover — anything in ACTIVE_ORDER_STATUSES) and not currently
// waiting in a Shared Delivery queue. Both checks are enforced here
// server-side — the Hostel Settings screen also checks client-side so it
// can explain the block up front, but this is the source of truth.
studentsRouter.patch('/hostel', (req, res) => {
  const parsed = hostelSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'A valid hostel is required.');

  const studentId = req.auth!.sub;

  const activeOrder = db
    .prepare(
      `SELECT id FROM orders WHERE student_id = ? AND status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(', ')}) LIMIT 1`,
    )
    .get(studentId, ...ACTIVE_ORDER_STATUSES) as { id: string } | undefined;
  if (activeOrder) {
    return fail(
      res,
      'HOSTEL_001',
      "You can't change your hostel while you have an active order — including the payment window, restaurant preparation, and out-for-delivery. Try again once it's delivered or cancelled.",
    );
  }

  const queueEntry = db
    .prepare("SELECT id FROM shared_delivery_queue WHERE student_id = ? AND status IN ('waiting', 'matched') LIMIT 1")
    .get(studentId) as QueueRow | undefined;
  if (queueEntry) {
    return fail(
      res,
      'HOSTEL_001',
      "You can't change your hostel while waiting for a Shared Delivery match. Leave the queue first, or wait for it to resolve.",
    );
  }

  const current = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as StudentRow | undefined;
  if (!current) return fail(res, 'ORDER_001', 'Student not found.');

  if (current.hostel !== parsed.data.hostel) {
    db.prepare('UPDATE students SET hostel = ? WHERE id = ?').run(parsed.data.hostel, studentId);
    logAudit('student', studentId, 'student.hostel_changed', `${current.hostel} -> ${parsed.data.hostel}`);
  }

  const updated = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as StudentRow;
  return ok(res, mapStudent(updated));
});

/**
 * GET /students/orders — full order history for the current student.
 *
 * Phase 6D: each order carries its payment outcome (Paid / Refunded /
 * Cancelled / Payment Failed) plus the refund details, so History can show
 * where the money ended up without a second request per order.
 */
studentsRouter.get('/orders', (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE student_id = ? ORDER BY created_at DESC')
    .all(req.auth!.sub) as OrderRow[];
  const result = orders.map((order) => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) as OrderItemRow[];
    const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id) as
      | PaymentRow
      | undefined;
    const outcome = payment
      ? paymentOutcome(payment, order.status)
      : order.status === 'cancelled'
        ? 'cancelled'
        : 'awaiting_payment';
    const restaurant = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(order.restaurant_id) as { name: string } | undefined;
    return {
      ...mapOrder(order, items),
      restaurantName: restaurant?.name ?? null,
      payment: payment ? mapPayment(payment) : null,
      paymentOutcome: outcome,
      paymentOutcomeLabel: PAYMENT_OUTCOME_LABEL[outcome],
    };
  });
  return ok(res, result);
});


/* ------------------------------------------------------------------ *
 * Phase 5 — Favourites
 * ------------------------------------------------------------------ */

const favoriteSchema = z.object({
  targetType: z.enum(['restaurant', 'menu_item']),
  targetId: z.string().min(1),
});

/**
 * GET /students/favorites
 *
 * Returns the hydrated favourites, not just ids, so the Favourites screen
 * renders in one round trip. Targets that have since been soft-deleted are
 * skipped rather than returned as broken rows.
 */
studentsRouter.get('/favorites', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM favorites WHERE student_id = ? ORDER BY created_at DESC')
    .all(req.auth!.sub) as FavoriteRow[];

  const restaurants: ReturnType<typeof mapRestaurant>[] = [];
  const dishes: (ReturnType<typeof mapMenuItem> & { restaurantName: string })[] = [];

  for (const row of rows) {
    if (row.target_type === 'restaurant') {
      const restaurant = db
        .prepare('SELECT * FROM restaurants WHERE id = ? AND deleted_at IS NULL')
        .get(row.target_id) as RestaurantRow | undefined;
      if (restaurant) restaurants.push(mapRestaurant(restaurant));
    } else {
      const item = db
        .prepare('SELECT * FROM menu_items WHERE id = ? AND deleted_at IS NULL')
        .get(row.target_id) as MenuItemRow | undefined;
      if (!item) continue;
      const parent = db
        .prepare('SELECT * FROM restaurants WHERE id = ? AND deleted_at IS NULL')
        .get(item.restaurant_id) as RestaurantRow | undefined;
      if (!parent) continue;
      dishes.push({ ...mapMenuItem(item), restaurantName: parent.name });
    }
  }

  return ok(res, {
    restaurantIds: rows.filter((r) => r.target_type === 'restaurant').map((r) => r.target_id),
    dishIds: rows.filter((r) => r.target_type === 'menu_item').map((r) => r.target_id),
    restaurants,
    dishes,
  });
});

// POST /students/favorites — idempotent (UNIQUE constraint + INSERT OR IGNORE).
studentsRouter.post('/favorites', (req, res) => {
  const parsed = favoriteSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'Invalid favourite.');
  const { targetType, targetId } = parsed.data;

  const exists =
    targetType === 'restaurant'
      ? db.prepare('SELECT id FROM restaurants WHERE id = ? AND deleted_at IS NULL').get(targetId)
      : db.prepare('SELECT id FROM menu_items WHERE id = ? AND deleted_at IS NULL').get(targetId);
  if (!exists) return fail(res, 'ORDER_001', 'That item no longer exists.');

  db.prepare(
    'INSERT OR IGNORE INTO favorites (id, student_id, target_type, target_id) VALUES (?, ?, ?, ?)',
  ).run(generateId('fav'), req.auth!.sub, targetType, targetId);

  return ok(res, { targetType, targetId, favorited: true });
});

// DELETE /students/favorites/:targetType/:targetId
studentsRouter.delete('/favorites/:targetType/:targetId', (req, res) => {
  const parsed = favoriteSchema.safeParse({
    targetType: req.params.targetType,
    targetId: req.params.targetId,
  });
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'Invalid favourite.');

  db.prepare('DELETE FROM favorites WHERE student_id = ? AND target_type = ? AND target_id = ?').run(
    req.auth!.sub,
    parsed.data.targetType,
    parsed.data.targetId,
  );
  return ok(res, { ...parsed.data, favorited: false });
});

/* ------------------------------------------------------------------ *
 * Phase 5 — Profile statistics
 * ------------------------------------------------------------------ */

/**
 * GET /students/stats
 *
 * Read-only aggregation over the student's own orders. Money saved is
 * derived, never stored: on a Shared Delivery order the student pays the flat
 * convenience fee instead of the restaurant's full delivery fee, so the
 * saving for that order is `max(0, delivery_fee - convenience_fee)`.
 * Cancelled orders are excluded.
 */
studentsRouter.get('/stats', (req, res) => {
  const orders = db
    .prepare("SELECT * FROM orders WHERE student_id = ? AND status != 'cancelled'")
    .all(req.auth!.sub) as OrderRow[];

  const feeByRestaurant = new Map<string, number>();
  const deliveryFee = (restaurantId: string): number => {
    if (!feeByRestaurant.has(restaurantId)) {
      const row = db.prepare('SELECT delivery_fee FROM restaurants WHERE id = ?').get(restaurantId) as
        | { delivery_fee: number }
        | undefined;
      feeByRestaurant.set(restaurantId, row?.delivery_fee ?? 0);
    }
    return feeByRestaurant.get(restaurantId) ?? 0;
  };

  const sharedOrders = orders.filter((o) => o.delivery_type === 'shared');
  const moneySaved = sharedOrders.reduce(
    (total, order) => total + Math.max(0, deliveryFee(order.restaurant_id) - order.convenience_fee),
    0,
  );

  const spendByRestaurant = new Map<string, number>();
  for (const order of orders) {
    spendByRestaurant.set(
      order.restaurant_id,
      (spendByRestaurant.get(order.restaurant_id) ?? 0) + (order.subtotal + order.convenience_fee),
    );
  }
  const topRestaurantId =
    [...spendByRestaurant.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topRestaurant = topRestaurantId
    ? (db.prepare('SELECT name FROM restaurants WHERE id = ?').get(topRestaurantId) as
        | { name: string }
        | undefined)
    : undefined;

  const favoriteCount = db
    .prepare('SELECT COUNT(*) AS n FROM favorites WHERE student_id = ?')
    .get(req.auth!.sub) as { n: number };

  return ok(res, {
    totalOrders: orders.length,
    sharedOrders: sharedOrders.length,
    individualOrders: orders.length - sharedOrders.length,
    deliveredOrders: orders.filter((o) => o.status === 'delivered').length,
    totalSpent: orders.reduce((total, o) => total + (o.subtotal + o.convenience_fee), 0),
    moneySaved,
    favoriteCount: favoriteCount.n,
    topRestaurant: topRestaurant?.name ?? null,
  });
});
