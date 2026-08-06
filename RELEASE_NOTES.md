# Thapar Bites v1.0.0 Release Notes

## Release contents

This release contains the Thapar Bites API, Student App, Ops Dashboard, shared UI package, SQLite schema, seed scripts, build configuration, documentation, and environment examples.

## Confirmed fixes included

- Added a role-aware wildcard route in the Ops Dashboard. Unknown routes now redirect an authenticated admin to the Admin Dashboard, an authenticated restaurant user to Restaurant Orders, and signed-out users to Login.
- Corrected confirmed TypeScript failures in the Student App and Ops Dashboard caused by stale component properties, invalid property names, and unused imports and values.
- Restored native required validation to the platform-payment form inputs.
- Corrected API type declarations and imports for restaurant rating counts, platform payment details, and the existing QR/pair-code error paths.

## Files modified

- `apps/api/src/db/rows.ts`
- `apps/api/src/lib/response.ts`
- `apps/api/src/modules/admin/admin.routes.ts`
- `apps/api/src/modules/restaurants/restaurants.routes.ts`
- `apps/ops-dashboard/src/App.tsx`
- `apps/ops-dashboard/src/features/admin/AdminPlatformPaymentSettingsScreen.tsx`
- `apps/ops-dashboard/src/features/admin/AdminRestaurantsScreen.tsx`
- `apps/ops-dashboard/src/features/restaurant/RestaurantOrdersScreen.tsx`
- `apps/student-app/src/features/auth/screens/RegisterScreen.tsx`
- `apps/student-app/src/features/orders/screens/OrderTrackingScreen.tsx`
- `apps/student-app/src/features/profile/screens/ProfileScreen.tsx`
- `apps/student-app/src/features/restaurants/screens/RestaurantListScreen.tsx`
- `apps/student-app/src/shared/components/ui/HostelSelect.tsx`

## Build status

The release source passed production builds for all workspaces:

- API: `tsc -p tsconfig.json`
- Student App: `tsc -b && vite build`
- Ops Dashboard: `tsc -b && vite build`

Student App and Ops Dashboard lint complete without errors. The Student App reports two non-blocking Fast Refresh warnings for files that export shared constants alongside components.

## Required environment variables

Copy the example files before deployment and supply environment-specific values:

| Application | Variable | Required production value |
| --- | --- | --- |
| API | `PORT` | The API listener port; defaults to `4000`. |
| API | `CAMPUS_BITES_JWT_SECRET` | A unique, high-entropy secret. Never use the example value. |
| API | `CAMPUS_BITES_DB_PATH` | Optional SQLite database path; use a persistent, backed-up volume. |
| API | `CAMPUS_BITES_AUTO_PAYOUT` | `false` unless automatic payout settlement is explicitly enabled. |
| Student App | `VITE_API_URL` | The public API base URL ending in `/api/v1`. |
| Ops Dashboard | `VITE_API_URL` | The public API base URL ending in `/api/v1`. |

## Runtime note

Build verification completed in the release environment. Run the live workflow checklist in a standard Node.js 22+ deployment environment before exposing the public endpoints.
