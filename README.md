# Thapar Bites — Your Campus Food Companion

A modern campus food ordering platform built exclusively for the Thapar
Institute of Engineering & Technology community.

**Thapar Bites — Version 1.0.1**

A full, working build of the platform described in the PRD: a real backend,
a real database, a real matching engine, and two frontends — the Student
App and the Restaurant/Admin Ops Dashboard. Everything in this repo talks to
everything else over real HTTP; nothing is a static mockup.

**The one thing this platform is built around:** Shared Delivery. Two
students from the same hostel, ordering from the same restaurant, get
matched automatically, pay separately, and split one delivery.

## What's real vs. simulated

This runs entirely on your machine — there's no hosting, no real payment
gateway, and no real delivery partners. Given that ceiling, here's exactly
where the line is:

| Piece | Status |
|---|---|
| Database, auth, all 43 API endpoints | **Real.** SQLite + Express, JWT + bcrypt. |
| Shared Delivery matching engine | **Real**, server-side. Two actual logged-in students get matched by a real FIFO queue — not a client-side simulation. |
| Payment window (3-min countdown, Case A/B/C from Ch. 7.11) | **Real** state machine, server-enforced deadlines. |
| Restaurant accept/prepare/ready actions | **Real** — a human (you, via the Ops Dashboard) has to click these. |
| Payment gateway | **Simulated.** "Pay now" always succeeds after ~1s. There's no Razorpay/Stripe integration. |
| Delivery partner (collected → out for delivery → driver arrived) | **Simulated.** No delivery-partner app exists yet, so the backend auto-advances these three steps on a timer once a restaurant marks an order ready. Restaurant actions before this point are real. |
| PairCode™ handover verification | **Real** interactive step in the Student App. |

## Quick start

```bash
npm install        # installs all three apps (npm workspaces)
npm run seed        # creates apps/api/campus-bites.sqlite3 with test data + the Super Admin
npm run dev          # runs the API (4000), Student App (5173), Ops Dashboard (5174) together
```

> **If `npm install` fails on `better-sqlite3`** with a `node-gyp rebuild` /
> 403 error: its prebuilt binary download hiccuped and it fell back to
> compiling from source, which needs Node headers this environment may not
> fetch. It's intermittent — delete `node_modules` and `package-lock.json`
> and run `npm install` again; it resolves on retry.

Then open:
- **Student App** — http://localhost:5173
- **Ops Dashboard** — http://localhost:5174

### Test accounts (password: `password123` for all)

| Role | Email | Notes |
|---|---|---|
| Student | asha@thapar.edu | Sutlej hostel |
| Student | rohan@thapar.edu | Sutlej hostel — matches with Asha |
| Student | priya@thapar.edu | Beas hostel — proves matches never cross hostels |
| Restaurant | owner@sharmadadhaba.com | Sharma Da Dhaba |
| Restaurant | owner@spiceroutemomos.com | Spice Route Momos |

### Administrator access

The platform has exactly **one Super Admin**, seeded for Aditya Kumar. No
demo or shared admin accounts exist, and admin credentials are not printed
anywhere in the app or the logs — sign in with the credentials issued to
you.

Every other administrator is created from **Ops Dashboard → Admins**, which
only the Super Admin can see. From there the Super Admin can:

- create an admin (with a generated or chosen temporary password),
- reset an admin's password,
- disable or re-enable an admin (a disabled admin cannot sign in or refresh),
- delete an admin.

Regular admins keep full access to the operational dashboards but cannot
view or manage other administrator accounts — the API enforces this
independently of the UI.

**To see a real Shared Delivery match happen**, open the Student App in two
different browser windows (or one normal + one incognito), log in as Asha
in one and Rohan in the other, and add the same restaurant to both carts
with a total between that restaurant's Shared and Individual minimums. Join
the queue from both — the match happens for real, server-side, usually
within a couple of seconds.

### Automated verification

`npm run verify` runs a 28-check script against the live API — the same
one used to build this: two real students get matched, both pay, a
restaurant owner accepts/prepares/marks the order ready, the simulated
delivery plays out, PairCode verification succeeds, and the admin
dashboard reflects it all. Start `npm run dev:api` (and reseed) first,
then run this in another terminal.

## Architecture

```
apps/
  api/                Express + TypeScript + SQLite. All 43 endpoints from
                       the PRD's Appendix E. See apps/api/README.md.
  student-app/         React + Vite. The ordering flow — browse, cart,
                       Shared Delivery, payment, tracking, PairCode.
  ops-dashboard/       React + Vite. Restaurant order management +
                       Admin oversight, role-gated behind one login screen.
scripts/
  verify-platform.mjs  End-to-end test script, see above.
```

Each app has its own README with more detail on that piece specifically.

## What's out of scope

- Real payment gateway, real Supabase/cloud hosting, real delivery-partner app — see the table above.
- Most of Ch. 11–13's long tail of business rules and edge cases beyond what the core loop needed (the highest-signal ones — hostel isolation, cart-restaurant locking, the Case A/B/C payment outcomes, requeue-on-partner-no-pay — are implemented and tested; less central ones aren't yet).
- Student registration and login both have real screens in the Student App, backed by `POST /auth/register` / `POST /auth/login`. Restaurant/Admin accounts are still provisioned via the seed script, matching how a real B2B onboarding would work — there's no self-serve signup for those roles by design.

## Suggested next steps

- Real-time push (Socket.io/SSE) in place of the current ~1.5–3s polling — the polling was a deliberate choice for reliability while building, not a ceiling
- Swap the simulated payment gateway for a real one (Razorpay is the natural fit for an India-based platform) once there's a merchant account to test against
