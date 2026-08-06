import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type { CartItemRow, OrderItemRow, OrderRow, RestaurantRow } from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, created, fail, ApiError } from '../../lib/response';
import { generateId, generatePairCode } from '../../lib/ids';
import { mapOrder } from '../../lib/mappers';

export const checkoutRouter = Router();
checkoutRouter.use(requireAuth('student'));

function loadCart(studentId: string) {
  const rows = db
    .prepare(
      `SELECT ci.*, mi.name as name, mi.price as price, mi.available as available
       FROM cart_items ci JOIN menu_items mi ON mi.id = ci.menu_item_id
       WHERE ci.student_id = ? AND mi.deleted_at IS NULL`,
    )
    .all(studentId) as (CartItemRow & { name: string; price: number; available: number })[];
  const subtotal = rows.reduce((sum, r) => sum + r.price * r.quantity, 0);
  return { rows, subtotal, restaurantId: rows[0]?.restaurant_id as string | undefined };
}

// POST /checkout/validate — dry-run eligibility check, no side effects.
checkoutRouter.post('/validate', (req, res) => {
  const { rows, subtotal, restaurantId } = loadCart(req.auth!.sub);
  if (rows.length === 0) return fail(res, 'CART_001', 'Your cart is empty.');

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId) as
    | RestaurantRow
    | undefined;
  if (!restaurant) return fail(res, 'CART_002', 'This restaurant is no longer available.');
  return ok(res, {
    subtotal,
    restaurantId,
    eligibility: {
      individual: subtotal >= restaurant.minimum_order,
      shared: subtotal >= restaurant.shared_delivery_minimum && subtotal < restaurant.minimum_order,
    },
    minimums: { individual: restaurant.minimum_order, shared: restaurant.shared_delivery_minimum },
  });
});

const checkoutSchema = z.object({ deliveryType: z.literal('individual') });

// POST /checkout — Individual Delivery only. Shared Delivery goes through
// POST /shared-delivery/queue instead, since an order can't exist for it
// until a match is made.
checkoutRouter.post('/', (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', "deliveryType must be 'individual' for this endpoint.");
  }
  const studentId = req.auth!.sub;
  const { rows, subtotal, restaurantId } = loadCart(studentId);
  if (rows.length === 0) return fail(res, 'CART_001', 'Your cart is empty.');

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId) as
    | RestaurantRow
    | undefined;
  if (!restaurant) return fail(res, 'CART_002', 'This restaurant is no longer available.');

  // Restaurant status enforcement: a restaurant can be marked CLOSED after
  // items were already sitting in the cart (or the cart was built while it
  // was open), so this must be re-checked at checkout time too, not just
  // on add-to-cart. A restaurant disabled or soft-deleted by Admin is
  // treated the same way — it cannot receive new orders.
  if (restaurant.deleted_at || !restaurant.is_active || restaurant.status === 'closed') {
    return fail(res, 'CART_002', 'This restaurant is currently closed and is not accepting orders.');
  }

  // Phase 2 bug fix: `loadCart` already selects `available`, but nothing ever
  // checked it, so a student could pay for an item the kitchen had marked out
  // of stock (or that had since been soft-deleted from the menu).
  const unavailable = rows.filter((line) => !line.available);
  if (unavailable.length > 0) {
    return fail(
      res,
      'CART_002',
      `No longer available: ${unavailable.map((l) => l.name).join(', ')}. Please remove these items.`,
    );
  }

  if (subtotal < restaurant.minimum_order) {
    return fail(
      res,
      'VALIDATION_001',
      `Cart total is below the Individual Delivery minimum of ₹${restaurant.minimum_order}.`,
    );
  }

  /**
   * Phase 2 bug fix — checkout is now a single database transaction.
   *
   * Before, the order insert, the order_items inserts, the payment insert and
   * the cart clear were four independent statements. A failure (or a crash)
   * part-way through left real corruption: an order with no items, or a cart
   * that had already produced an order but was never emptied, letting the
   * student check out the same food twice.
   *
   * better-sqlite3's `db.transaction()` wraps the whole closure in
   * BEGIN/COMMIT and rolls back automatically if anything throws.
   */
  const placeOrder = db.transaction(() => {
    const orderId = generateId('ord');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO orders (id, student_id, restaurant_id, delivery_type, status, subtotal, convenience_fee, pair_code, created_at, updated_at)
       VALUES (?, ?, ?, 'individual', 'payment_pending', ?, 0, ?, ?, ?)`,
    ).run(orderId, studentId, restaurantId, subtotal, generatePairCode(), now, now);

    const insertItem = db.prepare(
      'INSERT INTO order_items (id, order_id, menu_item_id, name, price, quantity) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const line of rows) {
      insertItem.run(generateId('oi'), orderId, line.menu_item_id, line.name, line.price, line.quantity);
    }

    db.prepare(
      `INSERT INTO payments (id, order_id, student_id, restaurant_id, amount, status, transfer_status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 'not_started', ?)`,
    ).run(generateId('pay'), orderId, studentId, restaurantId, subtotal, now);

    // Guarded delete: `changes` must match the cart we priced. If another
    // request emptied or altered the cart while we were mid-checkout, the
    // whole transaction rolls back rather than charging for a stale snapshot.
    const cleared = db.prepare('DELETE FROM cart_items WHERE student_id = ?').run(studentId);
    if (cleared.changes !== rows.length) {
      throw new ApiError('CART_002', 'Your cart changed while checking out. Please review it and try again.');
    }

    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as OrderItemRow[];
    return mapOrder(orderRow, items);
  });

  try {
    return created(res, placeOrder());
  } catch (error) {
    if (error instanceof ApiError) return fail(res, error.code, error.message);
    throw error;
  }
});

