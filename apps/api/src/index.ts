import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import './db/client'; // runs migrations on import

import { authRouter } from './modules/auth/auth.routes';
import { studentsRouter } from './modules/students/students.routes';
import { restaurantsRouter } from './modules/restaurants/restaurants.routes';
import { cartRouter } from './modules/cart/cart.routes';
import { checkoutRouter } from './modules/checkout/checkout.routes';
import { sharedDeliveryRouter } from './modules/sharedDelivery/sharedDelivery.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { deliveryRouter } from './modules/delivery/delivery.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { restaurantDashboardRouter } from './modules/restaurantDashboard/restaurantDashboard.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { eventsRouter } from './modules/events/events.routes';
import { ratingsRouter } from './modules/ratings/ratings.routes';
import { startMatchingEngine } from './modules/matching/matchingEngine';
import { startFulfillmentEngine } from './modules/orders/fulfillmentEngine';
import { startPayoutEngine } from './modules/payments/payouts';
import { purgeExpiredRefreshTokens } from './lib/refreshTokens';
import { sweepExpiredTickets } from './lib/sseTickets';
import { sweepRateLimitBuckets } from './lib/rateLimit';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Phase 2: needed so the rate limiter sees the real client IP (and not the
// proxy's) when the API runs behind nginx or a tunnel.
app.set('trust proxy', 1);
// Don't advertise the stack to attackers.
app.disable('x-powered-by');

/**
 * Phase 2 security fix — CORS was `cors()` with no arguments, which reflects
 * ANY requesting origin. Because the API is bearer-token based that wasn't
 * directly exploitable, but it let any website on the internet drive the API
 * with a token it had obtained. Origins are now an explicit allowlist,
 * configurable via CORS_ORIGINS for deployment.
 */
const DEFAULT_ORIGINS = [
  'http://localhost:5173', // student-app dev
  'http://localhost:5174', // ops-dashboard dev
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];
const allowedOrigins = (process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []).concat(
  process.env.NODE_ENV === 'production' ? [] : DEFAULT_ORIGINS,
);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header = same-origin, curl, or a mobile client: allow.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
    maxAge: 86400,
  }),
);

// Phase 6C: the only oversized body this API accepts is a QR code image sent
// as an inline data URL. It gets its own parser, mounted first — body-parser
// skips a request whose body is already parsed, so the strict limit below
// still governs every other endpoint.
const QR_UPLOAD_PATHS = [
  '/api/v1/restaurant/payment-settings',
  '/api/v1/restaurant/payment-settings/qr',
  '/api/v1/admin/restaurants/:id/payment-settings',
  '/api/v1/admin/restaurants/:id/payment-settings/qr',
  // Phase 6E — platform QR code for Thapar Bites' own payment identity.
  '/api/v1/admin/platform-payment-settings',
  '/api/v1/admin/platform-payment-settings/qr',
];
app.use(QR_UPLOAD_PATHS, express.json({ limit: '2mb' }));

// Phase 2: an unbounded JSON body let any client push arbitrary megabytes into
// the process. Nothing this API accepts is anywhere near 100kb.
app.use(express.json({ limit: '100kb' }));

// Security response headers (hand-rolled to avoid adding a dependency).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'campus-bites-api' }));

const v1 = express.Router();
v1.use('/auth', authRouter);
v1.use('/students', studentsRouter);
v1.use('/restaurants', restaurantsRouter);
v1.use('/cart', cartRouter);
v1.use('/checkout', checkoutRouter);
v1.use('/shared-delivery', sharedDeliveryRouter);
v1.use('/payments', paymentsRouter);
v1.use('/orders', ordersRouter);
v1.use('/delivery', deliveryRouter);
v1.use('/notifications', notificationsRouter);
v1.use('/restaurant', restaurantDashboardRouter);
v1.use('/admin', adminRouter);
v1.use('/events', eventsRouter);
v1.use('/ratings', ratingsRouter);
app.use('/api/v1', v1);

// Catch-all 404 for anything under /api/v1 that didn't match a route above.
app.use('/api/v1', (_req, res) => {
  res.status(404).json({ success: false, error: { code: 'SYSTEM_001', message: 'No such endpoint.' } });
});

// Centralized error handler — catches thrown/rejected errors from any route.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] unhandled error:', err);
  // A rejected CORS origin is a client mistake, not a server fault.
  if (err instanceof Error && err.message.includes('is not allowed by CORS')) {
    return res.status(403).json({ success: false, error: { code: 'AUTH_003', message: 'Origin not allowed.' } });
  }
  // Never leak stack traces or driver messages to the client.
  res.status(500).json({ success: false, error: { code: 'SYSTEM_001', message: 'Unexpected server error.' } });
});

const server = app.listen(PORT, () => {
  console.log(`[campus-bites-api] listening on http://localhost:${PORT}`);
  startMatchingEngine();
  startFulfillmentEngine();
  startPayoutEngine();
});

// Phase 2: SSE streams are long-lived, so Node's default 2-minute socket
// timeout was killing healthy connections and driving the client's reconnect
// loop. Heartbeats keep the stream alive; the timeout must not fight them.
server.requestTimeout = 0;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 61_000;

/** Housekeeping for the three in-memory/DB stores added in Phase 2. */
const HOUSEKEEPING_MS = 15 * 60 * 1000;
const housekeeping = setInterval(() => {
  try {
    purgeExpiredRefreshTokens();
    sweepExpiredTickets();
    sweepRateLimitBuckets();
  } catch (error) {
    console.error('[api] housekeeping failed:', error);
  }
}, HOUSEKEEPING_MS);
housekeeping.unref();

// Graceful shutdown so in-flight SQLite writes finish and SSE clients get a
// clean FIN rather than a reset.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[campus-bites-api] ${signal} received, shutting down.`);
    clearInterval(housekeeping);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
