/**
 * Lifecycle statuses, modeled as string-literal unions rather than TS `enum`.
 * These mirror exactly what the real API sets on an Order — see
 * apps/api/src/modules/matching/matchingEngine.ts and payments.routes.ts.
 *
 * Source of truth: PRD Chapter 8.10 "Order Lifecycle States", adapted to
 * what the real backend actually produces (e.g. there's no 'waiting_for_match'
 * order status — that's queue-level state, see QueueStatus below — and both
 * payment paths land on 'order_received' directly rather than pausing on an
 * intermediate 'payment_successful').
 */
export type OrderStatus =
  | 'payment_pending'
  | 'awaiting_partner_payment' // Shared Delivery only — you've paid, your match partner hasn't yet
  | 'awaiting_restaurant_payment' // Phase 6A — you've paid Thapar Bites; we're paying the restaurant
  | 'payment_failed'
  | 'payment_expired'
  | 'payment_refunded'
  | 'order_received'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'collected'
  | 'out_for_delivery'
  | 'driver_arrived'
  | 'paircode_verification'
  | 'delivered'
  | 'completed'
  | 'cancelled';

/** The Shared Delivery queue's own state, from GET /shared-delivery/status. */
export type QueueStatus = 'none' | 'waiting' | 'matched' | 'cancelled' | 'expired';

/** PRD Chapter 4.8 / 4.9 — the two delivery methods. */
export type DeliveryType = 'individual' | 'shared';

/** PRD Appendix D.15 — Matches table `status`. */
export type MatchStatus = 'pending_payment' | 'confirmed' | 'expired' | 'cancelled';

/** PRD Appendix D.16 — Payments table `status`: the student -> Thapar Bites leg. */
export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'expired' | 'refunded';

/** Phase 6A — the Thapar Bites -> restaurant leg of the same payment. */
export type TransferStatus = 'not_started' | 'pending' | 'confirmed' | 'failed';

/**
 * Phase 6A — the single student-facing payment state, derived server-side from
 * both legs (see apps/api/src/lib/paymentStage.ts). Thapar Bites collects the
 * money first and pays the restaurant second; the restaurant never receives an
 * order before `restaurant_payment_confirmed`.
 */
export type PaymentStage =
  | 'awaiting_payment'
  | 'payment_successful'
  | 'waiting_for_restaurant_payment'
  | 'restaurant_payment_confirmed'
  | 'payment_failed'
  | 'payment_expired'
  | 'refund_initiated' // Phase 6D — money on its way back to the student
  | 'refund_failed' // Phase 6D — the refund attempt itself failed
  | 'refunded';

export const PAYMENT_STAGE_LABEL: Record<PaymentStage, string> = {
  awaiting_payment: 'Awaiting Payment',
  payment_successful: 'Payment Successful',
  waiting_for_restaurant_payment: 'Waiting for Restaurant Payment',
  restaurant_payment_confirmed: 'Restaurant Payment Confirmed',
  payment_failed: 'Payment Failed',
  payment_expired: 'Payment Expired',
  refund_initiated: 'Refund Initiated',
  refund_failed: 'Refund Failed',
  refunded: 'Refund Completed',
};

/**
 * Phase 6D — the coarse payment outcome shown as a badge on Order History.
 * Answers "where is my money?", not "which internal leg is running?".
 */
export type PaymentOutcome = 'paid' | 'refunded' | 'cancelled' | 'payment_failed' | 'awaiting_payment';

export const PAYMENT_OUTCOME_LABEL: Record<PaymentOutcome, string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  payment_failed: 'Payment Failed',
  awaiting_payment: 'Awaiting Payment',
};

/** The order the four happy-path stages happen in, for progress UI. */
export const PAYMENT_STAGE_SEQUENCE: PaymentStage[] = [
  'awaiting_payment',
  'payment_successful',
  'waiting_for_restaurant_payment',
  'restaurant_payment_confirmed',
];

/** PRD Appendix D.7 — Restaurants table `status`. */
export type RestaurantStatus = 'open' | 'busy' | 'closed';

/** PRD Chapter 8.5 — supported payment methods for the MVP. */
export type PaymentMethod = 'upi' | 'debit_card' | 'credit_card' | 'net_banking' | 'wallet';

/** Human-facing labels for each order status, in the voice of the interface. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  payment_pending: 'Payment pending',
  awaiting_partner_payment: 'Waiting on your delivery partner',
  awaiting_restaurant_payment: 'Confirming payment to the restaurant',
  payment_failed: 'Payment failed',
  payment_expired: 'Payment window expired',
  payment_refunded: 'Refunded',
  // Phase 6B: reaching this status means the admin confirmed the restaurant
  // payout, so from the student's side the order is now definitively confirmed.
  order_received: 'Order Confirmed',
  accepted: 'Accepted by restaurant',
  preparing: 'Preparing your food',
  ready_for_pickup: 'Ready for pickup',
  collected: 'Collected by delivery',
  out_for_delivery: 'Out for delivery',
  driver_arrived: 'Delivery partner has arrived',
  paircode_verification: 'Verifying PairCode',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * The ordered "happy path" a single order walks through after payment is
 * confirmed, used to drive the tracking stepper. Matches Ch. 8.10 + Ch. 10.
 */
export const ORDER_TRACKING_SEQUENCE: OrderStatus[] = [
  // Phase 6A: Thapar Bites is the payment intermediary, so there is one real
  // beat between "you paid" and "the restaurant has your order".
  'awaiting_restaurant_payment',
  'order_received',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'collected',
  'out_for_delivery',
  'driver_arrived',
  'paircode_verification',
  'delivered',
  'completed',
];
