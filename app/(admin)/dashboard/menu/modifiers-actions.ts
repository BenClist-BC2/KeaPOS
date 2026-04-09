'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { parseCents } from '@/lib/types';
import { logAudit, getRequestContext, createDiff } from '@/lib/audit';

async function getContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return { supabase, user, company_id: profile.company_id as string };
}

// ─── Modifier groups ──────────────────────────────────────────

export async function createModifierGroup(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Name is required' };

  const min_selections = parseInt(formData.get('min_selections') as string) || 0;
  const max_selections = parseInt(formData.get('max_selections') as string) || 1;

  const payload = {
    company_id: ctx.company_id,
    name,
    min_selections,
    max_selections,
    required: min_selections > 0,
  };

  const { data, error } = await ctx.supabase
    .from('modifier_groups')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'modifier_group.created',
    entity_type: 'modifier_group',
    entity_id: data.id,
    new_values: payload,
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function updateModifierGroup(id: string, formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Name is required' };

  const { data: before } = await ctx.supabase
    .from('modifier_groups')
    .select('name, required, min_selections, max_selections')
    .eq('id', id)
    .single();

  const min_selections = parseInt(formData.get('min_selections') as string) || 0;
  const max_selections = parseInt(formData.get('max_selections') as string) || 1;

  const patch = {
    name,
    min_selections,
    max_selections,
    required: min_selections > 0,
  };

  const { error } = await ctx.supabase.from('modifier_groups').update(patch).eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'modifier_group.modified',
      entity_type: 'modifier_group',
      entity_id: id,
      ...createDiff(before, patch),
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function deleteModifierGroup(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { count } = await ctx.supabase
    .from('product_modifier_groups')
    .select('product_id', { count: 'exact', head: true })
    .eq('modifier_group_id', id);

  if ((count ?? 0) > 0)
    return { error: `This modifier group is assigned to ${count} product(s) — unassign it first.` };

  const { data: before } = await ctx.supabase
    .from('modifier_groups')
    .select('name')
    .eq('id', id)
    .single();

  const { error } = await ctx.supabase.from('modifier_groups').delete().eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'modifier_group.deleted',
      entity_type: 'modifier_group',
      entity_id: id,
      old_values: before,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

// ─── Modifiers (options within a group) ──────────────────────

export async function createModifier(groupId: string, formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Name is required' };

  const payload = {
    modifier_group_id: groupId,
    company_id: ctx.company_id,
    name,
    sort_order: parseInt(formData.get('sort_order') as string) || 0,
  };

  const { data, error } = await ctx.supabase
    .from('modifiers')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { error: error.message };

  // Auto-create product_modifier_options for all products already assigned this group
  const { data: assignments } = await ctx.supabase
    .from('product_modifier_groups')
    .select('product_id')
    .eq('modifier_group_id', groupId);

  if (assignments && assignments.length > 0) {
    await ctx.supabase.from('product_modifier_options').insert(
      assignments.map(a => ({
        product_id: a.product_id,
        modifier_id: data.id,
        price_adjustment_cents: 0,
        enabled: true,
      }))
    );
  }

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'modifier.created',
    entity_type: 'modifier',
    entity_id: data.id,
    new_values: { ...payload, propagated_to_products: assignments?.length ?? 0 },
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function updateModifier(id: string, formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Name is required' };

  const { data: before } = await ctx.supabase
    .from('modifiers')
    .select('name, sort_order')
    .eq('id', id)
    .single();

  const patch = {
    name,
    sort_order: parseInt(formData.get('sort_order') as string) || 0,
  };

  const { error } = await ctx.supabase.from('modifiers').update(patch).eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'modifier.modified',
      entity_type: 'modifier',
      entity_id: id,
      ...createDiff(before, patch),
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function deleteModifier(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { data: before } = await ctx.supabase
    .from('modifiers')
    .select('name, modifier_group_id')
    .eq('id', id)
    .single();

  // product_modifier_options rows cascade-delete via FK
  const { error } = await ctx.supabase.from('modifiers').delete().eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'modifier.deleted',
      entity_type: 'modifier',
      entity_id: id,
      old_values: before,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

// ─── Product ↔ modifier group assignments ─────────────────────

export async function assignModifierGroup(productId: string, modifierGroupId: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { error: assignError } = await ctx.supabase
    .from('product_modifier_groups')
    .insert({ product_id: productId, modifier_group_id: modifierGroupId });

  if (assignError && !assignError.message.includes('duplicate'))
    return { error: assignError.message };

  // Auto-create product_modifier_options for every modifier in this group
  const { data: modifiers } = await ctx.supabase
    .from('modifiers')
    .select('id')
    .eq('modifier_group_id', modifierGroupId);

  if (modifiers && modifiers.length > 0) {
    await ctx.supabase
      .from('product_modifier_options')
      .upsert(
        modifiers.map(m => ({
          product_id: productId,
          modifier_id: m.id,
          price_adjustment_cents: 0,
          enabled: true,
        })),
        { onConflict: 'product_id,modifier_id', ignoreDuplicates: true }
      );
  }

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'modifier_group.modified',
    entity_type: 'modifier_group',
    entity_id: modifierGroupId,
    new_values: { assigned_to_product: productId },
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function unassignModifierGroup(productId: string, modifierGroupId: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  // Delete product_modifier_options for all modifiers in this group × this product
  const { data: modifiers } = await ctx.supabase
    .from('modifiers')
    .select('id')
    .eq('modifier_group_id', modifierGroupId);

  if (modifiers && modifiers.length > 0) {
    await ctx.supabase
      .from('product_modifier_options')
      .delete()
      .eq('product_id', productId)
      .in('modifier_id', modifiers.map(m => m.id));
  }

  const { error } = await ctx.supabase
    .from('product_modifier_groups')
    .delete()
    .eq('product_id', productId)
    .eq('modifier_group_id', modifierGroupId);

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'modifier_group.modified',
    entity_type: 'modifier_group',
    entity_id: modifierGroupId,
    old_values: { unassigned_from_product: productId },
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/menu');
  return { error: null };
}

// ─── Per-product modifier option config ───────────────────────

export async function updateProductModifierOption(
  productId: string,
  modifierId: string,
  patch: { price_adjustment_cents?: number; enabled?: boolean }
) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { error } = await ctx.supabase
    .from('product_modifier_options')
    .update(patch)
    .eq('product_id', productId)
    .eq('modifier_id', modifierId);

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'modifier.modified',
    entity_type: 'modifier',
    entity_id: modifierId,
    new_values: { product_id: productId, ...patch },
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/menu');
  return { error: null };
}
