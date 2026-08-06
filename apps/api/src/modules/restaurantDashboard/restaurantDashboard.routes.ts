import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type {
  MenuCategoryRow,
  MenuItemRow,
  MatchRow,
  OrderItemRow,
  OrderRow,
  PaymentRow,
  QrTokenRow,
  RestaurantNotificationRow,
} from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, created, fail } from '../../lib/response';
import { mapMenuCategory, mapMenuItem, mapOrder } from '../../lib/mappers';
import { notifyStudent } from '../../lib/notify';
import { logAudit } from '../../lib/audit';
import { decryptQrPayload, hashPayload } from '../../lib/qrTokens';
import {
  loadPaymentSettingsRow,
  mapPaymentSettings,
  paymentSettingsSchema,
  saveQrCode,
  savePaymentSettings,
} from '../../lib/paymentSettings';
import { qrCodeImageSchema } from '../../lib/validation';
import { pushToStudent } from '../../lib/eventBus';
import { generateId } from '../../lib/ids';
import { initiateRefund } from '../payments/payouts';
import {
  imageUrlSchema,
  menuCategoryNameSchema,
  menuItemNameSchema,
  menuItemPriceSchema,
  optionalImageUrlSchema,
  prepTimeMinutesSchema,
} from '../../lib/validation';

export const restaurantDashboardRouter = Router();
restaurantDashboardRouter.use(requireAuth('restaurant'));

// Phase 6A — 'awaiting_restaurant_payment' is deliberately absent: the student
// has paid Thapar Bites but the restaurant has not been paid yet, so the
// kitchen must not see the order. It becomes visible as 'order_received' only
// after the payout is confirmed (see modules/payments/payouts.ts).
const VISIBLE_STATUSES = ['order_received', 'accepted', 'preparing', 'ready_for_pickup'];

/**
 * GET /restaurant/notifications — Phase 6B. A restaurant is told about an
 * order only once an admin has confirmed the payout, so these rows double as
 * the kitchen's "new order" feed.
 */
restaurantDashboardRouter.get('/notifications', (req, res) => {
  const rows = db
    .prepare(
      'SELECT * FROM restaurant_notifications WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 50',
    )
    .all(req.auth!.restaurantId!) as RestaurantNotificationRow[];
  return ok(
    res,
    rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      title: row.title,
      body: row.body,
      read: row.read === 1,
      createdAt: row.created_at,
    })),
  );
});

// PATCH /restaurant/notifications/read — mark the feed as seen.
restaurantDashboardRouter.patch('/notifications/read', (req, res) => {
  db.prepare('UPDATE restaurant_notifications SET read = 1 WHERE restaurant_id = ?').run(
    req.auth!.restaurantId!,
  );
  return ok(res, { ok: true });
});

// ===========================================================================
// Phase 6C — Restaurant Payment Settings (restaurant manager surface)
// ===========================================================================
// The manager owns the payout identity for their own restaurant only: the
// restaurant id always comes from the session, never from the request body,
// so one manager can't edit another restaurant's UPI.

// GET /restaurant/payment-settings
restaurantDashboardRouter.get('/payment-settings', (req, res) => {
  const row = loadPaymentSettingsRow(req.auth!.restaurantId!);
  if (!row) return fail(res, 'ORDER_001', 'Restaurant not found.');
  return ok(res, mapPaymentSettings(row));
});

// PUT /restaurant/payment-settings — UPI ID, account holder, notes, QR.
// `onlinePaymentsEnabled` is stripped: that switch belongs to the admin.
restaurantDashboardRouter.put('/payment-settings', (req, res) => {
  const parsed = paymentSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid payment settings.');
  }
  const restaurantId = req.auth!.restaurantId!;
  if (!loadPaymentSettingsRow(restaurantId)) return fail(res, 'ORDER_001', 'Restaurant not found.');

  const { onlinePaymentsEnabled: _ignored, ...editable } = parsed.data;
  const row = savePaymentSettings(restaurantId, editable);
  logAudit('restaurant', req.auth!.sub, 'payment_settings.updated', `restaurant=${restaurantId}`);
  return ok(res, mapPaymentSettings(row));
});

