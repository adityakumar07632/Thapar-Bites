import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeIndianRupee, CheckCircle2, PartyPopper, QrCode, Timer, Users } from 'lucide-react';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Chip } from '@/shared/components/ui/Chip';
import { Button } from '@/shared/components/ui/Button';
import { PairCodeTicket } from '@/shared/components/ui/PairCodeTicket';
import { OrderStepper } from '@/shared/components/ui/OrderStepper';
import { ErrorState, Skeleton } from '@campus-bites/ui';
import { api, ApiRequestError } from '@/shared/lib/api';
import { formatCountdown, formatINR } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useEventStream } from '@/shared/lib/useEventStream';
import type { MatchDetails } from '@/features/shared-delivery/queueTypes';
import QRCode from 'qrcode';

const POLL_MS = 6000;

/** The shared-delivery journey as a student experiences it, used here as a
 * preview of what happens after payment. */
const TIMELINE = [
  { key: 'matched', label: 'Matched with a delivery partner' },
  { key: 'paid', label: 'Both students pay within 3 minutes' },
  { key: 'confirmed', label: 'Restaurant confirms and prepares' },
  { key: 'pickup', label: 'One rider collects both orders' },
  { key: 'handover', label: 'PairCode handover at your hostel' },
];

/**
 * Phase 13 — renders the split pair code (student's half + blanks for the
 * partner's half) in a clear ticket-stub style.
 *
 * Example display strings from the server: "AB___" (student A) or "__CDE"
 * (student B).  We boldly highlight the student's own characters and dim the
 * blank placeholders so the visual split is immediately obvious.
 */
function SplitCodeDisplay({ display }: { display: string }) {
  return (
    <div className="flex items-center justify-center gap-0.5 font-mono text-3xl font-semibold tracking-widest">
      {display.split('').map((ch, i) => (
        <span
          key={i}
          className={ch === '_' ? 'text-steel-300' : 'text-steel-900'}
        >
          {ch === '_' ? '—' : ch}
        </span>
      ))}
    </div>
  );
}

