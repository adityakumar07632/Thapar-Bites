# Phase 10B — Complete Theme System & Dark Mode

## Summary

Phase 10B adds a production-quality theme system across the entire Thapar Bites
platform. No features were added, no APIs or schemas changed, no authentication
or payment flows modified. Every change is additive and layered on top of the
existing feature-complete product.

Three appearance options are available everywhere:
- **Light** — always light
- **Dark** — always dark
- **System Default** — follows the device OS setting, updates live

The user's preference is saved in `localStorage` under the key `cb-theme` and
persists across logouts and app restarts. An inline script in each `index.html`
applies the correct class before React hydrates, eliminating any flash of the
wrong theme on load.

---

## Architecture

### Centralised `ThemeProvider`  (`packages/ui/src/ThemeProvider.tsx`)

A single React context exported from the shared design-system package:

```ts
import { ThemeProvider, useTheme } from '@campus-bites/ui';

// Hook API
const { mode, resolvedTheme, setMode } = useTheme();
// mode:          'light' | 'dark' | 'system'  (stored preference)
// resolvedTheme: 'light' | 'dark'             (what is actually applied)
// setMode:       (mode: ThemeMode) => void
```

- Listens to `window.matchMedia('(prefers-color-scheme: dark)')` for live OS
  preference changes when mode is `'system'`.
- Applies/removes the `dark` class on `document.documentElement`.
- Adds the `theme-transitioning` class for the brief CSS transition window, then
  removes it — so transitions only fire on theme switch, not on every render.

### CSS variable overrides  (`packages/ui/src/tokens.css`)

All Tailwind v4 utilities reference CSS custom properties at runtime (not
compile-time literals), so overriding the properties inside `.dark` cascades to
every component automatically — no per-component `dark:` classes required for
the steel and white colour scales.

```css
@custom-variant dark (&:where(.dark, .dark *));

.dark {
  color-scheme: dark;

  /* Steel palette */
  --color-steel-50:  #131619;  /* page background       */
  --color-steel-100: #1c1f24;  /* app shell / large bg  */
  --color-steel-150: #222930;  /* subtle dividers        */
  --color-steel-200: #2d3540;  /* borders                */
  --color-steel-300: #3d4d5a;  /* stronger borders       */
  --color-steel-400: #5a6b7a;  /* placeholder / disabled */
  --color-steel-500: #7a8e9e;  /* muted text / icons     */
  --color-steel-600: #9fb0be;  /* secondary text         */
  --color-steel-700: #bcc9d4;  /* tertiary text          */
  --color-steel-800: #d4dde6;  /* secondary prominent    */
  --color-steel-900: #eaeff5;  /* primary text           */

  /* Card / panel surface */
  --color-white: #23282f;

  /* Brighter accent colours for dark backgrounds */
  --color-turmeric-600: #e8a427;
  --color-turmeric-700: #c6870f;
  --color-chili-500:    #d4674a;
  --color-chili-600:    #cf5535;
  --color-cardamom-500: #5a8a70;
  --color-cardamom-600: #4c7a62;

  /* Shadows adjusted for dark surfaces */
  --shadow-tray: inset 0 0 0 1px rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.4);
  --shadow-lift: 0 8px 24px -12px rgba(0,0,0,0.7);
}
```

This single block gives dark mode to every component that uses the design
system: Card, Button, Badge, Field / Input / Textarea / Select, Alert, Modal,
Toast, DataTable, Skeleton, States, PageTransition, AppShell, TopBar, BottomNav,
Shell sidebar, and every screen built on them.

### Anti-flash inline script  (both `index.html` files)

```html
<script>
  (function () {
    var stored = localStorage.getItem('cb-theme') || 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored === 'system' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
```

Runs synchronously before any JavaScript bundle — the correct theme class is on
`<html>` before the first paint.

### Smooth transitions  (tokens.css)

```css
html.theme-transitioning *,
html.theme-transitioning *::before,
html.theme-transitioning *::after {
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.15s ease,
    fill 0.15s ease,
    box-shadow 0.2s ease !important;
}
```

The `theme-transitioning` class is added at switch time and removed after 300 ms.
Transitions fire only during theme changes — not on every render — so existing
hover / active / loading animations are unaffected.

---

## Manual overrides for edge cases

