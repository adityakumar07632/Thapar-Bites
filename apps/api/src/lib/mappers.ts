import type {
  CartItemRow,
  DeliveryRow,
  MenuCategoryRow,
  MenuItemRow,
  NotificationRow,
  OrderItemRow,
  OrderRow,
  PaymentRow,
  RestaurantOwnerRow,
  RestaurantRow,
  StudentRow,
} from '../db/rows';
import { PAYMENT_STAGE_LABEL, paymentStage, paymentTimeline } from './paymentStage';

export function mapStudent(row: StudentRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    rollNumber: row.roll_number,
    email: row.email,
    phone: row.phone,
    hostel: row.hostel,
    roomNumber: row.room_number,
    reliabilityScore: row.reliability_score,
    avatarUrl: row.avatar_url ?? null,
  };
}

export function mapRestaurant(row: RestaurantRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cuisine: row.cuisine,
    minimumOrder: row.minimum_order,
    sharedDeliveryMinimum: row.shared_delivery_minimum,
    status: row.status,
    etaMinutes: row.eta_minutes,
    rating: row.rating,
    contactNumber: row.contact_number,
    email: row.email,
    location: row.location,
    openingTime: row.opening_time,
    closingTime: row.closing_time,
    deliveryFee: row.delivery_fee,
    isActive: Boolean(row.is_active),
    imageUrl: row.image_url ?? null,
    deletedAt: row.deleted_at,
    ratingCount: row.rating_count ?? 0,
  };
}

export function mapRestaurantOwner(row: RestaurantOwnerRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    restaurantId: row.restaurant_id,
  };
}

export function mapMenuCategory(row: MenuCategoryRow) {
  return { id: row.id, restaurantId: row.restaurant_id, name: row.name };
}

export function mapMenuItem(row: MenuItemRow) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    price: row.price,
    available: Boolean(row.available),
    isVeg: Boolean(row.is_veg),
    imageUrl: row.image_url,
    prepTimeMinutes: row.prep_time_minutes,
    rating: row.rating ?? null,
    ratingCount: row.rating_count ?? 0,
  };
}

export function mapCartItem(row: CartItemRow & { name: string; price: number; available: number }) {
  return {
    menuItemId: row.menu_item_id,
    name: row.name,
    price: row.price,
    quantity: row.quantity,
    available: Boolean(row.available),
  };
}

/** PairCode reveal gate (Ch. 10, sprint 2). The code is generated up front
 * (so it's stable and identical on both sides of a Shared Delivery match),
 * but it must never be shown to the student until the handover sequence
 * actually needs it: Driver Arrived → student opens PairCode →
 * 'paircode_verification' → delivery partner verifies → delivered/completed.
 * Gated centrally here so every route that serializes an order (checkout,
 * orders, students, restaurant dashboard, admin) gets this for free instead
 * of each one having to remember to hide it. */
const PAIR_CODE_VISIBLE_STATUSES = new Set(['paircode_verification', 'delivered', 'completed']);

export function mapOrder(row: OrderRow, items: OrderItemRow[]) {
  return {
    id: row.id,
    studentId: row.student_id,
    restaurantId: row.restaurant_id,
    deliveryType: row.delivery_type,
    matchId: row.match_id,
    status: row.status,
    subtotal: row.subtotal,
    convenienceFee: row.convenience_fee,
    totalAmount: row.subtotal + row.convenience_fee,
    pairCode: PAIR_CODE_VISIBLE_STATUSES.has(row.status) ? row.pair_code : null,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines: items.map((item) => ({
      menuItemId: item.menu_item_id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  };
}

/**
 * Phase 6A — a payment is serialized with BOTH legs (student -> Thapar Bites
 * and Thapar Bites -> restaurant) plus the derived `stage`/`stageLabel` the
 * UI renders, so no client has to re-implement the state machine.
 */
export function mapPayment(row: PaymentRow) {
  const stage = paymentStage(row);
  return {
    id: row.id,
    orderId: row.order_id,
    studentId: row.student_id,
    restaurantId: row.restaurant_id,
    amount: row.amount,
    status: row.status,
    transferStatus: row.transfer_status,
    stage,
    stageLabel: PAYMENT_STAGE_LABEL[stage],
    method: row.method,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    transferConfirmedAt: row.transfer_confirmed_at,
    // Phase 6B — payout retry state, shown on Admin Payout Management.
    transferAttempts: row.transfer_attempts ?? 0,
    transferFailureReason: row.transfer_failure_reason ?? null,
    // Phase 6D — the refund leg, plus the timeline every surface renders.
    refundStatus: row.refund_status ?? 'none',
    refundReason: row.refund_reason ?? null,
    refundAmount: row.refund_amount ?? null,
    refundTrigger: row.refund_trigger ?? null,
    refundInitiatedAt: row.refund_initiated_at ?? null,
    refundCompletedAt: row.refund_completed_at ?? null,
    refundFailureReason: row.refund_failure_reason ?? null,
    timeline: paymentTimeline(row),
  };
}

export function mapDelivery(row: DeliveryRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    driverName: row.driver_name,
    assignedAt: row.assigned_at,
    arrivedAt: row.arrived_at,
    deliveredAt: row.delivered_at,
  };
}

export function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    read: Boolean(row.read),
    createdAt: row.created_at,
  };
}
