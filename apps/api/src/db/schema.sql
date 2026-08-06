-- Thapar Bites API — schema.sql
-- Mirrors PRD Appendix D (Database Design & ERD). Money columns are whole
-- rupees (INTEGER), consistent with the mock data / UI built earlier.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS students (
  id                  TEXT PRIMARY KEY,
  full_name           TEXT NOT NULL,
  roll_number         TEXT UNIQUE NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  phone               TEXT,
  password_hash       TEXT NOT NULL,
  hostel              TEXT NOT NULL,
  room_number         TEXT,
  reliability_score   INTEGER NOT NULL DEFAULT 100,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS restaurants (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  description              TEXT,
  cuisine                  TEXT,
  minimum_order            INTEGER NOT NULL,
  shared_delivery_minimum  INTEGER NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'open', -- open|busy|closed (kitchen-set)
  eta_minutes              INTEGER NOT NULL DEFAULT 20,
  rating                   REAL,
  -- Admin Restaurant Management (Version 1 completion) ---------------------
  contact_number           TEXT,
  email                    TEXT,
  location                 TEXT,
  opening_time             TEXT, -- 'HH:MM', 24h
  closing_time             TEXT, -- 'HH:MM', 24h
  delivery_fee             INTEGER NOT NULL DEFAULT 0,
  is_active                INTEGER NOT NULL DEFAULT 1, -- admin enable/disable switch
  deleted_at               TEXT -- soft delete marker; NULL = not deleted
);

CREATE TABLE IF NOT EXISTS restaurant_owners (
  id             TEXT PRIMARY KEY,
  full_name      TEXT NOT NULL,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id             TEXT PRIMARY KEY,
  full_name      TEXT NOT NULL,
  email          TEXT UNIQUE NOT NULL,
  phone          TEXT,
  password_hash  TEXT NOT NULL,
  -- 'super_admin' can manage other admins; 'admin' cannot.
  role           TEXT NOT NULL DEFAULT 'admin',
  -- 'disabled' accounts keep their history but cannot sign in.
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id             TEXT PRIMARY KEY,
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id),
  name           TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id                  TEXT PRIMARY KEY,
  restaurant_id       TEXT NOT NULL REFERENCES restaurants(id),
  category_id         TEXT NOT NULL REFERENCES menu_categories(id),
  name                TEXT NOT NULL,
  description         TEXT,
  price               INTEGER NOT NULL,
  available           INTEGER NOT NULL DEFAULT 1,
  -- Restaurant Menu Management (Version 1 completion) ----------------------
  is_veg              INTEGER NOT NULL DEFAULT 1,
  image_url           TEXT,
  prep_time_minutes   INTEGER,
  deleted_at          TEXT -- soft delete marker; keeps historical order_items/cart_items FKs intact
);

-- One row per (student, menu_item) — D.10/D.11 Carts + CartItems, flattened
-- since a student only ever has one active cart (enforced in application code
-- by clearing rows for any other restaurant_id on add).
CREATE TABLE IF NOT EXISTS cart_items (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students(id),
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id),
  menu_item_id   TEXT NOT NULL REFERENCES menu_items(id),
  quantity       INTEGER NOT NULL,
  UNIQUE(student_id, menu_item_id)
);

-- D.14 SharedDeliveryQueue
CREATE TABLE IF NOT EXISTS shared_delivery_queue (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students(id),
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id),
  hostel         TEXT NOT NULL,
  cart_snapshot  TEXT NOT NULL, -- JSON: [{menuItemId,name,price,quantity}], frozen at queue time
  subtotal       INTEGER NOT NULL,
  joined_at      TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'waiting' -- waiting|matched|cancelled|expired
);

