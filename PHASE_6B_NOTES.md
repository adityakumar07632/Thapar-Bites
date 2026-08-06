# Phase 6B — Admin Payout Management

Thapar Bites is the payment intermediary: the student pays Thapar Bites, and a
**restaurant only ever receives an order after an admin confirms the payout**.
Phase 6B turns that rule into an operated workflow.

## Summary

- **Release is now human-gated.** The Phase 6A auto-settling payout worker is
  off by default (`CAMPUS_BITES_AUTO_PAYOUT=false`). Nothing moves an order into
  the kitchen except an admin pressing *Confirm Restaurant Payment*. Until then
  the order sits in `awaiting_restaurant_payment`, which is excluded from the
  restaurant dashboard's visible statuses, so the kitchen cannot see it at all.
- **New page: Pending Restaurant Payments** (`/admin/payouts`, nav "Restaurant
  Payouts"), showing Order ID, Student, Restaurant, Amount, Payment Time,
  Restaurant UPI and Transfer Status for every payment Thapar Bites is holding.
- **Four admin actions** per row: Confirm Restaurant Payment, Retry Transfer,
  Refund Student, Cancel Order. Refund and Cancel ask for a reason, which is
  stored on the order and in the payment log.
- **On confirmation:** the order flips to `order_received`, the restaurant is
  notified (`restaurant_notifications` + live SSE `new_order`), and the student's
  tracker reads **Order Confirmed**.
- **Payment logs:** an append-only `payment_logs` table records who confirmed,
  when, which order, the resulting transfer status, amount and note. Shown under
  the pending queue.
- **Payment analytics:** Pending Transfers, Completed Transfers, Failed
  Transfers and Today's Revenue (plus rupee totals for each).

## Files modified

### API (`apps/api`)
| File | Change |
| --- | --- |
| `src/db/schema.sql` | New `payment_logs` and `restaurant_notifications` tables + indexes |
| `src/db/client.ts` | Migrations for `restaurants.upi_id`, `payments.transfer_attempts`, `payments.transfer_failure_reason`; UPI backfill; two-pass schema apply so legacy database files no longer abort boot |
| `src/db/rows.ts` | `RestaurantRow.upi_id`, payment transfer fields, `PaymentLogRow`, `RestaurantNotificationRow` |
| `src/lib/paymentLog.ts` | **New** — `logPaymentEvent`, `adminName`, `listPaymentLogs` |
| `src/lib/notify.ts` | **New** `notifyRestaurant()` |
| `src/lib/mappers.ts` | `mapPayment` exposes `transferAttempts` / `transferFailureReason` |
| `src/modules/payments/payouts.ts` | Admin-confirmation mode; restaurant notification on release; `markTransferFailed`, `retryRestaurantTransfer`, `refundStudentPayment`, `cancelOrderForPayment`; every action logged |
| `src/modules/admin/admin.routes.ts` | `GET /admin/payouts/pending`, `/payouts/analytics`, `/payouts/logs`; `PATCH /admin/payments/:id/{confirm-transfer,retry-transfer,mark-failed,refund,cancel-order}` |
| `src/modules/restaurantDashboard/restaurantDashboard.routes.ts` | `GET /restaurant/notifications`, `PATCH /restaurant/notifications/read` |
| `.env.example` | `CAMPUS_BITES_AUTO_PAYOUT` |

### Ops dashboard (`apps/ops-dashboard`)
| File | Change |
| --- | --- |
| `src/features/admin/AdminPayoutsScreen.tsx` | **New** — pending queue, four actions, analytics cards, payment log |
| `src/App.tsx` | `/admin/payouts` route |
| `src/components/layout/Shell.tsx` | "Restaurant Payouts" nav item |

### Student app (`apps/student-app`)
| File | Change |
| --- | --- |
| `src/shared/types/enums.ts` | `order_received` now reads **Order Confirmed** |

Untouched, as required: Shared Delivery, authentication, and every unrelated page.

## Verified end to end

Student pays → restaurant order list does **not** contain the order → admin sees
it in Pending Restaurant Payments with UPI and payment time → retry logs an entry
→ confirm releases it → restaurant order list contains it, restaurant
notification written, student status `order_received` ("Order Confirmed"), two
log rows recorded with `actorName: Platform Admin`. API and both dashboards
typecheck and build clean.

## Remaining work

- Restaurant UPI IDs are auto-backfilled as `<name>@campusbites`; add an admin
  field on the restaurant detail screen to edit the real handle.
- Real PSP payout integration — today `Confirm Restaurant Payment` records the
  settlement rather than calling a bank/UPI API; `mark-failed` exists for the
  webhook that will report failures.
- Refunds after the restaurant has already been paid must be handled manually
  (the endpoint deliberately refuses).
- No unread badge for restaurant notifications in the kitchen UI yet (the API is
  ready).
- Payment analytics are all-time plus today; date-range filters and CSV export
  are not built.
