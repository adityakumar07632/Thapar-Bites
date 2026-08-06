import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type {
  AdminRow,
  OrderItemRow,
  OrderRow,
  PaymentRow,
  RestaurantOwnerRow,
  RestaurantRow,
  StudentRow,
} from '../../db/rows';
import { requireAuth, hashPassword } from '../../lib/auth';
import { ok, created, fail } from '../../lib/response';
import { mapOrder, mapPayment, mapRestaurant, mapRestaurantOwner, mapStudent } from '../../lib/mappers';
import {
  cancelOrderForPayment,
  confirmRestaurantTransfer,
  markTransferFailed,
  refundStudentPayment,
  restaurantClosedReason,
  retryRefund,
  retryRestaurantTransfer,
} from '../payments/payouts';
import { listPaymentLogs } from '../../lib/paymentLog';
import { connectionStats } from '../../lib/eventBus';
import { generateId, generateTempPassword } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { phoneSchema, qrCodeImageSchema, timeOfDaySchema } from '../../lib/validation';
import {
  loadPlatformPaymentSettings,
  platformPaymentSettingsSchema,
  savePlatformPaymentSettings,
  savePlatformQrCode,
} from '../../lib/platformPaymentSettings';
import {
  loadPaymentSettingsRow,
  mapPaymentSettings,
  paymentSettingsSchema,
  savePaymentSettings,
  saveQrCode,
  setOnlinePaymentsEnabled,
} from '../../lib/paymentSettings';
import { queueStatistics } from '../sharedDelivery/queueMetrics';

export const adminRouter = Router();
adminRouter.use(requireAuth('admin'));

function loadRestaurantOrFail(id: string, res: Response) {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id) as RestaurantRow | undefined;
  if (!restaurant) {
    fail(res, 'ORDER_001', 'Restaurant not found.');
    return null;
  }
  return restaurant;
}

