# KeaPOS - Restaurant Point of Sale System

A cloud-based, offline-capable POS system designed specifically for New Zealand restaurants and bars.

## Tech Stack

### Core Framework
- **Next.js 14+** (App Router) with TypeScript
- **React 18** for UI components
- **Tailwind CSS** for styling

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

## Project Structure

```
keapos/
├── app/
│   ├── (admin)/          # Admin portal routes (server-rendered)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── (pos)/            # POS terminal routes (client-rendered, offline-first)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/              # API routes
│   ├── layout.tsx        # Root layout with providers
│   └── globals.css       # Global styles
├── lib/
│   ├── supabase/         # Supabase client configuration
│   ├── db/               # Dexie offline database
│   ├── stores/           # Zustand stores
│   ├── providers/        # React providers (Query, Auth, etc.)
│   └── utils/            # Utility functions
├── public/
│   └── manifest.json     # PWA manifest
└── package.json
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

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Payment Provider
PAYMENT_PROVIDER_API_KEY=your-payment-api-key
PAYMENT_PROVIDER_URL=https://api.payment-provider.com
```

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the admin portal.
Open [http://localhost:3000/pos](http://localhost:3000/pos) for the POS terminal.

### Build

```bash
npm run build
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

This is the initial foundation. Next phases include:

1. **Database Schema Design** - Tables for companies, locations, users, menu items, transactions
2. **Authentication Flow** - Supabase Auth integration with role management
3. **Admin Portal** - Company setup, menu management
4. **POS Interface** - Order taking, payment processing
5. **Sync Logic** - Offline queue processing and conflict resolution
6. **Hardware Integration** - Printer and payment terminal APIs
7. **Testing** - Unit tests, integration tests, RLS policy tests

## License

Proprietary - All rights reserved
