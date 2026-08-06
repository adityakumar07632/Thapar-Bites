# Thapar Bites — Phase 1 Codebase Audit

Scope: every file in the uploaded monorepo (121 files) was read — all 13 API route
modules, both engines, the DB schema and seed, all 3 stores, all 12 student screens,
all 9 ops-dashboard screens, both shared UI kits, and every lib/util.

## 0. Architecture as found

```
campus-bites/
├─ apps/api                Express 5 + better-sqlite3 + JWT + Zod
│  ├─ src/index.ts         13 routers mounted at /api/v1, health, error handler
│  ├─ src/lib              auth, response, mappers, validation, eventBus (SSE),
│  │                       notify, audit, reliability, ids
│  ├─ src/db               client (migrate-on-import), schema.sql (16 tables),
│  │                       rows.ts (row types), seed.ts
│  └─ src/modules          auth, students, restaurants, cart, checkout,
│                          shared-delivery, payments, orders, delivery,
│                          notifications, restaurant (dashboard), admin, events,
│                          matching/matchingEngine, orders/fulfillmentEngine
├─ apps/student-app        Vite + React 19 + react-router-dom 7 + Zustand + framer-motion
└─ apps/ops-dashboard      Vite + React 19 (admin + restaurant manager, shared Shell)
```

Money is stored as whole rupees (INTEGER) throughout. IDs are prefixed strings
(`stu_`, `ord_`, …) from `lib/ids.ts`. All responses go through
`ok/created/fail` in `lib/response.ts` with a stable `{ success, data | error }`
envelope and coded errors (`AUTH_001`, `ORDER_001`, `PAYMENT_002`, …). This is a
genuinely clean architecture and is being preserved.

---

## 1. ✅ Fully implemented

**API**
- Auth: student register, unified login across students / restaurant_owners / admins,
  logout, refresh. bcrypt hashing, HS256 JWT, `requireAuth(...roles)` guard.
- Restaurants: list, detail, menu (with `isActive`, `imageUrl`, `isVeg`, `prepTimeMinutes`).
- Cart: add / update qty / remove / clear, one flattened cart per student.
- Checkout: individual and shared paths, minimum-order and shared-minimum enforcement.
- Shared delivery: queue join/leave, `matchingEngine` pairing by (restaurant, hostel),
  match records, dual payment window, pair codes.
- Orders: active order, history, detail, cancel, status transitions; `fulfillmentEngine`
  advances placed → accepted → preparing → ready → out_for_delivery → delivered.
- Payments: initiate + verify (simulated gateway), expiry handling.
- Delivery: assignment and arrival/delivered timestamps.
- Notifications: list, mark-read, `notify.ts` helper writing rows + pushing SSE.
- Real-time: SSE at `GET /events?token=`, per-student and per-restaurant channels,
  20s heartbeat, `retry: 2000`.
- Restaurant dashboard API: incoming orders, accept/reject, status advance, menu CRUD.
- Admin API: dashboard counts, students, orders, audit log, full restaurant CRUD
  (create with generated manager password, patch, enable, disable, soft-delete,
  reset-password).
- Reliability score adjustments, audit logging, 16-table schema with 7 indexes, seed data.

**Student app**
- Login / Register / RequireAuth guard, Zustand auth store with persistence.
- Restaurant list + detail, menu with images / veg flags / out-of-stock, disabled-restaurant
  handling, cart + CartBar, checkout, waiting-for-match, dual payment window,
  PairCodeTicket, order tracking with OrderStepper, order history, profile (read-only).
- AppShell / TopBar / BottomNav, `useEventStream` SSE hook.

**Ops dashboard**
- Login, ProtectedRoute, Shell with role-aware nav.
- Admin: dashboard, restaurants list + detail + add modal + enable/disable/delete/reset,
  students, orders, audit.
- Restaurant: incoming orders screen, menu screen + item modal.

---

## 2. 🟡 Partially implemented