-- D.15 Matches
CREATE TABLE IF NOT EXISTS matches (
  id                TEXT PRIMARY KEY,
  restaurant_id     TEXT NOT NULL REFERENCES restaurants(id),
  student_a         TEXT NOT NULL REFERENCES students(id),
  student_b         TEXT NOT NULL REFERENCES students(id),
  pair_code         TEXT NOT NULL,
  payment_deadline  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment|confirmed|expired|cancelled
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- D.12 Orders
CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,
  student_id        TEXT NOT NULL REFERENCES students(id),
  restaurant_id     TEXT NOT NULL REFERENCES restaurants(id),
  delivery_type     TEXT NOT NULL, -- individual|shared
  match_id          TEXT REFERENCES matches(id),
  status            TEXT NOT NULL,
  subtotal          INTEGER NOT NULL,
  convenience_fee   INTEGER NOT NULL DEFAULT 0,
  pair_code         TEXT,
  cancel_reason     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- D.13 OrderItems (denormalized name/price snapshot at order time)
CREATE TABLE IF NOT EXISTS order_items (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  menu_item_id  TEXT NOT NULL REFERENCES menu_items(id),
  name          TEXT NOT NULL,
  price         INTEGER NOT NULL,
  quantity      INTEGER NOT NULL
);

-- D.16 Payments
-- Phase 6A (Payment Infrastructure): Thapar Bites is the payment
-- intermediary. A payment therefore has TWO legs, tracked separately:
--   `status`          — the student -> Thapar Bites leg
--   `transfer_status` — the Thapar Bites -> restaurant leg
-- A restaurant must never receive an order until `transfer_status` is
-- 'confirmed' (see modules/payments/payouts.ts).
CREATE TABLE IF NOT EXISTS payments (
  id                    TEXT PRIMARY KEY,
  order_id              TEXT NOT NULL REFERENCES orders(id),
  student_id            TEXT REFERENCES students(id),
  restaurant_id         TEXT REFERENCES restaurants(id),
  amount                INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending|successful|failed|expired|refunded
  transfer_status       TEXT NOT NULL DEFAULT 'not_started', -- not_started|pending|confirmed|failed
  method                TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at               TEXT,
  transfer_confirmed_at TEXT,
  -- Phase 6D (Refunds): the money-back leg. `refund_status` is the lifecycle
  -- of the refund itself ('none' until one is initiated), kept separate from
  -- `status` so a refund can be in flight (pending) or have failed without
  -- losing the fact that the student's payment originally succeeded.
  refund_status         TEXT NOT NULL DEFAULT 'none', -- none|pending|completed|failed
  refund_reason         TEXT,
  refund_amount         INTEGER,
  refund_trigger        TEXT, -- restaurant_closed|restaurant_rejected|transfer_failed|admin_cancelled|admin_manual|student_cancelled
  refund_initiated_at   TEXT,
  refund_completed_at   TEXT,
  refund_failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_refund ON payments(refund_status);

-- D.17 Deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  driver_name   TEXT,
  assigned_at   TEXT,
  arrived_at    TEXT,
  delivered_at  TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Appendix H-adjacent: a light audit trail, referenced by Admin APIs (E.15).
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_type  TEXT NOT NULL, -- student|restaurant|admin|system
  actor_id    TEXT,
  action      TEXT NOT NULL,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_student ON cart_items(student_id);
CREATE INDEX IF NOT EXISTS idx_queue_restaurant_hostel ON shared_delivery_queue(restaurant_id, hostel, status);
CREATE INDEX IF NOT EXISTS idx_orders_student ON orders(student_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);

-- Phase 2 security fix: revocable, rotating refresh tokens. Only a SHA-256
-- hash of the token is stored, so a database leak yields no usable tokens.
-- `family_id` groups every rotation descended from one login, which lets a
-- replayed (already-rotated) token invalidate the whole family as theft.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id             TEXT PRIMARY KEY,              -- the token's jti claim
  subject_id     TEXT NOT NULL,                 -- students.id | restaurant_owners.id | admins.id
  role           TEXT NOT NULL,                 -- student|restaurant|admin
  restaurant_id  TEXT,                          -- snapshot only; claims are re-derived on rotation
  token_hash     TEXT NOT NULL,
  family_id      TEXT NOT NULL,
  issued_at      TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  revoked_at     TEXT,
  replaced_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_subject ON refresh_tokens(subject_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens(expires_at);

-- Phase 2 performance fix: the shared-delivery matcher and the order
-- fulfilment engine both scan by status on every tick.
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status, payment_deadline);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- Phase 5 (Discovery & Student Experience): a student's favourite
-- restaurants and dishes. One row per (student, target) pair; `target_type`
-- keeps restaurants and menu items in a single table so the favourites API
-- stays one endpoint instead of two parallel ones.
CREATE TABLE IF NOT EXISTS favorites (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students(id),
  target_type  TEXT NOT NULL, -- restaurant|menu_item
  target_id    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_student ON favorites(student_id, target_type);

-- Phase 6A: the student payment-history screen reads by student, and the
-- payout worker scans by transfer_status.
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_transfer ON payments(transfer_status);

-- ===========================================================================
-- Phase 6B — Admin Payout Management
-- ===========================================================================
-- Thapar Bites holds the student's money until an admin explicitly confirms
-- the onward transfer to the restaurant. Two things are needed for that:
--   1. somewhere to send the money  -> restaurants.upi_id
--   2. an auditable record of who   -> payment_logs
-- The restaurant must not learn an order exists until that confirmation, so
-- restaurant_notifications rows are only ever written on release.

-- Payout destination for a restaurant (admin-managed).
-- (Added via ALTER TABLE in client.ts for pre-existing databases.)

CREATE TABLE IF NOT EXISTS payment_logs (
  id               TEXT PRIMARY KEY,
  payment_id       TEXT NOT NULL REFERENCES payments(id),
  order_id         TEXT NOT NULL REFERENCES orders(id),
  action           TEXT NOT NULL,   -- transfer_confirmed|transfer_retried|transfer_failed|student_refunded|order_cancelled|refund_initiated|refund_completed|refund_failed
  transfer_status  TEXT NOT NULL,   -- transfer status AFTER the action
  amount           INTEGER NOT NULL DEFAULT 0,
  actor_type       TEXT NOT NULL,   -- admin|system
  actor_id         TEXT,
  actor_name       TEXT,
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_payment ON payment_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created ON payment_logs(created_at);

-- Kitchen-facing notifications. Written only once a payout is confirmed.
CREATE TABLE IF NOT EXISTS restaurant_notifications (
  id             TEXT PRIMARY KEY,
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id),
  order_id       TEXT,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  read           INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_restaurant_notifications ON restaurant_notifications(restaurant_id, read);

-- ===========================================================================
-- Phase 6E — Platform Payment Settings
-- ===========================================================================
-- Thapar Bites' own UPI identity. Students always pay Thapar Bites, not the
-- individual restaurant. This singleton table holds the platform-level UPI ID,
-- QR code, account holder name, payment instructions, and notes that are shown
-- to students at checkout. Only a Platform Admin can modify these.
--
-- There is always at most one row, keyed by the fixed string 'platform'.

CREATE TABLE IF NOT EXISTS platform_payment_settings (
  id                    TEXT PRIMARY KEY DEFAULT 'platform',
  upi_id                TEXT,
  account_holder_name   TEXT,
  qr_code_url           TEXT,
  payment_instructions  TEXT,
  payment_notes         TEXT,
  updated_at            TEXT
);

-- ===========================================================================
-- Phase 8A — Restaurant & Food Ratings
-- ===========================================================================
-- A student may rate the restaurant and each food item on a delivered order.
-- Each (order, restaurant) pair can have at most one restaurant rating, and
-- each (order, menu_item) pair can have at most one item rating. Both are
-- upserted — submitting again updates the existing stars.

CREATE TABLE IF NOT EXISTS ratings (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students(id),
  order_id       TEXT NOT NULL REFERENCES orders(id),
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id),
  menu_item_id   TEXT,                 -- NULL → restaurant-level rating
  stars          INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One restaurant rating per order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_order_restaurant
  ON ratings(order_id, restaurant_id) WHERE menu_item_id IS NULL;

-- One food-item rating per order per item.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_order_item
  ON ratings(order_id, menu_item_id)  WHERE menu_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ratings_restaurant ON ratings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ratings_menu_item  ON ratings(menu_item_id);

-- ===========================================================================
-- Phase 9B — Password Reset Tokens
-- ===========================================================================
-- Hashed, single-use, expiring tokens for forgot-password / reset-password.
-- The raw token is never stored — only the SHA-256 hex digest.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT UNIQUE NOT NULL,
  user_id     TEXT NOT NULL,
  user_type   TEXT NOT NULL,  -- 'student' | 'restaurant' | 'admin'
  expires_at  TEXT NOT NULL,
  used_at     TEXT,           -- NULL until the token is consumed
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);

-- ===========================================================================
-- Phase 13 — Shared Delivery QR Verification
-- ===========================================================================
-- Each matched student gets a unique, encrypted QR token tied to their order.
-- The restaurant scans both codes to verify the handover (in addition to the
-- existing manual pair-code path).  Tokens are one-time-use and expire after
-- 24 h.

CREATE TABLE IF NOT EXISTS shared_delivery_qr_tokens (
  id            TEXT PRIMARY KEY,
  match_id      TEXT NOT NULL REFERENCES matches(id),
  order_id      TEXT NOT NULL REFERENCES orders(id),
  student_id    TEXT NOT NULL REFERENCES students(id),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  part          TEXT NOT NULL CHECK (part IN ('A', 'B')),
  payload       TEXT NOT NULL,         -- encrypted QR payload (returned to student)
  payload_hash  TEXT NOT NULL UNIQUE,  -- SHA-256(payload) used for O(1) scan lookup
  scanned_at    TEXT,                  -- set when restaurant first scans this code
  used_at       TEXT,                  -- set when delivery is completed via QR
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_order    ON shared_delivery_qr_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_match    ON shared_delivery_qr_tokens(match_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_student  ON shared_delivery_qr_tokens(student_id);
