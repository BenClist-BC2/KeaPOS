'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';

/**
 * Create a staff member via Supabase Edge Function.
 * - If email provided: creates a Supabase auth user + sends invite email (for owners/managers)
 * - If no email: creates PIN-only profile (for terminal-only staff)
 * - PIN is hashed in the Edge Function before storing
 */
export async function inviteStaff(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found' };
  if (!['owner', 'manager'].includes(profile.role)) {
    return { error: 'Only owners and managers can invite staff' };
  }

  const email       = (formData.get('email') as string)?.trim() || undefined;
  const full_name   = (formData.get('full_name') as string)?.trim();
  const pin         = (formData.get('pin') as string)?.trim();
  const role        = formData.get('role') as UserRole;
  const location_id = (formData.get('location_id') as string) || undefined;

  if (!full_name) return { error: 'Full name is required' };
  if (!pin || pin.length < 4) return { error: 'PIN must be at least 4 digits' };
  if (!['owner', 'manager', 'staff'].includes(role)) {
    return { error: 'Invalid role' };
  }

  // Get session to pass auth to Edge Function
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { error: 'No active session' };
  }

  // Call Supabase Edge Function to create staff
  const { data: result, error } = await supabase.functions.invoke('create-staff', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      full_name,
      pin,
      email,
      role,
      location_id,
    },
  });

  if (error) {
    return { error: error.message ?? 'Failed to create staff member' };
  }

  if (result?.error) {
    return { error: result.error };
  }

  revalidatePath('/dashboard/staff');
  return { error: null };
}

export async function updateStaffRole(staffId: string, formData: FormData) {
  const supabase = await createClient();
  const role = formData.get('role') as UserRole;
  const location_id = (formData.get('location_id') as string) || null;
  const active = formData.get('active') === 'true';

  const { error } = await supabase
    .from('profiles')
    .update({ role, location_id, active })
    .eq('id', staffId);

  if (error) return { error: error.message };
  revalidatePath('/dashboard/staff');
  return { error: null };
}