// PUT /restaurant/payment-settings/qr — replace or clear just the QR image.
restaurantDashboardRouter.put('/payment-settings/qr', (req, res) => {
  const parsed = z.object({ qrCodeUrl: qrCodeImageSchema }).safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid QR code image.');
  }
  const restaurantId = req.auth!.restaurantId!;
  if (!loadPaymentSettingsRow(restaurantId)) return fail(res, 'ORDER_001', 'Restaurant not found.');
  const row = saveQrCode(restaurantId, parsed.data.qrCodeUrl);
  logAudit(
    'restaurant',
    req.auth!.sub,
    parsed.data.qrCodeUrl ? 'payment_settings.qr_replaced' : 'payment_settings.qr_removed',
    `restaurant=${restaurantId}`,
  );
  return ok(res, mapPaymentSettings(row));
});

// GET /restaurant/orders — incoming orders for the logged-in owner's restaurant.
restaurantDashboardRouter.get('/orders', (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const includeAll = req.query.all === 'true';
  const rows = includeAll
    ? (db
        .prepare('SELECT * FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(restaurantId) as OrderRow[])
    : (db
        .prepare(
          `SELECT * FROM orders WHERE restaurant_id = ? AND status IN (${VISIBLE_STATUSES.map(() => '?').join(', ')}) ORDER BY created_at ASC`,
        )
        .all(restaurantId, ...VISIBLE_STATUSES) as OrderRow[]);

  const result = rows.map((order) => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) as OrderItemRow[];
    return mapOrder(order, items);
  });
  return ok(res, result);
});

function transition(
  req: Request,
  res: Response,
  fromStatuses: string[],
  toStatus: string,
  notification?: { title: string; body: string },
) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as OrderRow | undefined;
  if (!order || order.restaurant_id !== req.auth!.restaurantId) {
    return fail(res, 'ORDER_001', 'Order not found.');
  }
  if (!fromStatuses.includes(order.status)) {
    return fail(res, 'VALIDATION_001', `Cannot move an order from '${order.status}' to '${toStatus}'.`);
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(toStatus, now, order.id);
  if (notification) notifyStudent(order.student_id, notification.title, notification.body);
  pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) as OrderItemRow[];
  return ok(res, mapOrder({ ...order, status: toStatus, updated_at: now }, items));
}

// PATCH /restaurant/orders/:id/accept
restaurantDashboardRouter.patch('/orders/:id/accept', (req, res) =>
  transition(req, res, ['order_received'], 'accepted', {
    title: 'Order accepted',
    body: 'The restaurant has accepted your order.',
  }),
);

const rejectSchema = z.object({ reason: z.string().optional() });

// PATCH /restaurant/orders/:id/reject
restaurantDashboardRouter.patch('/orders/:id/reject', (req, res) => {
  const parsed = rejectSchema.safeParse(req.body ?? {});
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as OrderRow | undefined;
  if (!order || order.restaurant_id !== req.auth!.restaurantId) return fail(res, 'ORDER_001', 'Order not found.');
  if (order.status !== 'order_received') {
    return fail(res, 'VALIDATION_001', 'Only newly received orders can be rejected.');
  }
  const now = new Date().toISOString();
  const reason = parsed.success ? (parsed.data.reason ?? 'Rejected by restaurant.') : 'Rejected by restaurant.';
  db.prepare("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?").run(
    reason,
    now,
    order.id,
  );
  /**
   * Phase 6D — a rejection means the student must get their money back. This
   * used to be a bare UPDATE with no reason, amount or log; it now goes
   * through the one refund engine, which records Refund Initiated / Refund
   * Completed, notifies the student and blocks a second refund.
   */
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id) as
    | PaymentRow
    | undefined;
  if (payment) {
    initiateRefund(payment.id, 'restaurant_rejected', `The restaurant rejected your order: ${reason}`, {
      type: 'system',
    });
  }
  notifyStudent(order.student_id, 'Order rejected', `The restaurant couldn't take your order: ${reason}`);
  logAudit('restaurant', req.auth!.restaurantId ?? null, 'order.rejected', `order ${order.id}: ${reason}`);
  pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) as OrderItemRow[];
  return ok(res, mapOrder({ ...order, status: 'cancelled', updated_at: now }, items));
});

