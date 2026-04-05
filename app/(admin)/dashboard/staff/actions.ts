'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { logAudit, createDiff } from '@/lib/audit';
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('Profile lookup error:', profileError);
    return { error: `Profile lookup failed: ${profileError.message}` };
  }
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

    // Audit log: Staff created with email
    await logAudit({
      company_id: profile.company_id,
      user_id: user.id,
      action: 'staff.created',
      entity_type: 'staff',
      entity_id: newUser.user.id,
      new_values: {
        full_name,
        email,
        role,
        has_email: true,
        location_id: location_id || null,
      },
    });
  } else {
    // PIN-only user: create auth user with generated email
    const staffId = crypto.randomUUID();
    const generatedEmail = `staff-${staffId}@keapos.internal`;

    // Generate a random password (won't be used, but required for auth user)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const generatedPassword = Array.from(array)
      .map(byte => chars[byte % chars.length])
      .join('');

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: generatedEmail,
      password: generatedPassword,
      email_confirm: true,
    });

    if (createError) {
      return { error: createError.message };
    }

    if (!newUser.user) {
      return { error: 'Failed to create user' };
    }

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

    // Audit log: Staff created (PIN-only)
    await logAudit({
      company_id: profile.company_id,
      user_id: user.id,
      action: 'staff.created',
      entity_type: 'staff',
      entity_id: newUser.user.id,
      new_values: {
        full_name,
        role,
        has_email: false,
        location_id: location_id || null,
      },
    });
  }

  revalidatePath('/dashboard/staff');
  return { error: null };
}

export async function updateStaffRole(staffId: string, formData: FormData) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found' };

  const role = formData.get('role') as UserRole;
  const location_id = (formData.get('location_id') as string) || null;
  const active = formData.get('active') === 'true';

  // Fetch old values for audit trail
  const { data: oldProfile } = await supabase
    .from('profiles')
    .select('role, location_id, active, full_name')
    .eq('id', staffId)
    .single();

  const { error } = await supabase
    .from('profiles')
    .update({ role, location_id, active })
    .eq('id', staffId);

  if (error) return { error: error.message };

  // Audit log: Staff modified
  if (oldProfile) {
    const { old_values, new_values } = createDiff(
      { role: oldProfile.role, location_id: oldProfile.location_id, active: oldProfile.active },
      { role, location_id, active }
    );

    // Only log if there were actual changes
    if (Object.keys(new_values).length > 0) {
      await logAudit({
        company_id: profile.company_id,
        user_id: user.id,
        action: 'staff.modified',
        entity_type: 'staff',
        entity_id: staffId,
        old_values,
        new_values,
        metadata: { staff_name: oldProfile.full_name },
      });
    }
  }

  revalidatePath('/dashboard/staff');
  return { error: null };
}

export async function deleteStaff(staffId: string) {
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
    return { error: 'Only owners and managers can delete staff' };
  }

  // Get staff member to verify ownership
  const { data: staffMember } = await supabase
    .from('profiles')
    .select('id, company_id, full_name')
    .eq('id', staffId)
    .single();

  if (!staffMember) {
    return { error: 'Staff member not found' };
  }

  if (staffMember.company_id !== profile.company_id) {
    return { error: 'Unauthorized' };
  }

  // Check if staff member has any transactions
  const { count: orderCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('staff_id', staffId);

  if (orderCount && orderCount > 0) {
    return {
      error: `Cannot delete "${staffMember.full_name}". They have ${orderCount} transaction(s) in the system. Please deactivate them instead to maintain audit trail.`
    };
  }

  // Safe to delete - no transactions
  // Delete profile (auth user deletion handled by admin client if needed)
  const { error: deleteError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', staffId);

  if (deleteError) return { error: deleteError.message };

  // If they have an auth user, delete it
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Try to delete the auth user (will fail silently if already deleted by cascade)
  await supabaseAdmin.auth.admin.deleteUser(staffId).catch(() => {});

  // Audit log: Staff deleted
  await logAudit({
    company_id: profile.company_id,
    user_id: user.id,
    action: 'staff.deleted',
    entity_type: 'staff',
    entity_id: staffId,
    metadata: {
      staff_name: staffMember.full_name,
      had_transactions: false,
    },
  });

  revalidatePath('/dashboard/staff');
  return { error: null };
}
