# KeaPOS - Restaurant Point of Sale System

A cloud-based, offline-capable POS system designed specifically for New Zealand restaurants and bars.

## Tech Stack

### Core Framework
- **Next.js 16** (App Router) with TypeScript
- **React 19** for UI components
- **Tailwind CSS 4** for styling

### Backend & Database
- **Supabase** - PostgreSQL database with authentication, realtime, and storage
- **Row-Level Security (RLS)** - Multi-tenant data isolation

### Offline-First Architecture
- **@ducanh2912/next-pwa** - Progressive Web App capabilities
- **Dexie.js** - IndexedDB wrapper for local data storage
- **Service Workers** - Request caching and offline support

### State Management
- **Zustand** - Client state (cart, UI, offline queue)
- **TanStack Query (React Query)** - Server state and data fetching

### Forms & Validation
- **React Hook Form** - Form handling
- **Zod** - Schema validation

### Testing
- **Vitest** - Unit and component tests
- **React Testing Library** - Component rendering and interaction
- **Playwright** - End-to-end browser tests

## Project Structure

```
keapos/
├── app/
│   ├── (admin)/              # Admin portal routes (server-rendered)
│   │   ├── layout.tsx        # Sidebar navigation layout
│   │   └── dashboard/
│   │       └── page.tsx      # Dashboard with stats and setup checklist
│   ├── (pos)/                # POS terminal routes (client-rendered, offline-first)
│   │   ├── layout.tsx        # Fullscreen layout
│   │   └── terminal/
│   │       └── page.tsx      # POS terminal interface
│   ├── layout.tsx            # Root layout with providers
│   └── globals.css           # Global styles
├── lib/
│   ├── supabase/             # Supabase client configuration
│   ├── db/                   # Dexie offline database schema and helpers
│   └── providers/            # React providers (TanStack Query, etc.)
├── supabase/
│   ├── migrations/           # SQL migration files (source of truth for schema)
│   ├── seed.sql              # Development seed data
│   └── config.toml           # Supabase CLI configuration
├── .github/workflows/
│   ├── ci.yml                # Runs unit tests on every PR
│   └── migrate.yml           # Applies migrations on merge to main/staging
├── tests/
│   ├── setup.ts              # Vitest global setup (fake-indexeddb, jest-dom)
│   ├── unit/                 # Unit and component tests
│   └── e2e/                  # Playwright end-to-end tests
├── public/
│   └── manifest.json         # PWA manifest
├── proxy.ts                  # Next.js 16 request proxy (auth session refresh)
├── playwright.config.ts      # Playwright configuration
├── vitest.config.ts          # Vitest configuration
└── typedoc.json              # API documentation configuration
```

## Multi-Tenancy Architecture

### Hierarchy
```
Company (e.g., "Bob's Burgers Ltd")
  ├── Location 1 (Queen Street, Auckland)
  │   ├── Staff members
  │   ├── POS terminals
  │   └── Transactions
  └── Location 2 (Ponsonby Road, Auckland)
      ├── Staff members
      ├── POS terminals
      └── Transactions
```

### Database Design
- Every table includes `company_id` for tenant isolation
- Location-specific tables also include `location_id`
- RLS policies enforce data access at the database level
- Shared data (menu items, recipes) stored at company level
- Transactions stored at location level

## Offline Mode

### How It Works
1. **Online**: Direct Supabase connection with realtime subscriptions
2. **Offline Detection**: Service worker intercepts failed requests
3. **Local Queue**: Transactions saved to IndexedDB
4. **Sync on Reconnect**: Queue processed when connection restored
5. **Optimistic UI**: Immediate feedback with rollback on failure

### What Works Offline
- ✅ Take orders (saved to IndexedDB)
- ✅ View menu items (cached)
- ✅ Accept cash payments
- ✅ Print receipts (network printers on local LAN)
- ❌ Card payments (requires online payment terminal)
- ❌ Real-time inventory checks (uses cached data)
- ❌ New staff login (must be logged in before outage)

## Supabase Environments

Schema changes are managed as migration files in `supabase/migrations/`. These files are the **single source of truth** — never change the schema directly in the Supabase dashboard.

### Environment Strategy

| Branch | Supabase environment | Purpose |
|---|---|---|
| `main` | Production project | Live customers |
| `staging` | Staging project | QA / client sign-off |
| Feature branches | Supabase Branch (auto) | Development |