export function MatchFoundScreen() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, []);

  const load = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      const data = await api.get<MatchDetails>('/shared-delivery/match');
      setMatch(data);
      setPhase('ready');
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your match.');
      setPhase((current) => (current === 'loading' ? 'error' : current));
    }
    timerRef.current = setTimeout(load, POLL_MS);
  }, []);

  useEffect(() => {
    pollNowRef.current = load;
    void load();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  useEventStream(token, (event) => {
    if (event.type === 'order_updated' || event.type === 'queue_status_changed') pollNowRef.current();
  });

  // Phase 13 — generate QR code data URL whenever the payload changes.
  useEffect(() => {
    if (!match?.qrPayload) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(match.qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#1a2332', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [match?.qrPayload]);

  if (phase === 'loading') {
    return (
      <AppShell>
        <TopBar title="Match found" />
        <div className="flex flex-col gap-3 px-5 pt-4">
          <Skeleton className="h-36 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
        </div>
      </AppShell>
    );
  }

  if (phase === 'error' || !match) {
    return (
      <AppShell>
        <TopBar title="Match found" onBack={() => navigate('/')} />
        <div className="px-5 pt-6">
          <ErrorState
            title="No active match"
            description={error ?? "We couldn't find a live Shared Delivery match for you."}
            onRetry={() => {
              setPhase('loading');
              void load();
            }}
          />
        </div>
      </AppShell>
    );
  }

  const deadlineMs = Math.max(0, new Date(match.paymentDeadline).getTime() - now);
  const awaitingPayment = match.status === 'pending_payment';
  const total = (match.subtotal ?? 0) + match.sharedFee;

  // Show verification sections only once the order is confirmed (paid).
  const showVerification =
    !awaitingPayment && (match.verificationDisplay || match.qrPayload);

  return (
    <AppShell>
      <TopBar title="Match found" subtitle={match.restaurantName ?? undefined} onBack={() => navigate('/orders')} />

      <div className="flex flex-col gap-3 px-5 pt-4 pb-8">
        <Compartment className="flex flex-col items-center p-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cardamom-500 text-white">
            <PartyPopper size={26} />
          </span>
          <p className="mt-4 font-display text-lg font-semibold text-steel-900">You've been paired</p>
          <p className="mt-1.5 max-w-[300px] text-sm leading-snug text-steel-500">
            Another {match.partner.hostel ?? 'hostel'} student is ordering from{' '}
            {match.restaurantName ?? 'the same restaurant'}. You share one delivery — never your identity or
            your food.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Chip tone="cardamom">
              <Users size={12} /> Delivery partner found
            </Chip>
            {match.etaMinutes && <Chip tone="neutral">~{match.etaMinutes} min after confirmation</Chip>}
          </div>
        </Compartment>

        {awaitingPayment && (
          <Compartment className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-steel-900">Payment window</p>
              <p className="mt-0.5 text-xs leading-snug text-steel-500">
                Both students must pay before the timer ends, or the match is released.
              </p>
            </div>
            <span
              className={`shrink-0 font-mono text-2xl font-semibold tabular-nums ${deadlineMs < 30_000 ? 'text-chili-600' : 'text-steel-800'}`}
            >
              <Timer size={14} className="mr-1 inline align-[-2px]" />
              {formatCountdown(deadlineMs)}
            </span>
          </Compartment>
        )}

        <PairCodeTicket
          code={match.pairCode}
          restaurantName={match.restaurantName ?? 'Restaurant'}
        />
        <p className="-mt-1 px-1 text-[11px] leading-snug text-steel-400">
          This is your shared PairCode. Both of you read it out at handover so the rider hands each order to
          the right person.
        </p>

        {/* ── Phase 13: Verification sections ─────────────────────────────── */}
        {showVerification && (
          <>
            {/* Split pair code — student sees only their half */}
            {match.verificationDisplay && (
              <Compartment className="p-5">
                <p className="mb-3 font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
                  Your verification code
                </p>
                <SplitCodeDisplay display={match.verificationDisplay} />
                <p className="mt-3 text-center text-[11px] leading-snug text-steel-400">
                  Show only your part to the restaurant. Your partner shows theirs.
                  Together they form the full PairCode above.
                </p>
              </Compartment>
            )}

            {/* QR code */}
            {match.qrPayload && (
              <Compartment className="flex flex-col items-center p-5">
                <div className="mb-3 flex items-center gap-2">
                  <QrCode size={16} className="text-steel-500" />
                  <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
                    Your QR verification
                  </p>
                </div>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Your QR verification code"
                    className="h-[200px] w-[200px] rounded-xl"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-[200px] w-[200px] items-center justify-center rounded-xl bg-steel-50">
                    <Skeleton className="h-full w-full rounded-xl" />
                  </div>
                )}
                <p className="mt-3 text-center text-[11px] leading-snug text-steel-400">
                  The restaurant scans both students' QR codes at handover. Each code is
                  one-time use and expires after delivery.
                </p>
              </Compartment>
            )}
          </>
        )}

        <Compartment className="p-4">
          <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
            What this match costs you
          </p>
          <div className="mt-2.5 flex flex-col gap-1.5 text-sm text-steel-600">
            {match.subtotal !== null && (
              <div className="flex justify-between">
                <span>Your food</span>
                <span>{formatINR(match.subtotal)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Shared delivery fee</span>
              <span>{formatINR(match.sharedFee)}</span>
            </div>
            {match.individualFee > 0 && (
              <div className="flex justify-between text-steel-400">
                <span className="line-through">Individual delivery fee</span>
                <span className="line-through">{formatINR(match.individualFee)}</span>
              </div>
            )}
          </div>
          <div className="my-3 h-px bg-steel-100" />
          <div className="flex justify-between font-display font-semibold text-steel-900">
            <span>You pay</span>
            <span>{formatINR(total)}</span>
          </div>
          {match.savings > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-cardamom-500/10 px-3 py-2 text-xs font-medium text-cardamom-600">
              <BadgeIndianRupee size={14} />
              You save {formatINR(match.savings)} on this delivery by sharing it.
            </div>
          )}
        </Compartment>

        <div>
          <p className="mb-2 px-1 font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
            Delivery timeline
          </p>
          <Compartment className="p-4">
            <OrderStepper steps={TIMELINE} currentIndex={awaitingPayment ? 1 : 2} />
          </Compartment>
        </div>

        {match.orderId && (
          <Button
            fullWidth
            size="lg"
            icon={awaitingPayment ? <ArrowRight size={18} /> : <CheckCircle2 size={18} />}
            onClick={() =>
              navigate(awaitingPayment ? `/order/${match.orderId}/payment` : `/order/${match.orderId}`, {
                replace: true,
              })
            }
          >
            {awaitingPayment ? `Continue to payment · ${formatINR(total)}` : 'Track this order'}
          </Button>
        )}
      </div>
    </AppShell>
  );
}
