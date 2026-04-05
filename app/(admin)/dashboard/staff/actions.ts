'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import type { UserRole } from '@/lib/types';

/**
 * Create a staff member.
 * - If email provided: creates a Supabase auth user + sends invite email (for owners/managers)
 * - If no email: creates PIN-only profile (for terminal-only staff)
 * - PIN is hashed before storing
 */
export async function inviteStaff(formData: FormData) {
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

  // Create admin client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Hash PIN
  const pin_hash = await bcrypt.hash(pin, 10);

  // If email provided: create full auth user
  if (email) {
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);

    if (createError) {
      return { error: createError.message };
    }

    if (!newUser.user) {
      return { error: 'Failed to create user' };
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: newUser.user.id,
      company_id: profile.company_id,
      location_id: location_id || null,
      role,
      full_name,
      pin_hash,
    });

    if (profileError) {
      return { error: profileError.message };
    }
  } else {
    // PIN-only user: no auth.users row
    const profileId = crypto.randomUUID();
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: profileId,
      company_id: profile.company_id,
      location_id: location_id || null,
      role,
      full_name,
      pin_hash,
    });

    if (profileError) {
      return { error: profileError.message };
    }
  }

  revalidatePath('/dashboard/staff');
  return { error: null };
}

export async function updateStaffRole(staffId: string, formData: FormData) {
  const supabase = await createServerClient();
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
