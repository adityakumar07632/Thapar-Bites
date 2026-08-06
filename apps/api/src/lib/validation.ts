import { z } from 'zod';

/**
 * Shared validators for Admin Restaurant Management and Restaurant Menu
 * Management (Part 3 of the Version 1 completion scope). Kept centralized
 * so both modules produce identical, user-friendly VALIDATION_001 messages.
 */

// A relaxed but real URL check — Zod's built-in `.url()` accepts any scheme
// (e.g. `ftp://`), so we additionally require http(s) since these are meant
// to be publicly loadable food-item photos.
export const imageUrlSchema = z
  .string()
  .trim()
  .url('Image URL must be a valid URL.')
  .refine((url) => /^https?:\/\//i.test(url), 'Image URL must start with http:// or https://');

export const optionalImageUrlSchema = z
  .union([imageUrlSchema, z.literal('')])
  .optional()
  .transform((v) => (v ? v : null));

export const menuCategoryNameSchema = z
  .string()
  .trim()
  .min(2, 'Category must be at least 2 characters.')
  .max(40, 'Category must be under 40 characters.');

export const menuItemPriceSchema = z
  // zod v4 replaced `invalid_type_error` with the unified `error` option; the
  // old key was silently ignored (and is a type error), so a non-numeric price
  // produced zod's default message instead of this one.
  .number({ error: 'Price must be a number.' })
  .int('Price must be a whole number of rupees.')
  .positive('Price must be greater than ₹0.');


export const menuItemNameSchema = z
  .string()
  .trim()
  .min(2, 'Item name must be at least 2 characters.')
  .max(80, 'Item name must be under 80 characters.');

export const prepTimeMinutesSchema = z
  .number()
  .int('Preparation time must be a whole number of minutes.')
  .min(1, 'Preparation time must be at least 1 minute.')
  .max(180, 'Preparation time must be 180 minutes or less.')
  .optional()
  .nullable();

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in 24-hour 'HH:MM' format.");

export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Contact number looks too short.')
  .max(20, 'Contact number looks too long.');

// ---------------------------------------------------------------------------
// Phase 6C — Restaurant Payment Settings
// ---------------------------------------------------------------------------

/**
 * A UPI Virtual Payment Address: `handle@psp`. NPCI allows letters, digits and
 * `.`, `-`, `_` in the handle, and an alphabetic PSP suffix. Case is not
 * significant, so we normalise to lowercase before storing — that keeps the
 * admin payout queue from showing the same destination two different ways.
 */
export const upiIdSchema = z
  .string()
  .trim()
  .min(5, 'UPI ID looks too short.')
  .max(60, 'UPI ID must be under 60 characters.')
  .regex(
    /^[a-zA-Z0-9.\-_]{2,50}@[a-zA-Z][a-zA-Z0-9]{1,20}$/,
    "UPI ID must look like 'name@bank' (letters, digits, dot, dash or underscore before the @).",
  )
  .transform((v) => v.toLowerCase());

export const accountHolderNameSchema = z
  .string()
  .trim()
  .min(2, 'Account holder name is required.')
  .max(80, 'Account holder name must be under 80 characters.');

export const paymentNotesSchema = z
  .string()
  .trim()
  .max(300, 'Payment notes must be under 300 characters.')
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/**
 * A QR code is either a hosted image URL or an inline data URL produced by the
 * dashboard's uploader (it downscales the picked file before sending, so the
 * payload stays small). Anything else — an SVG data URL, a script URL — is
 * rejected, since this string is rendered straight into an <img src>.
 */
export const qrCodeImageSchema = z
  .union([
    imageUrlSchema,
    z
      .string()
      .regex(
        /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/,
        'QR code must be a PNG, JPEG or WebP image.',
      )
      .max(1_400_000, 'QR code image is too large — please upload a smaller picture.'),
    z.literal(''),
  ])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

// ---------------------------------------------------------------------------
// Phase 6E — Platform Payment Settings
// ---------------------------------------------------------------------------

export const paymentInstructionsSchema = z
  .string()
  .trim()
  .max(600, 'Payment instructions must be under 600 characters.')
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
