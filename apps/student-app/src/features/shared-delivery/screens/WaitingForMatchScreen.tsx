import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, Hourglass, ListOrdered, Radio, Users, X } from 'lucide-react';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Chip } from '@/shared/components/ui/Chip';
import { Button } from '@/shared/components/ui/Button';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { ErrorState, Skeleton } from '@campus-bites/ui';
import { api, ApiRequestError } from '@/shared/lib/api';
import { formatCountdown, formatINR } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useEventStream } from '@/shared/lib/useEventStream';
import type { QueueStatusResponse } from '@/features/shared-delivery/queueTypes';

/** Safety-net cadence — SSE is what makes this feel live; the poll only
 * matters while a dropped stream is reconnecting. */
const POLL_MS = 5000;

type Dialog = 'none' | 'leave' | 'convert';

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Compartment className="p-3.5">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-steel-400">
        {icon}
        {label}
      </span>
      <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-steel-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-steel-400">{hint}</p>}
    </Compartment>
  );
}

export function WaitingForMatchScreen() {
  const navigate = useNavigate();
  const { student, token } = useAuthStore();
  const [status, setStatus] = useState<QueueStatusResponse | null>(null);
  const [phase, setPhase] = useState<'loading' | 'waiting' | 'matched' | 'gone' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>('none');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, []);

  const poll = useCallback(async () => {
    if (stoppedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      const next = await api.get<QueueStatusResponse>('/shared-delivery/status');
      if (stoppedRef.current) return;
      setStatus(next);
      setError(null);

      if (next.status === 'matched') {
        stoppedRef.current = true;
        setPhase('matched');
        navigationTimerRef.current = setTimeout(() => navigate('/match', { replace: true }), 900);
        return;
      }
      if (next.status === 'none' || next.status === 'expired' || next.status === 'cancelled') {
        stoppedRef.current = true;
        setPhase('gone');
        return;
      }
      setPhase('waiting');
    } catch (err) {
      if (stoppedRef.current) return;
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the queue.');
      setPhase((current) => (current === 'loading' ? 'error' : current));
    }
    timerRef.current = setTimeout(poll, POLL_MS);
  }, [navigate]);

  useEffect(() => {
    stoppedRef.current = false;
    pollNowRef.current = poll;
    void poll();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    };
  }, [poll]);

  useEventStream(token, (event) => {
    if (event.type === 'queue_status_changed') pollNowRef.current();
  });

  async function handleLeave() {
    setBusy(true);
    stoppedRef.current = true;
    try {
      await api.del('/shared-delivery/queue');
      navigate('/', { replace: true });
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not leave the queue.');
      stoppedRef.current = false;
    } finally {
      setBusy(false);
      setDialog('none');
    }
  }

  async function handleContinueWaiting() {
    setBusy(true);
    setActionError(null);
    try {
      const next = await api.post<QueueStatusResponse>('/shared-delivery/continue-waiting');
      setStatus(next);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not extend your wait.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConvert() {
    setBusy(true);
    setActionError(null);
    try {
      const order = await api.post<{ id: string }>('/shared-delivery/convert-to-individual');
      stoppedRef.current = true;
      navigate(`/order/${order.id}/payment`, { replace: true });
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not switch to Individual Delivery.');
    } finally {
      setBusy(false);
      setDialog('none');
    }
  }

  if (phase === 'loading') {
    return (
      <AppShell>
        <TopBar title="Shared Delivery queue" />
        <div className="flex flex-col gap-3 px-5 pt-4">
          <Skeleton className="h-40 rounded-card" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
          <Skeleton className="h-28 rounded-card" />
        </div>
      </AppShell>
    );
  }

  if (phase === 'error') {
    return (
      <AppShell>
        <TopBar title="Shared Delivery queue" onBack={() => navigate('/')} />
        <div className="px-5 pt-6">
          <ErrorState
            title="Couldn't load the queue"
            description={error ?? 'Check your connection and try again.'}
            onRetry={() => {
              stoppedRef.current = false;
              setPhase('loading');
              void poll();
            }}
          />
        </div>
      </AppShell>
    );
  }

  if (phase === 'gone') {
    const wasCancelled = status?.status === 'cancelled';
    return (
      <AppShell>
        <TopBar title="Shared Delivery queue" onBack={() => navigate('/')} />
        <div className="flex flex-col items-center px-6 pt-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-steel-100 text-steel-400">
            <Hourglass size={26} />
          </span>
          <p className="mt-5 font-display text-lg font-semibold text-steel-900">
            {wasCancelled ? "You've left the queue" : 'No longer in a queue'}
          </p>
          <p className="mt-1.5 max-w-[300px] text-sm leading-snug text-steel-500">
            {wasCancelled
              ? 'Nothing was charged. Rebuild your cart whenever you want to try Shared Delivery again.'
              : 'This queue entry is closed. You can start a new Shared Delivery order any time.'}
          </p>
          <Button className="mt-6" onClick={() => navigate('/', { replace: true })}>
            Browse restaurants
          </Button>
        </div>
      </AppShell>
    );
  }

  const matched = phase === 'matched';
  const elapsedMs = status?.joinedAt ? Math.max(0, now - new Date(status.joinedAt).getTime()) : 0;
  const decisionRequired = Boolean(status?.decisionRequired);
  const stageRemainingMs = Math.max(
    0,
    status?.expiresAt ? new Date(status.expiresAt).getTime() - now : 0,
  );
  const etaMs = status?.estimatedWaitMs ?? 0;

  return (
    <AppShell>
      <TopBar
        title="Shared Delivery queue"
        subtitle={status?.restaurantName ?? undefined}
        onBack={() => navigate('/')}
      />

      <div className="flex flex-col gap-3 px-5 pt-4 pb-8">
        <Compartment className="flex flex-col items-center p-6 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <span
              className={`absolute inset-0 rounded-full border-2 ${matched ? 'border-cardamom-500' : 'border-turmeric-400 animate-ping'} opacity-40`}
              aria-hidden
            />
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-full ${matched ? 'bg-cardamom-500 text-white' : 'bg-turmeric-500 text-steel-900'} transition-colors`}
            >
              <Users size={26} />
            </span>
          </div>

          <p className="mt-4 font-display text-lg font-semibold text-steel-900">
            {matched ? 'Match found!' : decisionRequired ? 'Still looking…' : 'Looking for a match…'}
          </p>
          <p className="mt-1.5 max-w-[300px] text-sm leading-snug text-steel-500">
            {matched
              ? 'Taking you to the match details…'
              : `Pairing you with another ${student?.hostel ?? 'hostel'} student ordering from ${status?.restaurantName ?? 'the same restaurant'}. You'll never see who they are — Thapar Bites only shares the delivery.`}
          </p>

          {!matched && (
            <>
              <p className="mt-5 font-mono text-4xl font-semibold tabular-nums text-steel-800">
                {formatCountdown(elapsedMs)}
              </p>
              <p className="mt-1 text-xs text-steel-400">Time in queue</p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-cardamom-500/10 px-2.5 py-1 text-[11px] font-medium text-cardamom-600">
                <Radio size={12} className="animate-pulse" /> Live updates on
              </span>
            </>
          )}
        </Compartment>

        {!matched && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatTile
                icon={<ListOrdered size={12} />}
                label="Position"
                value={status?.position ? `#${status.position}` : '—'}
                hint="in your hostel queue"
              />
              <StatTile
                icon={<Users size={12} />}
                label="Waiting"
                value={String(status?.waitingCount ?? 0)}
                hint={`${status?.totalWaitingCount ?? 0} on campus`}
              />
              <StatTile
                icon={<Clock3 size={12} />}
                label="Est. wait"
                value={`~${Math.max(1, Math.round(etaMs / 60000))}m`}
                hint="based on recent matches"
              />
            </div>

            <Compartment className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-steel-900">
                    {decisionRequired ? 'Decision time' : `Stage ${status?.stage ?? 1} of 3`}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-steel-500">
                    {decisionRequired
                      ? "We've searched for 15 minutes without a match. Choose how to continue."
                      : 'We keep searching automatically. No action needed from you.'}
                  </p>
                </div>
                {!decisionRequired && (
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-steel-700">
                    {formatCountdown(stageRemainingMs)}
                  </span>
                )}
              </div>

              <div className="mt-3 flex gap-1.5" aria-hidden>
                {[1, 2, 3].map((stage) => (
                  <span
                    key={stage}
                    className={`h-1.5 flex-1 rounded-full ${
                      decisionRequired || (status?.stage ?? 1) > stage
                        ? 'bg-cardamom-500'
                        : (status?.stage ?? 1) === stage
                          ? 'bg-turmeric-500'
                          : 'bg-steel-200'
                    }`}
                  />
                ))}
              </div>
            </Compartment>

            {status?.subtotal !== undefined && (
              <Compartment className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-steel-400">Your frozen cart</p>
                  <p className="font-display text-sm font-semibold text-steel-900">
                    {formatINR(status.subtotal)}
                  </p>
                </div>
                <Chip tone="turmeric">Shared Delivery</Chip>
              </Compartment>
            )}

            {(actionError || error) && (
              <p className="rounded-lg bg-chili-500/10 px-3.5 py-2.5 text-xs text-chili-600">
                {actionError ?? error}
              </p>
            )}

            {decisionRequired ? (
              <div className="flex flex-col gap-2.5 pt-1">
                <Button fullWidth size="lg" disabled={busy} onClick={handleContinueWaiting}>
                  Keep waiting 5 more minutes
                </Button>
                <Button
                  fullWidth
                  size="lg"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setDialog('convert')}
                >
                  Switch to Individual Delivery
                </Button>
                <Button variant="ghost" fullWidth icon={<X size={16} />} disabled={busy} onClick={() => setDialog('leave')}>
                  Leave the queue
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="mt-1"
                fullWidth
                icon={<X size={16} />}
                disabled={busy}
                onClick={() => setDialog('leave')}
              >
                Leave the queue
              </Button>
            )}
          </>
        )}
      </div>

      {dialog === 'leave' && (
        <ConfirmDialog
          title="Leave the Shared Delivery queue?"
          description="Your frozen cart is released and nothing is charged. Leaving queues often can lower your reliability score."
          confirmLabel="Leave queue"
          cancelLabel="Keep waiting"
          onConfirm={handleLeave}
          onCancel={() => setDialog('none')}
        />
      )}

      {dialog === 'convert' && (
        <ConfirmDialog
          title="Switch to Individual Delivery?"
          description="Your cart is placed as your own order right away — you pay the full delivery yourself instead of splitting it, and the ₹10 shared fee no longer applies."
          confirmLabel="Switch and pay"
          cancelLabel="Keep waiting"
          onConfirm={handleConvert}
          onCancel={() => setDialog('none')}
        />
      )}
    </AppShell>
  );
}