// GET /admin/dashboard — platform-wide summary stats.
adminRouter.get('/dashboard', (_req, res) => {
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM students) as students,
         -- Phase 2 bug fix (AUDIT §4.3): soft-deleted restaurants were still
         -- counted here, so the admin dashboard disagreed with the restaurants
         -- list (which already filters them out).
         (SELECT COUNT(*) FROM restaurants WHERE deleted_at IS NULL) as restaurants,
         (SELECT COUNT(*) FROM orders) as orders,
         (SELECT COUNT(*) FROM orders WHERE delivery_type = 'shared') as sharedOrders,
         (SELECT COUNT(*) FROM orders WHERE status = 'completed') as completedOrders,
         (SELECT COUNT(*) FROM orders WHERE status = 'cancelled') as cancelledOrders,
         (SELECT COALESCE(SUM(subtotal + convenience_fee), 0) FROM orders WHERE status NOT IN ('cancelled','payment_expired')) as gmv
      `,
    )
    .get();

  const activeQueue = db
    .prepare("SELECT COUNT(*) as n FROM shared_delivery_queue WHERE status = 'waiting'")
    .get() as { n: number };

  const recentAudit = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10').all();

  return ok(res, { totals, activeQueueSize: activeQueue.n, recentAudit, liveConnections: connectionStats() });
});

// GET /admin/shared-delivery — Phase 4 queue monitor. Read-only view over the
// rows the matching engine already maintains: who is waiting right now, which
// matches are live, and how the queue is performing overall.
adminRouter.get('/shared-delivery', (_req, res) => {
  const now = Date.now();

  const queue = db
    .prepare(
      `SELECT q.id, q.student_id, q.restaurant_id, q.hostel, q.subtotal, q.joined_at, q.expires_at,
              s.full_name AS student_name, s.roll_number, r.name AS restaurant_name
         FROM shared_delivery_queue q
         JOIN students s ON s.id = q.student_id
         JOIN restaurants r ON r.id = q.restaurant_id
        WHERE q.status = 'waiting'
        ORDER BY q.joined_at ASC`,
    )
    .all() as {
    id: string;
    student_id: string;
    restaurant_id: string;
    hostel: string;
    subtotal: number;
    joined_at: string;
    expires_at: string;
    student_name: string;
    roll_number: string;
    restaurant_name: string;
  }[];

  const seenGroup = new Map<string, number>();
  const activeQueue = queue.map((row) => {
    const key = `${row.restaurant_id}|${row.hostel}`;
    const position = (seenGroup.get(key) ?? 0) + 1;
    seenGroup.set(key, position);
    return {
      id: row.id,
      studentId: row.student_id,
      studentName: row.student_name,
      rollNumber: row.roll_number,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      hostel: row.hostel,
      subtotal: row.subtotal,
      joinedAt: row.joined_at,
      expiresAt: row.expires_at,
      waitingMs: Math.max(0, now - new Date(row.joined_at).getTime()),
      position,
    };
  });

  const matches = db
    .prepare(
      `SELECT m.id, m.restaurant_id, m.status, m.pair_code, m.payment_deadline, m.created_at,
              r.name AS restaurant_name,
              a.full_name AS student_a_name, b.full_name AS student_b_name, a.hostel AS hostel
         FROM matches m
         JOIN restaurants r ON r.id = m.restaurant_id
         JOIN students a ON a.id = m.student_a
         JOIN students b ON b.id = m.student_b
        WHERE m.status IN ('pending_payment', 'confirmed')
        ORDER BY m.created_at DESC
        LIMIT 50`,
    )
    .all() as {
    id: string;
    restaurant_id: string;
    status: string;
    pair_code: string;
    payment_deadline: string;
    created_at: string;
    restaurant_name: string;
    student_a_name: string;
    student_b_name: string;
    hostel: string;
  }[];

  const activeMatches = matches.map((m) => {
    const orders = db
      .prepare('SELECT id, status, subtotal, convenience_fee FROM orders WHERE match_id = ?')
      .all(m.id) as { id: string; status: string; subtotal: number; convenience_fee: number }[];
    return {
      id: m.id,
      restaurantId: m.restaurant_id,
      restaurantName: m.restaurant_name,
      hostel: m.hostel,
      status: m.status,
      pairCode: m.pair_code,
      paymentDeadline: m.payment_deadline,
      createdAt: m.created_at,
      students: [m.student_a_name, m.student_b_name],
      orders,
      combinedValue: orders.reduce((sum, o) => sum + o.subtotal + o.convenience_fee, 0),
    };
  });

  return ok(res, { stats: queueStatistics(now), activeQueue, activeMatches });
});

// GET /admin/restaurants?includeDeleted=true
adminRouter.get('/restaurants', (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const rows = (
    includeDeleted
      ? db.prepare('SELECT * FROM restaurants')
      : db.prepare('SELECT * FROM restaurants WHERE deleted_at IS NULL')
  ).all() as RestaurantRow[];

  const withCounts = rows.map((r) => {
    const orderCount = db
      .prepare("SELECT COUNT(*) as n FROM orders WHERE restaurant_id = ?")
      .get(r.id) as { n: number };
    const manager = db.prepare('SELECT * FROM restaurant_owners WHERE restaurant_id = ?').get(r.id) as
      | RestaurantOwnerRow
      | undefined;
    return { ...mapRestaurant(r), orderCount: orderCount.n, manager: manager ? mapRestaurantOwner(manager) : null };
  });
  return ok(res, withCounts);
});

// GET /admin/restaurants/:id — single restaurant with manager details, for the Edit form.
adminRouter.get('/restaurants/:id', (req, res) => {
  const restaurant = loadRestaurantOrFail(req.params.id, res);
  if (!restaurant) return;
  const manager = db.prepare('SELECT * FROM restaurant_owners WHERE restaurant_id = ?').get(restaurant.id) as
    | RestaurantOwnerRow
    | undefined;
  return ok(res, { ...mapRestaurant(restaurant), manager: manager ? mapRestaurantOwner(manager) : null });
});

const createRestaurantSchema = z.object({
  name: z.string().trim().min(2, 'Restaurant name must be at least 2 characters.'),
  category: z.string().trim().min(2, 'Category is required.'),
  description: z.string().trim().min(1, 'Description is required.'),
  contactNumber: phoneSchema,
  email: z.string().trim().email('A valid restaurant email is required.'),
  location: z.string().trim().min(2, 'Location is required.'),
  openingTime: timeOfDaySchema,
  closingTime: timeOfDaySchema,
  minimumOrder: z.number().int().positive('Minimum order value must be greater than ₹0.'),
  sharedDeliveryMinimum: z.number().int().positive('Shared delivery minimum must be greater than ₹0.'),
  deliveryFee: z.number().int().min(0, 'Delivery fee cannot be negative.'),
  managerName: z.string().trim().min(2, 'Manager name must be at least 2 characters.'),
  managerEmail: z.string().trim().email('A valid manager email is required.'),
  tempPassword: z.string().min(6, 'Temporary password must be at least 6 characters.').optional(),
});

// POST /admin/restaurants — Add Restaurant + auto-create its Manager account.
adminRouter.post('/restaurants', (req, res) => {
  const parsed = createRestaurantSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid input.');
  }
  const data = parsed.data;

  const emailTaken = db
    .prepare('SELECT id FROM restaurant_owners WHERE email = ?')
    .get(data.managerEmail);
  if (emailTaken) {
    return fail(res, 'VALIDATION_001', 'A restaurant manager account with this email already exists.');
  }

  const restaurantId = generateId('res');
  const ownerId = generateId('owner');
  const tempPassword = data.tempPassword ?? generateTempPassword();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO restaurants
         (id, name, description, cuisine, minimum_order, shared_delivery_minimum, status, eta_minutes, rating,
          contact_number, email, location, opening_time, closing_time, delivery_fee, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 'open', 20, NULL, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      restaurantId,
      data.name,
      data.description,
      data.category,
      data.minimumOrder,
      data.sharedDeliveryMinimum,
      data.contactNumber,
      data.email,
      data.location,
      data.openingTime,
      data.closingTime,
      data.deliveryFee,
    );

    db.prepare(
      'INSERT INTO restaurant_owners (id, full_name, email, password_hash, restaurant_id) VALUES (?, ?, ?, ?, ?)',
    ).run(ownerId, data.managerName, data.managerEmail, hashPassword(tempPassword), restaurantId);
  });
  tx();

  logAudit('admin', req.auth!.sub, 'restaurant.created', `${data.name} (${restaurantId})`);

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId) as RestaurantRow;
  return created(res, {
    restaurant: mapRestaurant(restaurant),
    manager: { id: ownerId, fullName: data.managerName, email: data.managerEmail, restaurantId, tempPassword },
  });
});

const editRestaurantSchema = z.object({
  name: z.string().trim().min(2).optional(),
  contactNumber: phoneSchema.optional(),
  email: z.string().trim().email().optional(),
  openingTime: timeOfDaySchema.optional(),
  closingTime: timeOfDaySchema.optional(),
  deliveryFee: z.number().int().min(0).optional(),
  minimumOrder: z.number().int().positive().optional(),
  sharedDeliveryMinimum: z.number().int().positive().optional(),
  description: z.string().trim().min(1).optional(),
  status: z.enum(['open', 'busy', 'closed']).optional(),
});

// ===========================================================================
// Phase 6C — Restaurant Payment Settings (admin surface)
// ===========================================================================
// Everything the manager can do, plus the enable/disable switch. Declared
// before PATCH /restaurants/:id so the more specific paths win.

// ===========================================================================
// Platform Payment Settings — Thapar Bites' own UPI/QR identity.
// Students ALWAYS pay Thapar Bites; these are the details shown at checkout.
// ===========================================================================

// GET /admin/platform-payment-settings
adminRouter.get('/platform-payment-settings', (_req, res) => {
  return ok(res, loadPlatformPaymentSettings());
});

// PUT /admin/platform-payment-settings
adminRouter.put('/platform-payment-settings', (req, res) => {
  const parsed = platformPaymentSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid platform payment settings.');
  }
  const settings = savePlatformPaymentSettings(parsed.data);
  logAudit('admin', req.auth!.sub, 'platform_payment_settings.updated', 'platform');
  return ok(res, settings);
});

// PUT /admin/platform-payment-settings/qr — replace or clear the QR image.
adminRouter.put('/platform-payment-settings/qr', (req, res) => {
  const parsed = z.object({ qrCodeUrl: qrCodeImageSchema }).safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid QR code image.');
  }
  const settings = savePlatformQrCode(parsed.data.qrCodeUrl);
  logAudit(
    'admin',
    req.auth!.sub,
    parsed.data.qrCodeUrl ? 'platform_payment_settings.qr_replaced' : 'platform_payment_settings.qr_removed',
    'platform',
  );
  return ok(res, settings);
});

// GET /admin/restaurants/:id/payment-settings
adminRouter.get('/restaurants/:id/payment-settings', (req, res) => {
  const row = loadPaymentSettingsRow(req.params.id);
  if (!row) return fail(res, 'ORDER_001', 'Restaurant not found.');
  return ok(res, mapPaymentSettings(row));
});

// PUT /admin/restaurants/:id/payment-settings
adminRouter.put('/restaurants/:id/payment-settings', (req, res) => {
  const parsed = paymentSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid payment settings.');
  }
  if (!loadPaymentSettingsRow(req.params.id)) return fail(res, 'ORDER_001', 'Restaurant not found.');
  const row = savePaymentSettings(req.params.id, parsed.data);
  logAudit('admin', req.auth!.sub, 'payment_settings.updated', `restaurant=${req.params.id}`);
  return ok(res, mapPaymentSettings(row));
});

// PUT /admin/restaurants/:id/payment-settings/qr — replace the QR code.
adminRouter.put('/restaurants/:id/payment-settings/qr', (req, res) => {
  const parsed = z.object({ qrCodeUrl: qrCodeImageSchema }).safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid QR code image.');
  }
  if (!loadPaymentSettingsRow(req.params.id)) return fail(res, 'ORDER_001', 'Restaurant not found.');
  const row = saveQrCode(req.params.id, parsed.data.qrCodeUrl);
  logAudit(
    'admin',
    req.auth!.sub,
    parsed.data.qrCodeUrl ? 'payment_settings.qr_replaced' : 'payment_settings.qr_removed',
    `restaurant=${req.params.id}`,
  );
  return ok(res, mapPaymentSettings(row));
});

// PATCH /admin/restaurants/:id/payment-settings/toggle — enable/disable the
// restaurant's online payments. Existing orders are untouched; this only
// controls whether students are shown the payment details.
adminRouter.patch('/restaurants/:id/payment-settings/toggle', (req, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'enabled must be true or false.');
  if (!loadPaymentSettingsRow(req.params.id)) return fail(res, 'ORDER_001', 'Restaurant not found.');
  const row = setOnlinePaymentsEnabled(req.params.id, parsed.data.enabled);
  logAudit(
    'admin',
    req.auth!.sub,
    parsed.data.enabled ? 'payment_settings.enabled' : 'payment_settings.disabled',
    `restaurant=${req.params.id}`,
  );
  return ok(res, mapPaymentSettings(row));
});

// PATCH /admin/restaurants/:id — Edit Restaurant.
adminRouter.patch('/restaurants/:id', (req, res) => {
  const restaurant = loadRestaurantOrFail(req.params.id, res);
  if (!restaurant) return;

  const parsed = editRestaurantSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid input.');
  }
  const d = parsed.data;
  if (Object.keys(d).length === 0) {
    return fail(res, 'VALIDATION_001', 'No fields to update were provided.');
  }

  db.prepare(
    `UPDATE restaurants SET
       name = COALESCE(?, name),
       contact_number = COALESCE(?, contact_number),
       email = COALESCE(?, email),
       opening_time = COALESCE(?, opening_time),
       closing_time = COALESCE(?, closing_time),
       delivery_fee = COALESCE(?, delivery_fee),
       minimum_order = COALESCE(?, minimum_order),
       shared_delivery_minimum = COALESCE(?, shared_delivery_minimum),
       description = COALESCE(?, description),
       status = COALESCE(?, status)
     WHERE id = ?`,
  ).run(
    d.name ?? null,
    d.contactNumber ?? null,
    d.email ?? null,
    d.openingTime ?? null,
    d.closingTime ?? null,
    d.deliveryFee ?? null,
    d.minimumOrder ?? null,
    d.sharedDeliveryMinimum ?? null,
    d.description ?? null,
    d.status ?? null,
    restaurant.id,
  );

  logAudit('admin', req.auth!.sub, 'restaurant.updated', `${restaurant.id}: ${JSON.stringify(d)}`);

  const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurant.id) as RestaurantRow;
  return ok(res, mapRestaurant(updated));
});

// PATCH /admin/restaurants/:id/enable
adminRouter.patch('/restaurants/:id/enable', (req, res) => {
  const restaurant = loadRestaurantOrFail(req.params.id, res);
  if (!restaurant) return;
  if (restaurant.deleted_at) return fail(res, 'VALIDATION_001', 'A deleted restaurant cannot be enabled.');

  db.prepare('UPDATE restaurants SET is_active = 1 WHERE id = ?').run(restaurant.id);
  logAudit('admin', req.auth!.sub, 'restaurant.enabled', restaurant.id);

  const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurant.id) as RestaurantRow;
  return ok(res, mapRestaurant(updated));
});

// PATCH /admin/restaurants/:id/disable — disabled restaurants can't take new
// orders (enforced in cart/checkout/shared-delivery), stay visible to
// Admin, and are surfaced to students as unavailable.
adminRouter.patch('/restaurants/:id/disable', (req, res) => {
  const restaurant = loadRestaurantOrFail(req.params.id, res);
  if (!restaurant) return;

  db.prepare('UPDATE restaurants SET is_active = 0 WHERE id = ?').run(restaurant.id);
  logAudit('admin', req.auth!.sub, 'restaurant.disabled', restaurant.id);

  const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurant.id) as RestaurantRow;
  return ok(res, mapRestaurant(updated));
});

// DELETE /admin/restaurants/:id — soft delete only; data is never purged.
adminRouter.delete('/restaurants/:id', (req, res) => {
  const restaurant = loadRestaurantOrFail(req.params.id, res);
  if (!restaurant) return;
  if (restaurant.deleted_at) return fail(res, 'VALIDATION_001', 'This restaurant has already been deleted.');

  const now = new Date().toISOString();
  db.prepare('UPDATE restaurants SET deleted_at = ?, is_active = 0 WHERE id = ?').run(now, restaurant.id);
  logAudit('admin', req.auth!.sub, 'restaurant.deleted', restaurant.id);

  const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurant.id) as RestaurantRow;
  return ok(res, mapRestaurant(updated));
});

// POST /admin/restaurants/:id/reset-password — generates and sets a new
// temporary password for the Restaurant Manager account.
adminRouter.post('/restaurants/:id/reset-password', (req, res) => {
  const restaurant = loadRestaurantOrFail(req.params.id, res);
  if (!restaurant) return;

  const manager = db.prepare('SELECT * FROM restaurant_owners WHERE restaurant_id = ?').get(restaurant.id) as
    | RestaurantOwnerRow
    | undefined;
  if (!manager) return fail(res, 'ORDER_001', 'This restaurant has no manager account to reset.');

  const tempPassword = generateTempPassword();
  db.prepare('UPDATE restaurant_owners SET password_hash = ? WHERE id = ?').run(hashPassword(tempPassword), manager.id);
  logAudit('admin', req.auth!.sub, 'restaurant_manager.password_reset', `${restaurant.id} / ${manager.email}`);

  return ok(res, { managerEmail: manager.email, tempPassword });
});

// GET /admin/students
adminRouter.get('/students', (_req, res) => {
  const rows = db.prepare('SELECT * FROM students ORDER BY reliability_score ASC').all() as StudentRow[];
  return ok(res, rows.map(mapStudent));
});

// GET /admin/orders
adminRouter.get('/orders', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit) as OrderRow[];
  const result = rows.map((order) => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) as OrderItemRow[];
    return mapOrder(order, items);
  });
  return ok(res, result);
});

// GET /admin/audit
adminRouter.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  return ok(res, rows);
});

/**
 * Phase 6A — payment ledger. Thapar Bites is the intermediary, so Ops needs
 * to see both legs of every payment: what the student paid us, and whether we
 * have paid the restaurant yet.
 */
adminRouter.get('/payments', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const rows = db
    .prepare(
      `SELECT p.*, s.full_name AS student_name, r.name AS restaurant_name, o.status AS order_status,
              o.delivery_type AS delivery_type
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN students s ON s.id = COALESCE(p.student_id, o.student_id)
         LEFT JOIN restaurants r ON r.id = COALESCE(p.restaurant_id, o.restaurant_id)
        ORDER BY COALESCE(p.paid_at, p.created_at, o.created_at) DESC
        LIMIT ?`,
    )
    .all(limit) as (PaymentRow & {
    student_name: string | null;
    restaurant_name: string | null;
    order_status: string;
    delivery_type: string;
  })[];

  const payments = rows.map((row) => ({
    ...mapPayment(row),
    studentName: row.student_name,
    restaurantName: row.restaurant_name,
    orderStatus: row.order_status,
    deliveryType: row.delivery_type,
  }));

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'successful' THEN amount ELSE 0 END), 0) AS collected,
         COALESCE(SUM(CASE WHEN status = 'successful' AND transfer_status = 'confirmed' THEN amount ELSE 0 END), 0) AS transferred,
         COALESCE(SUM(CASE WHEN status = 'successful' AND transfer_status != 'confirmed' THEN amount ELSE 0 END), 0) AS heldForRestaurants,
         COUNT(CASE WHEN status = 'successful' AND transfer_status = 'pending' THEN 1 END) AS pendingTransfers
       FROM payments`,
    )
    .get();

  return ok(res, { payments, totals });
});

