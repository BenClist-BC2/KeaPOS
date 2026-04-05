# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start Next.js dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint

# Testing
npm test                             # Run all unit tests (Vitest)
npm test tests/unit/cart.test.ts     # Run a single test file
npm run test:watch                   # Watch mode
npm run test:coverage                # Coverage report
npm run test:e2e                     # Playwright e2e (starts dev server)
npm run test:e2e:ui                  # Playwright visual runner

# Database
npm run db:migrate       # Push pending migrations to linked Supabase project
npm run db:seed          # Load sample data
npm run db:reset         # Wipe and re-run all migrations + seed (dev only)
npm run db:types         # Regenerate lib/supabase/database.types.ts from schema
npm run db:new -- <name> # Create a timestamped migration file

# Docs
npm run docs             # Generate TypeDoc into docs/api/
```

## Architecture

KeaPOS is a multi-tenant restaurant POS system with offline-first support. The tenant hierarchy is: **Company → Locations → (Terminals + Staff) → Orders**.

### Route Groups

- `app/(admin)/` — Server-rendered admin portal (`/dashboard/*`). Requires role `owner` or `manager`.
- `app/(pos)/` — Client-rendered POS terminal (`/terminal`). Offline-capable, authenticated as a terminal device.

### Authentication — Two Distinct Paths

**Admin users** sign in with email/password via Supabase Auth. Profile role must be `owner` or `manager`.

**Terminals** are full Supabase Auth users with synthetic emails (`terminal-{uuid}@keapos.internal`). One-time device pairing via QR code; thereafter the device holds the session locally for offline use.

**Staff (PIN-only)** also have Supabase Auth users (`staff-{uuid}@keapos.internal`) but never log in directly — they authenticate on a terminal via a 4-digit PIN verified against a bcrypt hash in `profiles.pin_hash`. This is required so RLS policies work via `auth.uid()`.

### Key Patterns

**Terminal ID extraction** — always parse from the authenticated user's email:
```typescript
const terminalIdMatch = user.email?.match(/^terminal-([a-f0-9-]+)@keapos\.internal$/);
```

**Service role client** — required for creating/deleting auth users and writing audit logs (bypasses RLS). Only ever used server-side. Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code.

**Transaction history protection** — terminals and staff cannot be deleted if they have orders; deactivate (`active: false`) instead. Always count orders before attempting deletion.

**Audit logging** — use `logAudit()` and `createDiff()` from `lib/audit.ts`. Audit logs are written via service role key so they cannot be tampered with by regular users. All staff/terminal mutations, orders, PIN logins and failures must be logged.

### State Management

- **Zustand**: `lib/store/cart.ts` (cart), `lib/store/active-staff.ts` (currently logged-in staff on terminal)
- **TanStack Query**: server state and data fetching in admin portal
- **Dexie (IndexedDB)**: `lib/db/offline-db.ts` — offline order queue, synced on reconnect

### Database

Migrations in `supabase/migrations/` are the **single source of truth** — never edit the schema directly in the Supabase dashboard. After any schema change, run `npm run db:types` and commit the generated file.

RLS enforces multi-tenancy: every table has `company_id`; location-scoped tables also have `location_id`. Audit logs are read-only for users; inserts only via service role.

### Server Actions

All mutations go through Next.js Server Actions:
- `app/(admin)/dashboard/staff/actions.ts` — staff CRUD
- `app/(admin)/dashboard/terminals/actions.ts` — terminal CRUD + credential reset
- `app/(pos)/terminal/actions.ts` — `placeOrder()`
- `app/(pos)/terminal/pin-actions.ts` — `verifyPIN()`

### CI/CD

- `.github/workflows/ci.yml` — runs `npm test` on every PR
- `.github/workflows/migrate.yml` — auto-applies migrations on merge to `main` or `staging`
- Supabase Branching creates an isolated DB per feature branch automatically (Pro plan)

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-side only
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
