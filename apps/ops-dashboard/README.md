# @campus-bites/ops-dashboard

The Restaurant Dashboard and Admin Dashboard from the PRD's architecture
(Appendix C), built as one role-gated app rather than two separate
codebases — same underlying tables/list patterns either way, and it halves
the boilerplate. Splitting them into separate deployables later is a
routing change, not a rewrite.

## Run

```bash
npm run dev   # http://localhost:5174 — needs the API running on :4000
```

Log in as `owner@sharmadadhaba.com` (`password123`) for the restaurant
view. For the admin view, please sign in using your administrator account —
the platform ships with a single Super Admin and no demo admin logins.

## Restaurant view

`/restaurant/orders` — polls every 3s. Real actions: accept/reject a new
order, mark it preparing, mark it ready for pickup. A restaurant open/busy/
closed toggle sits in the header. Once an order is marked ready, the
backend's simulated delivery-partner timeline takes over (see the API's
README) — there's nothing further for the restaurant to do.

## Admin view

`/admin/dashboard` (totals, GMV, Shared Delivery share, recent activity),
`/admin/orders`, `/admin/restaurants`, `/admin/students` (sorted by
reliability score), `/admin/admins` (Super Admin only — create, reset, disable, delete
administrator accounts), `/admin/audit` (the system-level events — requeues,
rejections — logged via `logAudit()` in the API).

## Structure

Mirrors the student app's conventions: `lib/api.ts` (fetch wrapper),
`lib/authStore.ts` (Zustand + localStorage), `components/ui` /
`components/layout`, `features/restaurant` + `features/admin` for the
screens themselves.
