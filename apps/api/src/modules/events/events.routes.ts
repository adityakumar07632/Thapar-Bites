import { Router } from 'express';
import { requireAuth, verifyAccessToken } from '../../lib/auth';
import { issueStreamTicket, redeemStreamTicket } from '../../lib/sseTickets';
import { ok } from '../../lib/response';
import {
  registerStudentConnection,
  registerRestaurantConnection,
  unregisterStudentConnection,
  unregisterRestaurantConnection,
} from '../../lib/eventBus';

export const eventsRouter = Router();

const HEARTBEAT_MS = 20000;

/**
 * POST /events/ticket — Phase 2 security fix.
 *
 * `EventSource` can't set an Authorization header, so the stream URL needs a
 * credential in the query string. Putting the 2-hour access JWT there leaked
 * it into access logs, proxy logs and browser history. The client now trades
 * its bearer token for a single-use, 60-second opaque ticket and puts that in
 * the URL instead.
 */
eventsRouter.post('/ticket', requireAuth(), (req, res) => {
  const { ticket, expiresInMs } = issueStreamTicket(req.auth!);
  return ok(res, { ticket, expiresInMs });
});

/**
 * GET /events?ticket=<single-use ticket> — a long-lived SSE stream.
 *
 * `?token=<JWT>` is still accepted for backward compatibility with any client
 * that hasn't been updated, but it must now be a genuine ACCESS token: before
 * the `typ` claim existed, a 30-day refresh token was accepted here too.
 */
eventsRouter.get('/', (req, res) => {
  const ticketParam = typeof req.query.ticket === 'string' ? req.query.ticket : '';
  const tokenParam = typeof req.query.token === 'string' ? req.query.token : '';

  let payload = ticketParam ? redeemStreamTicket(ticketParam) : null;
  if (!payload && tokenParam) {
    try {
      payload = verifyAccessToken(tokenParam);
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    res.status(401).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');

  if (payload.role === 'student') {
    registerStudentConnection(payload.sub, res);
  } else if (payload.role === 'restaurant' && payload.restaurantId) {
    registerRestaurantConnection(payload.restaurantId, res);
  }

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  // Phase 2 bug fix: only 'close' was handled. A socket that errored (client
  // network drop, proxy reset) never fired 'close' on some Node versions, so
  // the heartbeat interval and the eventBus entry leaked for the process's
  // lifetime — writes then piled up against a dead socket. `cleanup` is
  // idempotent and bound to every terminal signal.
  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    if (payload!.role === 'student') {
      unregisterStudentConnection(payload!.sub, res);
    } else if (payload!.role === 'restaurant' && payload!.restaurantId) {
      unregisterRestaurantConnection(payload!.restaurantId, res);
    }
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
});
