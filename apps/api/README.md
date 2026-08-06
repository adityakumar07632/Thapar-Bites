# @campus-bites/api

Express + TypeScript + SQLite backend implementing all 43 endpoints from
the PRD's Appendix E (API Specification).

## Run

```bash
npm run seed   # creates campus-bites.sqlite3 with demo restaurants/menu/accounts
npm run dev     # http://localhost:4000, auto-restarts on change
```

## Structure

```
src/
  db/
    schema.sql        Full schema, mirrors PRD Appendix D (ERD)
    client.ts          better-sqlite3 connection + migration runner
    seed.ts             Demo restaurants, menu, and accounts
    rows.ts              Raw snake_case row types
  lib/
    auth.ts             JWT + bcrypt, requireAuth(...roles) middleware
    mappers.ts           DB row → camelCase API response mappers
    response.ts           Standard {success,data}/{success,error} envelope + error codes (E.18)
    notify.ts, audit.ts    Notification + audit-log helpers, called from the modules below
  modules/
    auth/ students/ restaurants/ cart/ checkout/ sharedDelivery/
    payments/ orders/ delivery/ notifications/ restaurantDashboard/ admin/
      — one folder per Appendix E section, routes only, queries inline
    matching/matchingEngine.ts    The real Ch. 7 matching engine — see below
    orders/fulfillmentEngine.ts    Simulated delivery-partner auto-advance
```

## The matching engine

`matchingEngine.ts` runs on a `setInterval` (`TICK_MS`, currently 1.2s) and does three things every tick:

1. **Forms matches** — groups the waiting queue by `(restaurant, hostel)`, pairs the two oldest entries FIFO, creates a `Match` + two `Order`s (one per student) with a shared PairCode and a 3-minute payment deadline.
2. **Expires stale queue entries** past the 15-minute wait ceiling.
3. **Expires payment windows** — implements Ch. 7.11's Case A (handled inline in `payments.routes.ts` when the second payment lands), Case B (one side paid — they're refunded and requeued at the front with their *original* timestamp per BR-037, the other side's order is marked expired), and the neither-paid case.

## Auth

Three roles share one `students`/`restaurant_owners`/`admins` table set and one `POST /auth/login` endpoint that tries each in turn. JWTs carry `{ sub, role, restaurantId? }`; `requireAuth('restaurant')` etc. gates each module's router.

## Notes

- Money is stored as whole-rupee integers, not paise — matches the mock data this was built against.
- `PRAGMA foreign_keys = ON` and `journal_mode = WAL` are set in `client.ts`.
- Delete `campus-bites.sqlite3*` and rerun `npm run seed` to reset to a clean demo state at any time.
