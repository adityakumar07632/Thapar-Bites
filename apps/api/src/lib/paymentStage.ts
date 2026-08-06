import type { PaymentRow } from '../db/rows';

/**
 * Phase 6A/6D — the student-facing payment states.
 *
 * Thapar Bites is the payment intermediary: the student pays Thapar Bites,
 * and Thapar Bites then pays the restaurant. Those are two different money
 * movements, so they're stored as separate columns (`status`,
 * `transfer_status` and, since Phase 6D, `refund_status`) and collapsed here
 * into the single stage the student is actually shown. Deriving it in one
 * place means every surface — payment window, order tracking, payment
 * history, admin — agrees.
 */
export type PaymentStage =
  | 'awaiting_payment' // student has not paid Thapar Bites yet
  | 'payment_successful' // Thapar Bites has the money
  | 'waiting_for_restaurant_payment' // payout to the restaurant is in flight
  | 'restaurant_payment_confirmed' // restaurant has been paid; order is released
  | 'payment_failed'
  | 'payment_expired'
  | 'refund_initiated' // Phase 6D — money is on its way back to the student
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

type StageInput = Pick<PaymentRow, 'status' | 'transfer_status'> & Partial<Pick<PaymentRow, 'refund_status'>>;

export function paymentStage(row: StageInput): PaymentStage {
  // Phase 6D: a refund in flight outranks everything else — the money is
  // moving back to the student, so no other stage is meaningful.
  if (row.refund_status === 'pending') return 'refund_initiated';
  if (row.refund_status === 'failed' && row.status !== 'refunded') return 'refund_failed';

  if (row.status === 'pending') return 'awaiting_payment';
  if (row.status === 'failed') return 'payment_failed';
  if (row.status === 'expired') return 'payment_expired';
  if (row.status === 'refunded') return 'refunded';

  // status === 'successful' — which leg are we on?
  if (row.transfer_status === 'confirmed') return 'restaurant_payment_confirmed';
  if (row.transfer_status === 'pending') return 'waiting_for_restaurant_payment';
  if (row.transfer_status === 'failed') return 'waiting_for_restaurant_payment';
  return 'payment_successful';
}

/**
 * Phase 6D — the four student-facing payment outcomes used on Order History.
 * Deliberately coarser than `PaymentStage`: a badge answers "where is my
 * money?", not "which internal leg is running?".
 */
export type PaymentOutcome = 'paid' | 'refunded' | 'cancelled' | 'payment_failed' | 'awaiting_payment';

export const PAYMENT_OUTCOME_LABEL: Record<PaymentOutcome, string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  payment_failed: 'Payment Failed',
  awaiting_payment: 'Awaiting Payment',
};

export function paymentOutcome(row: StageInput, orderStatus?: string | null): PaymentOutcome {
  if (row.status === 'refunded' || row.refund_status === 'pending' || row.refund_status === 'completed') {
    return 'refunded';
  }
  if (row.status === 'failed' || row.status === 'expired') return 'payment_failed';
  if (orderStatus === 'cancelled' || orderStatus === 'payment_expired') return 'cancelled';
  if (row.status === 'successful') return 'paid';
  return 'awaiting_payment';
}

export type TimelineState = 'done' | 'current' | 'pending' | 'failed';

export interface TimelineStep {
  key: string;
  label: string;
  state: TimelineState;
  at: string | null;
  note?: string | null;
}

/**
 * Phase 6D — the payment timeline every surface renders:
 *
 *   Payment Successful -> Waiting for Restaurant Payment
 *      -> Restaurant Payment Confirmed
 *      OR
 *      -> Refund Initiated -> Refund Completed
 *
 * Built server-side from the payment row so the student app, the ops
 * dashboard and any future surface show exactly the same history.
 */
export function paymentTimeline(row: PaymentRow): TimelineStep[] {
  const refunding = row.refund_status !== 'none' && row.refund_status != null;
  const paid = row.status === 'successful' || row.status === 'refunded' || refunding;

  const steps: TimelineStep[] = [
    {
      key: 'payment_successful',
      label: 'Payment Successful',
      state: paid ? 'done' : row.status === 'failed' || row.status === 'expired' ? 'failed' : 'current',
      at: row.paid_at ?? null,
    },
  ];

  if (refunding) {
    steps.push({
      key: 'waiting_for_restaurant_payment',
      label: 'Waiting for Restaurant Payment',
      state: 'done',
      at: row.paid_at ?? null,
      note: 'Stopped — the order could not go ahead.',
    });
    steps.push({
      key: 'refund_initiated',
      label: 'Refund Initiated',
      state: 'done',
      at: row.refund_initiated_at ?? null,
      note: row.refund_reason ?? null,
    });
    steps.push({
      key: 'refund_completed',
      label: row.refund_status === 'failed' ? 'Refund Failed' : 'Refund Completed',
      state:
        row.refund_status === 'completed' ? 'done' : row.refund_status === 'failed' ? 'failed' : 'current',
      at: row.refund_completed_at ?? null,
      note: row.refund_failure_reason ?? null,
    });
    return steps;
  }

  steps.push({
    key: 'waiting_for_restaurant_payment',
    label: 'Waiting for Restaurant Payment',
    state:
      row.transfer_status === 'confirmed'
        ? 'done'
        : row.transfer_status === 'failed'
          ? 'failed'
          : paid
            ? 'current'
            : 'pending',
    at: paid ? (row.paid_at ?? null) : null,
    note: row.transfer_status === 'failed' ? row.transfer_failure_reason : null,
  });

  steps.push({
    key: 'restaurant_payment_confirmed',
    label: 'Restaurant Payment Confirmed',
    state: row.transfer_status === 'confirmed' ? 'done' : 'pending',
    at: row.transfer_confirmed_at ?? null,
  });

  return steps;
}
