import { useEffect, useRef } from 'react';
import { api } from './api';

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

/** See apps/student-app's useEventStream for the full rationale — same
 * "dumb" event pattern and the same Phase 2 hardening (single-use stream
 * tickets instead of a JWT in the URL, plus our own backoff reconnect so a
 * dead stream can't hammer the API), just consumed by the restaurant/admin
 * side here. */
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
          attempt = 0;
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
