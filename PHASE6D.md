# Phase 6D — Refunds & Payment Failure Handling

Thapar Bites sits between the student and the restaurant: the student pays
Thapar Bites, and Thapar Bites pays the restaurant. Phase 6D closes the other
direction — when an order cannot go ahead, the money goes back automatically,
exactly once, and the restaurant never sees the order.

## What was built

### 1. One refund engine (`apps/api/src/modules/payments/payouts.ts`)
`initiateRefund(paymentId, trigger, reason, actor)` is the only code path that
moves money back. It records the refund in two visible steps — `pending`
(Refund Initiated) then `completed` (Refund Completed) — cancels the order in
the same transaction, writes a payment-log entry, and notifies the student.

Automatic triggers now wired in:

| Trigger | Where it fires |
| --- | --- |
| `restaurant_closed` | payout worker, before releasing an order to a closed kitchen |
| `restaurant_rejected` | `PATCH /restaurant/orders/:id/reject` |
| `transfer_failed` | `markTransferFailed` (restaurant payment failed) |
| `admin_cancelled` | `PATCH /admin/payments/:id/cancel-order` before confirmation |
| `student_cancelled` | `PATCH /orders/:id/cancel` before the payout |
| `admin_manual` | `PATCH /admin/payments/:id/refund` |

A rejection is refunded even if the payout was already confirmed: the student
must not pay for food that will never be cooked.

### 2. Admin Refund Dashboard (`/admin/refunds`)
`GET /admin/refunds?status=pending|successful|failed|all` plus
`PATCH /admin/refunds/:id/retry`. The screen shows order ID, student (name and
roll number), restaurant, refund amount, reason, refund date and status, with
summary tiles for pending / successful / failed totals. Failed refunds are the
only actionable row.

### 3. Student order history & tracking
`GET /students/orders` now returns `paymentOutcome` (Paid, Refunded, Cancelled,
Payment Failed) and the full payment object per order. History shows the badge
plus the refund amount, date and reason. Order tracking adds a refund panel and
a **payment timeline** — Payment Successful → Waiting for Restaurant Payment →
Restaurant Payment Confirmed, or → Refund Initiated → Refund Completed/Failed.

### 4. Restaurant isolation
A refunded order is cancelled inside the refund transaction, and the restaurant
queue only lists live statuses — so a refunded order can never appear in, or
stay in, a kitchen's list.

### 5. Validation
- Double refunds: blocked in the same transaction that opens the refund
  (`refund_status NOT IN ('pending','completed')` guard).
- Duplicate transfers: `confirm-transfer` refuses an already-confirmed,
  cancelled, refunded, or closed-restaurant payment; `retry-transfer` only
  accepts a genuinely failed transfer.

## Schema additions (`payments`)
`refund_status`, `refund_reason`, `refund_amount`, `refund_trigger`,
`refund_initiated_at`, `refund_completed_at`, `refund_failure_reason` — added
idempotently at boot and backfilled for pre-6D refunded rows.

## Testing
`npm run build` passes for api, student-app and ops-dashboard. A live
end-to-end run against the API covered 21 checks, all passing: rejection
auto-refund, double-refund rejection, transfer-after-refund rejection,
restaurant queue isolation, admin cancel auto-refund, student history badge +
refund details, timeline shape, and all three dashboard tabs with summary
totals.

Note: `scripts/verify-platform.mjs` still fails from the point where it expects
a paid order to reach `order_received` immediately. That is pre-existing Phase
6A behaviour (orders wait at `awaiting_restaurant_payment` until an admin
confirms the payout), not a Phase 6D regression.

## Remaining work
- Refund retries are manual; a background retry worker for `failed` refunds is
  not built.
- Refunds are simulated end-to-end (as payments are) — no real PSP refund API.
- No refund email/SMS receipt; students see in-app notifications only.
- Partial refunds (single item out of stock) are out of scope: refunds are
  always the full payment amount.
