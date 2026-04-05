'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';
import bcrypt from 'bcryptjs';

/**
 * Create a staff member.
 * - If email provided: creates a Supabase auth user + sends invite email (for owners/managers)
 * - If no email: creates PIN-only profile (for terminal-only staff)
 * - PIN is always hashed with bcrypt before storing
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

  const email       = (formData.get('email') as string)?.trim() || null;
  const full_name   = (formData.get('full_name') as string)?.trim();
  const pin         = (formData.get('pin') as string)?.trim();
  const role        = formData.get('role') as UserRole;
  const location_id = (formData.get('location_id') as string) || null;

  if (!full_name) return { error: 'Full name is required' };
  if (!pin || pin.length < 4) return { error: 'PIN must be at least 4 digits' };
  if (!['owner', 'manager', 'staff'].includes(role)) {
    return { error: 'Invalid role' };
  }

  // Hash the PIN
  const pin_hash = await bcrypt.hash(pin, 10);

  // If email provided: create full auth user (owner/manager who can access admin portal)
  // If no email: create PIN-only profile (staff who only access terminal)
  if (email) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      return {
        error:
          'Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY in your environment. ' +
          'Find it in Supabase Dashboard → Settings → API → Project API keys → service_role (or use a Secret API key with admin privileges).',
      };
    }

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
    const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create auth user with invite (sends magic link email)
    const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (createError) return { error: createError.message };
    if (!newUser.user) return { error: 'Failed to create user' };

    // Create profile linked to the auth user
    const { error: profileError } = await adminClient
      .from('profiles')
      .insert({
        id:          newUser.user.id,
        company_id:  profile.company_id,
        location_id,
        role,
        full_name,
        pin_hash,
      });

    if (profileError) return { error: profileError.message };
  } else {
    // PIN-only user (no auth.users row) — generate UUID for profile.id
    const profileId = crypto.randomUUID();
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id:          profileId,
        company_id:  profile.company_id,
        location_id,
        role,
        full_name,
        pin_hash,
      });

    if (profileError) return { error: profileError.message };
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
