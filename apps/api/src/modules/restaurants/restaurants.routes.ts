import { Router } from 'express';
import { db } from '../../db/client';
import type { MenuCategoryRow, MenuItemRow, RestaurantRow } from '../../db/rows';
import { ok, fail } from '../../lib/response';
import { mapMenuCategory, mapMenuItem, mapRestaurant } from '../../lib/mappers';
import { publicPlatformPaymentDetails } from '../../lib/platformPaymentSettings';

export const restaurantsRouter = Router();

// GET /restaurants?search=&sort=rating|eta
restaurantsRouter.get('/', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;

  let rows = db.prepare('SELECT * FROM restaurants WHERE deleted_at IS NULL').all() as RestaurantRow[];
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || (r.cuisine ?? '').toLowerCase().includes(needle),
    );
  }
  if (sort === 'rating') rows = [...rows].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (sort === 'eta') rows = [...rows].sort((a, b) => a.eta_minutes - b.eta_minutes);

  return ok(res, rows.map(mapRestaurant));
});

/**
 * Phase 5 — GET /restaurants/dishes?search=
 *
 * Cross-restaurant dish search + the discovery index the student list screen
 * uses for its Veg / Non-Veg and price filters. Declared BEFORE `/:id` so
 * Express doesn't match "dishes" as a restaurant id.
 *
 * Soft-deleted restaurants and menu items are excluded, as everywhere else on
 * the public surface.
 */
restaurantsRouter.get('/dishes', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const rows = db
    .prepare(
      `SELECT mi.*, r.name AS restaurant_name, r.status AS restaurant_status,
              r.eta_minutes AS restaurant_eta, r.rating AS restaurant_rating,
              r.is_active AS restaurant_is_active
         FROM menu_items mi
         JOIN restaurants r ON r.id = mi.restaurant_id
        WHERE mi.deleted_at IS NULL AND r.deleted_at IS NULL`,
    )
    .all() as (MenuItemRow & {
    restaurant_name: string;
    restaurant_status: RestaurantRow['status'];
    restaurant_eta: number;
    restaurant_rating: number | null;
    restaurant_is_active: number;
  })[];

  const matched = search
    ? rows.filter(
        (row) =>
          row.name.toLowerCase().includes(search) ||
          (row.description ?? '').toLowerCase().includes(search),
      )
    : rows;

  return ok(
    res,
    matched.map((row) => ({
      ...mapMenuItem(row),
      restaurantName: row.restaurant_name,
      restaurantStatus: row.restaurant_status,
      restaurantEtaMinutes: row.restaurant_eta,
      restaurantRating: row.restaurant_rating,
      restaurantIsActive: Boolean(row.restaurant_is_active),
    })),
  );
});

// GET /restaurants/:id
restaurantsRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM restaurants WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as
    | RestaurantRow
    | undefined;
  if (!row) return fail(res, 'ORDER_001', 'Restaurant not found.');
  return ok(res, mapRestaurant(row));
});

/**
 * GET /restaurants/:id/payment-details — Phase 6C.
 *
 * What checkout shows the student: where the money is going and how to pay.
 * Read-only, and blank when the restaurant has online payments switched off.
 */
restaurantsRouter.get('/:id/payment-details', (req, res) => {
  // Phase 6E — students always pay Thapar Bites, never the restaurant directly.
  // We still validate that the restaurant exists (a deleted restaurant means
  // the order should not exist either), but the payment details returned are
  // Thapar Bites' own platform UPI/QR, never the restaurant's payout info.
  const row = db
    .prepare('SELECT id FROM restaurants WHERE id = ? AND deleted_at IS NULL')
    .get(req.params.id) as { id: string } | undefined;
  if (!row) return fail(res, 'ORDER_001', 'Restaurant not found.');
  return ok(res, publicPlatformPaymentDetails());
});

// GET /restaurants/:id/menu
restaurantsRouter.get('/:id/menu', (req, res) => {
  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!restaurant) return fail(res, 'ORDER_001', 'Restaurant not found.');

  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? ORDER BY sort_order, name')
    .all(req.params.id) as MenuCategoryRow[];
  const items = db
    .prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND deleted_at IS NULL')
    .all(req.params.id) as MenuItemRow[];

  return ok(res, {
    categories: categories.map(mapMenuCategory),
    items: items.map(mapMenuItem),
  });
});
