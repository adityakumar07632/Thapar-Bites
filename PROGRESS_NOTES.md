# Thapar Bites — Restaurant Management: Progress Notes (IN PROGRESS)

This ZIP is **not** the finished Version 1 deliverable — it's a checkpoint so
you have the real, working state of the code so far. Nothing here is a mock;
everything listed as "done" is real, wired-up backend code. The frontend
(ops-dashboard admin/manager screens) is **not** started yet.

## ⚠️ Important: could not run a live build in this environment
This sandbox has no network access (`npm install` fails with `403 Forbidden`
against the npm registry), so I could not run `npm install`, `npm run build`,
`npm run lint`, or `scripts/verify-platform.mjs` against a live server. All
code below was written and manually reviewed for type-correctness and
consistency with the existing codebase's patterns, but it has **not been
compiled or executed**. Please run `npm install && npm run build` yourself
(or hand this back to me in an environment with network access) before
treating it as production-ready.

## ✅ Done — Backend (apps/api)

**Database (`src/db/schema.sql`, `src/db/client.ts`, `src/db/rows.ts`)**
- `restaurants` table: added `contact_number`, `email`, `location`,
  `opening_time`, `closing_time`, `delivery_fee`, `is_active`, `deleted_at`.
- `menu_items` table: added `is_veg`, `image_url`, `prep_time_minutes`,
  `deleted_at`.
- `db/client.ts` now runs an idempotent column-migration step
  (`PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN`) on boot, so this works
  against a pre-existing `.sqlite3` file too, not just a fresh one.
- Row/type interfaces updated to match.

**Mappers (`src/lib/mappers.ts`)**
- `mapRestaurant` now includes the new fields + `isActive`/`deletedAt`.
- `mapMenuItem` now includes `isVeg`/`imageUrl`/`prepTimeMinutes`.
- New `mapRestaurantOwner` for admin responses.

**Validation (`src/lib/validation.ts` — new file)**
- Shared Zod validators: item name, price (positive integer), category name,
  image URL (must be http/https), prep time (1–180 min), 24h time format,
  phone number.

**IDs (`src/lib/ids.ts`)**
- Added `generateTempPassword()` for new/reset manager accounts.

**Admin Restaurant Management (`src/modules/admin/admin.routes.ts`)**
All under `requireAuth('admin')`, all audit-logged via `logAudit`:
- `GET /admin/restaurants?includeDeleted=true` — now includes manager info,
  excludes soft-deleted by default.
- `GET /admin/restaurants/:id` — single restaurant + manager, for an edit form.
- `POST /admin/restaurants` — **Add Restaurant**: creates the restaurant row
  *and* auto-creates the Restaurant Manager account in one transaction.
  Returns the generated (or provided) temp password once.
- `PATCH /admin/restaurants/:id` — **Edit Restaurant** (name, contact, email,
  hours, delivery fee, minimums, description, status).
- `PATCH /admin/restaurants/:id/enable` / `/disable` — **Enable/Disable**.
- `DELETE /admin/restaurants/:id` — **Soft delete only** (`deleted_at` set,
  `is_active` cleared; row is never removed).
- `POST /admin/restaurants/:id/reset-password` — **Reset Manager Password**,
  returns a new temp password.

**Restaurant Menu Management (`src/modules/restaurantDashboard/restaurantDashboard.routes.ts`)**
All under `requireAuth('restaurant')`, strictly scoped to
`req.auth.restaurantId` (a manager can never touch another restaurant's
menu), all audit-logged:
- `GET /restaurant/menu` — categories + items for the manager's own restaurant.
- `POST /restaurant/menu/items` — **Add Item** (name, description, category
  — auto-created if new, price, veg/non-veg, image URL, prep time,
  availability). Rejects duplicate names (case-insensitive) up front.
- `PATCH /restaurant/menu/items/:id` — **Edit Item** / change price / change
  category / change image / mark Available/Out of Stock — all one endpoint,
  partial updates. Logs `menu_item.price_changed` and/or
  `menu_item.availability_changed` specifically when those fields change.
- `DELETE /restaurant/menu/items/:id` — soft delete (keeps historical
  `order_items`/`cart_items` foreign keys intact; also removes the item from
  any student's live cart).

**Security enforcement (Part 4)**
- `restaurants.routes.ts` (public/student-facing): `GET /restaurants`,
  `GET /restaurants/:id`, `GET /restaurants/:id/menu` now all exclude
  soft-deleted restaurants and soft-deleted menu items.
- `cart.routes.ts`, `checkout.routes.ts`, `sharedDelivery.routes.ts`: the
  existing "restaurant is closed" checks (3 call sites) were extended to
  also block a **disabled** (`is_active = 0`) or **soft-deleted** restaurant
  from receiving any new cart items, checkouts, or Shared Delivery queue
  joins — same error path/message as "closed" so no new error code was
  needed.
- Role separation (student cannot hit management APIs; manager confined to
  own restaurant; admin unrestricted) reuses the existing `requireAuth(role)`
  middleware and `restaurantId` checks already in the codebase — no new gaps
  introduced.

**Audit log actions added:** `restaurant.created`, `restaurant.updated`,
`restaurant.enabled`, `restaurant.disabled`, `restaurant.deleted`,
`restaurant_manager.password_reset`, `menu_item.created`,
`menu_item.updated`, `menu_item.price_changed`,
`menu_item.availability_changed`, `menu_item.deleted`.

## ❌ Not started yet

1. **Ops-dashboard frontend** — no UI exists yet for any of the above:
   - Admin: Add/Edit Restaurant form, Enable/Disable toggle, Delete
     (with confirm), Reset Password action + temp-password display.
   - Restaurant Manager: a new "Menu" screen (add/edit/delete items,
     price/category/image edit, Available/Out of Stock toggle), plus nav
     entry in `Shell.tsx` and a route in `App.tsx`.
2. **Student-app minor updates** — `MenuItem`/`Restaurant` shared types
   don't yet expose the new fields (`isVeg`, `imageUrl`, `isActive`, etc.),
   and `RestaurantListScreen`/`RestaurantDetailScreen` don't yet visually
   reflect "unavailable restaurant" or "out of stock item" (the backend
   already blocks the actual order, this is just the visual cue).
3. **Live build/lint/test verification** — blocked on network access in
   this sandbox; needs to be run for real before shipping.
4. **Final summary report, git commit message, and the truly complete ZIP**
   — will follow once the above is finished.

## Files touched so far (11 modified + 1 new)
```
apps/api/src/db/schema.sql                                        (modified)
apps/api/src/db/client.ts                                         (modified)
apps/api/src/db/rows.ts                                           (modified)
apps/api/src/lib/mappers.ts                                       (modified)
apps/api/src/lib/ids.ts                                           (modified)
apps/api/src/lib/validation.ts                                    (new)
apps/api/src/modules/admin/admin.routes.ts                        (modified)
apps/api/src/modules/restaurantDashboard/restaurantDashboard.routes.ts (modified)
apps/api/src/modules/restaurants/restaurants.routes.ts            (modified)
apps/api/src/modules/cart/cart.routes.ts                          (modified)
apps/api/src/modules/checkout/checkout.routes.ts                  (modified)
apps/api/src/modules/sharedDelivery/sharedDelivery.routes.ts      (modified)
```
Nothing else in the repo was touched — no existing routes, screens, or logic
were rewritten or reorganized outside of the targeted edits above.
