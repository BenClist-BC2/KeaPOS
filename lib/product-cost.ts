/**
 * Server-side product cost calculation and snapshot utilities.
 *
 * Cost semantics:
 *   - Purchased product : cost = linked ingredient.cost_cents (per ingredient.unit)
 *   - Recipe product    : sum of (ingredient cost × quantity) for all recipe lines,
 *                         handling nested recipe components via yield_quantity/yield_unit
 *   - Combo product     : sum of component product costs × quantities
 *
 * All costs are ex-GST integer cents.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { toBaseUnits } from './units';
import type { Unit } from './units';

/**
 * Calculate the ex-GST cost (in cents) of producing/buying one unit of a product.
 * Returns 0 if cost cannot be determined (missing data or cycle).
 */
export async function calculateProductCost(
  supabase: SupabaseClient,
  productId: string,
  visited: Set<string> = new Set()
): Promise<number> {
  if (visited.has(productId)) return 0; // cycle guard
  visited.add(productId);

  const { data: product } = await supabase
    .from('products')
    .select('product_type, ingredient_id, yield_quantity, yield_unit')
    .eq('id', productId)
    .single();

  if (!product) return 0;

  // ── Purchased ────────────────────────────────────────────────
  if (product.product_type === 'purchased') {
    if (!product.ingredient_id) return 0;
    const { data: ing } = await supabase
      .from('ingredients')
      .select('cost_cents')
      .eq('id', product.ingredient_id)
      .single();
    return ing?.cost_cents ?? 0;
  }

  // ── Recipe ───────────────────────────────────────────────────
  if (product.product_type === 'recipe') {
    const { data: lines } = await supabase
      .from('recipe_lines')
      .select('ingredient_id, component_product_id, quantity, unit, ingredients(cost_cents, unit)')
      .eq('product_id', productId);

    let total = 0;

    for (const line of lines ?? []) {
      if (line.ingredient_id) {
        // Supabase returns joined rows as array
        const ing = Array.isArray(line.ingredients) ? line.ingredients[0] : line.ingredients;
        if (!ing) continue;
        // cost_cents is per ingredient.unit; convert line.quantity to ingredient base units
        total += (ing.cost_cents as number)
          * toBaseUnits(line.quantity, line.unit as Unit)
          / toBaseUnits(1, ing.unit as Unit);

      } else if (line.component_product_id) {
        // Get the component recipe's total cost and its yield
        const { data: comp } = await supabase
          .from('products')
          .select('yield_quantity, yield_unit')
          .eq('id', line.component_product_id)
          .single();

        const compTotalCost = await calculateProductCost(
          supabase,
          line.component_product_id,
          new Set(visited)
        );

        if (comp?.yield_quantity && comp?.yield_unit) {
          // cost per base unit of component yield
          const costPerBase = compTotalCost / toBaseUnits(comp.yield_quantity, comp.yield_unit as Unit);
          total += costPerBase * toBaseUnits(line.quantity, line.unit as Unit);
        } else {
          total += compTotalCost;
        }
      }
    }

    return Math.round(total);
  }

  // ── Combo ────────────────────────────────────────────────────
  if (product.product_type === 'combo') {
    const { data: items } = await supabase
      .from('combo_items')
      .select('item_product_id, quantity')
      .eq('combo_product_id', productId);

    let total = 0;
    for (const item of items ?? []) {
      const itemCost = await calculateProductCost(supabase, item.item_product_id, new Set(visited));
      total += itemCost * item.quantity;
    }
    return Math.round(total);
  }

  return 0;
}

/**
 * Calculate and record cost snapshots for the given products.
 */
export async function snapshotProductCosts(
  supabase: SupabaseClient,
  companyId: string,
  productIds: string[],
  reason: string,
  triggeredBy: string
): Promise<void> {
  if (productIds.length === 0) return;

  const rows = await Promise.all(
    productIds.map(async productId => ({
      company_id:   companyId,
      product_id:   productId,
      cost_cents:   await calculateProductCost(supabase, productId),
      reason,
      triggered_by: triggeredBy,
    }))
  );

  await supabase.from('product_cost_snapshots').insert(rows);
}

/**
 * Find all products affected by cost changes to the given ingredients,
 * calculate their new costs, and insert snapshots.
 *
 * Covers:
 *   - Purchased products directly linked to one of the ingredients
 *   - Recipe products with a recipe line using one of the ingredients
 */
export async function snapshotCostsForIngredients(
  supabase: SupabaseClient,
  companyId: string,
  ingredientIds: string[],
  triggeredBy: string
): Promise<void> {
  if (ingredientIds.length === 0) return;

  const [{ data: purchased }, { data: recipeLines }] = await Promise.all([
    supabase
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .in('ingredient_id', ingredientIds),
    supabase
      .from('recipe_lines')
      .select('product_id')
      .in('ingredient_id', ingredientIds),
  ]);

  const affected = new Set<string>([
    ...(purchased ?? []).map((p: { id: string }) => p.id),
    ...(recipeLines ?? []).map((r: { product_id: string }) => r.product_id),
  ]);

  await snapshotProductCosts(
    supabase,
    companyId,
    Array.from(affected),
    'ingredient_price_change',
    triggeredBy
  );
}