| Area | What exists | What's missing |
|---|---|---|
| Payments | Simulated 2-step gateway, correct state machine | No real PSP. **Razorpay/UPI is Phase 5.** |
| Shared delivery | Queue table, matching engine, payment window, pair codes | No student-facing **queue screen** (position, people waiting, ETA, cancel), no partner detail after match, no handoff confirmation UI |
| Auth | Student register + unified login + refresh | No forgot/reset password, no email verification, no `@thapar.edu` domain rule, no roll-number format rule, silent session expiry (no auto-refresh on 401) |
| Student profile | Read-only display | No edit (name/phone/hostel/room), no password change |
| Restaurant profile | Admin can edit any restaurant | **Manager cannot edit their own** profile, hours, status (open/busy/closed), ETA or delivery fee |
| Order tracking | Stepper + status | No per-step timestamps, no live ETA countdown, no partner info on shared orders, no delivery contact |
| Notifications | API + rows + SSE push | No bell / panel / unread badge in either app; nothing consumes the endpoint |
| Admin analytics | Raw counts | No trends, no revenue, no top restaurants, no charts |
| Restaurant analytics | — | Nothing at all |

---

## 3. ❌ Missing entirely

- **Landing page** — the student app opens straight into `/login`. No public marketing/entry surface.
- **Search** — no restaurant or dish search anywhere.
- **Filters / sort** — no cuisine, veg, price, rating, open-now, or ETA filtering.
- Reviews and ratings write path (`restaurants.rating` is read but **never written**).
- Favorites, coupons, referral system.
- Skeleton loading states (screens flash blank), empty-state design, error-state design.
- Password reset, email verification.
- Rate limiting, request logging, pagination.
- Any test suite (`scripts/verify-platform.mjs` is a smoke script, not tests).

---

## 4. 🐞 Bugs

1. **`/auth/refresh` accepts an access token.** `verifyToken` doesn't distinguish
   token types, so an access token works as a refresh token — and the returned
   payload is re-signed verbatim, meaning a `restaurantId` claim is preserved
   without re-checking the owner still belongs to that restaurant.
2. **Checkout is not transactional.** cart read → order insert → order_items insert →
   payment insert → cart clear runs as separate statements. A failure midway leaves
   an order with no items or a cart that was charged and not cleared.
3. **Soft-deleted restaurants leak.** `deleted_at IS NULL` is filtered in the student
   list but not in every admin/order join, so deleted restaurants reappear in some views.
4. **Root `package.json` had a duplicate `devDependencies` key** (noted as fixed in
   PROGRESS_REPORT, verified fixed).
5. **`useRestaurantsStore` cache removal is a hard regression.** Every visit refetches
   with no stale-while-revalidate, so navigating back re-triggers a full blank load.
6. **SSE reconnect has no backoff** — `retry: 2000` means a dead server is hammered
   every 2s per client, forever.
7. **Engines use `setInterval` in-process.** Two API instances = double state
   transitions and double matching. Also all timers are lost on restart, so an
   order mid-flight can stall permanently.
8. **No 401 interceptor.** When the 2h access token expires, every screen shows a
   raw error instead of refreshing the session.

---

## 5. ⚠ UI problems

- Two divergent design systems (`student-app` vs `ops-dashboard`) with duplicated
  `Button.tsx` and `utils.ts`; no shared tokens, so the two products look unrelated.
- No skeletons → white flash on every navigation.
- Errors render as bare inline strings; no toasts, no retry affordance.
- Empty states are plain sentences ("No orders."), no illustration or CTA.
- Ops dashboard is desktop-only — tables overflow on mobile, no responsive collapse.
- `ProfileScreen` contains developer-facing copy ("live server, not local mock data")
  shipped to students.
- No focus-visible styling, no aria labels on icon-only buttons, low-contrast muted text.
- framer-motion is a dependency but barely used; no page transitions.

---

## 6. ⚠ Backend problems

