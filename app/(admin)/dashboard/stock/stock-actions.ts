'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { logAudit, getRequestContext, createDiff } from '@/lib/audit';
import { toBaseUnits } from '@/lib/units';
import type { Unit } from '@/lib/units';
import { parseCents } from '@/lib/types';
import { snapshotCostsForIngredients } from '@/lib/product-cost';

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

// ─── Shared cost-update helper ────────────────────────────────

/** Convert invoice costs to per-ingredient-unit and update ingredients table. */
async function applyIngredientCosts(
  ctx: Awaited<ReturnType<typeof getContext>>,
  lines: StockReceiptLineInput[],
  clearOutOfStock: boolean
) {
  if (!ctx) return;

  const costByIngredient = new Map<string, { unit_cost_cents: number; invoiceUnit: Unit }>();
  for (const line of lines) {
    costByIngredient.set(line.ingredient_id, {
      unit_cost_cents: parseCents(line.unit_cost_dollars),
      invoiceUnit: line.unit,
    });
  }

  const ingredientIds = Array.from(costByIngredient.keys());
  const { data: ingredientRows } = await ctx.supabase
    .from('ingredients')
    .select('id, unit')
    .in('id', ingredientIds);

  const ingredientUnitMap = new Map<string, Unit>(
    (ingredientRows ?? []).map(i => [i.id as string, i.unit as Unit])
  );

  await Promise.all(
    Array.from(costByIngredient.entries()).map(([ingredient_id, { unit_cost_cents, invoiceUnit }]) => {
      const ingredientUnit = ingredientUnitMap.get(ingredient_id) ?? invoiceUnit;
      // Convert cost from per-invoice-unit to per-ingredient-unit.
      // e.g. $3/kg invoice, ingredient tracked in kg → 300 cents/kg
      // e.g. $3/kg invoice, ingredient tracked in g  → 0.3 cents/g → rounds to 0 (precision limit)
      // Tip: track ingredients in their purchase unit (kg not g) to avoid rounding loss.
      const cost_cents = Math.round(
        unit_cost_cents * toBaseUnits(1, invoiceUnit) / toBaseUnits(1, ingredientUnit)
      );
      const update: Record<string, unknown> = { cost_cents };
      if (clearOutOfStock) update.out_of_stock = false;
      return ctx.supabase
        .from('ingredients')
        .update(update)
        .eq('id', ingredient_id)
        .eq('company_id', ctx.company_id);
    })
  );

  return Array.from(costByIngredient.keys());
}

// ─── Suppliers ────────────────────────────────────────────────

export async function createSupplier(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Supplier name is required' };

  const payload = {
    company_id: ctx.company_id,
    name,
    contact_name: (formData.get('contact_name') as string)?.trim() || null,
    phone: (formData.get('phone') as string)?.trim() || null,
    email: (formData.get('email') as string)?.trim() || null,
  };

  const { data, error } = await ctx.supabase
    .from('suppliers')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'supplier.created',
    entity_type: 'supplier',
    entity_id: data.id,
    new_values: payload,
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/stock');
  return { error: null };
}

export async function updateSupplier(id: string, formData: FormData) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Supplier name is required' };

  const { data: before } = await ctx.supabase
    .from('suppliers')
    .select('name, contact_name, phone, email')
    .eq('id', id)
    .single();

  const patch = {
    name,
    contact_name: (formData.get('contact_name') as string)?.trim() || null,
    phone: (formData.get('phone') as string)?.trim() || null,
    email: (formData.get('email') as string)?.trim() || null,
  };

  const { error } = await ctx.supabase.from('suppliers').update(patch).eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'supplier.modified',
      entity_type: 'supplier',
      entity_id: id,
      ...createDiff(before, patch),
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/stock');
  return { error: null };
}

export async function deleteSupplier(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { count } = await ctx.supabase
    .from('stock_receipts')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id);

  if ((count ?? 0) > 0)
    return { error: `This supplier has ${count} receipt(s) — deactivate instead of deleting.` };

  const { data: before } = await ctx.supabase
    .from('suppliers')
    .select('name')
    .eq('id', id)
    .single();

  const { error } = await ctx.supabase.from('suppliers').delete().eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'supplier.deleted',
      entity_type: 'supplier',
      entity_id: id,
      old_values: before,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/stock');
  return { error: null };
}

export async function deactivateSupplier(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { error } = await ctx.supabase
    .from('suppliers')
    .update({ active: false })
    .eq('id', id);

  if (error) return { error: error.message };

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'supplier.deactivated',
    entity_type: 'supplier',
    entity_id: id,
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/stock');
  return { error: null };
}

// ─── Stock receipts ───────────────────────────────────────────

export interface StockReceiptLineInput {
  ingredient_id: string;
  quantity: number;
  unit: Unit;
  /** Ex-GST cost per invoice unit in dollars (e.g. "12.50") */
  unit_cost_dollars: string;
}

