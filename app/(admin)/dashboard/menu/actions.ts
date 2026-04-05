'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseCents } from '@/lib/types';

// ─── Categories ──────────────────────────────────────────────

export async function createCategory(formData: FormData) {
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
  if (!name) return { error: 'Category name is required' };

  const { error } = await supabase.from('categories').insert({
    company_id: profile.company_id,
    name,
    sort_order: parseInt(formData.get('sort_order') as string) || 0,
  });

  if (error) return { error: error.message };
  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient();
  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Category name is required' };

  const { error } = await supabase
    .from('categories')
    .update({
      name,
      sort_order: parseInt(formData.get('sort_order') as string) || 0,
      active: formData.get('active') === 'true',
    })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/menu');
  return { error: null };
}

// ─── Products ────────────────────────────────────────────────

export async function createProduct(formData: FormData) {
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
  const category_id = formData.get('category_id') as string;
  const priceStr = formData.get('price') as string;

  if (!name) return { error: 'Product name is required' };
  if (!category_id) return { error: 'Category is required' };
  if (!priceStr || isNaN(parseFloat(priceStr))) return { error: 'Valid price is required' };

  const { error } = await supabase.from('products').insert({
    company_id: profile.company_id,
    category_id,
    name,
    description: (formData.get('description') as string)?.trim() || null,
    price_cents: parseCents(priceStr),
    sort_order: parseInt(formData.get('sort_order') as string) || 0,
    available: true,
  });

  if (error) return { error: error.message };
  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function updateProduct(id: string, formData: FormData) {
  const supabase = await createClient();
  const name = (formData.get('name') as string)?.trim();
  const priceStr = formData.get('price') as string;

  if (!name) return { error: 'Product name is required' };
  if (!priceStr || isNaN(parseFloat(priceStr))) return { error: 'Valid price is required' };

  const { error } = await supabase
    .from('products')
    .update({
      name,
      category_id: formData.get('category_id') as string,
      description: (formData.get('description') as string)?.trim() || null,
      price_cents: parseCents(priceStr),
      sort_order: parseInt(formData.get('sort_order') as string) || 0,
      available: formData.get('available') === 'true',
    })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/menu');
  return { error: null };
}