/**
 * ==========================================================================
 * Phase 6B — Admin Payout Management
 * ==========================================================================
 * Thapar Bites holds the student's money. A restaurant only ever receives an
 * order when an admin confirms the payout here, so these endpoints are the
 * single gate between "student paid us" and "kitchen is cooking".
 */

interface PendingPayoutRow extends PaymentRow {
  student_name: string | null;
  student_roll: string | null;
  restaurant_name: string | null;
  restaurant_upi: string | null;
  order_status: string;
  delivery_type: string;
  order_created_at: string;
}

function mapPendingPayout(row: PendingPayoutRow) {
  return {
    ...mapPayment(row),
    orderId: row.order_id,
    studentName: row.student_name,
    studentRoll: row.student_roll,
    restaurantName: row.restaurant_name,
    restaurantUpi: row.restaurant_upi,
    orderStatus: row.order_status,
    deliveryType: row.delivery_type,
    // "Payment Time" on the screen = when the student's money reached us.
    paymentTime: row.paid_at ?? row.created_at ?? row.order_created_at,
  };
}

/**
 * GET /admin/payouts/pending — the Pending Restaurant Payments queue: every
 * payment where Thapar Bites has the money but the restaurant has not been
 * paid yet (including failed attempts awaiting a retry).
 */
