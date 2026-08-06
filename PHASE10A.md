# Phase 10A — UI & UX Polish

## Summary

Phase 10A focused exclusively on visual and experiential quality. No new features
were added and no APIs, database schemas, authentication flows, payment flows,
or shared-delivery logic were changed. Every improvement is layered on top of the
existing feature-complete product.

---

## UI Improvements

### Loading States

| Screen | Before | After |
|---|---|---|
| Admin Dashboard | Plain `<p>Loading…</p>` | `SkeletonStatCard` × 4 for the stat grid; inline shimmer rows for the activity log |
| Admin Restaurants | No loading indicator | `SkeletonRows` while the first fetch completes |
| Restaurant Orders (Ops) | No loading indicator | `SkeletonRows` + `loaded` flag so the list only appears once data arrives |
| Restaurant Detail (Student) | `TopBar title="Loading…"` placeholder | Full structured `RestaurantDetailSkeleton` matching the real layout: info card + category/item rows |
| Order Tracking (Student) | Blank screen while polling | `OrderTrackingSkeleton` with status card + stepper + items placeholders |
| Profile Stats | Instant empty grid | `SkeletonProfileStats` (2 × 2 grid of shimmer stat cards) shown while the `/students/stats` fetch is in flight |

**New shared skeleton variants (packages/ui):**
- `SkeletonRestaurantCard` — matches the 88 px cover + three-line text column layout
- `SkeletonStatCard` — icon + number + label tile for admin dashboard stats
- `SkeletonOrderCard` — compact order/payment list item
- `SkeletonProfileStats` — 2 × 2 stat card grid

### Empty States

| Screen | Before | After |
|---|---|---|
| Cart | Plain two-line text, no icon | `EmptyState` with `ShoppingCart` icon, friendly copy, and "Browse restaurants" CTA |
| Restaurant Orders (Ops) | Nothing | `EmptyState` with `Package` icon and real-time note |
| Admin Restaurants | No icon or CTA in the table | `EmptyState` inside `DataTable` with "Add restaurant" CTA |
| Admin Dashboard activity | Plain `<p>No activity yet.</p>` | `EmptyState` with `Activity` icon |
| Admin Restaurants (error path) | `Alert` | `ErrorState` with retry button |
| Restaurant Orders (error) | Bare error string | `ErrorState` with retry button |

All `EmptyState` instances now carry the `animate-rise` class for a soft entrance.

### Error States

- **New components exported from `packages/ui`:**
  - `NotFoundState` — 404 page with `MapPinOff` icon and "Back to home" CTA
  - `NetworkErrorState` — connectivity failure with `WifiOff` icon and retry
  - `PaymentErrorState` — payment failure with `CreditCard` icon
  - `AuthErrorState` — session expiry with `ShieldAlert` icon and sign-in CTA

- **Student app** now has a `*` catch-all route in `App.tsx` that renders
  `NotFoundScreen` — so any unknown URL gets a proper 404 page instead of a
  blank white screen.

