import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type { CartItemRow, MenuItemRow, RestaurantRow } from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, noContent, fail } from '../../lib/response';
import { generateId } from '../../lib/ids';

export const cartRouter = Router();
cartRouter.use(requireAuth('student'));

function currentCart(studentId: string) {
  const rows = db
    .prepare(
      `SELECT ci.*, mi.name as name, mi.price as price, mi.available as available, mi.restaurant_id as restaurant_id
       FROM cart_items ci JOIN menu_items mi ON mi.id = ci.menu_item_id
       WHERE ci.student_id = ?`,
    )
    .all(studentId) as (CartItemRow & { name: string; price: number; available: number })[];

  const restaurantId = rows[0]?.restaurant_id ?? null;
  const subtotal = rows.reduce((sum, r) => sum + r.price * r.quantity, 0);
  return {
    restaurantId,
    subtotal,
    lines: rows.map((r) => ({
      menuItemId: r.menu_item_id,
      name: r.name,
      price: r.price,
      quantity: r.quantity,
      available: Boolean(r.available),
    })),
  };
}

// GET /cart
cartRouter.get('/', (req, res) => {
  return ok(res, currentCart(req.auth!.sub));
});

const addSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().positive().default(1),
  replaceCart: z.boolean().optional(),
});

// POST /cart/items
cartRouter.post('/items', (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'menuItemId is required.');
  const { menuItemId, quantity, replaceCart } = parsed.data;
  const studentId = req.auth!.sub;

  const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(menuItemId) as
    | MenuItemRow
    | undefined;
  if (!menuItem) return fail(res, 'ORDER_001', 'Menu item not found.');
  if (!menuItem.available) return fail(res, 'CART_002', 'This item is currently unavailable.');

  // Restaurant status enforcement: a CLOSED restaurant cannot accept new
  // items into a cart, regardless of individual menu-item availability.
  // A restaurant disabled or soft-deleted by Admin is treated the same way.
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(menuItem.restaurant_id) as
    | RestaurantRow
    | undefined;
  if (!restaurant || restaurant.deleted_at || !restaurant.is_active || restaurant.status === 'closed') {
    return fail(res, 'CART_002', 'This restaurant is currently closed and is not accepting orders.');
  }

  const existingRestaurant = db
    .prepare('SELECT DISTINCT restaurant_id FROM cart_items WHERE student_id = ?')
    .get(studentId) as { restaurant_id: string } | undefined;

  if (existingRestaurant && existingRestaurant.restaurant_id !== menuItem.restaurant_id) {
    if (!replaceCart) {
      return fail(
        res,
        'CART_002',
        `Your cart has items from another restaurant (${existingRestaurant.restaurant_id}). Pass replaceCart: true to start a new cart.`,
      );
    }
    db.prepare('DELETE FROM cart_items WHERE student_id = ?').run(studentId);
  }

  const existingLine = db
    .prepare('SELECT * FROM cart_items WHERE student_id = ? AND menu_item_id = ?')
    .get(studentId, menuItemId) as CartItemRow | undefined;

  if (existingLine) {
    db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(quantity, existingLine.id);
  } else {
    db.prepare(
      'INSERT INTO cart_items (id, student_id, restaurant_id, menu_item_id, quantity) VALUES (?, ?, ?, ?, ?)',
    ).run(generateId('cart'), studentId, menuItem.restaurant_id, menuItemId, quantity);
  }

  return ok(res, currentCart(studentId), 201);
});

const updateQuantitySchema = z.object({ quantity: z.number().int().min(0) });

// PATCH /cart/items/:id — :id is a menuItemId
cartRouter.patch('/items/:id', (req, res) => {
  const parsed = updateQuantitySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'quantity must be a non-negative integer.');
  const studentId = req.auth!.sub;

  if (parsed.data.quantity === 0) {
    db.prepare('DELETE FROM cart_items WHERE student_id = ? AND menu_item_id = ?').run(studentId, req.params.id);
  } else {
    const result = db
      .prepare('UPDATE cart_items SET quantity = ? WHERE student_id = ? AND menu_item_id = ?')
      .run(parsed.data.quantity, studentId, req.params.id);
    if (result.changes === 0) return fail(res, 'ORDER_001', 'That item is not in your cart.');
  }
  return ok(res, currentCart(studentId));
});

// DELETE /cart/items/:id
cartRouter.delete('/items/:id', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE student_id = ? AND menu_item_id = ?').run(req.auth!.sub, req.params.id);
  return ok(res, currentCart(req.auth!.sub));
});

// DELETE /cart
cartRouter.delete('/', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE student_id = ?').run(req.auth!.sub);
  return noContent(res);
});
