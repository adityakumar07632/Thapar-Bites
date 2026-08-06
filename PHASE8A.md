# Phase 8A — Restaurant & Food Ratings

## Summary

Implemented a complete 1–5 star rating system for restaurants and food items.
Students can rate any delivered order (once per order, updatable). Ratings are
immediately recalculated and persisted to the restaurant and food-item rows so
every screen that shows a star count reads cached values — no per-request
aggregation.

---

## Files Modified

### Backend (`apps/api`)

| File | Change |
|------|--------|
| `src/db/schema.sql` | Added `ratings` table with partial unique indexes (one restaurant rating per order, one item rating per order per item) |
| `src/db/client.ts` | Added `migrateColumns()` calls for `restaurants.rating_count`, `menu_items.rating`, `menu_items.rating_count` |
| `src/db/rows.ts` | Added `RatingRow` interface; added `rating_count` to `RestaurantRow`; added `rating` and `rating_count` to `MenuItemRow` |
| `src/lib/mappers.ts` | `mapRestaurant` now exposes `ratingCount`; `mapMenuItem` now exposes `rating` and `ratingCount` |
| `src/modules/ratings/ratings.routes.ts` | **New.** `POST /ratings` (upsert rating for a delivered order) and `GET /ratings/order/:orderId` (fetch existing ratings) |
| `src/modules/admin/admin.routes.ts` | Added `GET /admin/ratings/restaurants` and `GET /admin/ratings/items` |
| `src/modules/students/students.routes.ts` | `GET /students/orders` response now includes `restaurantName` |
| `src/index.ts` | Mounted `ratingsRouter` at `/api/v1/ratings` |

### Student App (`apps/student-app`)

| File | Change |
|------|--------|
| `src/shared/types/domain.ts` | Added `ratingCount` to `Restaurant`; added `rating` + `ratingCount` to `MenuItem`; added `restaurantName` to `Order` |
| `src/features/restaurants/screens/RestaurantDetailScreen.tsx` | Shows rating count next to restaurant stars; shows per-item rating below each food item's price |
| `src/features/orders/screens/OrderHistoryScreen.tsx` | Shows a ⭐ Rate button on delivered/completed past orders; clicking opens the `RatingModal` |
| `src/features/ratings/RatingModal.tsx` | **New.** Bottom-sheet modal with 5-star picker for the restaurant and each item in the order. Submits to `POST /ratings`; pre-fills stars when updating an existing rating |

### Ops Dashboard (`apps/ops-dashboard`)

| File | Change |
|------|--------|
| `src/features/admin/AdminRatingsScreen.tsx` | **New.** Two-tab view — Restaurants tab (avg star + count per restaurant) and Food Items tab (avg star + count per item) |
| `src/App.tsx` | Added `/admin/ratings` route |
| `src/components/layout/Shell.tsx` | Added **Ratings** nav item (Star icon) to the admin sidebar |

---

## Business Rules Implemented

- Students can only rate orders with status `delivered` or `completed`.
- Each order yields at most **one** restaurant rating and **one** rating per food item.
- Submitting again **updates** the existing rating (upsert); the latest stars win.
- Average ratings are recalculated immediately after every insert/update.
- Rating is displayed on the restaurant detail page and next to each food item.
- Admin can view restaurant ratings and food-item ratings in the Ops Dashboard.

---

## Not Implemented (out of scope for this phase)

- Written text reviews (explicitly excluded per spec).
- Rating on the Order Tracking screen (only on Order History for past orders).
- Restaurant dashboard rating visibility (admin-only for now).

---

## Remaining Work / Next Phases

- Phase 8B (if planned): Written reviews, review moderation, review responses.
- Consider surfacing top-rated items as a discovery filter in `RestaurantListScreen`.
- Restaurant dashboard could show its own ratings.
