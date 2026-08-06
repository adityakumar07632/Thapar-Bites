# Phase 9A — Landing Page & Student-First Entry Flow

## Summary

Thapar Bites now opens with a polished landing page instead of a bare login form.
The existing `LandingScreen` was enhanced with clear student CTAs and a staff
text link. A new `/staff` portal page shows role-selection cards for Restaurant
Managers and Administrators, linking out to the Ops Dashboard. All authenticated
users continue to bypass the landing page and land directly in their respective
dashboards.

---

## Files Modified

### Student App (`apps/student-app`)

| File | Change |
|------|--------|
| `src/features/marketing/screens/LandingScreen.tsx` | Added **"Restaurant Manager or Admin? Sign In Here"** text link below the hero CTAs; added **"Staff portal"** link to the footer account section; renamed "I already have one" button to "Sign in" for clarity |
| `src/features/marketing/screens/StaffPortalScreen.tsx` | **New.** `/staff` route — two role cards (Restaurant Manager, Administrator) that open the Ops Dashboard. URL configurable via `VITE_OPS_URL` env var (defaults to `http://localhost:5174`) |
| `src/App.tsx` | Added `/staff` route for `StaffPortalScreen` |

---

## Entry Flows

### Unauthenticated student

```
Visit "/" → RequireAuth → /welcome (LandingScreen)
Click "Create your account" → /register → student dashboard
Click "Sign in" → /login → student dashboard
```

### Restaurant Manager / Admin

```
LandingScreen: click "Restaurant Manager or Admin? Sign In Here"
→ /staff (StaffPortalScreen)
→ click either card → Ops Dashboard login (external URL: VITE_OPS_URL)
```

### Already logged-in student

```
Visit "/welcome" → LandingScreen detects token → redirect to "/"
Visit "/staff"   → StaffPortalScreen detects token → redirect to "/"
Visit "/"        → RequireAuth passes → RestaurantListScreen (dashboard)
```

### Already logged-in restaurant / admin

These users are in the Ops Dashboard app (separate Vite instance). Their auth
state is managed by the Ops Dashboard's own `useAuthStore` — they never visit
the student app's routes.

---

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `VITE_OPS_URL` | `http://localhost:5174` | Base URL of the Ops Dashboard; set in `apps/student-app/.env` for hosted deployments |

---

## No Backend Changes

Phase 9A is purely a frontend / UX change. No API routes, database schema,
authentication logic, payment system, shared delivery, ratings, or existing
dashboards were modified.

---

## Remaining Work / Next Phases

- Set `VITE_OPS_URL` to the production Ops Dashboard URL in the student app's
  deployment environment variables.
- Optionally add a role query param (`?role=restaurant`) to the Ops Dashboard
  login so it can pre-label the form (currently both cards link to the same login page).