adminRouter.get('/payouts/pending', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, s.full_name AS student_name, s.roll_number AS student_roll,
              r.name AS restaurant_name, r.upi_id AS restaurant_upi,
              o.status AS order_status, o.delivery_type AS delivery_type, o.created_at AS order_created_at
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN students s ON s.id = COALESCE(p.student_id, o.student_id)
         LEFT JOIN restaurants r ON r.id = COALESCE(p.restaurant_id, o.restaurant_id)
        WHERE p.status = 'successful'
          AND p.transfer_status IN ('pending', 'failed', 'not_started')
          AND o.status NOT IN ('cancelled', 'payment_expired', 'completed')
        ORDER BY COALESCE(p.paid_at, p.created_at, o.created_at) ASC`,
    )
    .all() as PendingPayoutRow[];

  return ok(res, rows.map(mapPendingPayout));
});

/**
 * GET /admin/payouts/analytics — payout health at a glance.
 * Today's revenue is what students actually paid Thapar Bites today.
 */
adminRouter.get('/payouts/analytics', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const stats = db
    .prepare(
      `SELECT
         COUNT(CASE WHEN status = 'successful' AND transfer_status IN ('pending','not_started') THEN 1 END) AS pendingTransfers,
         COALESCE(SUM(CASE WHEN status = 'successful' AND transfer_status IN ('pending','not_started') THEN amount ELSE 0 END), 0) AS pendingAmount,
         COUNT(CASE WHEN transfer_status = 'confirmed' THEN 1 END) AS completedTransfers,
         COALESCE(SUM(CASE WHEN transfer_status = 'confirmed' THEN amount ELSE 0 END), 0) AS completedAmount,
         COUNT(CASE WHEN transfer_status = 'failed' THEN 1 END) AS failedTransfers,
         COALESCE(SUM(CASE WHEN transfer_status = 'failed' THEN amount ELSE 0 END), 0) AS failedAmount,
         COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refundedPayments,
         COALESCE(SUM(CASE WHEN status = 'successful' AND DATE(COALESCE(paid_at, created_at)) = ? THEN amount ELSE 0 END), 0) AS todayRevenue,
         COUNT(CASE WHEN status = 'successful' AND DATE(COALESCE(paid_at, created_at)) = ? THEN 1 END) AS todayPayments
       FROM payments`,
    )
    .get(today, today);

  return ok(res, stats);
});

/** GET /admin/payouts/logs — who confirmed what, and when. */
adminRouter.get('/payouts/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const rows = listPaymentLogs(limit);
  return ok(
    res,
    rows.map((row) => ({
      id: row.id,
      paymentId: row.payment_id,
      orderId: row.order_id,
      action: row.action,
      transferStatus: row.transfer_status,
      amount: row.amount,
      actorType: row.actor_type,
      actorId: row.actor_id,
      actorName: row.actor_name,
      studentName: row.student_name,
      restaurantName: row.restaurant_name,
      note: row.note,
      createdAt: row.created_at,
    })),
  );
});

function loadPayoutOrFail(id: string, res: Response) {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as PaymentRow | undefined;
  if (!payment) {
    fail(res, 'ORDER_001', 'Payment not found.');
    return null;
  }
  return payment;
}

/**
 * PATCH /admin/payments/:id/confirm-transfer — settle the Thapar Bites ->
 * restaurant leg. This is the ONLY way an order reaches a kitchen, and it can
 * only happen once the student's payment succeeded.
 */
adminRouter.patch('/payments/:id/confirm-transfer', (req, res) => {
  const payment = loadPayoutOrFail(req.params.id, res);
  if (!payment) return;
  if (payment.status !== 'successful') {
    return fail(res, 'PAYMENT_001', 'The student payment has not succeeded yet, so it cannot be transferred.');
  }
  if (payment.transfer_status === 'confirmed') {
    return fail(res, 'VALIDATION_001', 'This transfer has already been confirmed.');
  }
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(payment.order_id) as
    | { status: string }
    | undefined;
  if (order && ['cancelled', 'payment_expired'].includes(order.status)) {
    return fail(res, 'VALIDATION_001', 'This order is cancelled and cannot be paid onward to the restaurant.');
  }
  // Phase 6D — a refunded (or refunding) payment can never be transferred: the
  // money has already gone back to the student.
  if (payment.refund_status === 'pending' || payment.refund_status === 'completed') {
    return fail(res, 'VALIDATION_001', 'This payment has been refunded and cannot be transferred.');
  }
  // Phase 6D — a closed restaurant cannot fulfil the order, so releasing it
  // would strand the student. Refund instead of transferring.
  const closed = restaurantClosedReason(payment.restaurant_id);
  if (closed) {
    return fail(res, 'VALIDATION_001', `${closed} Refund the student instead.`);
  }

  const result = confirmRestaurantTransfer(payment.id, 'admin', req.auth!.sub);
  return ok(res, { payment: mapPayment(result.payment), orderReleased: result.released });
});

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(200).optional() });

/** PATCH /admin/payments/:id/retry-transfer — requeue a failed payout. */
adminRouter.patch('/payments/:id/retry-transfer', (req, res) => {
  const payment = loadPayoutOrFail(req.params.id, res);
  if (!payment) return;
  if (payment.status !== 'successful') {
    return fail(res, 'PAYMENT_001', 'Only a successful student payment can be transferred.');
  }
  if (payment.transfer_status === 'confirmed') {
    return fail(res, 'VALIDATION_001', 'This transfer has already been confirmed.');
  }
  if (payment.refund_status === 'pending' || payment.refund_status === 'completed') {
    return fail(res, 'VALIDATION_001', 'This payment has been refunded and cannot be transferred.');
  }
  if (payment.transfer_status !== 'failed') {
    return fail(res, 'VALIDATION_001', 'Only a failed transfer can be retried.');
  }
  const updated = retryRestaurantTransfer(payment.id, { type: 'admin', id: req.auth!.sub });
  return ok(res, { payment: mapPayment(updated) });
});

/** PATCH /admin/payments/:id/mark-failed — record a failed payout attempt. */
adminRouter.patch('/payments/:id/mark-failed', (req, res) => {
  const parsed = reasonSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'Provide a short reason (3-200 characters).');
  const payment = loadPayoutOrFail(req.params.id, res);
  if (!payment) return;
  if (payment.transfer_status === 'confirmed') {
    return fail(res, 'VALIDATION_001', 'This transfer has already been confirmed.');
  }
  const updated = markTransferFailed(
    payment.id,
    parsed.data.reason ?? 'Transfer to the restaurant failed.',
    { type: 'admin', id: req.auth!.sub },
  );
  return ok(res, { payment: mapPayment(updated) });
});

/**
 * PATCH /admin/payments/:id/refund — return the student's money. The order is
 * cancelled with it, because a refunded order must never reach a kitchen.
 */
adminRouter.patch('/payments/:id/refund', (req, res) => {
  const parsed = reasonSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'Provide a short reason (3-200 characters).');
  const payment = loadPayoutOrFail(req.params.id, res);
  if (!payment) return;
  if (payment.status === 'refunded') return fail(res, 'VALIDATION_001', 'This payment is already refunded.');
  if (payment.status !== 'successful') {
    return fail(res, 'PAYMENT_001', 'Only a successful payment can be refunded.');
  }
  if (payment.transfer_status === 'confirmed') {
    return fail(res, 'VALIDATION_001', 'The restaurant has already been paid; refund this order manually.');
  }

  const result = refundStudentPayment(
    payment.id,
    { type: 'admin', id: req.auth!.sub },
    parsed.data.reason ?? 'Refunded by Thapar Bites admin.',
  );
  if (!result.ok) return fail(res, 'VALIDATION_001', result.error ?? 'This refund could not be processed.');
  return ok(res, { payment: mapPayment(result.payment), orderStatus: result.order?.status ?? null });
});

/** PATCH /admin/payments/:id/cancel-order — cancel an order that has not been released. */
adminRouter.patch('/payments/:id/cancel-order', (req, res) => {
  const parsed = reasonSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 'VALIDATION_001', 'Provide a short reason (3-200 characters).');
  const payment = loadPayoutOrFail(req.params.id, res);
  if (!payment) return;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id) as OrderRow | undefined;
  if (!order) return fail(res, 'ORDER_001', 'Order not found.');
  if (order.status === 'cancelled') return fail(res, 'VALIDATION_001', 'This order is already cancelled.');
  if (payment.transfer_status === 'confirmed') {
    return fail(res, 'VALIDATION_001', 'The restaurant has already received this order; cancel it from Orders.');
  }

  const result = cancelOrderForPayment(
    payment.id,
    { type: 'admin', id: req.auth!.sub },
    parsed.data.reason ?? 'Cancelled by Thapar Bites admin.',
  );
  return ok(res, {
    payment: mapPayment(result.payment),
    orderStatus: result.order?.status ?? null,
    // Phase 6D — cancelling before the payout automatically returns the money.
    refunded: result.refunded,
  });
});

/**
 * ==========================================================================
 * Phase 6D — Admin Refund Dashboard
 * ==========================================================================
 * Every refund Thapar Bites has ever started, grouped by where it got to:
 * Pending (money on its way back), Successful (student has it) and Failed
 * (needs a human). Reads only — refunds are created by the refund engine.
 */

interface RefundRow extends PaymentRow {
  student_name: string | null;
  student_roll: string | null;
  restaurant_name: string | null;
  order_status: string;
}

function mapRefund(row: RefundRow) {
  return {
    ...mapPayment(row),
    orderId: row.order_id,
    studentName: row.student_name,
    studentRoll: row.student_roll,
    restaurantName: row.restaurant_name,
    orderStatus: row.order_status,
    refundStatus: row.refund_status,
    refundReason: row.refund_reason,
    refundAmount: row.refund_amount ?? row.amount,
    refundTrigger: row.refund_trigger,
    refundTime: row.refund_completed_at ?? row.refund_initiated_at,
    refundInitiatedAt: row.refund_initiated_at,
    refundCompletedAt: row.refund_completed_at,
    refundFailureReason: row.refund_failure_reason,
  };
}

const REFUND_TABS = { pending: 'pending', successful: 'completed', failed: 'failed' } as const;

/** GET /admin/refunds?status=pending|successful|failed (default: all). */
adminRouter.get('/refunds', (req, res) => {
  const tab = String(req.query.status ?? 'all');
  const mapped = REFUND_TABS[tab as keyof typeof REFUND_TABS];
  const where = mapped ? "p.refund_status = ?" : "p.refund_status != 'none'";
  const params = mapped ? [mapped] : [];

  const rows = db
    .prepare(
      `SELECT p.*, s.full_name AS student_name, s.roll_number AS student_roll,
              r.name AS restaurant_name, o.status AS order_status
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN students s ON s.id = COALESCE(p.student_id, o.student_id)
         LEFT JOIN restaurants r ON r.id = COALESCE(p.restaurant_id, o.restaurant_id)
        WHERE ${where}
        ORDER BY COALESCE(p.refund_completed_at, p.refund_initiated_at) DESC
        LIMIT 200`,
    )
    .all(...params) as RefundRow[];

  const summary = db
    .prepare(
      `SELECT
         COUNT(CASE WHEN refund_status = 'pending' THEN 1 END) AS pendingCount,
         COALESCE(SUM(CASE WHEN refund_status = 'pending' THEN COALESCE(refund_amount, amount) ELSE 0 END), 0) AS pendingAmount,
         COUNT(CASE WHEN refund_status = 'completed' THEN 1 END) AS successfulCount,
         COALESCE(SUM(CASE WHEN refund_status = 'completed' THEN COALESCE(refund_amount, amount) ELSE 0 END), 0) AS successfulAmount,
         COUNT(CASE WHEN refund_status = 'failed' THEN 1 END) AS failedCount,
         COALESCE(SUM(CASE WHEN refund_status = 'failed' THEN COALESCE(refund_amount, amount) ELSE 0 END), 0) AS failedAmount
       FROM payments`,
    )
    .get();

  return ok(res, { refunds: rows.map(mapRefund), summary });
});

/** PATCH /admin/refunds/:id/retry — re-run a refund that failed. */
adminRouter.patch('/refunds/:id/retry', (req, res) => {
  const payment = loadPayoutOrFail(req.params.id, res);
  if (!payment) return;
  const result = retryRefund(payment.id, { type: 'admin', id: req.auth!.sub });
  if (!result.ok) return fail(res, 'VALIDATION_001', result.error ?? 'This refund could not be retried.');
  return ok(res, { payment: mapPayment(result.payment) });
});

// ============================================================
// Phase 8A — Ratings
// ============================================================

/** GET /admin/ratings/restaurants — average rating & count per restaurant. */
adminRouter.get('/ratings/restaurants', (_req, res) => {
  const rows = db.prepare(`
    SELECT r.id   AS restaurantId,
           r.name AS restaurantName,
           ROUND(AVG(rt.stars), 1) AS avgRating,
           COUNT(rt.id)            AS ratingCount
      FROM restaurants r
      LEFT JOIN ratings rt ON rt.restaurant_id = r.id AND rt.menu_item_id IS NULL
     WHERE r.deleted_at IS NULL
     GROUP BY r.id, r.name
     ORDER BY avgRating DESC, ratingCount DESC
  `).all();
  return ok(res, rows);
});

/** GET /admin/ratings/items — average rating & count per food item. */
adminRouter.get('/ratings/items', (_req, res) => {
  const rows = db.prepare(`
    SELECT mi.id   AS menuItemId,
           mi.name AS menuItemName,
           r.id    AS restaurantId,
           r.name  AS restaurantName,
           ROUND(AVG(rt.stars), 1) AS avgRating,
           COUNT(rt.id)            AS ratingCount
      FROM menu_items mi
      JOIN restaurants r ON r.id = mi.restaurant_id
      LEFT JOIN ratings rt ON rt.menu_item_id = mi.id
     WHERE mi.deleted_at IS NULL AND r.deleted_at IS NULL
     GROUP BY mi.id, mi.name, r.id, r.name
     ORDER BY avgRating DESC, ratingCount DESC
  `).all();
  return ok(res, rows);
});


// ============================================================
// Admin Management — Super Admin only
// ============================================================

/**
 * Only a Super Admin may manage other administrators. The role is re-read
 * from the database rather than trusted from the token, so demoting or
 * deleting an admin takes effect immediately for sessions already issued.
 */
function requireSuperAdmin(req: Request, res: Response): AdminRow | null {
  const me = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.auth!.sub) as AdminRow | undefined;
  if (!me || me.status === 'disabled') {
    fail(res, 'AUTH_003', 'This administrator account is no longer active.');
    return null;
  }
  if (me.role !== 'super_admin') {
    fail(res, 'AUTH_003', 'Only the Super Admin can manage administrator accounts.');
    return null;
  }
  return me;
}

function mapAdmin(row: AdminRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

function loadAdminOrFail(id: string, res: Response): AdminRow | null {
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(id) as AdminRow | undefined;
  if (!row) {
    fail(res, 'VALIDATION_001', 'Administrator not found.');
    return null;
  }
  return row;
}

const createAdminSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  phone: phoneSchema,
  role: z.enum(['admin', 'super_admin']).default('admin'),
  temporaryPassword: z
    .string()
    .min(8, 'Temporary password must be at least 8 characters.')
    .max(200)
    .optional(),
});

/** GET /admin/admins — the administrator list (Super Admin only). */
adminRouter.get('/admins', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const rows = db
    .prepare("SELECT * FROM admins ORDER BY CASE role WHEN 'super_admin' THEN 0 ELSE 1 END, full_name")
    .all() as AdminRow[];
  return ok(res, rows.map(mapAdmin));
});

/** POST /admin/admins — create an administrator with a temporary password. */
adminRouter.post('/admins', (req, res) => {
  const me = requireSuperAdmin(req, res);
  if (!me) return;

  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', parsed.error.issues[0]?.message ?? 'Invalid administrator details.');
  }
  const data = parsed.data;

  const clash = db.prepare('SELECT id FROM admins WHERE LOWER(email) = ?').get(data.email) as
    | { id: string }
    | undefined;
  if (clash) return fail(res, 'VALIDATION_001', 'An administrator with that email already exists.');

  const tempPassword = data.temporaryPassword ?? generateTempPassword();
  const id = generateId('admin');
  db.prepare(
    `INSERT INTO admins (id, full_name, email, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
  ).run(id, data.fullName, data.email, data.phone, hashPassword(tempPassword), data.role);

  logAudit('admin', me.id, 'admin.create', JSON.stringify({ adminId: id, email: data.email, role: data.role }));
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(id) as AdminRow;
  return created(res, { admin: mapAdmin(row), temporaryPassword: tempPassword });
});