- **Order Tracking** now renders a proper `ErrorState` (with retry and "Back to
  orders" fallback) when the first poll fails, instead of staying blank.

### Animations

**Design-token additions (`packages/ui/tokens.css`):**
- `--animate-fade-in`, `--animate-slide-up`, `--animate-slide-up-sm`
- `--animate-pop-in` (cubic-bezier spring — used on dialogs)
- `--animate-pulse-soft` (gentle opacity pulse)

**Applied animations:**
- All `EmptyState` instances: `animate-rise` on mount
- Restaurant List → `PageTransition` wraps the visible list
- Restaurant Detail → `PageTransition` wraps the menu once it loads
- Order Tracking → `PageTransition` wraps the fully-loaded view
- Cart Screen → `PageTransition` wraps the line items
- Admin Dashboard → `animate-rise` on the whole page
- Admin Restaurants → `animate-rise` on the whole page
- Restaurant Orders → `animate-rise` on the whole page
- FAQ accordion answers → `animate-rise` on open
- Delivery method buttons → `transition-all duration-150` for selection feedback

### Responsive Design

- **Admin Dashboard stat grid**: was `grid-cols-4` (broken on mobile). Now
  `grid-cols-2 sm:grid-cols-4`.
- **Admin Dashboard secondary stats**: was `grid-cols-3` (too narrow on phones).
  Now `grid-cols-1 sm:grid-cols-3`.
- **Restaurant Orders header**: action buttons now wrap (`flex-wrap`) on narrow
  viewports instead of overflowing.
- **Landing page footer**: now a 3-column grid on `sm+`, stacked on mobile.
- **Landing page hero CTA buttons**: `flex-col` on mobile, `flex-row` on `sm+`.

### Consistency

- **Buttons**: all interactive elements now use `loading` prop on the shared
  `Button` component (Loader2 spinner) instead of manual disabled + text swap.
- **Inputs**: all login/register/profile form inputs now have explicit `<label>`
  elements with `htmlFor` associations.
- **Admin Restaurants**: was using a bare `Alert` for load errors; now uses the
  shared `ErrorState` component (consistent with all other screens).
- **Ops Dashboard CSS** now imports `tokens.css` and exposes `animate-rise` to
  all ops screens.
- **BottomNav**: active indicator pip (2 px horizontal bar above active icon)
  for clear visual anchoring. Previously only color changed.

### Accessibility

- All icon-only buttons now have descriptive `aria-label` attributes (logout,
  search clear, restaurant enable/disable/delete, navigation close, etc.)
- All decorative icons have `aria-hidden` applied.
- `EmptyState`, `ErrorState`, and all new state variants use semantic HTML
  (`role="alert"` on error states, `role="status"` on loading states).
- Form inputs have explicit `<label>` + `htmlFor` associations on Login,
  Register, and Profile edit forms.
- `aria-pressed` added to mode toggles (Restaurants / Dishes) and delivery
  method buttons.
- `aria-expanded` was already on FAQ accordion buttons — preserved.
- `aria-label` added to main `<nav>` in BottomNav.
- `focus-visible` ring now uses `border-radius: 4px` to match rounded UI
  (was a sharp-cornered outline).

### Performance

- `RestaurantListScreen`: extracted `doFetch` as a `useCallback` to avoid
  re-creating the function on every render and to allow it as a stable
  `onRetry` reference.
- `OrderTrackingScreen`: error path now short-circuits to a proper UI rather
  than continuing to poll into an invisible state.
- Admin screens: `loaded` flag prevents re-rendering the table with an empty
  array while data is still in flight.

---

## Files Modified

### packages/ui/src/
- `tokens.css` — 5 new keyframes + animation tokens
- `components/Skeleton.tsx` — 4 new skeleton variants
- `components/States.tsx` — 4 new error/not-found state components; `EmptyState` gets `animate-rise`
- `components/PageTransition.tsx` — improved `aria` labelling
- `index.ts` — all new exports

### apps/student-app/src/
- `App.tsx` — wildcard catch-all route → `NotFoundScreen`
- `features/auth/screens/LoginScreen.tsx` — labels, `loading` prop, demo accounts UX
- `features/auth/screens/RegisterScreen.tsx` — labels, `loading` prop, `noValidate`
- `features/cart/screens/CartScreen.tsx` — `EmptyState`, `PageTransition`, `loading` prop
- `features/restaurants/screens/RestaurantListScreen.tsx` — `SkeletonRestaurantCard`, `useCallback` fetch, error retry
- `features/restaurants/screens/RestaurantDetailScreen.tsx` — `RestaurantDetailSkeleton`, menu loading skeleton, `PageTransition`
- `features/orders/screens/OrderTrackingScreen.tsx` — `OrderTrackingSkeleton`, full error path with retry
- `features/profile/screens/ProfileScreen.tsx` — `SkeletonProfileStats`, expanded stat/info layout
- `features/marketing/screens/LandingScreen.tsx` — responsive hero + footer, `animate-rise` on FAQ answers
- `shared/components/layout/BottomNav.tsx` — active pip indicator, `aria-label`
- `shared/screens/NotFoundScreen.tsx` — NEW: 404 screen

### apps/ops-dashboard/src/
- `index.css` — `@source` scan for tokens, `animate-in-item` utility
- `features/admin/AdminDashboardScreen.tsx` — `SkeletonStatCard`, fixed responsive grid, `EmptyState` for activity log
- `features/admin/AdminRestaurantsScreen.tsx` — `SkeletonRows`, `loaded` flag, `ErrorState`, `EmptyState` in table with CTA
- `features/restaurant/RestaurantOrdersScreen.tsx` — `SkeletonRows`, `loaded` flag, `EmptyState`, `ErrorState`, improved order card layout

---

## Remaining Work

- **Framer Motion entrance animations** for individual list items (stagger).
  The design token infrastructure is in place; connecting Framer Motion's
  `motion.div` + `variants` to `RestaurantCard`, `DishCard`, and admin
  table rows would add the final layer of polish.
- **Toast notifications** for destructive ops actions (enable/disable/delete
  restaurant). The `ToastProvider` is wired in both apps; the ops screens
  currently use `setError` + Alert — a small follow-up to swap these.
- **Offline / stale-data banner** at the top of the restaurant list when
  the fetch is more than N seconds old (would use the existing poll cadence).
- **Keyboard trap for Modals** — the shared `Modal` component closes on Escape
  and clicks outside but does not trap focus inside; adding a `FocusTrap`
  wrapper would complete WCAG 2.1 AA compliance.
- **Image skeleton placeholders** — `RestaurantCard` cover and `DishCard`
  image slots show a blank grey box on load. Adding a shimmer placeholder
  while `<img>` is loading (via `onLoad` + state) would remove the pop-in.
