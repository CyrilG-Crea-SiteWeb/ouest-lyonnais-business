# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
bun run dev        # Start dev server (Vite + TanStack Start)

# Build
bun run build      # Production build
bun run preview    # Preview production build

# Lint & Format
bun run lint       # ESLint
bun run format     # Prettier (writes in place)
```

No test suite is configured. Type checking is done implicitly by Vite at build time (TypeScript strict mode via tsconfig).

## Architecture

This is a **TanStack Start** (React + Vite + SSR) app for managing the OLB (Ouest Lyonnais Business) networking club. It is built with Lovable and deployed on Lovable Cloud. The backend is entirely Supabase (auth + Postgres + Edge Functions).

### Key patterns

**Routing** — TanStack Router file-based routing. The generated `src/routeTree.gen.ts` is auto-updated by the router plugin; never edit it manually. All authenticated pages live under `src/routes/_authenticated/`. The layout route `_authenticated/route.tsx` enforces auth via `beforeLoad` and wraps content in `AppShell`.

**Auth flow**:

1. `_authenticated/route.tsx` reads the local Supabase session (no network) and redirects to `/auth` if missing.
2. It also checks `membres.mdp_defini`; if `false`, redirects to `/definir-mot-de-passe`.
3. On the client, `useProfile()` (`src/hooks/use-profile.ts`) fetches the current member's row from the `membres` table via React Query, with a retry on "auth-not-ready".

**Server functions** — Sensitive mutations use TanStack Start's `createServerFn`. These live in `src/lib/*.functions.ts`. They use the `requireSupabaseAuth` middleware (`src/integrations/supabase/auth-middleware.ts`) which validates the Bearer token from the request header. The client side attaches this token automatically via `attachSupabaseAuth` middleware registered in `src/start.ts`.

Server functions use `supabaseAdmin` (service role key, server-only) for admin operations like inviting users or deleting accounts. Do NOT import `client.server.ts` from client code — use dynamic `import()` inside server function handlers as already done.

**Supabase client** — `src/integrations/supabase/client.ts` exports a lazy singleton `supabase` (Proxy pattern) usable in both browser and SSR. Import it as `import { supabase } from "@/integrations/supabase/client"`.

**Role system** — `membres.role` enum: `"admin" | "bureau" | "membre" | "comite_membres" | "comite_fetes"`. Navigation items with `adminOnly: true` are hidden unless `role === "admin"`; items with `bureauOnly: true` are shown to `bureau` and `admin`; items with `comiteOnly: true` are shown to `comite_membres`, `bureau`, and `admin`. Use `hasRole()` from `use-profile.ts` for ordered comparisons (membre < bureau < admin; `comite_membres` and `comite_fetes` are NOT in the ordering, so `hasRole()` returns `false` for them). Event/poll management rights are granted via `peutGererEvenementsSondages()` to `comite_fetes`, `bureau`, and `admin`.

**Notifications** — `src/lib/notifications.ts` provides `creerNotifications` (throws on error) and `creerNotificationsSafe` (best-effort, never throws). Push notifications are sent via a Supabase Edge Function `send-push` triggered after in-app notification insertion.

**Exports** — `src/lib/exports.ts` handles PDF (jsPDF + jspdf-autotable) and Excel (xlsx) generation entirely on the client side.

**Supabase views** — The `v_palmares_semaine` and `v_stats_membre_semaine` views are used for dashboard aggregations. The `get_or_create_semaine` RPC returns the current week's `semaines.id`, creating the row if needed.

### Vite config

`vite.config.ts` uses `@lovable.dev/vite-tanstack-config` which already bundles TanStack Start, React, Tailwind CSS v4, tsconfig paths, Nitro, and dev tooling. Do not add these plugins manually. The SSR entry point is `src/server.ts` (registered as `server: { entry: "server" }` in the config).

### Environment variables

Required in `.env` (client + server use both prefixes):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is required server-side only (used in `client.server.ts`); it is not committed and must be set in Lovable Cloud secrets.

### UI components

All shadcn/ui components are in `src/components/ui/`. Brand colors: teal `#006875` (primary) and orange `#F6A000` (accent). Tailwind CSS v4 is used (no `tailwind.config.js`; config is inline via CSS variables).