/** POST /admin/admins/:id/reset-password — issue a new temporary password. */
adminRouter.post('/admins/:id/reset-password', (req, res) => {
  const me = requireSuperAdmin(req, res);
  if (!me) return;
  const target = loadAdminOrFail(req.params.id, res);
  if (!target) return;

  const tempPassword = generateTempPassword();
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(tempPassword), target.id);
  logAudit('admin', me.id, 'admin.reset_password', JSON.stringify({ adminId: target.id }));
  return ok(res, { admin: mapAdmin(target), temporaryPassword: tempPassword });
});

/** PATCH /admin/admins/:id/disable — block sign-in without deleting history. */
adminRouter.patch('/admins/:id/disable', (req, res) => {
  const me = requireSuperAdmin(req, res);
  if (!me) return;
  const target = loadAdminOrFail(req.params.id, res);
  if (!target) return;
  if (target.id === me.id) return fail(res, 'VALIDATION_001', 'You cannot disable your own account.');
  if (target.role === 'super_admin') {
    return fail(res, 'VALIDATION_001', 'A Super Admin account cannot be disabled.');
  }

  db.prepare("UPDATE admins SET status = 'disabled' WHERE id = ?").run(target.id);
  logAudit('admin', me.id, 'admin.disable', JSON.stringify({ adminId: target.id }));
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(target.id) as AdminRow;
  return ok(res, { admin: mapAdmin(row) });
});

