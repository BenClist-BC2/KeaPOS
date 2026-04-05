'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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

  // Call Supabase Edge Function to create terminal
  const { data: result, error } = await supabase.functions.invoke('create-terminal', {
    body: { name, location_id },
  });

  if (error) {
    return { terminal_id: null, pairing_code: null, error: error.message ?? 'Failed to create terminal' };
  }

  if (result?.error) {
    return { terminal_id: null, pairing_code: null, error: result.error };
  }

  revalidatePath('/dashboard/terminals');
  return { terminal_id: result.terminal_id, pairing_code: result.pairing_code, error: null };
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
