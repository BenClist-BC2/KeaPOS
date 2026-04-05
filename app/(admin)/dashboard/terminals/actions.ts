'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

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

  revalidatePath('/dashboard/terminals');
  return { terminal_id: terminal.id, pairing_code: pairingCode, error: null };
}

export async function updateTerminal(id: string, formData: FormData) {
  const supabase = await createServerClient();
  const name = (formData.get('name') as string)?.trim();
  const active = formData.get('active') === 'true';

  if (!name) return { error: 'Terminal name is required' };

  const { error } = await supabase
    .from('terminals')
    .update({ name, active })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard/terminals');
  return { error: null };
}