/** PATCH /admin/admins/:id/enable — restore a disabled administrator. */
adminRouter.patch('/admins/:id/enable', (req, res) => {
  const me = requireSuperAdmin(req, res);
  if (!me) return;
  const target = loadAdminOrFail(req.params.id, res);
  if (!target) return;

  db.prepare("UPDATE admins SET status = 'active' WHERE id = ?").run(target.id);
  logAudit('admin', me.id, 'admin.enable', JSON.stringify({ adminId: target.id }));
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(target.id) as AdminRow;
  return ok(res, { admin: mapAdmin(row) });
});

/** DELETE /admin/admins/:id — remove an administrator account. */
adminRouter.delete('/admins/:id', (req, res) => {
  const me = requireSuperAdmin(req, res);
  if (!me) return;
  const target = loadAdminOrFail(req.params.id, res);
  if (!target) return;
  if (target.id === me.id) return fail(res, 'VALIDATION_001', 'You cannot delete your own account.');
  if (target.role === 'super_admin') {
    return fail(res, 'VALIDATION_001', 'A Super Admin account cannot be deleted.');
  }

  db.prepare('DELETE FROM admins WHERE id = ?').run(target.id);
  logAudit('admin', me.id, 'admin.delete', JSON.stringify({ adminId: target.id, email: target.email }));
  return ok(res, { deleted: true, id: target.id });
});