A handful of components use `bg-steel-900/40` as a dark overlay. In dark mode
the steel scale remaps steel-900 to near-white, which would break the overlay.
These were fixed with explicit `dark:` classes:

| Component | Old | Dark override |
|---|---|---|
| `Modal` backdrop | `bg-steel-900/40` | `dark:bg-black/60` |
| `Shell` drawer overlay | `bg-steel-900/40` | `dark:bg-black/60` |

---

## Appearance UI

### Student App — Profile screen

A new **Appearance** section sits below the contact-details block on the Profile
screen. Three radio-style buttons (Light / Dark / System Default) each show an
icon, a label, and a description. The active option is highlighted with the
turmeric accent and a checkmark.

### Ops Dashboard — Shell sidebar

A **theme-cycle button** at the bottom of the sidebar cycles through
Light → Dark → System with one click and shows the current mode label
(Sun / Moon / Monitor icon). Accessible `aria-label` describes the current state
and the action.

---

## Files Modified

### `packages/ui/src/`
- **`tokens.css`** — `@custom-variant dark`, dark palette block, transition class rule
- **`ThemeProvider.tsx`** — NEW: `ThemeProvider`, `useTheme`, `ThemeMode` type
- **`index.ts`** — export `ThemeProvider`, `useTheme`, `ThemeMode`
- **`components/Modal.tsx`** — backdrop fixed for dark mode (`dark:bg-black/60`)
- **`components/Toast.tsx`** — action button text contrast tweak in dark mode

### `apps/student-app/`
- **`index.html`** — anti-flash inline script added
- **`src/main.tsx`** — wrapped with `<ThemeProvider>`
- **`src/index.css`** — no changes needed (token vars auto-cascade)
- **`src/features/profile/screens/ProfileScreen.tsx`** — Appearance section added, avatar dark:variant

### `apps/ops-dashboard/`
- **`index.html`** — anti-flash inline script added
- **`src/main.tsx`** — wrapped with `<ThemeProvider>`
- **`src/components/layout/Shell.tsx`** — `ThemeToggle` component, drawer overlay dark fix

---

## What is NOT changed

- API, database schema, authentication, payment flow, shared delivery logic
- Component layouts, padding, spacing, typography scale
- Colour token names (the CSS variable names are stable; only their values change
  inside `.dark`)
- Any screen's routing or data-fetching logic

---

## Verification checklist

| Check | Light | Dark | System |
|---|---|---|---|
| Landing page readable | ✅ | ✅ | follows OS |
| Auth screens (login / register / forgot / reset) | ✅ | ✅ | follows OS |
| Student home (restaurant list + cards) | ✅ | ✅ | follows OS |
| Restaurant detail + menu | ✅ | ✅ | follows OS |
| Cart screen | ✅ | ✅ | follows OS |
| Shared delivery (waiting / match / payment) | ✅ | ✅ | follows OS |
| Order tracking + history | ✅ | ✅ | follows OS |
| Payment history | ✅ | ✅ | follows OS |
| Favourites | ✅ | ✅ | follows OS |
| Profile + Appearance section | ✅ | ✅ | follows OS |
| Change password | ✅ | ✅ | follows OS |
| Ops login | ✅ | ✅ | follows OS |
| Restaurant orders + menu + payment settings | ✅ | ✅ | follows OS |
| Admin dashboard + all admin screens | ✅ | ✅ | follows OS |
| Modals (all) | ✅ | ✅ | follows OS |
| Toasts | ✅ | ✅ | follows OS |
| Skeleton loaders | ✅ | ✅ | follows OS |
| Empty / error states | ✅ | ✅ | follows OS |
| Theme persists after logout + re-login | ✅ | ✅ | ✅ |
| No flash on reload | ✅ | ✅ | ✅ |
| Smooth transition (no flash on switch) | ✅ | ✅ | ✅ |
| WCAG contrast (AA) on text | ✅ | ✅ | ✅ |

---

## Remaining work (out of scope for this phase)

- Framer Motion staggered list-item entrance animations (carry-over from 10A)
- Toast notifications for destructive ops actions (carry-over from 10A)
- Offline / stale-data banner on restaurant list (carry-over from 10A)
- Keyboard focus trap inside Modals (carry-over from 10A)
- Image skeleton placeholders in RestaurantCard (carry-over from 10A)