[Supabase Branching](https://supabase.com/docs/guides/platform/branching) (Pro plan) automatically creates an isolated database for each Git branch and runs your migrations against it. When a PR is merged, the branch database is deleted. Production only receives a migration when it lands on `main`.

GitHub Actions (`.github/workflows/migrate.yml`) applies migrations automatically on merge to `main` or `staging`.

### Creating a migration

Always create migrations via the CLI so they get a proper timestamp:

```bash
npm run db:new -- add_staff_pin_column
# creates supabase/migrations/20240101120000_add_staff_pin_column.sql
# edit the file, then commit it
```

### Applying migrations manually

```bash
npm run db:migrate   # push pending migrations to the linked project
npm run db:diff      # preview what would change
npm run db:reset     # wipe and re-run all migrations + seed (dev only)
```

### Generating TypeScript types

After any schema change, regenerate the type definitions:

```bash
npm run db:types
# writes lib/supabase/database.types.ts
```

Commit the generated file so the whole team gets updated types immediately.

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_REF_PROD` | Project ref for production (Settings → General) |
| `SUPABASE_PROJECT_REF_STAGING` | Project ref for staging |
| `SUPABASE_DB_PASSWORD_PROD` | Database password for production |
| `SUPABASE_DB_PASSWORD_STAGING` | Database password for staging |

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm
- A Supabase account with a project created

### 1. Install dependencies

```bash
npm install
# The Supabase CLI is included as a dev dependency — no separate install needed
```

### 2. Set up environment variables

Fill in `.env.local` with your dev Supabase project credentials — find them at **Supabase Dashboard → Settings → API**:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Link, migrate, and seed your Supabase project

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npm run db:migrate   # applies schema migrations
npm run db:seed      # loads sample company, menu, and tables
```

### 4. Create your first user

- Go to **Supabase Dashboard → Authentication → Users → Add user**
- Enter your email and password, copy the generated **User UID**
- Run this in **SQL Editor** (use the UID and your name):

```sql
insert into profiles (id, company_id, role, full_name)
values (
  '<your-user-uid>',
  '00000000-0000-0000-0000-000000000001',
  'owner',
  'Your Name'
);
```

### 6. Start the dev server

```bash
npm run dev
```

### 5. Start the dev server

```bash
npm run dev
```

- Admin portal: [http://localhost:3000](http://localhost:3000) → redirects to `/dashboard`
- POS terminal: [http://localhost:3000/terminal](http://localhost:3000/terminal)

> **Without Supabase configured**, the app still runs — auth is bypassed and the UI is fully browsable.

### Build

```bash
npm run build
```

## Testing

### Unit & Component Tests

```bash
npm test                 # Run all unit tests once
npm run test:watch       # Watch mode (re-runs on file changes)
npm run test:coverage    # Run with coverage report (output: coverage/)
```

Tests live in `tests/unit/` and use Vitest + React Testing Library with fake-indexeddb for IndexedDB isolation.

### End-to-End Tests

```bash
npm run test:e2e         # Run Playwright tests (starts dev server automatically)
npm run test:e2e:ui      # Open Playwright's visual test runner
```

E2E tests live in `tests/e2e/` and run against Chromium.

### API Documentation

```bash
npm run docs             # Generate TypeDoc docs into docs/api/
```

## Features

### Admin Portal (`/admin`)
- Company and location management
- Menu configuration
- Recipe management
- Staff management
- Reports and analytics
- Settings

### POS Terminal (`/pos`)
- Touch-optimized interface
- Order management
- Payment processing
- Receipt printing
- Cash drawer integration
- Offline mode
- Real-time sync

## Hardware Integration

### Supported Hardware
- **Receipt Printers**: ESC/POS network printers (Epson, Star Micronics)
- **Cash Drawers**: Triggered via printer's cash drawer port
- **Payment Terminals**: Windcave/Smartpay network-connected terminals

### Network Requirements
- All hardware must be network-connected (Ethernet/WiFi)
- Hardware accessible via IP address on local network

## Security

### Authentication
- **Supabase Auth** for user management
- Session tokens cached for offline operation (8-12 hour expiry)
- Role-based access control (owner, manager, staff)

### Data Isolation
- RLS policies enforce tenant isolation
- Company admins can only access their company data
- Staff can only access their assigned location data

### Financial Data
- All transactions stored with audit trail
- Idempotency keys prevent duplicate transactions
- Optimistic locking for inventory
- Encrypted sensitive data at rest

## Deployment

### Recommended Setup
- **Frontend**: Vercel (automatic deployments)
- **Database**: Supabase Cloud
- **CDN**: Vercel Edge Network

## Next Steps

1. **Admin Portal** - Company setup, menu management, staff management
2. **POS Terminal** - Order taking, payment processing, offline queue
3. **Sync Logic** - Offline queue processing and conflict resolution
4. **Hardware Integration** - Printer and payment terminal APIs (Windcave/Smartpay)

## License

Proprietary - All rights reserved
