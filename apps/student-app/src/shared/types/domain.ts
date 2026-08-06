import type {
  DeliveryType,
  MatchStatus,
  OrderStatus,
  PaymentMethod,
  PaymentOutcome,
  PaymentStage,
  PaymentStatus,
  RestaurantStatus,
  TransferStatus,
} from './enums';

/** PRD Appendix D.6 — StudentProfiles table. Mirrors the real API response. */
export interface StudentProfile {
  id: string;
  fullName: string;
  rollNumber: string;
  hostel: string;
  roomNumber?: string | null;
  reliabilityScore: number; // BR-038: penalized on no-pay after a match
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

/** PRD Appendix D.7 — Restaurants table. */
export interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  minimumOrder: number; // Individual Delivery minimum, in INR
  sharedDeliveryMinimum: number; // Per-student Shared Delivery minimum, in INR
  status: RestaurantStatus;
  etaMinutes: number; // estimated preparation time, Ch. 4.5
  rating?: number | null;
  isActive: boolean; // false when disabled by Admin — restaurant can't take new orders
  imageUrl?: string | null; // Phase 5 — optional cover photo for the card
  ratingCount?: number; // Phase 8A — number of ratings
  deliveryFee?: number;
  location?: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
}

/** Phase 5 — a row from GET /restaurants/dishes: a dish plus enough of its
 * parent restaurant to render and filter it without a second request. */
export interface DishSearchResult extends MenuItem {
  restaurantName: string;
  restaurantStatus: RestaurantStatus;
  restaurantEtaMinutes: number;
  restaurantRating: number | null;
  restaurantIsActive: boolean;
}

/** Phase 5 — GET /students/stats. Every figure is derived server-side from
 * the student's own orders; nothing here is stored state. */
export interface StudentStats {
  totalOrders: number;
  sharedOrders: number;
  individualOrders: number;
  deliveredOrders: number;
  totalSpent: number;
  moneySaved: number;
  favoriteCount: number;
  topRestaurant: string | null;
}

/** Phase 5 — GET /students/favorites. */
export interface FavoritesPayload {
  restaurantIds: string[];
  dishIds: string[];
  restaurants: Restaurant[];
  dishes: (MenuItem & { restaurantName: string })[];
}

/** PRD Appendix D.8 — MenuCategories table. */
export interface MenuCategory {
  id: string;
  restaurantId: string;
  name: string;
}

/** PRD Appendix D.9 — MenuItems table. */
export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  isVeg?: boolean;
  imageUrl?: string | null;
  prepTimeMinutes?: number | null;
  rating?: number | null; // Phase 8A
  ratingCount?: number;   // Phase 8A
}

/** A line item as it appears on a placed Order (PRD Appendix D.13 OrderItems),
 * denormalized with a name/price snapshot rather than a live MenuItem join. */
export interface OrderLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

/** PRD Appendix D.15 — Matches table, as exposed by GET /shared-delivery/match.
 * Never includes the other student's identity (Ch. 7.13 privacy rules). */
export interface MatchInfo {
  matchId: string;
  restaurantId: string;
  status: MatchStatus;
  paymentDeadline: string;
  orderId: string | null;
  orderStatus: OrderStatus | null;
}

/**
 * PRD Appendix D.16 + Phase 6A — Payments table. Thapar Bites is the payment
 * intermediary, so a payment carries two legs: `status` (student -> Campus
 * Bites) and `transferStatus` (Thapar Bites -> restaurant). `stage` is the
 * single state the UI shows, derived server-side from both.
 */
export interface Payment {
  id: string;
  orderId: string;
  studentId: string | null;
  restaurantId: string | null;
  amount: number;
  status: PaymentStatus;
  transferStatus: TransferStatus;
  stage: PaymentStage;
  stageLabel: string;
  method: PaymentMethod | null;
  createdAt: string | null;
  paidAt: string | null;
  transferConfirmedAt: string | null;
  /** Phase 6D — the refund leg, present on every payment. */
  refundStatus: RefundStatus;
  refundReason: string | null;
  refundAmount: number | null;
  refundTrigger: RefundTrigger | null;
  refundInitiatedAt: string | null;
  refundCompletedAt: string | null;
  refundFailureReason: string | null;
  /** Phase 6D — Payment Success -> Confirmation or Refund, built server-side. */
  timeline: PaymentTimelineStep[];
}

/** Phase 6D — where the student's money is on its way back. */
export type RefundStatus = 'none' | 'pending' | 'completed' | 'failed';

/** Phase 6D — why Thapar Bites refunded. */
export type RefundTrigger =
  | 'restaurant_closed'
  | 'restaurant_rejected'
  | 'transfer_failed'
  | 'admin_cancelled'
  | 'admin_manual'
  | 'student_cancelled';

/** Phase 6D — one step of the payment timeline. */
export interface PaymentTimelineStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'pending' | 'failed';
  at: string | null;
  note?: string | null;
}

/** Phase 6A — a row of GET /payments/history. */
export interface PaymentHistoryEntry extends Payment {
  restaurantName: string | null;
  deliveryType: DeliveryType;
  orderStatus: OrderStatus;
}

/** PRD Appendix D.17 — Deliveries table. */
export interface Delivery {
  id: string;
  orderId: string;
  driverName: string | null;
  assignedAt: string | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
}

/** PRD Appendix D.12 / D.13 — Orders + OrderItems tables. */
export interface Order {
  id: string;
  studentId: string;
  restaurantId: string;
  restaurantName?: string | null; // Phase 8A
  deliveryType: DeliveryType;
  matchId: string | null;
  status: OrderStatus;
  subtotal: number;
  convenienceFee: number; // Ch. 1.7 — ₹10 per student on Shared Delivery
  totalAmount: number;
  pairCode: string | null; // Appendix D.12 `pair_code`
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  lines: OrderLine[];
  payment?: Payment | null;
  delivery?: Delivery | null;
  /** Phase 6D — Paid / Refunded / Cancelled / Payment Failed, from the API. */
  paymentOutcome?: PaymentOutcome;
  paymentOutcomeLabel?: string;
}
