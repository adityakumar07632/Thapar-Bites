# Phase 6C — Restaurant Payment Settings

## Summary
Every restaurant now has a payout identity: UPI ID, QR code, account holder
name, optional payment notes, and an admin-controlled online-payments switch.
Restaurant managers maintain their own details; admins can view, edit, replace
the QR, and disable payments for any restaurant; students see the UPI ID, QR
and instructions at checkout. Shared Delivery, authentication, the payment
flow and order logic were not modified.

## Files modified
API
- src/db/client.ts — migrations for qr_code_url, account_holder_name,
  payment_notes, online_payments_enabled, payment_settings_updated_at,
  plus a backfill of account holder name.
- src/db/rows.ts — new RestaurantRow columns.
- src/lib/validation.ts — upiIdSchema, accountHolderNameSchema,
  paymentNotesSchema, qrCodeImageSchema.
- src/lib/paymentSettings.ts (new) — single source of truth for reads,
  validation and writes, plus the narrowed student-facing projection.
- src/modules/restaurantDashboard/restaurantDashboard.routes.ts —
  GET/PUT /restaurant/payment-settings, PUT /restaurant/payment-settings/qr.
- src/modules/admin/admin.routes.ts — GET/PUT
  /admin/restaurants/:id/payment-settings, PUT .../qr, PATCH .../toggle.
- src/modules/restaurants/restaurants.routes.ts —
  GET /restaurants/:id/payment-details (public, blank when disabled).
- src/index.ts — 2mb JSON parser scoped to the QR upload paths only; every
  other endpoint keeps the 100kb limit.

Ops dashboard
- src/features/payments/PaymentSettingsPanel.tsx (new) — shared form with
  client-side UPI validation, QR preview, and image downscaling on upload.
- src/features/restaurant/RestaurantPaymentSettingsScreen.tsx (new).
- src/features/admin/AdminRestaurantDetailScreen.tsx — embeds the panel with
  the enable/disable switch.
- src/App.tsx, src/components/layout/Shell.tsx — route and nav entry.
- src/lib/api.ts — api.put.

Student app
- src/features/shared-delivery/screens/PaymentWindowScreen.tsx — "Pay
  <restaurant>" block with QR, UPI ID, account holder and instructions.

## Notes / remaining work
- QR images are stored as inline data URLs, consistent with the rest of the
  project; a file-storage backend would be the next step if catalogues grow.
- Disabling online payments hides the details from checkout but does not
  block order placement — that belongs to order logic, untouched this phase.
- No automated tests were added for the new endpoints.
