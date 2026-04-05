'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Generate a cryptographically random pairing code for terminals.
 * Returns a 16-character alphanumeric string.
 */
function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  const length = 16;
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes)
    .map(byte => chars[byte % chars.length])
    .join('');
}

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
  const supabase = await createClient();
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

  // Generate terminal credentials
  const terminalPassword = generatePairingCode();
  const terminalId = crypto.randomUUID();
  const terminalEmail = `terminal-${terminalId}@keapos.internal`;

  // Create Supabase auth user for the terminal (requires service role key)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return {
      terminal_id: null,
      pairing_code: null,
      error: 'Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY in your environment. ' +
             'Find it in Supabase Dashboard → Settings → API → Project API keys → service_role (or use a Secret API key with admin privileges).',
    };
  }

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create terminal auth user
  const { data: terminalUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email: terminalEmail,
    password: terminalPassword,
    email_confirm: true,
  });

  if (createUserError || !terminalUser.user) {
    return { terminal_id: null, pairing_code: null, error: createUserError?.message ?? 'Failed to create terminal user' };
  }

  // Create terminal profile
  const { error: profileError } = await adminClient.from('profiles').insert({
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
  const { data: terminal, error: terminalError } = await supabase.from('terminals').insert({
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
  const pairingCode = Buffer.from(JSON.stringify(pairingData)).toString('base64');

  revalidatePath('/dashboard/terminals');
  return { terminal_id: terminal.id, pairing_code: pairingCode, error: null };
}

export async function updateTerminal(id: string, formData: FormData) {
  const supabase = await createClient();
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
