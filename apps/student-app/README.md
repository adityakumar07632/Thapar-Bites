# @campus-bites/student-app

The Student App — browsing, cart, Shared Delivery, payment, order
tracking, and PairCode handover. Talks to the real `@campus-bites/api` backend;
there is no local simulation left in this app.

## Run

```bash
npm run dev   # http://localhost:5173 — needs the API running on :4000
```

## Structure

```
src/
  shared/
    types/          domain.ts (mirrors API responses) + enums.ts (status unions)
    lib/              api.ts (fetch wrapper with auth token), utils.ts
    components/       ui/ (Button, Compartment, PairCodeTicket, OrderStepper…)
                      layout/ (AppShell, TopBar, BottomNav)
  features/
    auth/             Login screen (real + password) + quick demo-account buttons,
                      Zustand auth store persisted to localStorage
    restaurants/       List/detail screens; useRestaurantsStore caches GET /restaurants
                       and GET /restaurants/:id/menu
    cart/              Server-persisted cart (GET/POST/PATCH/DELETE /cart) —
                       cross-restaurant conflicts surface as a real CART_002
                       error from the API, not a client-side guess
    shared-delivery/    WaitingForMatchScreen polls GET /shared-delivery/status;
                       PaymentWindowScreen calls POST /payments → /payments/verify
                       and polls the order while awaiting a match partner
    orders/             Tracking (polls GET /orders/:id, PairCode verify action)
                       + history (GET /students/orders)
    profile/            GET /students/profile equivalent, via the auth store
```

## Testing a real match on one machine

Open this app in two separate browser windows (or one normal + one
incognito) and log in as two different demo students in the same hostel
(Asha and Rohan). Add the same restaurant to both carts, join the Shared
Delivery queue from both, and watch the real match happen — no simulation
involved on either side.

## What changed from the earlier prototype

An earlier pass of this app ran entirely on local Zustand state with a
simulated "phantom" match partner (see the root README's git history if
you're curious). Every store in `features/*/store` now calls the real API
instead; `features/shared-delivery/engine/` (the old simulation) has been
deleted.
