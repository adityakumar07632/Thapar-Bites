import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import type { OrderRow, RatingRow } from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, fail } from '../../lib/response';
import { generateId } from '../../lib/ids';

export const ratingsRouter = Router();
ratingsRouter.use(requireAuth('student'));

/** Recalculate and persist the average rating + count for a restaurant. */
function recalcRestaurantRating(restaurantId: string): void {
  const result = db
    .prepare(
      `SELECT ROUND(AVG(stars), 1) as avg, COUNT(*) as cnt
         FROM ratings
        WHERE restaurant_id = ? AND menu_item_id IS NULL`,
    )
    .get(restaurantId) as { avg: number | null; cnt: number };
  db.prepare('UPDATE restaurants SET rating = ?, rating_count = ? WHERE id = ?').run(
    result.avg,
    result.cnt,
    restaurantId,
  );
}

/** Recalculate and persist the average rating + count for a menu item. */
function recalcItemRating(menuItemId: string): void {
  const result = db
    .prepare(
      `SELECT ROUND(AVG(stars), 1) as avg, COUNT(*) as cnt
         FROM ratings
        WHERE menu_item_id = ?`,
    )
    .get(menuItemId) as { avg: number | null; cnt: number };
  db.prepare('UPDATE menu_items SET rating = ?, rating_count = ? WHERE id = ?').run(
    result.avg,
    result.cnt,
    menuItemId,
  );
}

const submitSchema = z.object({
  orderId: z.string().min(1),
  restaurantId: z.string().min(1),
  restaurantStars: z.number().int().min(1).max(5),
  itemRatings: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        stars: z.number().int().min(1).max(5),
      }),
    )
    .optional()
    .default([]),
});

/**
 * POST /ratings
 *
 * Submit or update the rating for a delivered order. A student may only rate
 * an order that belongs to them and has status 'delivered' or 'completed'.
 * Calling this again for the same order updates the existing stars (upsert).
 */
ratingsRouter.post('/', (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'VALIDATION_001', 'Invalid rating payload.');
  }

  const studentId = req.auth!.sub;
  const { orderId, restaurantId, restaurantStars, itemRatings } = parsed.data;

  // Verify the order belongs to this student and is in a rateable state.
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow | undefined;
  if (!order || order.student_id !== studentId) {
    return fail(res, 'ORDER_001', 'Order not found.');
  }
  if (!['delivered', 'completed'].includes(order.status)) {
    return fail(res, 'VALIDATION_001', 'You can only rate orders that have been delivered.');
  }
  if (order.restaurant_id !== restaurantId) {
    return fail(res, 'VALIDATION_001', 'Restaurant does not match this order.');
  }

  // Validate that every rated menu item actually belongs to this order, so a
  // student cannot rate arbitrary items from other orders or restaurants.
  if (itemRatings.length > 0) {
    const orderItemIds = new Set(
      (db.prepare('SELECT menu_item_id FROM order_items WHERE order_id = ?').all(orderId) as { menu_item_id: string }[])
        .map((r) => r.menu_item_id),
    );
    const invalid = itemRatings.find(({ menuItemId }) => !orderItemIds.has(menuItemId));
    if (invalid) {
      return fail(res, 'VALIDATION_001', 'One or more rated items do not belong to this order.');
    }
  }

  const now = new Date().toISOString();

  // All rating writes (restaurant + every item) run in one transaction so a
  // mid-loop failure cannot leave averages in a partially-updated state.
  db.transaction(() => {
    // Upsert restaurant rating.
    const existingRestaurant = db
      .prepare(
        `SELECT id FROM ratings WHERE order_id = ? AND restaurant_id = ? AND menu_item_id IS NULL`,
      )
      .get(orderId, restaurantId) as { id: string } | undefined;

    if (existingRestaurant) {
      db.prepare(`UPDATE ratings SET stars = ?, updated_at = ? WHERE id = ?`).run(
        restaurantStars,
        now,
        existingRestaurant.id,
      );
    } else {
      db.prepare(
        `INSERT INTO ratings (id, student_id, order_id, restaurant_id, menu_item_id, stars, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
      ).run(generateId('rtg'), studentId, orderId, restaurantId, restaurantStars, now, now);
    }

    // Upsert item ratings.
    for (const { menuItemId, stars } of itemRatings) {
      const existingItem = db
        .prepare(`SELECT id FROM ratings WHERE order_id = ? AND menu_item_id = ?`)
        .get(orderId, menuItemId) as { id: string } | undefined;

      if (existingItem) {
        db.prepare(`UPDATE ratings SET stars = ?, updated_at = ? WHERE id = ?`).run(
          stars,
          now,
          existingItem.id,
        );
      } else {
        db.prepare(
          `INSERT INTO ratings (id, student_id, order_id, restaurant_id, menu_item_id, stars, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId('rtg'), studentId, orderId, restaurantId, menuItemId, stars, now, now);
      }
    }
  })();

  // Recalculate averages outside the write transaction (read-heavy, non-critical
  // to atomicity; a stale average is far less harmful than a rolled-back rating).
  recalcRestaurantRating(restaurantId);
  for (const { menuItemId } of itemRatings) {
    recalcItemRating(menuItemId);
  }

  // Return the full set of ratings for this order.
  const allRatings = db
    .prepare(`SELECT * FROM ratings WHERE order_id = ? AND student_id = ?`)
    .all(orderId, studentId) as RatingRow[];

  return ok(res, mapRatings(allRatings));
});

/**
 * GET /ratings/order/:orderId
 *
 * Fetch this student's existing ratings for a given order.
 * Returns an empty list when the order hasn't been rated yet.
 */
ratingsRouter.get('/order/:orderId', (req, res) => {
  const studentId = req.auth!.sub;
  const { orderId } = req.params;

  const order = db.prepare('SELECT id, student_id FROM orders WHERE id = ?').get(orderId) as
    | Pick<OrderRow, 'id' | 'student_id'>
    | undefined;
  if (!order || order.student_id !== studentId) {
    return fail(res, 'ORDER_001', 'Order not found.');
  }

  const rows = db
    .prepare(`SELECT * FROM ratings WHERE order_id = ? AND student_id = ?`)
    .all(orderId, studentId) as RatingRow[];

  return ok(res, mapRatings(rows));
});

function mapRatings(rows: RatingRow[]) {
  const restaurant = rows.find((r) => r.menu_item_id === null);
  const items = rows.filter((r) => r.menu_item_id !== null);
  return {
    restaurantStars: restaurant?.stars ?? null,
    itemRatings: items.map((r) => ({ menuItemId: r.menu_item_id!, stars: r.stars })),
  };
}
