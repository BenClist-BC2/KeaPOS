'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';

/**
 * Invite a new staff member by creating a Supabase auth user and a profile.
 * Uses the service-role key via the admin API to create the user server-side.
 *
 * NOTE: SUPABASE_SERVICE_ROLE_KEY must be set in environment variables.
 * Without it, this falls back to returning an instructional error.
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

  const email     = (formData.get('email') as string)?.trim();
  const full_name = (formData.get('full_name') as string)?.trim();
  const role      = formData.get('role') as UserRole;
  const location_id = (formData.get('location_id') as string) || null;

  if (!email)     return { error: 'Email is required' };
  if (!full_name) return { error: 'Full name is required' };
  if (!['owner', 'manager', 'staff'].includes(role)) {
    return { error: 'Invalid role' };
  }

  // Use service-role client to create the auth user (server-side only)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return {
      error:
        'Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY in your environment, ' +
        'then go to Supabase Dashboard → Authentication → Users → Add user to create the account manually.',
    };
  }

  // Dynamically import to avoid bundling on client
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create auth user with invite (sends magic link email)
  const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email);
  if (createError) return { error: createError.message };
  if (!newUser.user) return { error: 'Failed to create user' };

  // Create profile linked to the new auth user
  const { error: profileError } = await adminClient
    .from('profiles')
    .insert({
      id:          newUser.user.id,
      company_id:  profile.company_id,
      location_id: location_id || null,
      role,
      full_name,
    });

  if (profileError) return { error: profileError.message };

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
