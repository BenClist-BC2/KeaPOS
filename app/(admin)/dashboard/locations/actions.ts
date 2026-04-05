'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createLocation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Profile not found' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Location name is required' };

  const { error } = await supabase.from('locations').insert({
    company_id: profile.company_id,
    name,
    address: (formData.get('address') as string)?.trim() || null,
    phone: (formData.get('phone') as string)?.trim() || null,
    timezone: (formData.get('timezone') as string) || 'Pacific/Auckland',
  });

  if (error) return { error: error.message };
  revalidatePath('/dashboard/locations');
  return { error: null };
}

export async function updateLocation(id: string, formData: FormData) {
  const supabase = await createClient();
  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Location name is required' };

  const { error } = await supabase
    .from('locations')
    .update({
      name,
      address: (formData.get('address') as string)?.trim() || null,
      phone: (formData.get('phone') as string)?.trim() || null,
      timezone: (formData.get('timezone') as string) || 'Pacific/Auckland',
      active: formData.get('active') === 'true',
    })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard/locations');
  return { error: null };
}