// PATCH /restaurant/orders/:id/preparing
restaurantDashboardRouter.patch('/orders/:id/preparing', (req, res) =>
  transition(req, res, ['accepted'], 'preparing', {
    title: 'Preparing your food',
    body: 'The kitchen has started on your order.',
  }),
);

// PATCH /restaurant/orders/:id/ready
restaurantDashboardRouter.patch('/orders/:id/ready', (req, res) =>
  transition(req, res, ['preparing'], 'ready_for_pickup', {
    title: 'Ready for pickup',
    body: 'Your order is ready and waiting for a delivery partner.',
  }),
);

const statusSchema = z.object({ status: z.enum(['open', 'busy', 'closed']) });

// PATCH /restaurant/status
restaurantDashboardRouter.patch('/status', (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', "status must be 'open', 'busy', or 'closed'.");
  db.prepare('UPDATE restaurants SET status = ? WHERE id = ?').run(parsed.data.status, req.auth!.restaurantId);
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.auth!.restaurantId);
  return ok(res, restaurant);
});

// ---------------------------------------------------------------------------
// Restaurant Menu Management (Version 1 completion, Part 2/3/5).
// Every route below is scoped to req.auth!.restaurantId — a manager can only
// ever see or touch their own restaurant's menu (Part 4 — Security).
// ---------------------------------------------------------------------------

/** Finds an existing category by name (case-insensitive) for this restaurant,
 * or creates one on the fly — menu categories are freeform text from the
 * manager's point of view, not a separate CRUD screen. */
function resolveCategoryId(restaurantId: string, categoryName: string): string {
  const trimmed = categoryName.trim();
  const existing = db
    .prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? AND LOWER(name) = LOWER(?)')
    .get(restaurantId, trimmed) as MenuCategoryRow | undefined;
  if (existing) return existing.id;

  const maxSort = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM menu_categories WHERE restaurant_id = ?')
    .get(restaurantId) as { m: number };
  const id = generateId('cat');
  db.prepare('INSERT INTO menu_categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?)').run(
    id,
    restaurantId,
    trimmed,
    maxSort.m + 1,
  );
  return id;
}

// GET /restaurant/menu — categories + items for the logged-in manager's restaurant.
restaurantDashboardRouter.get('/menu', (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? ORDER BY sort_order, name')
    .all(restaurantId) as MenuCategoryRow[];
  const items = db
    .prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND deleted_at IS NULL ORDER BY name')
    .all(restaurantId) as MenuItemRow[];
  return ok(res, { categories: categories.map(mapMenuCategory), items: items.map(mapMenuItem) });
});

const addMenuItemSchema = z.object({
  name: menuItemNameSchema,
  description: z.string().trim().max(400, 'Description must be under 400 characters.').optional().default(''),
  categoryName: menuCategoryNameSchema,
  price: menuItemPriceSchema,
  isVeg: z.boolean().optional().default(true),
  imageUrl: optionalImageUrlSchema,
  prepTimeMinutes: prepTimeMinutesSchema,
  available: z.boolean().optional().default(true),
});

