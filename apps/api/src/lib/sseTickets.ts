import crypto from 'node:crypto';
import type { AuthPayload } from './auth';

/**
 * Phase 2 security fix — SSE connections no longer put a long-lived JWT in a
 * URL query string.
 *
 * The browser's native `EventSource` cannot set an `Authorization` header, so
 * the old `GET /events?token=<access JWT>` leaked a 2-hour credential into
 * server access logs, proxy logs and browser history.
 *
 * Instead the client calls `POST /events/ticket` with its normal bearer
 * header and receives a single-use, 60-second, opaque ticket to put in the
 * query string. Even if that ticket is logged, it is worthless within a
 * minute and cannot be replayed.
 */

const TICKET_TTL_MS = 60 * 1000;

interface Ticket {
  payload: AuthPayload;
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();

export function issueStreamTicket(payload: AuthPayload): { ticket: string; expiresInMs: number } {
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(ticket, { payload, expiresAt: Date.now() + TICKET_TTL_MS });
  return { ticket, expiresInMs: TICKET_TTL_MS };
}

/** Consumes the ticket — a ticket is valid for exactly one stream. */
export function redeemStreamTicket(ticket: string): AuthPayload | null {
  const found = tickets.get(ticket);
  if (!found) return null;
  tickets.delete(ticket);
  if (found.expiresAt <= Date.now()) return null;
  return found.payload;
}

export function sweepExpiredTickets(): void {
  const now = Date.now();
  for (const [key, value] of tickets) {
    if (value.expiresAt <= now) tickets.delete(key);
  }
}
