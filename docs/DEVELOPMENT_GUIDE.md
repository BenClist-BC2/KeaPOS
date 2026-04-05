# KeaPOS Development Guide

**Last Updated:** 2026-04-05  
**Session:** Restaurant POS System Implementation

This document provides a comprehensive overview of the KeaPOS architecture, implementation details, and development guidelines for future Claude Code sessions.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Decisions](#architecture-decisions)
3. [Database Schema](#database-schema)
4. [Authentication System](#authentication-system)
5. [Audit Logging](#audit-logging)
6. [Key Components](#key-components)
7. [Development Workflow](#development-workflow)
8. [Testing Strategy](#testing-strategy)
9. [Important Patterns](#important-patterns)
10. [Future Considerations](#future-considerations)

---

## Project Overview

KeaPOS is a multi-tenant restaurant Point of Sale (POS) system built with:

- **Frontend:** Next.js 16 App Router, React, TypeScript, TailwindCSS
- **Backend:** Next.js Server Actions, Supabase (PostgreSQL with RLS)
- **Authentication:** Supabase Auth with custom profile system
- **Offline Support:** Direct Supabase access for terminals, local IndexedDB cache
- **Testing:** Vitest (unit), Playwright (e2e)
- **CI/CD:** GitHub Actions

### Multi-Tenant Hierarchy

```
Company (tenant)
├── Locations (physical stores/restaurants)
│   ├── Terminals (POS devices)
│   └── Staff Members (employees)
├── Menu Items
└── Orders/Transactions
```

---

## Architecture Decisions

### 1. Terminal Authentication Architecture

**Decision:** Terminals are full auth users with profiles (role: 'terminal')

**Why:**
- Terminals need direct Supabase access for offline capability
- RLS policies require authenticated users for data isolation
- Allows terminals to process transactions without internet connectivity
- Each terminal gets a unique auth user: `terminal-{uuid}@keapos.internal`

**Trade-offs:**
- Terminals mixed with human users in `auth.users` table
- Mitigated by role-based filtering in UI and RLS policies

### 2. Staff Authentication: Two Types

**Manager/Admin Users:**
- Have real email addresses
- Can access admin portal
- Receive email invitations
- Full auth.users + profiles entry

**Staff Users (PIN-only):**
- No real email (generated: `staff-{uuid}@keapos.internal`)
- Terminal-only access via 4-digit PIN
- Cannot access admin portal
- Still get auth.users + profiles entry for RLS compliance
- PIN stored hashed (bcryptjs) in profiles table

**Why both need auth users:**
- RLS policies require `auth.uid()` for data isolation
- Foreign key constraints (profiles.id → auth.users.id)
- Consistent permission model across all user types

### 3. Transaction Audit Trail

**Critical Rule:** Cannot delete terminals or staff if they have transaction history

**Implementation:**
```typescript
// Check before deletion
const { count: orderCount } = await supabase
  .from('orders')
  .select('*', { count: 'exact', head: true })
  .eq('terminal_id', terminalId);

if (orderCount && orderCount > 0) {
  return { error: 'Cannot delete. Use deactivation instead.' };
}
```

**Why:**
- Financial data regulations require complete audit trail
- Transactions must always reference valid terminal + staff records
- Deactivation (active: false) is the safe alternative

---

## Database Schema

### Core Tables

**companies**
- `id` (uuid, pk)
- `name` (text)
- `created_at` (timestamptz)

**locations**
- `id` (uuid, pk)
- `company_id` (uuid, fk → companies)
- `name` (text)
- `address` (text)
- `created_at` (timestamptz)

**profiles**
- `id` (uuid, pk, fk → auth.users.id)
- `company_id` (uuid, fk → companies)
- `location_id` (uuid, fk → locations, nullable)
- `role` (user_role enum: owner, manager, staff, terminal)
- `full_name` (text)
- `pin_hash` (text, nullable) - bcrypt hash for staff PINs
- `active` (boolean, default: true)
- `created_at` (timestamptz)

**terminals**
- `id` (uuid, pk) - matches the UUID in terminal email
- `company_id` (uuid, fk → companies)
- `location_id` (uuid, fk → locations)
- `name` (text) - friendly name like "Register 1"
- `active` (boolean, default: true)
- `created_at` (timestamptz)

**menu_items**
- `id` (uuid, pk)
- `company_id` (uuid, fk → companies)
- `name` (text)
- `category` (text)
- `price_cents` (integer)
- `available` (boolean, default: true)
- `created_at` (timestamptz)

**orders**
- `id` (uuid, pk)
- `company_id` (uuid, fk → companies)
- `location_id` (uuid, fk → locations)
- `terminal_id` (uuid, fk → terminals) - **CRITICAL: Which device processed this**
- `staff_id` (uuid, fk → profiles) - **CRITICAL: Which person processed this**
- `order_number` (text) - human-readable like "A001"
- `order_type` (order_type enum: dine_in, takeaway, delivery)
- `status` (order_status enum: pending, completed, cancelled)
- `total_cents` (integer)
- `tax_cents` (integer)
- `payment_method` (payment_method enum: cash, card, contactless)
- `table_id` (text, nullable)
- `customer_name` (text, nullable)
- `items` (jsonb) - array of {menu_item_id, name, quantity, price_cents}
- `created_at` (timestamptz)
- `completed_at` (timestamptz, nullable)

**audit_logs**
- `id` (uuid, pk)
- `company_id` (uuid, fk → companies)
- `user_id` (uuid, fk → profiles, nullable) - admin/staff who performed action
- `terminal_id` (uuid, fk → terminals, nullable) - terminal involved
- `action` (text) - e.g., 'staff.created', 'order.completed', 'auth.pin_login'
- `entity_type` (text) - e.g., 'staff', 'order', 'terminal'
- `entity_id` (uuid, nullable) - ID of affected entity
- `old_values` (jsonb, nullable) - before state for updates
- `new_values` (jsonb, nullable) - after state for creates/updates
- `metadata` (jsonb, nullable) - additional context
- `ip_address` (inet, nullable)
- `user_agent` (text, nullable)
- `created_at` (timestamptz)

### RLS Policies

All tables use Row Level Security for multi-tenant isolation:

```sql
-- Example: Orders can only be accessed by users in the same company
create policy "Users can view orders from their company"
  on orders for select
  using (company_id = (select company_id from profiles where id = auth.uid()));
```

**Audit logs exception:**
- Read-only for authenticated users (via RLS)
- Inserts only via service role key (bypasses RLS)
- Prevents tampering with audit trail

---

## Authentication System

### Admin Portal Authentication

**Route:** `/login`  
**Flow:**
1. User enters email + password
2. Supabase Auth signs in
3. Check profile.role ∈ ['owner', 'manager']
4. Redirect to `/dashboard`

**Protected routes:** All `/dashboard/*` routes check for admin role

### Terminal Authentication

**Route:** `/terminal`  
**Two-phase authentication:**

**Phase 1: Device Pairing (one-time)**
1. Admin creates terminal in dashboard
2. System generates:
   - Auth user: `terminal-{uuid}@keapos.internal`
   - Random 16-char password
   - QR code containing: `{terminal_id, email, password}` (base64 JSON)
3. Terminal device scans QR code
4. Terminal signs in to Supabase with credentials
5. Terminal stores session in device

**Phase 2: Staff PIN Login (per-shift/transaction)**
1. Terminal prompts for 4-digit PIN
2. PIN verified against `profiles.pin_hash` (bcrypt)
3. Fetches staff member's profile
4. Stores active staff in session (Zustand store)
5. All orders tagged with both `terminal_id` and `staff_id`

**Re-pairing terminals:**
- Admin can "Reset Credentials" to generate new password + QR code
- Useful if device is reset or credentials lost
- Logged in audit_logs as security event

---

## Audit Logging

### Infrastructure

**File:** `lib/audit.ts`  
**Documentation:** `docs/AUDIT_LOGGING.md`

### Core Functions

```typescript
// Log an audit event
await logAudit({
  company_id: string,
  user_id?: string,
  terminal_id?: string,
  action: string,
  entity_type: string,
  entity_id?: string,
  old_values?: Record<string, any>,
  new_values?: Record<string, any>,
  metadata?: Record<string, any>,
});

// Create diff for updates (only changed fields)
const { old_values, new_values } = createDiff(oldRecord, newRecord);
```

### What Gets Logged

**Staff Management:**
- `staff.created` - Staff member added (email or PIN-only)
- `staff.modified` - Role, location, or active status changed
- `staff.deleted` - Staff member removed (only if no transactions)

**Terminal Management:**
- `terminal.created` - New terminal registered
- `terminal.modified` - Name or active status changed
- `terminal.deleted` - Terminal removed (only if no transactions)
- `terminal.credentials_reset` - Security-critical: credentials regenerated

**Orders:**
- `order.completed` - Transaction finalized with all details

**Authentication:**
- `auth.pin_login` - Successful staff PIN authentication
- `auth.pin_failed` - Failed PIN attempt (security monitoring)

### Audit Log Queries

```sql
-- All actions by a specific admin
SELECT * FROM audit_logs 
WHERE user_id = 'admin-uuid' 
ORDER BY created_at DESC;

-- All transactions from a specific terminal
SELECT * FROM audit_logs 
WHERE terminal_id = 'terminal-uuid' 
  AND action = 'order.completed'
ORDER BY created_at DESC;

-- Security events (failed logins, credential resets)
SELECT * FROM audit_logs 
WHERE action IN ('auth.pin_failed', 'terminal.credentials_reset')
ORDER BY created_at DESC;

-- Changes to a specific staff member
SELECT * FROM audit_logs 
WHERE entity_type = 'staff' 
  AND entity_id = 'staff-uuid'
ORDER BY created_at DESC;
```

---

## Key Components

### Server Actions

**Staff Management:** `app/(admin)/dashboard/staff/actions.ts`
- `inviteStaff()` - Create email or PIN-only staff
- `updateStaffRole()` - Modify role/location/active status
- `deleteStaff()` - Remove staff (checks transaction history)

**Terminal Management:** `app/(admin)/dashboard/terminals/actions.ts`
- `createTerminal()` - Register new terminal with QR pairing
- `updateTerminal()` - Modify name/active status
- `deleteTerminal()` - Remove terminal (checks transaction history)
- `resetTerminalCredentials()` - Generate new password + QR code

**POS Actions:** `app/(pos)/terminal/actions.ts`
- `placeOrder()` - Create and complete order with audit logging

**PIN Authentication:** `app/(pos)/terminal/pin-actions.ts`
- `verifyPIN()` - Authenticate staff member via PIN

### Client Components

**Admin Portal:**
- `staff-client.tsx` - Two separate forms: "Add Staff Member" (PIN), "Add Manager" (email)
- `terminals-client.tsx` - Terminal management with QR code display
- `locations-client.tsx` - Location CRUD
- `menu-client.tsx` - Menu item management

**POS Terminal:**
- `terminal-shell.tsx` - Main wrapper, handles device pairing
- `pairing-screen.tsx` - QR code scanner for terminal setup
- `pin-login-screen.tsx` - Staff PIN entry
- `terminal-main.tsx` - Main POS interface (menu, cart, orders)
- `payment-modal.tsx` - Payment method selection and checkout

### State Management

**Zustand Stores:**
- `lib/store/cart.ts` - Shopping cart (items, quantities, totals)
- `lib/store/active-staff.ts` - Currently logged-in staff member on terminal

### Utilities

- `lib/supabase/client.ts` - Client-side Supabase client
- `lib/supabase/server.ts` - Server-side Supabase client
- `lib/audit.ts` - Audit logging utilities
- `lib/types.ts` - TypeScript interfaces for all entities
- `lib/db/offline-db.ts` - IndexedDB wrapper for offline caching

---

## Development Workflow

### Database Migrations

**Location:** `supabase/migrations/`

**Creating migrations:**
```bash
npx supabase migration new descriptive_name
```

**Applying locally:**
```bash
npx supabase db reset  # Reset and apply all migrations
```

**Production deployment:**
- Migrations auto-apply via GitHub Actions when pushed to `main`
- Workflow: `.github/workflows/migrate.yml`

### Running Tests

```bash
# Unit tests (Vitest)
npm test

# Watch mode
npm test -- --watch

# E2E tests (Playwright)
npx playwright test

# Test coverage
npm test -- --coverage
```

### Local Development

```bash
# Start Next.js dev server
npm run dev

# Start Supabase locally (optional)
npx supabase start

# Generate TypeScript types from database
npx supabase gen types typescript --local > lib/database.types.ts
```

### Git Workflow

1. Create feature branch: `git checkout -b feature/description`
2. Make changes with commits following convention
3. Run tests: `npm test`
4. Push and create PR
5. CI runs tests automatically
6. Merge to `master` after approval
7. Delete feature branch

**Commit message format:**
```
<type>: <short description>

<detailed explanation>

<why this change was made>

https://claude.ai/code/session_<id>
```

---

## Testing Strategy

### Unit Tests (98 tests passing)

**Coverage areas:**
- `tests/unit/auth-actions.test.ts` - Authentication flows
- `tests/unit/cart.test.ts` - Shopping cart logic
- `tests/unit/active-staff.test.ts` - Staff session management
- `tests/unit/pin-verification.test.ts` - PIN hashing and verification
- `tests/unit/offline-db.test.ts` - IndexedDB operations
- `tests/unit/schema.test.ts` - Database schema validation
- `tests/unit/login-form.test.tsx` - Login UI
- `tests/unit/dashboard.test.tsx` - Dashboard rendering
- `tests/unit/useAuth.test.ts` - Auth hooks
- `tests/unit/proxy.test.ts` - API proxy functionality
- `tests/unit/query-provider.test.tsx` - React Query setup

### E2E Tests (Playwright)

- `tests/e2e/navigation.spec.ts` - User navigation flows

### CI Pipeline

**Workflow:** `.github/workflows/ci.yml`

Runs on every PR and push to main/staging:
1. Checkout code
2. Setup Node.js 20
3. Install dependencies (`npm ci`)
4. Run tests (`npm test`)

---

## Important Patterns

### 1. Service Role Key Usage

**When to use:**
- Creating terminal/staff auth users (admin operations)
- Writing audit logs (bypass RLS for security)
- Deleting auth users

**Example:**
```typescript
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
```

**⚠️ Critical:** Never expose service role key to client-side code

### 2. Transaction History Protection

**Pattern:**
```typescript
// Always check before deleting entities with transactions
const { count } = await supabase
  .from('orders')
  .select('*', { count: 'exact', head: true })
  .eq('staff_id', staffId);

if (count && count > 0) {
  return { 
    error: `Cannot delete. Has ${count} transaction(s). Deactivate instead.` 
  };
}
```

### 3. Audit Logging for Updates

**Pattern:**
```typescript
// Fetch old values first
const { data: oldProfile } = await supabase
  .from('profiles')
  .select('role, location_id, active')
  .eq('id', staffId)
  .single();

// Make update
await supabase.from('profiles').update(newValues).eq('id', staffId);

// Log only changed fields
const { old_values, new_values } = createDiff(oldProfile, newValues);

if (Object.keys(new_values).length > 0) {
  await logAudit({
    company_id,
    user_id: adminId,
    action: 'staff.modified',
    entity_type: 'staff',
    entity_id: staffId,
    old_values,
    new_values,
  });
}
```

### 4. Terminal ID Extraction

**Pattern:**
```typescript
// Extract terminal ID from authenticated user's email
const terminalIdMatch = user.email?.match(/^terminal-([a-f0-9-]+)@keapos\.internal$/);
const terminal_id = terminalIdMatch?.[1];
```

### 5. PIN-Only User Creation

**Pattern:**
```typescript
// Generate email for auth requirement
const staffId = crypto.randomUUID();
const staffEmail = `staff-${staffId}@keapos.internal`;
const generatedPassword = crypto.randomUUID();

// Create auth user
const { data: newUser } = await supabaseAdmin.auth.admin.createUser({
  email: staffEmail,
  password: generatedPassword,
  email_confirm: true,
});

// Hash PIN for storage
const pin_hash = await bcrypt.hash(pin, 10);

// Create profile
await supabaseAdmin.from('profiles').insert({
  id: newUser.user.id,
  company_id,
  role: 'staff',
  full_name,
  pin_hash,
});
```

---

## Future Considerations

### 1. Planned Features

- **Reports Dashboard** - Sales analytics, staff performance, inventory
- **Table Management** - Visual floor plans, table status
- **Kitchen Display System** - Order routing to kitchen
- **Customer Loyalty** - Points, rewards, customer profiles
- **Inventory Tracking** - Stock levels, low stock alerts
- **Multi-payment Split** - Split bills across multiple payment methods

### 2. Performance Optimizations

- **Pagination** - Large order/staff/terminal lists need pagination
- **Caching** - Redis layer for frequently accessed menu items
- **Offline Sync** - Better conflict resolution for offline orders
- **Lazy Loading** - Code splitting for admin portal routes

### 3. Security Enhancements

- **Rate Limiting** - Prevent PIN brute force attacks (consider account lockout)
- **IP Whitelisting** - Restrict admin portal to known IPs
- **2FA** - Two-factor auth for admin users
- **Session Management** - Force re-auth after N hours
- **Audit Log Alerts** - Real-time notifications for suspicious activities

### 4. Operational Improvements

- **Backup System** - Automated database backups with point-in-time recovery
- **Monitoring** - Error tracking (Sentry), performance monitoring (Datadog)
- **Documentation** - API documentation with TypeDoc
- **Onboarding** - Setup wizard for new companies
- **Mobile Apps** - Native iOS/Android apps for terminals

### 5. Known Limitations

- **No bulk operations** - Staff/terminal import currently manual
- **Single currency** - Only supports cents (USD implicit)
- **No tax configuration** - Tax rates hardcoded
- **Basic reporting** - Need advanced BI tools
- **English only** - No i18n support yet

---

## Environment Variables

Required in `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Server-side only

# Optional
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**⚠️ Never commit `.env.local` to git**

---

## Troubleshooting

### Common Issues

**1. "Not authenticated" errors**
- Check if user session is valid
- Verify RLS policies allow the operation
- Ensure user has correct role (admin vs staff vs terminal)

**2. Foreign key violations**
- Usually means profile doesn't exist for auth user
- All staff/terminals need both auth.users + profiles entries

**3. PIN login fails**
- Verify PIN is exactly 4 digits
- Check pin_hash exists in profiles table
- Review audit_logs for `auth.pin_failed` events

**4. Can't delete terminal/staff**
- Check for transaction history (orders table)
- Use deactivation (active: false) instead

**5. Audit logs not appearing**
- Verify SUPABASE_SERVICE_ROLE_KEY is set
- Check audit logging function didn't silently fail
- Review server logs for errors

---

## Quick Reference

### Database Commands

```bash
# Reset local database
npx supabase db reset

# Create migration
npx supabase migration new name

# Generate types
npx supabase gen types typescript --local > lib/database.types.ts

# Apply migrations manually
npx supabase db push
```

### Test Commands

```bash
# All tests
npm test

# Specific test file
npm test tests/unit/cart.test.ts

# Coverage
npm test -- --coverage

# E2E
npx playwright test
```

### Git Commands

```bash
# Create feature branch
git checkout -b feature/name

# Stage and commit
git add .
git commit -m "feat: description"

# Push and track remote
git push -u origin feature/name

# Delete merged branch
git branch -d feature/name
git push origin --delete feature/name
```

---

## Session Metadata

**Implementation Date:** April 5, 2026  
**Primary Contributors:** Claude Code Session  
**Major Milestones:**
- ✅ Multi-tenant database schema with RLS
- ✅ Terminal device pairing system
- ✅ Staff PIN authentication
- ✅ Complete audit logging infrastructure
- ✅ Admin portal (staff, terminals, locations, menu)
- ✅ POS terminal interface
- ✅ Comprehensive test suite (98 tests)
- ✅ CI/CD pipelines

**Total Files Created:** 68  
**Total Tests:** 98 (all passing)  
**Database Migrations:** 6  
**Lines of Code:** ~15,000

---

## Contact & Support

For questions about this implementation:
1. Review this guide and `docs/AUDIT_LOGGING.md`
2. Check test files for usage examples
3. Review git history for context on specific changes
4. Consult Supabase documentation for RLS/auth questions

**Repository:** BenClist-BC2/KeaPOS  
**License:** [Add license information]

---

*This guide is maintained as the project evolves. Update it when making significant architectural changes.*