// POST /restaurant/menu/items — Add Menu Item.
restaurantDashboardRouter.post('/menu/items', (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const parsed = addMenuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid input.');
  }
  const d = parsed.data;

  const duplicate = db
    .prepare('SELECT id FROM menu_items WHERE restaurant_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL')
    .get(restaurantId, d.name);
  if (duplicate) {
    return fail(res, 'VALIDATION_001', `An item named "${d.name}" already exists on this menu.`);
  }

  const categoryId = resolveCategoryId(restaurantId, d.categoryName);
  const id = generateId('itm');
  db.prepare(
    `INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, available, is_veg, image_url, prep_time_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    restaurantId,
    categoryId,
    d.name,
    d.description || null,
    d.price,
    d.available ? 1 : 0,
    d.isVeg ? 1 : 0,
    d.imageUrl,
    d.prepTimeMinutes ?? null,
  );

  logAudit('restaurant', restaurantId, 'menu_item.created', `${d.name} (${id})`);

  const row = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id) as MenuItemRow;
  return created(res, mapMenuItem(row));
});

const editMenuItemSchema = z.object({
  name: menuItemNameSchema.optional(),
  description: z.string().trim().max(400, 'Description must be under 400 characters.').optional(),
  categoryName: menuCategoryNameSchema.optional(),
  price: menuItemPriceSchema.optional(),
  isVeg: z.boolean().optional(),
  imageUrl: z.string().optional(), // '' clears the image; validated manually below
  prepTimeMinutes: z
    .number()
    .int('Preparation time must be a whole number of minutes.')
    .min(1)
    .max(180)
    .nullable()
    .optional(),
  available: z.boolean().optional(),
});

// PATCH /restaurant/menu/items/:id — Edit Item (name, description, category,
// price, image, veg/non-veg, prep time) and Available / Out of Stock toggle.
restaurantDashboardRouter.patch('/menu/items/:id', (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id) as MenuItemRow | undefined;
  if (!item || item.restaurant_id !== restaurantId || item.deleted_at) {
    return fail(res, 'ORDER_001', 'Menu item not found.');
  }

  const parsed = editMenuItemSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid input.');
  }
  const d = parsed.data;
  if (Object.keys(d).length === 0) {
    return fail(res, 'VALIDATION_001', 'No fields to update were provided.');
  }

  if (d.name) {
    const duplicate = db
      .prepare(
        'SELECT id FROM menu_items WHERE restaurant_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL AND id != ?',
      )
      .get(restaurantId, d.name, item.id);
    if (duplicate) {
      return fail(res, 'VALIDATION_001', `An item named "${d.name}" already exists on this menu.`);
    }
  }

  let imageUrlUpdate: string | null | undefined;
  if (d.imageUrl !== undefined) {
    const trimmed = d.imageUrl.trim();
    if (trimmed === '') {
      imageUrlUpdate = null;
    } else {
      const parsedUrl = imageUrlSchema.safeParse(trimmed);
      if (!parsedUrl.success) {
        return fail(res, 'VALIDATION_001', parsedUrl.error.issues[0]?.message ?? 'Invalid image URL.');
      }
      imageUrlUpdate = parsedUrl.data;
    }
  }

  const categoryId = d.categoryName ? resolveCategoryId(restaurantId, d.categoryName) : item.category_id;
  const priceChanged = d.price !== undefined && d.price !== item.price;
  const availabilityChanged = d.available !== undefined && Boolean(item.available) !== d.available;

  db.prepare(
    `UPDATE menu_items SET
       name = ?, description = ?, category_id = ?, price = ?, available = ?, is_veg = ?, image_url = ?, prep_time_minutes = ?
     WHERE id = ?`,
  ).run(
    d.name ?? item.name,
    d.description !== undefined ? d.description || null : item.description,
    categoryId,
    d.price ?? item.price,
    d.available !== undefined ? (d.available ? 1 : 0) : item.available,
    d.isVeg !== undefined ? (d.isVeg ? 1 : 0) : item.is_veg,
    imageUrlUpdate !== undefined ? imageUrlUpdate : item.image_url,
    d.prepTimeMinutes !== undefined ? d.prepTimeMinutes : item.prep_time_minutes,
    item.id,
  );

  if (priceChanged) {
    logAudit('restaurant', restaurantId, 'menu_item.price_changed', `${item.id}: ₹${item.price} -> ₹${d.price}`);
  }
  if (availabilityChanged) {
    logAudit(
      'restaurant',
      restaurantId,
      'menu_item.availability_changed',
      `${item.id}: ${d.available ? 'available' : 'out_of_stock'}`,
    );
  }
  if (!priceChanged && !availabilityChanged) {
    logAudit('restaurant', restaurantId, 'menu_item.updated', item.id);
  }

  const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.id) as MenuItemRow;
  return ok(res, mapMenuItem(updated));
});

// DELETE /restaurant/menu/items/:id — soft delete; keeps historical
// order_items/cart_items rows valid and simply stops the item from
// appearing on the live menu.
restaurantDashboardRouter.delete('/menu/items/:id', (req, res) => {
  const restaurantId = req.auth!.restaurantId!;
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id) as MenuItemRow | undefined;
  if (!item || item.restaurant_id !== restaurantId || item.deleted_at) {
    return fail(res, 'ORDER_001', 'Menu item not found.');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE menu_items SET deleted_at = ?, available = 0 WHERE id = ?').run(now, item.id);
  db.prepare('DELETE FROM cart_items WHERE menu_item_id = ?').run(item.id);
  logAudit('restaurant', restaurantId, 'menu_item.deleted', item.id);
  return ok(res, { id: item.id, deleted: true });
});

// ===========================================================================
// Phase 13 — Shared Delivery QR Verification (restaurant side)
// ===========================================================================

const scanQrSchema = z.object({ payload: z.string().min(1) });

/**
 * POST /restaurant/shared-delivery/scan-qr
 *
 * Accepts a raw QR payload string (as decoded from the student's QR code by
 * the restaurant's scanner).  Each call processes ONE code; the restaurant
 * must call this twice — once for Student A, once for Student B.  The second
 * successful call completes the delivery and invalidates both tokens.
 *
 * Validation gate (both calls):
 *   • Correct restaurant (from session)
 *   • Same match / order / shared-delivery group
 *   • Order status = ready_for_pickup
 *   • QR code not expired
 *   • QR code not already used
 *
 * Return shape:
 *   { scanned: 1, part: 'A'|'B', awaiting: 'second' }  — first of two codes
 *   { verified: true }                                   — both codes scanned
 */
restaurantDashboardRouter.post('/shared-delivery/scan-qr', (req, res) => {
  const restaurantId = req.auth!.restaurantId!;

  const parsed = scanQrSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'payload is required.');

  // Decrypt and validate the QR payload.
  const data = decryptQrPayload(parsed.data.payload);
  if (!data) return fail(res, 'QR_001', 'Invalid or tampered QR code.');

  // Expiry is encoded in the payload itself (belt-and-suspenders with DB).
  if (new Date(data.expiresAt).getTime() < Date.now()) {
    return fail(res, 'QR_002', 'This QR code has expired.');
  }

  // Restaurant must match the authenticated session.
  if (data.restaurantId !== restaurantId) {
    return fail(res, 'QR_003', 'This QR code is for a different restaurant.');
  }

  // Look up token by payload hash for O(1) DB lookup.
  const payloadHash = hashPayload(parsed.data.payload);
  const token = db
    .prepare('SELECT * FROM shared_delivery_qr_tokens WHERE payload_hash = ?')
    .get(payloadHash) as QrTokenRow | undefined;

  if (!token) return fail(res, 'QR_001', 'QR code not recognised. Please try again.');
  if (token.used_at) return fail(res, 'QR_004', 'This QR code has already been used.');

  // Order must be ready for collection.
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(data.orderId) as OrderRow | undefined;
  if (!order || order.restaurant_id !== restaurantId) {
    return fail(res, 'ORDER_001', 'Order not found for this restaurant.');
  }
  if (order.status !== 'ready_for_pickup') {
    return fail(res, 'QR_005', `Order is not ready yet (status: ${order.status}).`);
  }

  const now = new Date().toISOString();

  // Mark this token as scanned (idempotent — already-scanned returns the same
  // "awaiting second" response so the restaurant can retry a failed scan).
  if (!token.scanned_at) {
    db.prepare('UPDATE shared_delivery_qr_tokens SET scanned_at = ? WHERE id = ?').run(now, token.id);
  }

  // Check whether the partner's token has also been scanned.
  const partnerToken = db
    .prepare(
      `SELECT * FROM shared_delivery_qr_tokens
       WHERE match_id = ? AND id != ? AND order_id != ?`,
    )
    .get(data.matchId, token.id, data.orderId) as QrTokenRow | undefined;

  const partnerScanned = partnerToken && (partnerToken.scanned_at || partnerToken.used_at);

  if (!partnerScanned) {
    // First of the two codes — ask for the second.
    return ok(res, {
      scanned: 1,
      part: data.part,
      awaiting: 'second',
      message: `Student ${data.part} verified. Now scan the second student's QR code.`,
    });
  }

  // Both codes scanned — complete the delivery.

  // Guard: partner must not be already used via a previous QR completion.
  if (partnerToken.used_at) {
    return fail(res, 'QR_004', 'Delivery already completed via QR verification.');
  }

  // Validate the partner's order is also ready.
  const partnerOrder = db
    .prepare('SELECT * FROM orders WHERE id = ?')
    .get(partnerToken.order_id) as OrderRow | undefined;
  if (!partnerOrder || partnerOrder.status !== 'ready_for_pickup') {
    return fail(res, 'QR_005', "Partner's order is not ready yet.");
  }

  // Verify both orders belong to the same match + restaurant.
  if (partnerOrder.match_id !== order.match_id || partnerOrder.restaurant_id !== restaurantId) {
    return fail(res, 'QR_006', 'Orders do not belong to the same shared delivery group.');
  }

  // Mark both tokens consumed and both orders delivered.
  db.prepare('UPDATE shared_delivery_qr_tokens SET used_at = ? WHERE id IN (?, ?)').run(
    now,
    token.id,
    partnerToken.id,
  );
  db.prepare("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id IN (?, ?)").run(
    now,
    order.id,
    partnerOrder.id,
  );

  pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });
  pushToStudent(partnerOrder.student_id, { type: 'order_updated', orderId: partnerOrder.id });

  logAudit(
    'restaurant',
    restaurantId,
    'shared_delivery.qr_verified',
    `match ${data.matchId} — orders ${order.id}, ${partnerOrder.id}`,
  );

  return ok(res, { verified: true, message: 'Shared Delivery verified. Hand over both orders.' });
});

