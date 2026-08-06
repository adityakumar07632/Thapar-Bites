/**
 * Phase 13 — adds two Shared Delivery verification methods to each
 * `ready_for_pickup` shared order:
 *
 *   Option 1: Scan QR Codes  — sequential camera scan of both students' QR
 *             codes.  The server verifies signature, expiry, restaurant
 *             ownership, and order status on each scan; the second scan
 *             completes the delivery.
 *
 *   Option 2: Enter Pair Code Manually — restaurant types the full pair code
 *             (both halves combined) to complete the delivery.
 *
 * Everything else (individual orders, order status flow, SSE polling) is
 * unchanged from Phase 12.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, Clock, KeyRound, Package, QrCode, RefreshCw, Users, X } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { useEventStream } from '@/lib/useEventStream';
import { Panel, Badge } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Modal } from '@campus-bites/ui';
import { formatINR, timeAgo } from '@/lib/utils';
import { EmptyState, SkeletonRows } from '@campus-bites/ui';
import { QrScannerModal } from './QrScannerModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderLine {
  name: string;
  price: number;
  quantity: number;
}

interface DashboardOrder {
  id: string;
  deliveryType: 'individual' | 'shared';
  matchId: string | null;
  status: string;
  subtotal: number;
  convenienceFee: number;
  totalAmount: number;
  createdAt: string;
  lines: OrderLine[];
}

// Phase 13 — state for the two-step QR scan flow.
type QrPhase = 'idle' | 'first_done' | 'verified' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  order_received: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
};

const STATUS_TONE: Record<string, 'neutral' | 'turmeric' | 'cardamom' | 'chili'> = {
  order_received: 'turmeric',
  accepted: 'neutral',
  preparing: 'turmeric',
  ready_for_pickup: 'cardamom',
};

function partnerNote(order: DashboardOrder, orders: DashboardOrder[]): string | null {
  if (order.deliveryType !== 'shared' || !order.matchId) return null;
  const partner = orders.find((o) => o.id !== order.id && o.matchId === order.matchId);
  if (!partner) return 'Paired order — the partner order is not on this board.';
  return `Paired with #${partner.id.slice(-8)} — currently ${(
    STATUS_LABEL[partner.status] ?? partner.status
  ).toLowerCase()}. Both leave with one rider.`;
}

/** Both orders in a shared match ready for pickup → restaurant can verify. */
function canVerifySharedDelivery(order: DashboardOrder, orders: DashboardOrder[]): boolean {
  if (order.deliveryType !== 'shared' || !order.matchId) return false;
  if (order.status !== 'ready_for_pickup') return false;
  const partner = orders.find((o) => o.id !== order.id && o.matchId === order.matchId);
  return partner?.status === 'ready_for_pickup';
}

// ---------------------------------------------------------------------------
// Pair Code verification modal
// ---------------------------------------------------------------------------

interface PairCodeModalProps {
  matchId: string;
  token: string;
  onSuccess: () => void;
  onClose: () => void;
}

