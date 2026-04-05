'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { logAudit, createDiff } from '@/lib/audit';

export interface CreateTerminalResult {
  terminal_id: string | null;
  pairing_code: string | null;
  error: string | null;
}

/**
 * Create a new terminal device.
 * Generates a Supabase auth user for the terminal with a random password,
 * returns a pairing code (base64 JSON) for QR code display.
 */
export async function createTerminal(formData: FormData): Promise<CreateTerminalResult> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { terminal_id: null, pairing_code: null, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return { terminal_id: null, pairing_code: null, error: 'Profile not found' };
  if (!['owner', 'manager'].includes(profile.role)) {
    return { terminal_id: null, pairing_code: null, error: 'Only owners and managers can create terminals' };
  }

  const name = (formData.get('name') as string)?.trim();
  const location_id = formData.get('location_id') as string;

  if (!name) return { terminal_id: null, pairing_code: null, error: 'Terminal name is required' };
  if (!location_id) return { terminal_id: null, pairing_code: null, error: 'Location is required' };

  // Create admin client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Generate terminal credentials
  const terminalId = crypto.randomUUID();
  const terminalEmail = `terminal-${terminalId}@keapos.internal`;

  // Generate secure random password (16 chars, alphanumeric)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const terminalPassword = Array.from(array)
    .map(byte => chars[byte % chars.length])
    .join('');

  // Create terminal auth user
  const { data: terminalUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email: terminalEmail,
    password: terminalPassword,
    email_confirm: true,
  });

  if (createUserError || !terminalUser.user) {
    return { terminal_id: null, pairing_code: null, error: createUserError?.message ?? 'Failed to create terminal user' };
  }

  // Create terminal profile
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: terminalUser.user.id,
    company_id: profile.company_id,
    location_id,
    role: 'terminal',
    full_name: name,
    active: true,
  });

  if (profileError) {
    return { terminal_id: null, pairing_code: null, error: profileError.message };
  }

  // Create terminal record
  const { data: terminal, error: terminalError } = await supabaseAdmin.from('terminals').insert({
    id: terminalId,
    company_id: profile.company_id,
    location_id,
    name,
  }).select('id').single();

  if (terminalError || !terminal) {
    return { terminal_id: null, pairing_code: null, error: terminalError?.message ?? 'Failed to create terminal record' };
  }

  // Generate pairing code (base64 JSON)
  const pairingData = {
    terminal_id: terminal.id,
    email: terminalEmail,
    password: terminalPassword,
  };
  const pairingCode = btoa(JSON.stringify(pairingData));

  // Audit log: Terminal created
  await logAudit({
    company_id: profile.company_id,
    user_id: user.id,
    action: 'terminal.created',
    entity_type: 'terminal',
    entity_id: terminal.id,
    new_values: {
      name,
      location_id,
      active: true,
    },
  });

  revalidatePath('/dashboard/terminals');
  return { terminal_id: terminal.id, pairing_code: pairingCode, error: null };
}

export async function updateTerminal(id: string, formData: FormData) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found' };

  const name = (formData.get('name') as string)?.trim();
  const active = formData.get('active') === 'true';

  if (!name) return { error: 'Terminal name is required' };

  // Fetch old values for audit trail
  const { data: oldTerminal } = await supabase
    .from('terminals')
    .select('name, active')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('terminals')
    .update({ name, active })
    .eq('id', id);

  if (error) return { error: error.message };

  // Audit log: Terminal modified
  if (oldTerminal) {
    const { old_values, new_values } = createDiff(
      { name: oldTerminal.name, active: oldTerminal.active },
      { name, active }
    );

    // Only log if there were actual changes
    if (Object.keys(new_values).length > 0) {
      await logAudit({
        company_id: profile.company_id,
        user_id: user.id,
        action: 'terminal.modified',
        entity_type: 'terminal',
        entity_id: id,
        old_values,
        new_values,
      });
    }
  }

  revalidatePath('/dashboard/terminals');
  return { error: null };
}

