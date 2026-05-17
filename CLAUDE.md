# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## commands

```bash
npm run dev      # start dev server (proxies /api → http://localhost:8000)
npm run build    # production build
npm run preview  # preview production build
```

No test runner is configured.

## architecture

**Stack**: Vue 3 (Composition API, `<script setup>`) + Vite + Pinia + Vue Router + Tailwind CSS v4 + PrimeVue 4 (Aura theme)

### api layer (`src/api/`)

`src/api/index.js` is the single axios instance. It:
- Sets `baseURL: /api` (proxied to `http://localhost:8000` in dev via vite.config.js)
- Injects `Authorization: Bearer <token>` and `X-Branch-Id` headers on every request via interceptors
- On 401, clears localStorage and redirects to `/login`

All other api files (`orders.js`, `customers.js`, `services.js`, etc.) import from this instance and export plain wrapper functions. There is no additional abstraction.

### state (`src/stores/`)

Three Pinia stores:
- **auth.js** — token (localStorage), user object, computed role flags (`isSuperAdmin`, `isAdmin`, `isCashier`), login/logout/fetchUser
- **branch.js** — selected branch id (localStorage), branches list; the active branch id is sent on every API request via the axios interceptor
- **cart.js** — POS cart items, attached customer, pickup/delivery fees, totals

### routing & access control (`src/router/index.js`)

All views are lazy-loaded. The router guard checks `auth.isAuthenticated` and `auth.user` role against each route's `meta.roles`. Role hierarchy: `super_admin > admin > cashier > staff`.

Route groups by minimum role:
- **cashier+**: `/pos`, `/orders`, `/orders/:id`, `/pickup-queue`, `/customers`, `/customers/:id`
- **admin+**: `/`, `/dashboard`, `/reports`, `/expenses`, `/services`, `/settings`
- **super_admin**: `/branches`, `/cross-branch`

### layouts

`AppLayout.vue` wraps all authenticated routes — contains `AppSidebar` and `AppHeader`. `AuthLayout.vue` wraps `/login`. The sidebar is role-aware and hides menu items the current user cannot access.

### notifications (PrimeVue)

`<Toast position="bottom-right" />` and `<ConfirmDialog />` are mounted once in `App.vue`. Use `useToast()` and `useConfirm()` from `primevue/usetoast` and `primevue/useconfirm` in any view. Never use `alert()` or `confirm()`.

Pattern for destructive actions:
```js
confirm.require({
  message: '...',
  header: '...',
  icon: 'pi pi-exclamation-triangle',
  rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
  acceptProps: { label: 'Delete', severity: 'danger' },
  accept: async () => { /* call api, then toast.add success */ },
})
```

Pattern for errors:
```js
toast.add({ severity: 'error', summary: 'error', detail: e.response?.data?.message || 'fallback', life: 4000 })
```

### styling

- Tailwind CSS v4 via `@tailwindcss/vite` — no `tailwind.config.js`, configured inline
- Design tokens (shadows, easing, durations) defined in `src/style.css` as CSS variables
- PrimeVue toast text color overridden in `style.css` to force dark text
- `@tailwindcss/forms` plugin is active

## git commit style

all lowercase. example: `feat: add expense category filter`
