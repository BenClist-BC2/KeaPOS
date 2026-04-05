# Audit Logging

Comprehensive audit trail for all system actions to ensure compliance, security, and fraud detection.

## What Gets Logged

### Authentication Events
- ✅ Admin portal login/logout
- ✅ Terminal pairing
- ✅ Staff PIN login (success/failure)
- ✅ Staff logout

### Transaction Events
- ✅ Order created
- ✅ Order item added/removed/modified
- ✅ Order completed
- ✅ Order cancelled
- ✅ Order refunded
- ✅ Payment recorded
- ✅ Payment refunded

### Configuration Changes
- ✅ Staff created/modified/deactivated/deleted
- ✅ Terminal created/modified/deactivated/deleted/credentials reset
- ✅ Location created/modified/deactivated
- ✅ Product created/modified/deactivated
- ✅ Product price changed (critical for compliance)
- ✅ Category created/modified/deactivated

## Usage

### Basic Logging

```typescript
import { logAudit } from '@/lib/audit';

// Log a simple action
await logAudit({
  company_id: 'company-uuid',
  user_id: 'user-uuid',
  action: 'product.created',
  entity_type: 'product',
  entity_id: 'product-uuid',
  new_values: { name: 'Coffee', price_cents: 450 },
  metadata: { category: 'Beverages' },
});
```

### Logging with Terminal Context

```typescript
await logAudit({
  company_id: profile.company_id,
  user_id: staff_id,           // Staff member who performed action
  terminal_id: terminal_id,     // Terminal device used
  action: 'order.created',
  entity_type: 'order',
  entity_id: order.id,
  new_values: { 
    order_number: order.order_number,
    total_cents: 1850,
    order_type: 'dine-in'
  },
  metadata: { 
    table_number: 'T1',
    items_count: 3 
  },
});
```

### Logging Changes (Updates)

```typescript
import { createDiff } from '@/lib/audit';

const oldProduct = { name: 'Coffee', price_cents: 450 };
const newProduct = { name: 'Coffee', price_cents: 500 };

const { old_values, new_values } = createDiff(oldProduct, newProduct);

await logAudit({
  company_id: profile.company_id,
  user_id: user.id,
  action: 'product.price_changed',
  entity_type: 'product',
  entity_id: product.id,
  old_values,  // { price_cents: 450 }
  new_values,  // { price_cents: 500 }
  metadata: { reason: 'Price increase', changed_by: user.full_name },
});
```

### Logging Failed Attempts

```typescript
await logAudit({
  company_id: profile.company_id,
  terminal_id: terminal_id,
  action: 'auth.pin_failed',
  entity_type: 'auth',
  metadata: { 
    pin_entered: pin.substring(0, 2) + '**',  // Partial PIN for debugging
    attempt_number: 3,
    ip_address: req.ip 
  },
});
```

## Required Actions to Implement

### High Priority (Financial/Security)
- [ ] Order creation (`placeOrder`)
- [ ] Order completion
- [ ] Order cancellation
- [ ] Payment recording
- [ ] Product price changes
- [ ] Staff PIN login attempts
- [ ] Cash drawer opens

### Medium Priority (Compliance)
- [ ] Staff creation/modification
- [ ] Terminal creation/modification
- [ ] Location creation/modification
- [ ] Product creation/modification
- [ ] Admin login/logout

### Lower Priority (Nice to have)
- [ ] Category management
- [ ] Settings changes
- [ ] Report generation

## Querying Audit Logs

### Recent actions for a specific order
```sql
SELECT * FROM audit_logs
WHERE entity_type = 'order'
  AND entity_id = 'order-uuid'
ORDER BY created_at DESC;
```

### All price changes in the last 30 days
```sql
SELECT * FROM audit_logs
WHERE action = 'product.price_changed'
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

### Failed PIN attempts today
```sql
SELECT * FROM audit_logs
WHERE action = 'auth.pin_failed'
  AND created_at::date = CURRENT_DATE
ORDER BY created_at DESC;
```

### All actions by a specific staff member
```sql
SELECT * FROM audit_logs
WHERE user_id = 'staff-uuid'
ORDER BY created_at DESC
LIMIT 100;
```

## Best Practices

1. **Always log financial changes** - Orders, payments, refunds, price changes
2. **Log security events** - Login attempts (success and failure), permission changes
3. **Include context** - Terminal ID, staff ID, IP address when available
4. **Don't log sensitive data** - Never log full credit card numbers, full PINs, passwords
5. **Use metadata for context** - Additional information that helps investigations
6. **Don't throw on audit failures** - Audit logging failures shouldn't break operations
7. **Log before and after** - For updates, always include old_values and new_values

## Storage & Retention

- Audit logs are append-only (no updates/deletes via RLS)
- Consider archiving logs older than 7 years to cold storage
- Logs are company-isolated via RLS
- Indexed for fast querying by company, user, action, entity, and date