- `cors()` with no options → `Access-Control-Allow-Origin: *` on an authenticated API.
- No rate limiting on `/auth/login` or `/auth/register` → unlimited credential stuffing.
- No pagination on `/admin/orders`, `/admin/students`, `/orders` — full table scans returned.
- `express.json()` with default 100kb and no field-length caps beyond Zod minimums.
- No request logging or correlation ids; debugging is `console.error` only.
- `better-sqlite3` is synchronous — every query blocks the event loop; fine at campus
  scale, but there is no connection/WAL tuning (`PRAGMA journal_mode=WAL` is not set).

---

## 7. ⚠ Security issues

| Severity | Issue |
|---|---|
| **Critical** | JWT secret falls back to the hardcoded literal `campus-bites-dev-secret-change-in-production` when `CAMPUS_BITES_JWT_SECRET` is unset — anyone can forge an admin token against a default deploy. |
| **Critical** | Refresh tokens are stateless with a 30d TTL and no denylist; `/auth/logout` is a no-op, so a stolen refresh token is valid for 30 days and cannot be revoked. |
| **High** | Access-token-as-refresh-token confusion (bug #1) plus claim re-signing without re-authorization. |
| **High** | No rate limiting on auth endpoints. |
| **High** | `cors()` wildcard on a credentialed API. |
| **Medium** | SSE token in the URL query string → lands in server logs, proxy logs and browser history. |
| **Medium** | No password policy beyond `min(6)`; no HIBP check; admin-generated manager temp passwords are returned in an API response and displayed in plain text. |
| **Medium** | No email/domain verification, so anyone (not just Thapar students) can register. |
| **Low** | Error responses are uniform, but login distinguishes nothing — good; however `register` reveals whether an email *or* roll number already exists. |

---

## 8. ⚠ Performance issues

- No caching layer or stale-while-revalidate on the client (regression #5).
- No pagination anywhere → admin lists grow unbounded.
- Restaurant menu fetched in full on every detail visit.
- `matchingEngine` and `fulfillmentEngine` poll the whole active-order table on an
  interval instead of being event-driven.
- No `PRAGMA journal_mode=WAL`, no prepared-statement reuse across requests
  (statements are re-prepared per call).
- No image optimization; `imageUrl` is rendered raw at full size with no `loading="lazy"`.
- No code splitting — both SPAs ship one bundle.

---

## 9. One recommendation before Phase 2

You asked for **Socket.io** for real-time. The app already has a working SSE
event bus (`lib/eventBus.ts` + `GET /events`) that does exactly what's needed:
server→client push of "something changed, refetch" signals, with heartbeat and
auto-reconnect built into `EventSource`. Socket.io would add ~50kB to each client
and a second transport to maintain for no capability gain, since nothing in
Thapar Bites needs client→server streaming. My recommendation is to **harden the
existing SSE layer** (backoff, token in header via fetch-based stream, granular
channels) rather than replace it. Say the word if you still want Socket.io and
I'll swap it in — the event names and `pushToStudent`/`pushToRestaurant` call
sites are already abstracted, so it's a contained change.

---

## 10. Proposed phase order

| Phase | Contents |
|---|---|
| **1** ✅ | This audit |
| **2** | Security + bug fixes: JWT secret enforcement, refresh-token rotation + denylist, rate limiting, CORS allowlist, transactional checkout, 401 auto-refresh interceptor, SSE backoff, WAL, soft-delete leaks |
| **3** | Shared design system + full UI redesign: landing page, nav, restaurant/food cards, cart, checkout, tracking, all three dashboards, skeletons, empty/error states, responsive ops dashboard |
| **4** | Feature completion: search, filters/sort, forgot/reset password, session persistence, student profile edit, restaurant profile + hours management, queue screen, shared-delivery handoff, notifications UI, richer order tracking |
| **5** | Razorpay/UPI integration (needs your Razorpay key id + secret) |
| **6** | Analytics, performance (pagination, SWR caching, code splitting, lazy images), final review |

---

## Note on running this project

This monorepo needs a Node host — Express and `better-sqlite3` cannot run on
Lovable's edge preview runtime, so the Lovable preview does not serve it. Run it
locally:

```bash
cd campus-bites
npm install
npm run seed          # creates and seeds the SQLite file
npm run dev           # api :4000, student-app :5173, ops-dashboard :5174
```
