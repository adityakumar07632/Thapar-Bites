import type { OrderStatus, QueueStatus, MatchStatus } from '@/shared/types/enums';

/** GET /shared-delivery/status — extended in Phase 4 with the live queue
 * metrics the Queue screen shows (position, people waiting, ETA). */
export interface QueueStatusResponse {
  status: QueueStatus;
  restaurantId?: string;
  restaurantName?: string | null;
  hostel?: string;
  subtotal?: number;
  joinedAt?: string;
  expiresAt?: string;
  position?: number;
  waitingCount?: number;
  totalWaitingCount?: number;
  estimatedWaitMs?: number;
  stage?: 1 | 2 | 3;
  elapsedMs?: number;
  stageRemainingMs?: number;
  decisionRequired?: boolean;
}

/** GET /shared-delivery/match — extended in Phase 4 with the pair code, fee
 * breakdown and savings the Match Found screen presents. The partner is still
 * never identified: only the hostel both students share.
 *
 * Phase 13 adds:
 *   verificationPart   — the student's half of the pair code (plain text)
 *   verificationDisplay — display string with blanks, e.g. "AB___" or "__CDE"
 *   qrPayload          — encrypted QR payload to render as a QR code; null once consumed
 */
export interface MatchDetails {
  matchId: string;
  restaurantId: string;
  restaurantName: string | null;
  etaMinutes: number | null;
  status: MatchStatus;
  pairCode: string;
  paymentDeadline: string;
  matchedAt: string;
  orderId: string | null;
  orderStatus: OrderStatus | null;
  subtotal: number | null;
  sharedFee: number;
  individualFee: number;
  savings: number;
  partner: { hostel: string | null };
  // Phase 13
  verificationPart: string | null;
  verificationDisplay: string | null;
  qrPayload: string | null;
}
