import { z } from 'zod';
import { db } from '../db/client';
import type { PlatformPaymentSettingsRow } from '../db/rows';
import {
  accountHolderNameSchema,
  paymentInstructionsSchema,
  paymentNotesSchema,
  qrCodeImageSchema,
  upiIdSchema,
} from './validation';

/**
 * Phase 6E — Platform Payment Settings.
 *
 * Thapar Bites acts as the payment intermediary: students always pay Campus
 * Bites, not the individual restaurant directly. This module owns the single
 * row in `platform_payment_settings` that holds the UPI handle, QR code,
 * account holder name, payment instructions, and notes the student sees at
 * checkout.
 *
 * Only a Platform Admin may read or write these settings. The student-facing
 * `publicPlatformPaymentDetails()` helper is what the payment window uses to
 * know where to direct students — it never exposes any restaurant UPI details.
 */

export interface PlatformPaymentSettings {
  upiId: string | null;
  accountHolderName: string | null;
  qrCodeUrl: string | null;
  paymentInstructions: string | null;
  paymentNotes: string | null;
  updatedAt: string | null;
}

function rowToSettings(row: PlatformPaymentSettingsRow): PlatformPaymentSettings {
  return {
    upiId: row.upi_id,
    accountHolderName: row.account_holder_name,
    qrCodeUrl: row.qr_code_url,
    paymentInstructions: row.payment_instructions,
    paymentNotes: row.payment_notes,
    updatedAt: row.updated_at,
  };
}

/** Returns the current platform settings, or all-null defaults if never configured. */
export function loadPlatformPaymentSettings(): PlatformPaymentSettings {
  const row = db
    .prepare("SELECT * FROM platform_payment_settings WHERE id = 'platform'")
    .get() as PlatformPaymentSettingsRow | undefined;

  if (!row) {
    return {
      upiId: null,
      accountHolderName: null,
      qrCodeUrl: null,
      paymentInstructions: null,
      paymentNotes: null,
      updatedAt: null,
    };
  }
  return rowToSettings(row);
}

export const platformPaymentSettingsSchema = z.object({
  upiId: upiIdSchema,
  accountHolderName: accountHolderNameSchema,
  paymentInstructions: paymentInstructionsSchema,
  paymentNotes: paymentNotesSchema,
  qrCodeUrl: qrCodeImageSchema,
});

export type PlatformPaymentSettingsInput = z.infer<typeof platformPaymentSettingsSchema>;

/** Upserts the platform payment settings. The QR code is only replaced when explicitly supplied. */
export function savePlatformPaymentSettings(input: PlatformPaymentSettingsInput): PlatformPaymentSettings {
  const now = new Date().toISOString();
  // When qrCodeUrl is not passed (undefined), keep the existing value.
  // When it is explicitly null or an empty string, clear it.
  const qrProvided = input.qrCodeUrl !== undefined;

  if (qrProvided) {
    db.prepare(
      `INSERT INTO platform_payment_settings
         (id, upi_id, account_holder_name, qr_code_url, payment_instructions, payment_notes, updated_at)
       VALUES ('platform', @upiId, @accountHolderName, @qrCodeUrl, @paymentInstructions, @paymentNotes, @now)
       ON CONFLICT(id) DO UPDATE SET
         upi_id = @upiId,
         account_holder_name = @accountHolderName,
         qr_code_url = @qrCodeUrl,
         payment_instructions = @paymentInstructions,
         payment_notes = @paymentNotes,
         updated_at = @now`,
    ).run({
      upiId: input.upiId,
      accountHolderName: input.accountHolderName,
      qrCodeUrl: input.qrCodeUrl,
      paymentInstructions: input.paymentInstructions,
      paymentNotes: input.paymentNotes,
      now,
    });
  } else {
    db.prepare(
      `INSERT INTO platform_payment_settings
         (id, upi_id, account_holder_name, payment_instructions, payment_notes, updated_at)
       VALUES ('platform', @upiId, @accountHolderName, @paymentInstructions, @paymentNotes, @now)
       ON CONFLICT(id) DO UPDATE SET
         upi_id = @upiId,
         account_holder_name = @accountHolderName,
         payment_instructions = @paymentInstructions,
         payment_notes = @paymentNotes,
         updated_at = @now`,
    ).run({
      upiId: input.upiId,
      accountHolderName: input.accountHolderName,
      paymentInstructions: input.paymentInstructions,
      paymentNotes: input.paymentNotes,
      now,
    });
  }

  return loadPlatformPaymentSettings();
}

/** Replace (or clear, with null) just the QR image. */
export function savePlatformQrCode(qrCodeUrl: string | null): PlatformPaymentSettings {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO platform_payment_settings (id, qr_code_url, updated_at)
     VALUES ('platform', @qrCodeUrl, @now)
     ON CONFLICT(id) DO UPDATE SET qr_code_url = @qrCodeUrl, updated_at = @now`,
  ).run({ qrCodeUrl, now });
  return loadPlatformPaymentSettings();
}

/**
 * What the student sees at checkout — Thapar Bites' own payment details.
 * Never exposes any restaurant UPI information.
 * `onlinePaymentsEnabled` is true whenever at least a UPI ID or QR code is configured.
 */
export function publicPlatformPaymentDetails(): {
  onlinePaymentsEnabled: boolean;
  upiId: string | null;
  qrCodeUrl: string | null;
  accountHolderName: string | null;
  paymentInstructions: string | null;
  paymentNotes: string | null;
} {
  const s = loadPlatformPaymentSettings();
  const configured = !!(s.upiId || s.qrCodeUrl);
  return {
    onlinePaymentsEnabled: configured,
    upiId: s.upiId,
    qrCodeUrl: s.qrCodeUrl,
    accountHolderName: s.accountHolderName,
    paymentInstructions: s.paymentInstructions,
    paymentNotes: s.paymentNotes,
  };
}
