import { z } from 'zod';
import { db } from '../db/client';
import type { RestaurantRow } from '../db/rows';
import {
  accountHolderNameSchema,
  paymentNotesSchema,
  qrCodeImageSchema,
  upiIdSchema,
} from './validation';

/**
 * Phase 6C — Restaurant Payment Settings.
 *
 * One restaurant, one payout identity: the UPI handle Thapar Bites transfers
 * to, the QR a student can scan, who the account belongs to, free-text
 * instructions, and a switch that says whether the restaurant is currently
 * accepting online payments at all.
 *
 * The columns live on `restaurants` (added by db/client.ts migrations) because
 * they are 1:1 with a restaurant and are read on nearly every payout query —
 * a side table would add a join to the admin payout queue for no benefit.
 * This module is the single place that reads, validates, and writes them so
 * the admin surface and the restaurant surface can never drift apart.
 */

export interface PaymentSettings {
  restaurantId: string;
  restaurantName: string;
  upiId: string | null;
  qrCodeUrl: string | null;
  accountHolderName: string | null;
  paymentNotes: string | null;
  onlinePaymentsEnabled: boolean;
  updatedAt: string | null;
}

export function mapPaymentSettings(row: RestaurantRow): PaymentSettings {
  return {
    restaurantId: row.id,
    restaurantName: row.name,
    upiId: row.upi_id,
    qrCodeUrl: row.qr_code_url,
    accountHolderName: row.account_holder_name,
    paymentNotes: row.payment_notes,
    // NULL (a restaurant created before this phase) counts as enabled so the
    // switch never silently turns a working restaurant off.
    onlinePaymentsEnabled: row.online_payments_enabled !== 0,
    updatedAt: row.payment_settings_updated_at,
  };
}

/**
 * What the student sees at checkout. Deliberately narrower than the admin
 * view: no timestamps, no internal ids, and nothing at all when the
 * restaurant has switched online payments off.
 */
export function publicPaymentDetails(row: RestaurantRow) {
  const enabled = row.online_payments_enabled !== 0;
  return {
    restaurantId: row.id,
    restaurantName: row.name,
    onlinePaymentsEnabled: enabled,
    upiId: enabled ? row.upi_id : null,
    qrCodeUrl: enabled ? row.qr_code_url : null,
    accountHolderName: enabled ? row.account_holder_name : null,
    paymentNotes: enabled ? row.payment_notes : null,
  };
}

/**
 * The restaurant manager's editable fields. UPI ID and account holder name
 * are required — a payout destination with either one missing is unusable —
 * while notes and the QR are optional.
 */
export const paymentSettingsSchema = z.object({
  upiId: upiIdSchema,
  accountHolderName: accountHolderNameSchema,
  paymentNotes: paymentNotesSchema,
  qrCodeUrl: qrCodeImageSchema,
  onlinePaymentsEnabled: z.boolean().optional(),
});

export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

export function loadPaymentSettingsRow(restaurantId: string): RestaurantRow | undefined {
  return db
    .prepare('SELECT * FROM restaurants WHERE id = ? AND deleted_at IS NULL')
    .get(restaurantId) as RestaurantRow | undefined;
}

/**
 * Writes the settings and stamps `payment_settings_updated_at`.
 * `onlinePaymentsEnabled` is only written when the caller supplied it, so the
 * restaurant's own save form can never flip a switch the admin controls
 * without meaning to.
 */
export function savePaymentSettings(
  restaurantId: string,
  input: PaymentSettingsInput,
): RestaurantRow {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE restaurants
        SET upi_id = @upiId,
            account_holder_name = @accountHolderName,
            payment_notes = @paymentNotes,
            qr_code_url = @qrCodeUrl,
            online_payments_enabled = COALESCE(@onlinePaymentsEnabled, online_payments_enabled),
            payment_settings_updated_at = @now
      WHERE id = @id`,
  ).run({
    id: restaurantId,
    upiId: input.upiId,
    accountHolderName: input.accountHolderName,
    paymentNotes: input.paymentNotes,
    qrCodeUrl: input.qrCodeUrl,
    onlinePaymentsEnabled:
      input.onlinePaymentsEnabled === undefined ? null : input.onlinePaymentsEnabled ? 1 : 0,
    now,
  });
  return loadPaymentSettingsRow(restaurantId)!;
}

/** Replace (or clear, with null) just the QR image. */
export function saveQrCode(restaurantId: string, qrCodeUrl: string | null): RestaurantRow {
  db.prepare(
    'UPDATE restaurants SET qr_code_url = ?, payment_settings_updated_at = ? WHERE id = ?',
  ).run(qrCodeUrl, new Date().toISOString(), restaurantId);
  return loadPaymentSettingsRow(restaurantId)!;
}

/** Admin-only switch: stop showing this restaurant's payment details. */
export function setOnlinePaymentsEnabled(restaurantId: string, enabled: boolean): RestaurantRow {
  db.prepare(
    'UPDATE restaurants SET online_payments_enabled = ?, payment_settings_updated_at = ? WHERE id = ?',
  ).run(enabled ? 1 : 0, new Date().toISOString(), restaurantId);
  return loadPaymentSettingsRow(restaurantId)!;
}