// ---------------------------------------------------------------------------

const verifyPairCodeSchema = z.object({
  matchId: z.string().min(1),
  pairCode: z.string().min(1),
});

/**
 * POST /restaurant/shared-delivery/verify-pair-code
 *
 * Manual fallback: restaurant types the full pair code (both halves combined,
 * e.g. "AB3DE").  Completes delivery for both orders in the match.
 *
 * This route deliberately mirrors all the same safety checks as scan-qr.
 */
restaurantDashboardRouter.post('/shared-delivery/verify-pair-code', (req, res) => {
  const restaurantId = req.auth!.restaurantId!;

  const parsed = verifyPairCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'matchId and pairCode are required.');
  }

  const { matchId, pairCode } = parsed.data;

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
  if (!match) return fail(res, 'MATCH_001', 'Match not found.');
  if (match.restaurant_id !== restaurantId) return fail(res, 'MATCH_001', 'Match not found for this restaurant.');

  if (pairCode.trim().toUpperCase() !== match.pair_code.toUpperCase()) {
    return fail(res, 'QR_007', 'Pair code is incorrect.');
  }

  // Both orders must be ready for pickup.
  const orders = db
    .prepare("SELECT * FROM orders WHERE match_id = ? AND status = 'ready_for_pickup'")
    .all(matchId) as OrderRow[];
  if (orders.length < 2) {
    return fail(res, 'QR_005', 'Both orders must be ready for pickup before verifying.');
  }

  const now = new Date().toISOString();
  for (const o of orders) {
    db.prepare("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ?").run(now, o.id);
    pushToStudent(o.student_id, { type: 'order_updated', orderId: o.id });
  }

  logAudit(
    'restaurant',
    restaurantId,
    'shared_delivery.pair_code_verified',
    `match ${matchId} — manual code entry`,
  );

  return ok(res, { verified: true, message: 'Shared Delivery verified. Hand over both orders.' });
});
