import { useEffect, useRef } from 'react';
import { api } from '@/shared/lib/api';

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

/**
 * Subscribes to the API's SSE stream for the lifetime of the component.
 * Events only ever say "something changed" (see apps/api's eventBus) — the
 * handler should react by re-fetching through the normal REST calls, which
 * stay the source of truth. Screens should still keep a slower poll running
 * underneath this as a safety net rather than depending on the stream alone.
 *
 * Phase 2 changes:
 *  - The access JWT no longer travels in the URL. We exchange it for a
 *    single-use 60-second stream ticket first, so the long-lived credential
 *    never lands in server access logs or browser history.
 *  - Reconnects are now our own, with exponential backoff. `EventSource`
 *    auto-reconnects, but it retried a URL whose ticket/token was already
 *    spent, so a dead stream became an endless 401 loop hammering the API
 *    every 2 seconds. We reconnect deliberately, fetching a fresh ticket
 *    each time, and back off 1s → 30s.
 */
export function useEventStream(token: string | null | undefined, onEvent: (event: StreamEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const backoffMs = () => Math.min(1000 * 2 ** attempt, 30_000);

    const connect = async () => {
      if (cancelled) return;
      try {
        const { ticket } = await api.post<{ ticket: string }>('/events/ticket');
        if (cancelled) return;

        source = new EventSource(`${BASE_URL}/events?ticket=${encodeURIComponent(ticket)}`);

        source.onopen = () => {
          attempt = 0; // healthy again — reset the backoff
        };

        source.onmessage = (message) => {
          try {
            const parsed = JSON.parse(message.data) as StreamEvent;
            handlerRef.current(parsed);
          } catch {
            // malformed or comment-only frame — ignore
          }
        };

        source.onerror = () => {
          // Close before scheduling, otherwise EventSource's own retry races
          // ours and we end up with two live streams per component.
          source?.close();
          source = null;
          if (cancelled) return;
          retryTimer = setTimeout(connect, backoffMs());
          attempt += 1;
        };
      } catch {
        if (cancelled) return;
        retryTimer = setTimeout(connect, backoffMs());
        attempt += 1;
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [token]);
}
