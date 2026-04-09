'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCents } from '@/lib/types';
import { parseIncGSTCents } from '@/lib/gst';
import type { Unit } from '@/lib/units';
import { logAudit, getRequestContext, createDiff } from '@/lib/audit';
import { snapshotProductCosts } from '@/lib/product-cost';
import type { ProductCostSnapshot } from '@/lib/types';

// ─── Shared helper ────────────────────────────────────────────

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

// ─── Categories ───────────────────────────────────────────────

export async function createCategory(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Category name is required' };

  const payload = {
    company_id: ctx.company_id,
    name,
    sort_order: parseInt(formData.get('sort_order') as string) || 0,
  };

  const { data, error } = await ctx.supabase
    .from('categories')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'category.created',
    entity_type: 'category',
    entity_id: data.id,
    new_values: payload,
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function updateCategory(id: string, formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Category name is required' };

  const { data: before } = await ctx.supabase
    .from('categories')
    .select('name, sort_order, active')
    .eq('id', id)
    .single();

  const patch = {
    name,
    sort_order: parseInt(formData.get('sort_order') as string) || 0,
    active: formData.get('active') === 'true',
  };

  const { error } = await ctx.supabase.from('categories').update(patch).eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    const diff = createDiff(before, patch);
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'category.modified',
      entity_type: 'category',
      entity_id: id,
      ...diff,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function deleteCategory(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { data: before } = await ctx.supabase
    .from('categories')
    .select('name')
    .eq('id', id)
    .single();

  const { error } = await ctx.supabase.from('categories').delete().eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'category.deactivated',
      entity_type: 'category',
      entity_id: id,
      old_values: before,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

// ─── Products ─────────────────────────────────────────────────

export async function createProduct(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  const category_id = formData.get('category_id') as string;
  const priceStr = formData.get('price') as string;
  const gstRate = parseInt(formData.get('gst_rate') as string) || 15;
  const product_type = (formData.get('product_type') as string) || 'purchased';

  if (!name) return { error: 'Product name is required' };
  if (!category_id) return { error: 'Category is required' };
  if (!priceStr || isNaN(parseFloat(priceStr))) return { error: 'Valid price is required' };

  const ingredient_id = (formData.get('ingredient_id') as string) || null;
  const yieldQtyStr = formData.get('yield_quantity') as string;
  const yield_unit = (formData.get('yield_unit') as string) || null;

  const payload = {
    company_id: ctx.company_id,
    category_id,
    name,
    description: (formData.get('description') as string)?.trim() || null,
    price_cents: parseIncGSTCents(priceStr, gstRate),
    gst_rate: gstRate,
    product_type,
    ingredient_id: product_type === 'purchased' ? ingredient_id : null,
    yield_quantity: product_type === 'recipe' && yieldQtyStr ? parseFloat(yieldQtyStr) : null,
    yield_unit: product_type === 'recipe' ? yield_unit : null,
    sort_order: parseInt(formData.get('sort_order') as string) || 0,
    available: true,
  };

  const { data, error } = await ctx.supabase
    .from('products')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'product.created',
    entity_type: 'product',
    entity_id: data.id,
    new_values: payload,
    ...getRequestContext(hdrs),
  });

  // Snapshot initial cost
  await snapshotProductCosts(ctx.supabase, ctx.company_id, [data.id], 'product_created', name);

  revalidatePath('/dashboard/menu');
  return { error: null, id: data.id };
}

export async function updateProduct(id: string, formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  const priceStr = formData.get('price') as string;
  const gstRate = parseInt(formData.get('gst_rate') as string) || 15;
  const product_type = (formData.get('product_type') as string) || 'purchased';

  if (!name) return { error: 'Product name is required' };
  if (!priceStr || isNaN(parseFloat(priceStr))) return { error: 'Valid price is required' };

  const { data: before } = await ctx.supabase
    .from('products')
    .select('name, price_cents, category_id, description, sort_order, available, product_type, gst_rate, ingredient_id, yield_quantity, yield_unit')
    .eq('id', id)
    .single();

  const ingredient_id = (formData.get('ingredient_id') as string) || null;
  const yieldQtyStr = formData.get('yield_quantity') as string;
  const yield_unit = (formData.get('yield_unit') as string) || null;

  const patch = {
    name,
    category_id: formData.get('category_id') as string,
    description: (formData.get('description') as string)?.trim() || null,
    price_cents: parseIncGSTCents(priceStr, gstRate),
    gst_rate: gstRate,
    product_type,
    ingredient_id: product_type === 'purchased' ? ingredient_id : null,
    yield_quantity: product_type === 'recipe' && yieldQtyStr ? parseFloat(yieldQtyStr) : null,
    yield_unit: product_type === 'recipe' ? yield_unit : null,
    sort_order: parseInt(formData.get('sort_order') as string) || 0,
    available: formData.get('available') === 'true',
  };

  const { error } = await ctx.supabase.from('products').update(patch).eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    const diff = createDiff(before, patch);
    const action = before.price_cents !== patch.price_cents
      ? 'product.price_changed'
      : 'product.modified';
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action,
      entity_type: 'product',
      entity_id: id,
      ...diff,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function deleteProduct(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { data: before } = await ctx.supabase
    .from('products')
    .select('name, price_cents, product_type')
    .eq('id', id)
    .single();

  const { error } = await ctx.supabase.from('products').delete().eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'product.deleted',
      entity_type: 'product',
      entity_id: id,
      old_values: before,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

// ─── Recipe lines ─────────────────────────────────────────────

/** BFS to detect cycles in recipe nesting. Returns true if adding componentProductId
 *  to parentProductId's recipe would create a circular reference. */
async function wouldCreateCycle(
  supabase: SupabaseClient,
  componentProductId: string,
  parentProductId: string
): Promise<boolean> {
  const visited = new Set<string>();
  const queue: string[] = [componentProductId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === parentProductId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const { data: lines } = await supabase
      .from('recipe_lines')
      .select('component_product_id')
      .eq('product_id', current)
      .not('component_product_id', 'is', null);

    for (const line of lines ?? []) {
      if (line.component_product_id) queue.push(line.component_product_id);
    }
  }

  return false;
}

export async function createRecipeLine(
  productId: string,
  data: {
    ingredient_id?: string | null;
    component_product_id?: string | null;
    quantity: number;
    unit: Unit;
    sort_order?: number;
  }
) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { data: product } = await ctx.supabase
    .from('products')
    .select('company_id, product_type')
    .eq('id', productId)
    .single();

  if (!product || product.company_id !== ctx.company_id)
    return { error: 'Product not found' };
  if (product.product_type !== 'recipe')
    return { error: 'Only recipe products can have recipe lines' };

  if (data.component_product_id) {
    const cycle = await wouldCreateCycle(ctx.supabase, data.component_product_id, productId);
    if (cycle) {
      const { data: comp } = await ctx.supabase
        .from('products')
        .select('name')
        .eq('id', data.component_product_id)
        .single();
      return {
        error: `Cannot add "${comp?.name ?? 'that product'}" — it would create a circular recipe reference.`,
      };
    }
  }

  const { error } = await ctx.supabase.from('recipe_lines').insert({
    product_id: productId,
    ingredient_id: data.ingredient_id ?? null,
    component_product_id: data.component_product_id ?? null,
    quantity: data.quantity,
    unit: data.unit,
    sort_order: data.sort_order ?? 0,
  });

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'product.modified',
    entity_type: 'product',
    entity_id: productId,
    new_values: { recipe_line_added: data },
    ...getRequestContext(hdrs),
  });

  await snapshotProductCosts(ctx.supabase, ctx.company_id, [productId], 'recipe_change', 'recipe line added');

  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function deleteRecipeLine(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { data: line } = await ctx.supabase
    .from('recipe_lines')
    .select('product_id, ingredient_id, component_product_id, quantity, unit')
    .eq('id', id)
    .single();

  const { error } = await ctx.supabase.from('recipe_lines').delete().eq('id', id);
  if (error) return { error: error.message };

  if (line) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'product.modified',
      entity_type: 'product',
      entity_id: line.product_id,
      old_values: { recipe_line_removed: line },
      ...getRequestContext(hdrs),
    });

    await snapshotProductCosts(ctx.supabase, ctx.company_id, [line.product_id], 'recipe_change', 'recipe line removed');
  }

  revalidatePath('/dashboard/menu');
  return { error: null };
}

