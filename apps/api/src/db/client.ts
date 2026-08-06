import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.CAMPUS_BITES_DB_PATH || path.join(__dirname, '../../campus-bites.sqlite3');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate(): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  /**
   * Phase 6B fix: schema.sql now ends with indexes over columns that older
   * database files don't have yet (payments.student_id, payments.transfer_status
   * ...). Executing it against such a file used to abort the whole boot. The
   * first pass therefore creates whatever it can, `migrateColumns` widens the
   * legacy tables, and the second pass finishes the indexes. Every statement is
   * idempotent, so running the file twice is a no-op on an up-to-date database.
   */
  try {
    db.exec(schema);
  } catch (error) {
    console.warn('[db] schema pass 1 incomplete on a legacy database, widening tables first:', error);
  }
  migrateColumns();
  db.exec(schema);
}

/**
 * `CREATE TABLE IF NOT EXISTS` (above) only takes effect for a brand-new
 * database file. Any Thapar Bites instance whose .sqlite3 file already
 * existed before the Restaurant Management work needs its existing
 * `restaurants` / `menu_items` tables widened with the new columns —
 * otherwise every INSERT/SELECT written against the new schema would fail
 * on a pre-existing file. This runs on every boot and is a no-op once the
 * columns are present, so it's safe to leave in permanently.
 */
