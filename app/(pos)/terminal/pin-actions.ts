'use server';

import bcrypt from 'bcryptjs';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';

export interface VerifyPINResult {
  staff_id: string | null;
  full_name: string | null;
  role: string | null;
  error: string | null;
}

/**
 * Verify a PIN for staff at the terminal's location.
 * Terminal must be authenticated (role=terminal) before calling this.
 */
export async function verifyPIN(pin: string): Promise<VerifyPINResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { staff_id: null, full_name: null, role: null, error: 'Terminal not authenticated' };
  }

  // Get terminal's location
  const { data: terminalProfile } = await supabase
    .from('profiles')
    .select('company_id, location_id, role')
    .eq('id', user.id)
    .single();

  if (!terminalProfile || terminalProfile.role !== 'terminal') {
    return { staff_id: null, full_name: null, role: null, error: 'Not a terminal device' };
  }

  // Fetch all active staff at this location (including owners/managers)
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, pin_hash')
    .eq('company_id', terminalProfile.company_id)
    .eq('active', true)
    .in('role', ['owner', 'manager', 'staff'])
    .not('pin_hash', 'is', null);

  if (!staff || staff.length === 0) {
    return { staff_id: null, full_name: null, role: null, error: 'No staff with PINs found' };
  }

  // Get terminal ID from email for audit logging
  const terminalIdMatch = user.email?.match(/^terminal-([a-f0-9-]+)@keapos\.internal$/);
  const terminal_id = terminalIdMatch?.[1] || null;

  // Check PIN against each staff member's hash (constant-time comparison)
  for (const member of staff) {
    if (member.pin_hash && await bcrypt.compare(pin, member.pin_hash)) {
      // Match found - log successful PIN login
      await logAudit({
        company_id: terminalProfile.company_id,
        user_id: member.id,
        terminal_id: terminal_id,
        action: 'auth.pin_login',
        entity_type: 'auth',
        metadata: {
          staff_name: member.full_name,
          staff_role: member.role,
          success: true,
        },
      });

      return {
        staff_id: member.id,
        full_name: member.full_name,
        role: member.role,
        error: null,
      };
    }
  }

  // Failed PIN attempt - log for security
  await logAudit({
    company_id: terminalProfile.company_id,
    terminal_id: terminal_id,
    action: 'auth.pin_failed',
    entity_type: 'auth',
    metadata: {
      pin_prefix: pin.substring(0, 2) + '**',  // Partial PIN for debugging (not full PIN!)
      attempts_against_staff_count: staff.length,
    },
  });

  return { staff_id: null, full_name: null, role: null, error: 'Invalid PIN' };
}