// ─── Cost history ─────────────────────────────────────────────

export async function getProductCostHistory(
  productId: string
): Promise<{ snapshots: ProductCostSnapshot[]; error: string | null }> {
  const ctx = await getContext();
  if (!ctx) return { snapshots: [], error: 'Not authenticated' };

  const { data, error } = await ctx.supabase
    .from('product_cost_snapshots')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { snapshots: [], error: error.message };
  return { snapshots: (data as ProductCostSnapshot[]) ?? [], error: null };
}

// ─── Ingredients ──────────────────────────────────────────────

export async function createIngredient(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  const unit = formData.get('unit') as Unit;
  const costStr = formData.get('cost') as string;

  if (!name) return { error: 'Name is required' };
  if (!unit) return { error: 'Unit is required' };
  if (!costStr || isNaN(parseFloat(costStr))) return { error: 'Valid cost is required' };

  const cost_cents = parseCents(costStr);

  const { data, error } = await ctx.supabase
    .from('ingredients')
    .insert({ company_id: ctx.company_id, name, unit, cost_cents })
    .select('id')
    .single();

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'ingredient.created',
    entity_type: 'ingredient',
    entity_id: data.id,
    new_values: { name, unit, cost_cents },
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/stock');
  return { error: null };
}

export async function updateIngredient(id: string, formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  const unit = formData.get('unit') as Unit;
  const costStr = formData.get('cost') as string;

  if (!name) return { error: 'Name is required' };
  if (!unit) return { error: 'Unit is required' };
  if (!costStr || isNaN(parseFloat(costStr))) return { error: 'Valid cost is required' };

  const cost_cents = parseCents(costStr);

  const { data: before } = await ctx.supabase
    .from('ingredients')
    .select('name, unit, cost_cents')
    .eq('id', id)
    .single();

  const { error } = await ctx.supabase
    .from('ingredients')
    .update({ name, unit, cost_cents })
    .eq('id', id);

  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    const diff = createDiff(before, { name, unit, cost_cents });
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'ingredient.modified',
      entity_type: 'ingredient',
      entity_id: id,
      ...diff,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/stock');
  return { error: null };
}

