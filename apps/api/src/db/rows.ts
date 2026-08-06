// Raw SQLite row shapes (snake_case, matching schema.sql exactly).

export interface StudentRow {
  id: string;
  full_name: string;
  roll_number: string;
  email: string;
  phone: string | null;
  password_hash: string;
  hostel: string;
  room_number: string | null;
  reliability_score: number;
  avatar_url: string | null;
  created_at: string;
}

/** Phase 5 — favourite restaurants / dishes. */
export interface FavoriteRow {
  id: string;
  student_id: string;
  target_type: 'restaurant' | 'menu_item';
  target_id: string;
  created_at: string;
}

export interface RestaurantOwnerRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  restaurant_id: string;
  created_at: string;
}

export interface AdminRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: 'super_admin' | 'admin';
  status: 'active' | 'disabled';
  created_at: string;
}

export interface RestaurantRow {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  minimum_order: number;
  shared_delivery_minimum: number;
  status: 'open' | 'busy' | 'closed';
  eta_minutes: number;
  rating: number | null;
  rating_count: number;
  contact_number: string | null;
  email: string | null;
  location: string | null;
  opening_time: string | null;
  closing_time: string | null;
  delivery_fee: number;
  is_active: number;
  image_url: string | null;
  /** Phase 6B — payout destination used by Admin Payout Management. */
  upi_id: string | null;
  // Phase 6C — Restaurant Payment Settings.
  qr_code_url: string | null;
  account_holder_name: string | null;
  payment_notes: string | null;
  online_payments_enabled: number;
  payment_settings_updated_at: string | null;
  deleted_at: string | null;
}

export interface MenuCategoryRow {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
}

export interface MenuItemRow {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  available: number;
  is_veg: number;
  image_url: string | null;
  prep_time_minutes: number | null;
  deleted_at: string | null;
  rating: number | null;
  rating_count: number;
}

export interface CartItemRow {
  id: string;
  student_id: string;
  restaurant_id: string;
  menu_item_id: string;
  quantity: number;
}

export interface QueueRow {
  id: string;
  student_id: string;
  restaurant_id: string;
  hostel: string;
  cart_snapshot: string;
  subtotal: number;
  joined_at: string;
  expires_at: string;
  status: 'waiting' | 'matched' | 'cancelled' | 'expired';
}

export interface MatchRow {
  id: string;
  restaurant_id: string;
  student_a: string;
  student_b: string;
  pair_code: string;
  payment_deadline: string;
  status: 'pending_payment' | 'confirmed' | 'expired' | 'cancelled';
  created_at: string;
}

export interface OrderRow {
  id: string;
  student_id: string;
  restaurant_id: string;
  delivery_type: 'individual' | 'shared';
  match_id: string | null;
  status: string;
  subtotal: number;
  convenience_fee: number;
  pair_code: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
}

/** Phase 6A — the Thapar Bites -> restaurant leg of a payment. */
export type TransferStatus = 'not_started' | 'pending' | 'confirmed' | 'failed';

export interface PaymentRow {
  id: string;
  order_id: string;
  student_id: string | null;
  restaurant_id: string | null;
  amount: number;
  status: 'pending' | 'successful' | 'failed' | 'expired' | 'refunded';
  transfer_status: TransferStatus;
  method: string | null;
  created_at: string | null;
  paid_at: string | null;
  transfer_confirmed_at: string | null;
  /** Phase 6B — how many payout attempts have been made, and why the last failed. */
  transfer_attempts: number;
  transfer_failure_reason: string | null;
  /** Phase 6D — the refund leg, tracked independently of `status`. */
  refund_status: RefundStatus;
  refund_reason: string | null;
  refund_amount: number | null;
  refund_trigger: RefundTrigger | null;
  refund_initiated_at: string | null;
  refund_completed_at: string | null;
  refund_failure_reason: string | null;
}

/** Phase 6D — lifecycle of the Thapar Bites -> student money-back leg. */
export type RefundStatus = 'none' | 'pending' | 'completed' | 'failed';

/** Phase 6D — why a refund happened. Drives the reason shown to the student. */
export type RefundTrigger =
  | 'restaurant_closed'
  | 'restaurant_rejected'
  | 'transfer_failed'
  | 'admin_cancelled'
  | 'admin_manual'
  | 'student_cancelled';

/** Phase 6B — immutable trail of every admin action on a payout. */
export interface PaymentLogRow {
  id: string;
  payment_id: string;
  order_id: string;
  action:
    | 'transfer_confirmed'
    | 'transfer_retried'
    | 'transfer_failed'
    | 'student_refunded'
    | 'order_cancelled'
    | 'refund_initiated'
    | 'refund_completed'
    | 'refund_failed';
  transfer_status: TransferStatus;
  amount: number;
  actor_type: 'admin' | 'system';
  actor_id: string | null;
  actor_name: string | null;
  note: string | null;
  created_at: string;
}

export interface RestaurantNotificationRow {
  id: string;
  restaurant_id: string;
  order_id: string | null;
  title: string;
  body: string;
  read: number;
  created_at: string;
}

export interface DeliveryRow {
  id: string;
  order_id: string;
  driver_name: string | null;
  assigned_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
}

export interface NotificationRow {
  id: string;
  student_id: string;
  title: string;
  body: string;
  read: number;
  created_at: string;
}

/** Phase 6E — Thapar Bites platform-level payment identity. Singleton row. */
export interface PlatformPaymentSettingsRow {
  id: string; // always 'platform'
  upi_id: string | null;
  account_holder_name: string | null;
  qr_code_url: string | null;
  payment_instructions: string | null;
  payment_notes: string | null;
  updated_at: string | null;
}

/** Phase 13 — Shared Delivery QR Verification. */
export interface QrTokenRow {
  id: string;
  match_id: string;
  order_id: string;
  student_id: string;
  restaurant_id: string;
  part: 'A' | 'B';
  payload: string;       // encrypted QR payload string
  payload_hash: string;  // SHA-256(payload) — lookup key during scan
  scanned_at: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

/** Phase 8A — Restaurant & Food Ratings. */
export interface RatingRow {
  id: string;
  student_id: string;
  order_id: string;
  restaurant_id: string;
  menu_item_id: string | null; // NULL = restaurant-level rating
  stars: number;
  created_at: string;
  updated_at: string;
}