function PairCodeModal({ matchId, token, onSuccess, onClose }: PairCodeModalProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!code.trim()) { setError('Enter the full pair code.'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.post(
        '/restaurant/shared-delivery/verify-pair-code',
        { matchId, pairCode: code.trim().toUpperCase() },
        token,
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Enter Pair Code"
      description="Ask Student A and Student B to read out their halves. Type the full combined code."
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-steel-700" htmlFor="paircode-input">
            Full pair code
          </label>
          <input
            id="paircode-input"
            type="text"
            className="w-full rounded-lg border border-steel-200 px-3 py-2.5 font-mono text-lg uppercase tracking-widest text-steel-900 placeholder:text-steel-300 focus:border-steel-400 focus:outline-none"
            placeholder="e.g. AB3DE"
            value={code}
            maxLength={10}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            autoFocus
          />
          <p className="text-xs text-steel-400">
            Student A reads their half first; Student B reads theirs. Together they form the full code.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-chili-50 px-3 py-2 text-sm text-chili-700">{error}</p>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1 justify-center" disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} className="flex-1 justify-center" disabled={busy || !code.trim()}>
            {busy ? 'Verifying…' : 'Confirm delivery'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// QR verification panel (inline within the order card)
// ---------------------------------------------------------------------------

interface QrVerifyPanelProps {
  token: string;
  onSuccess: () => void;
}

function QrVerifyPanel({ token, onSuccess }: QrVerifyPanelProps) {
  const [phase, setPhase] = useState<QrPhase>('idle');
  const [firstPart, setFirstPart] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  async function handleScan(payload: string) {
    setScanOpen(false);
    try {
      const res = await api.post<{
        scanned?: number;
        part?: string;
        verified?: boolean;
        message: string;
      }>('/restaurant/shared-delivery/scan-qr', { payload }, token);

      if (res.verified) {
        setPhase('verified');
        onSuccess();
      } else if (res.scanned === 1) {
        setPhase('first_done');
        setFirstPart(res.part ?? null);
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiRequestError ? err.message : 'QR scan failed. Try again.');
      setPhase('error');
    }
  }

  const secondStudentLabel = firstPart === 'A' ? 'B' : 'A';
  const scanLabel = phase === 'first_done' ? `Scan Student ${secondStudentLabel} QR` : 'Scan Student A QR';
  const scanHint =
    phase === 'first_done'
      ? `Student ${firstPart ?? ''} verified. Scan the second student's QR code.`
      : "Point the camera at the student's QR code.";

  return (
    <>
      {phase === 'idle' && (
        <Button size="sm" onClick={() => setScanOpen(true)} className="flex-1 justify-center gap-1.5">
          <QrCode size={14} aria-hidden /> Scan Student A QR
        </Button>
      )}

      {phase === 'first_done' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-cardamom-500/10 px-3 py-2 text-xs font-medium text-cardamom-700">
            <CheckCircle2 size={14} />
            Student {firstPart} verified — scan the second code to complete.
          </div>
          <Button size="sm" onClick={() => setScanOpen(true)} className="flex-1 justify-center gap-1.5">
            <QrCode size={14} aria-hidden /> {scanLabel}
          </Button>
        </div>
      )}

      {phase === 'verified' && (
        <div className="flex items-center gap-2 rounded-lg bg-cardamom-500/10 px-3 py-2 text-sm font-semibold text-cardamom-700">
          <CheckCircle2 size={16} /> ✅ Shared Delivery Verified — hand over both orders.
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg bg-chili-50 px-3 py-2 text-xs text-chili-700">{errorMsg}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setPhase('idle'); setErrorMsg(null); }}
            className="flex-1 justify-center"
          >
            Try again
          </Button>
        </div>
      )}

      <QrScannerModal
        open={scanOpen}
        title={scanLabel}
        hint={scanHint}
        onScan={handleScan}
        onClose={() => setScanOpen(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function RestaurantOrdersScreen() {
  const { token } = useAuthStore();
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [restaurantStatus, setRestaurantStatus] = useState<'open' | 'busy' | 'closed'>('open');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Phase 13 — pair code modal state.
  const [pairCodeTarget, setPairCodeTarget] = useState<{ matchId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<DashboardOrder[]>('/restaurant/orders', token);
      setOrders(data);
      setError(null);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load orders.');
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10000);
    return () => clearInterval(interval);
  }, [load]);

  useEventStream(token, (event) => {
    if (event.type === 'new_order' || event.type === 'order_updated') void load();
  });

  async function act(orderId: string, action: 'accept' | 'reject' | 'preparing' | 'ready') {
    setBusyId(orderId);
    try {
      await api.patch(`/restaurant/orders/${orderId}/${action}`, undefined, token);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function updateStatus(status: 'open' | 'busy' | 'closed') {
    const previous = restaurantStatus;
    setRestaurantStatus(status);
    try {
      await api.patch('/restaurant/status', { status }, token);
    } catch {
      setRestaurantStatus(previous);
    }
  }

  return (
    <div className="animate-rise">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-steel-900">Incoming orders</h1>
          <p className="text-sm text-steel-500">New orders appear the instant they're confirmed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-steel-500">Kitchen status:</span>
          {(['open', 'busy', 'closed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => void updateStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                restaurantStatus === s
                  ? 'bg-steel-900 text-white'
                  : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
              }`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => void load()}
            className="ml-1 rounded-full p-1.5 text-steel-400 hover:text-steel-700"
            aria-label="Refresh orders"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-chili-50 px-4 py-3 text-sm text-chili-700">{error}</div>
      )}

      {/* Order list */}
      {!loaded ? (
        <SkeletonRows count={3} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title="No active orders"
          description="Orders appear here in real time as students check out."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => {
            const note = partnerNote(order, orders);
            const canVerify = canVerifySharedDelivery(order, orders);
            return (
              <Panel key={order.id}>
                {/* Order header */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-semibold text-steel-800">
                      #{order.id.slice(-8)}
                    </span>
                    <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </Badge>
                    {order.deliveryType === 'shared' && (
                      <Badge tone="neutral">
                        <Users size={11} className="mr-1" />
                        Shared delivery
                      </Badge>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-steel-400">
                    <Clock size={11} />
                    {timeAgo(order.createdAt)}
                  </span>
                </div>

                {/* Line items */}
                <ul className="mb-3 flex flex-col gap-1">
                  {order.lines.map((line, i) => (
                    <li key={i} className="flex justify-between text-sm text-steel-700">
                      <span>
                        {line.quantity}× {line.name}
                      </span>
                      <span className="text-steel-500">{formatINR(line.price * line.quantity)}</span>
                    </li>
                  ))}
                </ul>

                {/* Totals */}
                <div className="mb-3 border-t border-steel-100 pt-2 text-sm">
                  <div className="flex justify-between font-medium text-steel-800">
                    <span>Total</span>
                    <span>{formatINR(order.totalAmount)}</span>
                  </div>
                </div>

                {/* Partner pairing note */}
                {note && (
                  <p className="mb-3 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">
                    {note}
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {order.status === 'order_received' && (
                    <>
                      <Button
                        variant="danger"
                        disabled={busyId === order.id}
                        onClick={() => void act(order.id, 'reject')}
                        className="flex-1 justify-center"
                      >
                        <X size={15} aria-hidden /> Reject
                      </Button>
                      <Button
                        disabled={busyId === order.id}
                        onClick={() => void act(order.id, 'accept')}
                        className="flex-1 justify-center"
                      >
                        <Check size={15} aria-hidden /> Accept
                      </Button>
                    </>
                  )}

                  {order.status === 'accepted' && (
                    <Button
                      disabled={busyId === order.id}
                      onClick={() => void act(order.id, 'preparing')}
                      className="flex-1 justify-center"
                    >
                      Start preparing
                    </Button>
                  )}

                  {order.status === 'preparing' && (
                    <Button
                      disabled={busyId === order.id}
                      onClick={() => void act(order.id, 'ready')}
                      className="flex-1 justify-center"
                    >
                      Mark ready for pickup
                    </Button>
                  )}

                  {order.status === 'ready_for_pickup' && order.deliveryType !== 'shared' && (
                    <div className="flex-1 rounded-lg bg-cardamom-500/10 py-2 text-center text-xs font-medium text-cardamom-600">
                      Waiting for delivery pickup…
                    </div>
                  )}

                  {/* ── Phase 13: Shared Delivery verification ──────────── */}
                  {order.status === 'ready_for_pickup' && order.deliveryType === 'shared' && (
                    <div className="w-full">
                      {!canVerify ? (
                        <div className="rounded-lg bg-steel-50 py-2 text-center text-xs text-steel-500">
                          Waiting for partner order to be ready…
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <p className="text-xs font-semibold text-steel-500 uppercase tracking-wide">
                            Verify shared delivery
                          </p>

                          {/* Option 1 — QR scan */}
                          <div className="rounded-xl border border-steel-150 bg-steel-50 p-3">
                            <p className="mb-2 text-xs font-semibold text-steel-700">
                              Option 1 — Scan student QR codes
                            </p>
                            <QrVerifyPanel
                              token={token ?? ''}
                              onSuccess={() => void load()}
                            />
                          </div>

                          {/* Divider */}
                          <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-steel-150" />
                            <span className="text-[10px] uppercase tracking-widest text-steel-400">or</span>
                            <div className="h-px flex-1 bg-steel-150" />
                          </div>

                          {/* Option 2 — Manual pair code */}
                          <div className="rounded-xl border border-steel-150 bg-steel-50 p-3">
                            <p className="mb-2 text-xs font-semibold text-steel-700">
                              Option 2 — Enter pair code manually
                            </p>
                            <Button
                              variant="secondary"
                              className="w-full justify-center gap-1.5"
                              onClick={() =>
                                setPairCodeTarget({ matchId: order.matchId! })
                              }
                            >
                              <KeyRound size={14} />
                              Enter pair code
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* Pair Code modal */}
      {pairCodeTarget && (
        <PairCodeModal
          matchId={pairCodeTarget.matchId}
          token={token ?? ''}
          onSuccess={() => {
            setPairCodeTarget(null);
            void load();
          }}
          onClose={() => setPairCodeTarget(null)}
        />
      )}
    </div>
  );
}