export async function deleteIngredient(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const [{ count: productCount }, { count: recipeCount }, { count: receiptCount }] =
    await Promise.all([
      ctx.supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('ingredient_id', id),
      ctx.supabase
        .from('recipe_lines')
        .select('id', { count: 'exact', head: true })
        .eq('ingredient_id', id),
      ctx.supabase
        .from('stock_receipt_lines')
        .select('id', { count: 'exact', head: true })
        .eq('ingredient_id', id),
    ]);

  if ((productCount ?? 0) > 0)
    return { error: 'This ingredient is linked to a product — unlink it first.' };
  if ((recipeCount ?? 0) > 0)
    return { error: 'This ingredient is used in one or more recipes — remove it from those recipes first.' };
  if ((receiptCount ?? 0) > 0)
    return { error: 'This ingredient has stock receipt history and cannot be deleted.' };

  const { data: before } = await ctx.supabase
    .from('ingredients')
    .select('name, unit, cost_cents')
    .eq('id', id)
    .single();

  const { error } = await ctx.supabase.from('ingredients').delete().eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'ingredient.deleted',
      entity_type: 'ingredient',
      entity_id: id,
      old_values: before,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/stock');
  return { error: null };
}

export async function toggleIngredientStock(id: string, outOfStock: boolean) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { error } = await ctx.supabase
    .from('ingredients')
    .update({ out_of_stock: outOfStock })
    .eq('id', id);

  if (error) return { error: error.message };

  const { data: linkedProducts } = await ctx.supabase
    .from('products')
    .select('id, available')
    .eq('ingredient_id', id);

  const { data: recipeProducts } = await ctx.supabase
    .from('recipe_lines')
    .select('product_id')
    .eq('ingredient_id', id);

  const affectedProductIds = [
    ...(linkedProducts?.map(p => p.id) ?? []),
    ...(recipeProducts?.map(r => r.product_id) ?? []),
  ];

  const hdrs = await headers();
  const context = getRequestContext(hdrs);

  for (const productId of [...new Set(affectedProductIds)]) {
    let shouldBeAvailable: boolean;

    if (outOfStock) {
      shouldBeAvailable = false;
    } else {
      const { data: allLines } = await ctx.supabase
        .from('recipe_lines')
        .select('ingredient_id, ingredients(out_of_stock)')
        .eq('product_id', productId);

      const anyStillOut = allLines?.some(
        (line: { ingredients: { out_of_stock: boolean }[] | null }) =>
          line.ingredients?.[0]?.out_of_stock === true
      );
      shouldBeAvailable = !anyStillOut;
    }

    const { data: product } = await ctx.supabase
      .from('products')
      .select('available')
      .eq('id', productId)
      .single();

    if (product && product.available !== shouldBeAvailable) {
      await ctx.supabase
        .from('products')
        .update({ available: shouldBeAvailable })
        .eq('id', productId);

      await logAudit({
        company_id: ctx.company_id,
        user_id: ctx.user.id,
        action: 'product.availability_changed',
        entity_type: 'product',
        entity_id: productId,
        old_values: { available: product.available },
        new_values: { available: shouldBeAvailable },
        metadata: { reason: 'ingredient_stock_change', ingredient_id: id },
        ...context,
      });
    }
  }

  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'ingredient.stock_toggled',
    entity_type: 'ingredient',
    entity_id: id,
    new_values: { out_of_stock: outOfStock },
    metadata: { affected_products: affectedProductIds.length },
    ...context,
  });

  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/stock');
  return { error: null };
}