export async function deleteTerminal(terminalId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found' };
  if (!['owner', 'manager'].includes(profile.role)) {
    return { error: 'Only owners and managers can delete terminals' };
  }

  // Get terminal to verify ownership
  const { data: terminal } = await supabase
    .from('terminals')
    .select('id, company_id, name')
    .eq('id', terminalId)
    .single();

  if (!terminal) {
    return { error: 'Terminal not found' };
  }

  if (terminal.company_id !== profile.company_id) {
    return { error: 'Unauthorized' };
  }

  // Check if terminal has any transactions (orders, payments)
  const { count: orderCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('terminal_id', terminalId);

  if (orderCount && orderCount > 0) {
    return {
      error: `Cannot delete terminal "${terminal.name}". It has ${orderCount} transaction(s) in the system. Please deactivate it instead to maintain audit trail.`
    };
  }

  // Safe to delete - no transactions
  const { error } = await supabase
    .from('terminals')
    .delete()
    .eq('id', terminalId);

  if (error) return { error: error.message };

  // Delete the auth user and profile for the terminal
  const terminalEmail = `terminal-${terminalId}@keapos.internal`;
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
  const terminalUser = users.find(u => u.email === terminalEmail);

  if (terminalUser) {
    await supabaseAdmin.auth.admin.deleteUser(terminalUser.id);
  }

  // Audit log: Terminal deleted
  await logAudit({
    company_id: profile.company_id,
    user_id: user.id,
    action: 'terminal.deleted',
    entity_type: 'terminal',
    entity_id: terminalId,
    metadata: {
      terminal_name: terminal.name,
      had_transactions: false,
    },
  });

  revalidatePath('/dashboard/terminals');
  return { error: null };
}

/**
 * Reset terminal credentials and generate new pairing code.
 * This allows re-pairing a terminal if credentials are lost.
 */
export async function resetTerminalCredentials(terminalId: string): Promise<CreateTerminalResult> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { terminal_id: null, pairing_code: null, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return { terminal_id: null, pairing_code: null, error: 'Profile not found' };
  if (!['owner', 'manager'].includes(profile.role)) {
    return { terminal_id: null, pairing_code: null, error: 'Only owners and managers can reset terminals' };
  }

  // Get terminal to verify ownership and get auth user ID
  const { data: terminal } = await supabase
    .from('terminals')
    .select('id, company_id')
    .eq('id', terminalId)
    .single();

  if (!terminal) {
    return { terminal_id: null, pairing_code: null, error: 'Terminal not found' };
  }

  if (terminal.company_id !== profile.company_id) {
    return { terminal_id: null, pairing_code: null, error: 'Unauthorized' };
  }

  // Get terminal's auth user (by email pattern)
  const terminalEmail = `terminal-${terminalId}@keapos.internal`;

  // Generate new password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const newPassword = Array.from(array)
    .map(byte => chars[byte % chars.length])
    .join('');

  // Update password using admin client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get user by email and update password
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
  const terminalUser = users.find(u => u.email === terminalEmail);

  if (!terminalUser) {
    return { terminal_id: null, pairing_code: null, error: 'Terminal auth user not found' };
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    terminalUser.id,
    { password: newPassword }
  );

  if (updateError) {
    return { terminal_id: null, pairing_code: null, error: updateError.message };
  }

  // Generate new pairing code
  const pairingData = {
    terminal_id: terminalId,
    email: terminalEmail,
    password: newPassword,
  };
  const pairingCode = btoa(JSON.stringify(pairingData));

  // Audit log: Terminal credentials reset (security-critical)
  await logAudit({
    company_id: profile.company_id,
    user_id: user.id,
    action: 'terminal.credentials_reset',
    entity_type: 'terminal',
    entity_id: terminalId,
    metadata: {
      reset_by: user.id,
    },
  });

  revalidatePath('/dashboard/terminals');
  return { terminal_id: terminalId, pairing_code: pairingCode, error: null };
}