function migrateColumns(): void {
  addColumnIfMissing('restaurants', 'contact_number', 'TEXT');
  addColumnIfMissing('restaurants', 'email', 'TEXT');
  addColumnIfMissing('restaurants', 'location', 'TEXT');
  addColumnIfMissing('restaurants', 'opening_time', 'TEXT');
  addColumnIfMissing('restaurants', 'closing_time', 'TEXT');
  addColumnIfMissing('restaurants', 'delivery_fee', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('restaurants', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('restaurants', 'deleted_at', 'TEXT');

  // Phase 5: student profile picture.
  addColumnIfMissing('students', 'avatar_url', 'TEXT');
  // Phase 5: optional cover image for a restaurant card.
  addColumnIfMissing('restaurants', 'image_url', 'TEXT');

  // Phase 6A: payments now carry both legs of the intermediary flow plus
  // enough denormalized ownership to render payment history without joins.
  addColumnIfMissing('payments', 'student_id', 'TEXT');
  addColumnIfMissing('payments', 'restaurant_id', 'TEXT');
  addColumnIfMissing('payments', 'transfer_status', "TEXT NOT NULL DEFAULT 'not_started'");
  addColumnIfMissing('payments', 'created_at', 'TEXT');
  addColumnIfMissing('payments', 'transfer_confirmed_at', 'TEXT');
  backfillPaymentOwnership();

  // Phase 6B: admin payout management. A restaurant needs a payout
  // destination, and a transfer needs enough state to be retried after a
  // failure without losing why it failed.
  addColumnIfMissing('restaurants', 'upi_id', 'TEXT');
  addColumnIfMissing('payments', 'transfer_attempts', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('payments', 'transfer_failure_reason', 'TEXT');
  backfillRestaurantUpi();

  // Phase 6C: restaurant payment settings — the payout identity a restaurant
  // manages itself and an admin can override. `online_payments_enabled`
  // defaults to 1 so existing restaurants keep working after the migration.
  addColumnIfMissing('restaurants', 'qr_code_url', 'TEXT');
  addColumnIfMissing('restaurants', 'account_holder_name', 'TEXT');
  addColumnIfMissing('restaurants', 'payment_notes', 'TEXT');
  addColumnIfMissing('restaurants', 'online_payments_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('restaurants', 'payment_settings_updated_at', 'TEXT');

  // Phase 8A: restaurant & food rating counts so the average can be stored
  // alongside the computed rating without a full-table aggregate on every read.
  addColumnIfMissing('restaurants', 'rating_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('menu_items',  'rating', 'REAL');
  addColumnIfMissing('menu_items',  'rating_count', 'INTEGER NOT NULL DEFAULT 0');
  backfillAccountHolderName();

  // Phase 6D: refunds. Every column is nullable (or defaulted) so existing
  // payment rows keep working; `refund_status` starts at 'none', and any row
  // already marked refunded by an earlier phase is backfilled to 'completed'
  // so it shows up correctly on the new Refund Dashboard.
  addColumnIfMissing('payments', 'refund_status', "TEXT NOT NULL DEFAULT 'none'");
  addColumnIfMissing('payments', 'refund_reason', 'TEXT');
  addColumnIfMissing('payments', 'refund_amount', 'INTEGER');
  addColumnIfMissing('payments', 'refund_trigger', 'TEXT');
  addColumnIfMissing('payments', 'refund_initiated_at', 'TEXT');
  addColumnIfMissing('payments', 'refund_completed_at', 'TEXT');
  addColumnIfMissing('payments', 'refund_failure_reason', 'TEXT');
  backfillRefundState();

  // Super Admin: admin accounts now carry a role, an enable/disable status,
  // and an optional phone number so a Super Admin can manage other admins.
  addColumnIfMissing('admins', 'phone', 'TEXT');
  addColumnIfMissing('admins', 'role', "TEXT NOT NULL DEFAULT 'admin'");
  addColumnIfMissing('admins', 'status', "TEXT NOT NULL DEFAULT 'active'");

  addColumnIfMissing('menu_items', 'is_veg', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('menu_items', 'image_url', 'TEXT');
  addColumnIfMissing('menu_items', 'prep_time_minutes', 'INTEGER');
  addColumnIfMissing('menu_items', 'deleted_at', 'TEXT');
}

/**
 * Phase 6A: rows written before payments carried student/restaurant ids (or a
 * created_at) are backfilled from their order, so payment history and the
 * payout worker never see half-populated legacy rows.
 */
function backfillPaymentOwnership(): void {
  db.exec(`
    UPDATE payments SET
      student_id = COALESCE(student_id, (SELECT o.student_id FROM orders o WHERE o.id = payments.order_id)),
      restaurant_id = COALESCE(restaurant_id, (SELECT o.restaurant_id FROM orders o WHERE o.id = payments.order_id)),
      created_at = COALESCE(created_at, (SELECT o.created_at FROM orders o WHERE o.id = payments.order_id))
    WHERE student_id IS NULL OR restaurant_id IS NULL OR created_at IS NULL
  `);
  // A pre-Phase-6A successful payment was, by definition, already released to
  // its restaurant — the gate didn't exist yet. Mark those transfers confirmed
  // so historical orders don't get pulled back behind the new gate.
  db.exec(`
    UPDATE payments
       SET transfer_status = 'confirmed',
           transfer_confirmed_at = COALESCE(transfer_confirmed_at, paid_at)
     WHERE status = 'successful' AND transfer_status = 'not_started'
       AND order_id IN (SELECT id FROM orders WHERE status NOT IN ('payment_pending','awaiting_partner_payment','awaiting_restaurant_payment'))
  `);
}

/**
 * Phase 6D: payments refunded before the refund lifecycle existed only had
 * `status = 'refunded'`. Give them a completed refund record so the Refund
 * Dashboard and the student's order detail have something to show.
 */
function backfillRefundState(): void {
  db.exec(`
    UPDATE payments
       SET refund_status = 'completed',
           refund_amount = COALESCE(refund_amount, amount),
           refund_reason = COALESCE(refund_reason, 'Refunded by Thapar Bites.'),
           refund_trigger = COALESCE(refund_trigger, 'admin_manual'),
           refund_initiated_at = COALESCE(refund_initiated_at, paid_at, created_at),
           refund_completed_at = COALESCE(refund_completed_at, paid_at, created_at)
     WHERE status = 'refunded' AND refund_status = 'none'
  `);
}

/**
 * Phase 6B: every restaurant needs a payout handle for the Pending Restaurant
 * Payments screen. Existing demo restaurants get a deterministic placeholder
 * derived from their name; admins can edit it later.
 */
function backfillRestaurantUpi(): void {
  db.exec(`
    UPDATE restaurants
       SET upi_id = LOWER(REPLACE(REPLACE(name, ' ', ''), '''', '')) || '@campusbites'
     WHERE upi_id IS NULL OR upi_id = ''
  `);
}

/**
 * Phase 6C: an empty account holder name would fail the settings form the
 * first time a manager opened it, so existing restaurants start off with the
 * restaurant's own name as the account holder. Managers can correct it.
 */
function backfillAccountHolderName(): void {
  db.exec(`
    UPDATE restaurants
       SET account_holder_name = name
     WHERE account_holder_name IS NULL OR account_holder_name = ''
  `);
}

function addColumnIfMissing(table: string, column: string, ddlType: string): void {
  const table_exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  if (!table_exists) return;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
  }
}

migrate();
