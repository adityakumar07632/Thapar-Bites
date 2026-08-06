import { db } from '../db/client';
import type { PaymentLogRow, TransferStatus } from '../db/rows';
import { generateId } from './ids';

/**
 * Phase 6B — Payment Logs.
 *
 * Money leaves Thapar Bites only when a human says so, so every payout action
 * records WHO acted, WHEN, on which ORDER, and what the transfer status became.
 * This is append-only: rows are never updated or deleted, which is what makes
 * the log usable as evidence when a restaurant disputes a settlement.
 */

export type PaymentLogAction = PaymentLogRow['action'];

export function logPaymentEvent(entry: {
  paymentId: string;
  orderId: string;
  action: PaymentLogAction;
  transferStatus: TransferStatus;
  amount: number;
  actorType: 'admin' | 'system';
  actorId?: string | null;
  actorName?: string | null;
  note?: string | null;
}): void {
  db.prepare(
    `INSERT INTO payment_logs
       (id, payment_id, order_id, action, transfer_status, amount, actor_type, actor_id, actor_name, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    generateId('plog'),
    entry.paymentId,
    entry.orderId,
    entry.action,
    entry.transferStatus,
    entry.amount,
    entry.actorType,
    entry.actorId ?? null,
    entry.actorName ?? null,
    entry.note ?? null,
    new Date().toISOString(),
  );
}

/** Resolves an admin id to a display name for the log, without a join at read time. */
export function adminName(adminId: string | null | undefined): string | null {
  if (!adminId) return null;
  const row = db.prepare('SELECT full_name FROM admins WHERE id = ?').get(adminId) as
    | { full_name: string }
    | undefined;
  return row?.full_name ?? null;
}

export function listPaymentLogs(limit = 100): (PaymentLogRow & {
  restaurant_name: string | null;
  student_name: string | null;
})[] {
  return db
    .prepare(
      `SELECT l.*, r.name AS restaurant_name, s.full_name AS student_name
         FROM payment_logs l
         LEFT JOIN orders o ON o.id = l.order_id
         LEFT JOIN restaurants r ON r.id = o.restaurant_id
         LEFT JOIN students s ON s.id = o.student_id
        ORDER BY l.created_at DESC
        LIMIT ?`,
    )
    .all(limit) as (PaymentLogRow & { restaurant_name: string | null; student_name: string | null })[];
}