export async function createStockReceipt(
  receiptData: {
    supplier_id: string | null;
    receipt_date: string;
    invoice_number: string | null;
    notes: string | null;
  },
  lines: StockReceiptLineInput[]
) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  if (lines.length === 0) return { error: 'At least one line item is required' };

  for (const line of lines) {
    if (!line.ingredient_id) return { error: 'Each line must have an ingredient' };
    if (!line.quantity || line.quantity <= 0) return { error: 'Quantity must be greater than 0' };
    const cost = parseFloat(line.unit_cost_dollars);
    if (isNaN(cost) || cost < 0) return { error: 'Unit cost must be a valid number' };
  }

  const { data: receipt, error: receiptError } = await ctx.supabase
    .from('stock_receipts')
    .insert({ company_id: ctx.company_id, created_by: ctx.user.id, ...receiptData })
    .select('id')
    .single();

  if (receiptError) return { error: receiptError.message };

  const lineRows = lines.map(line => ({
    receipt_id: receipt.id,
    ingredient_id: line.ingredient_id,
    quantity: line.quantity,
    unit: line.unit,
    unit_cost_cents: parseCents(line.unit_cost_dollars),
  }));

  const { error: linesError } = await ctx.supabase.from('stock_receipt_lines').insert(lineRows);

  if (linesError) {
    await ctx.supabase.from('stock_receipts').delete().eq('id', receipt.id);
    return { error: linesError.message };
  }

  const ingredientIds = await applyIngredientCosts(ctx, lines, true);

  // Snapshot costs for all products affected by the updated ingredient prices
  if (ingredientIds && ingredientIds.length > 0) {
    await snapshotCostsForIngredients(
      ctx.supabase,
      ctx.company_id,
      ingredientIds,
      `stock receipt ${receiptData.invoice_number ?? receipt.id}`
    );
  }

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'stock_receipt.created',
    entity_type: 'stock_receipt',
    entity_id: receipt.id,
    new_values: { ...receiptData, line_count: lines.length, ingredients_updated: ingredientIds },
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/stock');
  revalidatePath('/dashboard/menu');
  return { error: null, receiptId: receipt.id };
}

export async function updateStockReceipt(
  id: string,
  receiptData: {
    supplier_id: string | null;
    receipt_date: string;
    invoice_number: string | null;
    notes: string | null;
  },
  lines: StockReceiptLineInput[]
) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  if (lines.length === 0) return { error: 'At least one line item is required' };

  for (const line of lines) {
    if (!line.ingredient_id) return { error: 'Each line must have an ingredient' };
    if (!line.quantity || line.quantity <= 0) return { error: 'Quantity must be greater than 0' };
    const cost = parseFloat(line.unit_cost_dollars);
    if (isNaN(cost) || cost < 0) return { error: 'Unit cost must be a valid number' };
  }

  const { error: headerError } = await ctx.supabase
    .from('stock_receipts')
    .update(receiptData)
    .eq('id', id);

  if (headerError) return { error: headerError.message };

  // Replace lines: delete existing, insert new
  await ctx.supabase.from('stock_receipt_lines').delete().eq('receipt_id', id);

  const lineRows = lines.map(line => ({
    receipt_id: id,
    ingredient_id: line.ingredient_id,
    quantity: line.quantity,
    unit: line.unit,
    unit_cost_cents: parseCents(line.unit_cost_dollars),
  }));

  const { error: linesError } = await ctx.supabase.from('stock_receipt_lines').insert(lineRows);
  if (linesError) return { error: linesError.message };

  // Re-apply costs — note this overwrites current ingredient costs with these values
  const ingredientIds = await applyIngredientCosts(ctx, lines, false);

  if (ingredientIds && ingredientIds.length > 0) {
    await snapshotCostsForIngredients(
      ctx.supabase,
      ctx.company_id,
      ingredientIds,
      `stock receipt edit ${receiptData.invoice_number ?? id}`
    );
  }

  const hdrs = await headers();
  await logAudit({
    company_id: ctx.company_id,
    user_id: ctx.user.id,
    action: 'stock_receipt.created',
    entity_type: 'stock_receipt',
    entity_id: id,
    new_values: {
      ...receiptData,
      line_count: lines.length,
      ingredients_updated: ingredientIds,
      edited: true,
    },
    ...getRequestContext(hdrs),
  });

  revalidatePath('/dashboard/stock');
  revalidatePath('/dashboard/menu');
  return { error: null };
}

export async function deleteStockReceipt(id: string) {
  const ctx = await getContext();
  if (!ctx) return { error: 'Not authenticated' };

  const { data: before } = await ctx.supabase
    .from('stock_receipts')
    .select('receipt_date, invoice_number, supplier_id')
    .eq('id', id)
    .single();

  // Lines cascade-delete via FK
  const { error } = await ctx.supabase.from('stock_receipts').delete().eq('id', id);
  if (error) return { error: error.message };

  if (before) {
    const hdrs = await headers();
    await logAudit({
      company_id: ctx.company_id,
      user_id: ctx.user.id,
      action: 'stock_receipt.deleted',
      entity_type: 'stock_receipt',
      entity_id: id,
      old_values: before,
      ...getRequestContext(hdrs),
    });
  }

  revalidatePath('/dashboard/stock');
  return { error: null };
}
