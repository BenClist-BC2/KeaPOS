/**
 * Audit logging utilities for compliance and security
 *
 * Records all significant actions for:
 * - Financial compliance
 * - Security investigations
 * - Fraud detection
 * - Regulatory requirements
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

export type AuditAction =
  // Authentication
  | 'auth.login'
  | 'auth.logout'
  | 'auth.pin_login'
  | 'auth.pin_failed'
  | 'auth.terminal_paired'

  // Orders
  | 'order.created'
  | 'order.item_added'
  | 'order.item_removed'
  | 'order.item_modified'
  | 'order.completed'
  | 'order.cancelled'
  | 'order.refunded'

  // Payments
  | 'payment.recorded'
  | 'payment.refunded'

  // Staff management
  | 'staff.created'
  | 'staff.modified'
  | 'staff.deactivated'
  | 'staff.deleted'

  // Terminal management
  | 'terminal.created'
  | 'terminal.modified'
  | 'terminal.deactivated'
  | 'terminal.deleted'
  | 'terminal.credentials_reset'

  // Location management
  | 'location.created'
  | 'location.modified'
  | 'location.deactivated'

  // Menu management
  | 'category.created'
  | 'category.modified'
  | 'category.deactivated'
  | 'product.created'
  | 'product.modified'
  | 'product.price_changed'
  | 'product.deactivated';

export type AuditEntityType =
  | 'order'
  | 'order_item'
  | 'payment'
  | 'staff'
  | 'terminal'
  | 'location'
  | 'category'
  | 'product'
  | 'auth';

export interface AuditLogEntry {
  company_id: string;
  user_id?: string | null;
  terminal_id?: string | null;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

/**
 * Log an audit event using server-side Supabase client
 * Uses service role key to bypass RLS
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    // Use admin client to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error } = await supabaseAdmin.from('audit_logs').insert(entry);

    if (error) {
      // Log to console but don't throw - audit logging failures shouldn't break operations
      console.error('[Audit] Failed to log action:', entry.action, error);
    }
  } catch (err) {
    console.error('[Audit] Exception while logging:', err);
  }
}

/**
 * Helper to extract request context (IP, user agent) from Next.js headers
 */
export function getRequestContext(headers?: Headers): Pick<AuditLogEntry, 'ip_address' | 'user_agent'> {
  if (!headers) {
    return { ip_address: null, user_agent: null };
  }

  return {
    ip_address: headers.get('x-forwarded-for')?.split(',')[0] ||
                headers.get('x-real-ip') ||
                null,
    user_agent: headers.get('user-agent') || null,
  };
}

/**
 * Helper to create diff of changed values
 */
export function createDiff(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): { old_values: Record<string, unknown>; new_values: Record<string, unknown> } {
  const old_values: Record<string, unknown> = {};
  const new_values: Record<string, unknown> = {};

  // Find changed keys
  for (const key of Object.keys(newValues)) {
    if (oldValues[key] !== newValues[key]) {
      old_values[key] = oldValues[key];
      new_values[key] = newValues[key];
    }
  }

  return { old_values, new_values };
}
