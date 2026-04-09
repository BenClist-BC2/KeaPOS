'use client';

import { useState, useTransition, useMemo } from 'react';
import type { Category, Product, Ingredient, RecipeLine, ProductType, ModifierGroup, Modifier, ProductModifierOption } from '@/lib/types';
import { formatEx } from '@/lib/gst';
import { formatNZD } from '@/lib/types';
import { exToInc, incGSTInputValue, formatExAsInc } from '@/lib/gst';
import {
  ALL_UNITS, UNIT_LABELS, UNITS_BY_DIMENSION, dimensionOf, areCompatible,
  toBaseUnits, costPerBaseUnit,
} from '@/lib/units';
import type { Unit } from '@/lib/units';
import {
  createCategory, updateCategory, deleteCategory,
  createProduct, updateProduct, deleteProduct,
  createRecipeLine, deleteRecipeLine,
  getProductCostHistory,
} from './actions';
import type { ProductCostSnapshot } from '@/lib/types';
import { assignModifierGroup, unassignModifierGroup, updateProductModifierOption } from './modifiers-actions';

// ─── Shared UI ────────────────────────────────────────────────

function ErrorMsg({ message }: { message: string }) {
  return <p className="text-sm text-red-600 mt-1">{message}</p>;
}

function Badge({ label, colour }: { label: string; colour: 'green' | 'red' | 'gray' | 'blue' }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    red:   'bg-red-100 text-red-700',
    gray:  'bg-gray-100 text-gray-500',
    blue:  'bg-blue-100 text-blue-700',
  }[colour];
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Cost calculation ─────────────────────────────────────────

function calcRecipeCost(
  productId: string,
  products: Product[],
  ingredients: Ingredient[],
  recipeLinesByProductId: Record<string, RecipeLine[]>,
  visited = new Set<string>()
): number | null {
  if (visited.has(productId)) return null; // cycle guard
  visited.add(productId);

  const lines = recipeLinesByProductId[productId] ?? [];
  let total = 0;

  for (const line of lines) {
    if (line.ingredient_id) {
      const ing = ingredients.find(i => i.id === line.ingredient_id);
      if (!ing) return null;
      // cost_cents is per ingredient.unit; convert line quantity to ingredient base units
      const lineBaseQty = toBaseUnits(line.quantity, line.unit as Unit);
      const ingBaseQty  = toBaseUnits(1, ing.unit as Unit);
      total += (lineBaseQty / ingBaseQty) * ing.cost_cents;
    } else if (line.component_product_id) {
      const comp = products.find(p => p.id === line.component_product_id);
      if (!comp || !comp.yield_quantity || !comp.yield_unit) return null;
      const compCost = calcRecipeCost(
        comp.id, products, ingredients, recipeLinesByProductId, new Set(visited)
      );
      if (compCost === null) return null;
      const yieldBase = toBaseUnits(comp.yield_quantity, comp.yield_unit as Unit);
      const lineBase  = toBaseUnits(line.quantity, line.unit as Unit);
      total += (lineBase / yieldBase) * compCost;
    }
  }

  return total;
}

// ─── Cost history section ─────────────────────────────────────

function CostHistorySection({
  product,
  ingredients,
  allProducts,
  recipeLinesByProductId,
}: {
  product: Product;
  ingredients: Ingredient[];
  allProducts: Product[];
  recipeLinesByProductId: Record<string, RecipeLine[]>;
}) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<ProductCostSnapshot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Current cost (client-side estimate)
  const currentCost = useMemo(() => {
    if (product.product_type === 'purchased') {
      const ing = ingredients.find(i => i.id === product.ingredient_id);
      return ing ? ing.cost_cents : null;
    }
    if (product.product_type === 'recipe') {
      return calcRecipeCost(product.id, allProducts, ingredients, recipeLinesByProductId);
    }
    return null;
  }, [product, ingredients, allProducts, recipeLinesByProductId]);

  function handleToggle() {
    if (!open && snapshots === null) {
      startTransition(async () => {
        const result = await getProductCostHistory(product.id);
        if (result.error) setLoadError(result.error);
        else setSnapshots(result.snapshots);
      });
    }
    setOpen(v => !v);
  }

  const REASON_LABELS: Record<string, string> = {
    product_created:        'Product created',
    recipe_change:          'Recipe changed',
    ingredient_price_change: 'Ingredient price changed',
  };

  return (
    <div className="border-t border-gray-100 pt-4 mt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cost</span>
          {currentCost !== null ? (
            <span className="text-sm font-mono text-gray-700">
              {formatEx(currentCost)}
              <span className="text-xs text-gray-400 font-sans ml-1">ex. GST</span>
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50"
        >
          {pending ? 'Loading…' : open ? 'Hide history' : 'Cost history'}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          {loadError && <p className="text-xs text-red-600">{loadError}</p>}
          {snapshots !== null && snapshots.length === 0 && (
            <p className="text-xs text-gray-400">No cost history recorded yet.</p>
          )}
          {snapshots !== null && snapshots.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="pb-1 font-medium">Date</th>
                  <th className="pb-1 font-medium text-right">Cost (ex. GST)</th>
                  <th className="pb-1 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {snapshots.map(s => (
                  <tr key={s.id}>
                    <td className="py-1 text-gray-600">
                      {new Date(s.created_at).toLocaleDateString('en-NZ', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="py-1 text-right font-mono text-gray-700">{formatEx(s.cost_cents)}</td>
                    <td className="py-1 text-gray-400">
                      {REASON_LABELS[s.reason] ?? s.reason}
                      {s.triggered_by && ` · ${s.triggered_by}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Category form ────────────────────────────────────────────

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = category ? await updateCategory(category.id, fd) : await createCategory(fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          name="name"
          defaultValue={category?.name}
          required
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Sort order</label>
        <input
          name="sort_order"
          type="number"
          defaultValue={category?.sort_order ?? 0}
          className="mt-1 block w-32 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      {category && (
        <div className="flex items-center gap-2">
          <input type="checkbox" name="active" value="true" id="cat-active" defaultChecked={category.active} />
          <label htmlFor="cat-active" className="text-sm text-gray-700">Active</label>
          <input type="hidden" name="active" value="false" />
        </div>
      )}
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Recipe section (shown inside product edit form) ──────────

interface RecipeSectionProps {
  product: Product;
  ingredients: Ingredient[];
  recipeProducts: Product[];
  lines: RecipeLine[];
  allProducts: Product[];
  recipeLinesByProductId: Record<string, RecipeLine[]>;
}

function RecipeSection({
  product, ingredients, recipeProducts, lines, allProducts, recipeLinesByProductId,
}: RecipeSectionProps) {
  const [adding, setAdding] = useState(false);
  const [componentType, setComponentType] = useState<'ingredient' | 'product'>('ingredient');
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, startAddTransition] = useTransition();

  const estimatedCost = calcRecipeCost(
    product.id, allProducts, ingredients, recipeLinesByProductId
  );

  // Derive compatible units from the selected component
  const compatibleUnits = useMemo<Unit[]>(() => {
    if (componentType === 'ingredient') {
      const ing = ingredients.find(i => i.id === selectedIngredientId);
      if (!ing) return ALL_UNITS;
      return ALL_UNITS.filter(u => areCompatible(u, ing.unit as Unit));
    } else {
      const prod = recipeProducts.find(p => p.id === selectedProductId);
      if (!prod?.yield_unit) return ALL_UNITS;
      return ALL_UNITS.filter(u => areCompatible(u, prod.yield_unit as Unit));
    }
  }, [componentType, selectedIngredientId, selectedProductId, ingredients, recipeProducts]);

  // Reset unit when compatible list changes and current unit is no longer valid
  const unitIsCompatible = compatibleUnits.includes(unit);

  function handleAdd() {
    if (!qty || parseFloat(qty) <= 0) { setAddError('Enter a valid quantity'); return; }
    if (componentType === 'ingredient' && !selectedIngredientId) { setAddError('Select an ingredient'); return; }
    if (componentType === 'product' && !selectedProductId) { setAddError('Select a recipe product'); return; }
    if (!unitIsCompatible) { setAddError('Unit is not compatible with the selected component'); return; }

    setAddError(null);
    startAddTransition(async () => {
      const result = await createRecipeLine(product.id, {
        ingredient_id:        componentType === 'ingredient' ? selectedIngredientId : null,
        component_product_id: componentType === 'product'   ? selectedProductId    : null,
        quantity: parseFloat(qty),
        unit,
        sort_order: lines.length,
      });
      if (result.error) {
        setAddError(result.error);
      } else {
        setAdding(false);
        setQty('');
        setSelectedIngredientId('');
        setSelectedProductId('');
      }
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800">Recipe components</h4>
        {estimatedCost !== null && (
          <span className="text-xs text-gray-500">
            Est. cost: <span className="font-medium text-gray-700">{formatNZD(Math.round(estimatedCost))} ex. GST</span>
          </span>
        )}
      </div>

      {lines.length === 0 && !adding && (
        <p className="text-xs text-gray-400 mb-3">No components yet.</p>
      )}

      {lines.length > 0 && (
        <ul className="mb-3 divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
          {lines.map(line => (
            <RecipeLineRow
              key={line.id}
              line={line}
              ingredients={ingredients}
              products={allProducts}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <div className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-3">
          {/* Component type toggle */}
          <div className="flex gap-2">
            {(['ingredient', 'product'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setComponentType(t); setSelectedIngredientId(''); setSelectedProductId(''); }}
                className={`px-3 py-1 text-xs rounded-full border ${
                  componentType === t
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {t === 'ingredient' ? 'Ingredient' : 'Nested recipe'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Component selector */}
            <div className="col-span-3">
              {componentType === 'ingredient' ? (
                <select
                  value={selectedIngredientId}
                  onChange={e => setSelectedIngredientId(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select ingredient…</option>
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (per {UNIT_LABELS[i.unit as Unit]})
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select recipe product…</option>
                  {recipeProducts
                    .filter(p => p.id !== product.id)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.yield_quantity && p.yield_unit
                          ? ` (makes ${p.yield_quantity} ${p.yield_unit})`
                          : ''}
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* Quantity */}
            <div>
              <input
                type="number"
                min="0"
                step="any"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="Qty"
                className="block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* Unit */}
            <div>
              <select
                value={unitIsCompatible ? unit : compatibleUnits[0] ?? unit}
                onChange={e => setUnit(e.target.value as Unit)}
                className="block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {compatibleUnits.map(u => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>

            {/* Add button */}
            <div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={addPending}
                className="w-full px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
              >
                {addPending ? '…' : 'Add'}
              </button>
            </div>
          </div>

          {addError && <ErrorMsg message={addError} />}

          <button
            type="button"
            onClick={() => { setAdding(false); setAddError(null); }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-gray-500 hover:text-gray-900 border border-dashed border-gray-300 rounded px-3 py-1.5 w-full text-center hover:border-gray-400"
        >
          + Add component
        </button>
      )}
    </div>
  );
}

function RecipeLineRow({
  line, ingredients, products,
}: {
  line: RecipeLine;
  ingredients: Ingredient[];
  products: Product[];
}) {
  const [pending, startTransition] = useTransition();

  const label = line.ingredient_id
    ? ingredients.find(i => i.id === line.ingredient_id)?.name ?? 'Unknown ingredient'
    : products.find(p => p.id === line.component_product_id)?.name ?? 'Unknown product';

  const typeTag = line.ingredient_id ? 'ingredient' : 'recipe';

  return (
    <li className="flex items-center justify-between px-3 py-2 text-sm bg-white">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          typeTag === 'ingredient' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-700'
        }`}>
          {typeTag}
        </span>
        <span className="text-gray-800 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-gray-600 font-mono text-xs">
          {line.quantity} {UNIT_LABELS[line.unit as Unit]}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await deleteRecipeLine(line.id); })}
          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
        >
          {pending ? '…' : 'Remove'}
        </button>
      </div>
    </li>
  );
}

// ─── Product form ─────────────────────────────────────────────

// ─── Product modifier group assignment ───────────────────────

// ─── Per-option row inside an assigned modifier group ────────

function ModifierOptionRow({
  productId,
  modifier,
  option,
}: {
  productId: string;
  modifier: Modifier;
  option: ProductModifierOption;
}) {
  const [price, setPrice] = useState((option.price_adjustment_cents / 100).toFixed(2));
  const [savePending, startSaveTransition] = useTransition();
  const [togglePending, startToggleTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function savePrice() {
    const cents = Math.round(parseFloat(price) * 100);
    if (isNaN(cents) || cents === option.price_adjustment_cents) return;
    startSaveTransition(async () => {
      const result = await updateProductModifierOption(productId, modifier.id, {
        price_adjustment_cents: cents,
      });
      if (result.error) setError(result.error);
    });
  }

  function toggleEnabled() {
    startToggleTransition(async () => {
      const result = await updateProductModifierOption(productId, modifier.id, {
        enabled: !option.enabled,
      });
      if (result.error) setError(result.error);
    });
  }

  const priceNum = parseFloat(price);
  const priceColour = isNaN(priceNum) || priceNum === 0
    ? 'text-gray-400'
    : priceNum > 0 ? 'text-gray-700' : 'text-green-700';

  return (
    <li className={`flex items-center justify-between py-2 px-3 ${option.enabled ? '' : 'opacity-40'}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={togglePending}
          title={option.enabled ? 'Click to disable on this product' : 'Click to enable on this product'}
          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 ${
            option.enabled
              ? 'bg-gray-900 border-gray-900 text-white'
              : 'bg-white border-gray-300'
          }`}
        >
          {option.enabled && (
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 10 10">
              <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <span className="text-sm text-gray-800">{modifier.name}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="absolute left-2 top-1 text-gray-400 text-xs">$</span>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            onBlur={savePrice}
            disabled={savePending || !option.enabled}
            className={`w-24 border border-gray-200 rounded pl-5 pr-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900 ${priceColour}`}
          />
        </div>
        <span className="text-xs text-gray-400 w-12">
          {isNaN(priceNum) || priceNum === 0 ? 'free' : priceNum > 0 ? 'extra' : 'discount'}
        </span>
        {savePending && <span className="text-xs text-gray-400">saving…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </li>
  );
}

// ─── Product modifier group assignment ───────────────────────

function ProductModifiersSection({
  productId,
  modifierGroups,
  allModifiers,
  assignedGroupIds,
  productModifierOptions,
}: {
  productId: string;
  modifierGroups: ModifierGroup[];
  allModifiers: Modifier[];
  assignedGroupIds: Set<string>;
  productModifierOptions: ProductModifierOption[];
}) {
  const [togglePending, startToggleTransition] = useTransition();
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});

  function toggle(groupId: string, currentlyAssigned: boolean) {
    startToggleTransition(async () => {
      const result = currentlyAssigned
        ? await unassignModifierGroup(productId, groupId)
        : await assignModifierGroup(productId, groupId);
      if (result.error) setToggleErrors(prev => ({ ...prev, [groupId]: result.error! }));
      else setToggleErrors(prev => { const next = { ...prev }; delete next[groupId]; return next; });
    });
  }

  if (modifierGroups.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Modifier groups</h4>
        <p className="text-xs text-gray-400">
          No modifier groups yet. Create them in the{' '}
          <span className="font-medium">Modifiers</span> tab, then assign them here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">Modifier groups</h4>
      <p className="text-xs text-gray-400 mb-3">
        Assign groups to this product, then set the price and which options apply.
        Prices are ex. GST. Uncheck an option to hide it on this product.
      </p>
      <ul className="space-y-3">
        {modifierGroups.map(group => {
          const assigned = assignedGroupIds.has(group.id);
          const groupModifiers = allModifiers.filter(m => m.modifier_group_id === group.id);

          return (
            <li key={group.id} className="border border-gray-200 rounded-md overflow-hidden">
              {/* Group header row */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50">
                <input
                  type="checkbox"
                  id={`mg-${productId}-${group.id}`}
                  checked={assigned}
                  disabled={togglePending}
                  onChange={() => toggle(group.id, assigned)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <label
                  htmlFor={`mg-${productId}-${group.id}`}
                  className="flex-1 text-sm font-medium text-gray-700 cursor-pointer"
                >
                  {group.name}
                </label>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  group.required ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {group.required ? 'Required' : 'Optional'}
                </span>
                {groupModifiers.length > 0 && (
                  <span className="text-xs text-gray-400">
                    {groupModifiers.length} option{groupModifiers.length !== 1 ? 's' : ''}
                  </span>
                )}
                {toggleErrors[group.id] && (
                  <span className="text-xs text-red-600">{toggleErrors[group.id]}</span>
                )}
              </div>

              {/* Per-option config — only when assigned */}
              {assigned && groupModifiers.length > 0 && (
                <ul className="divide-y divide-gray-100 bg-white">
                  <li className="flex items-center justify-between px-3 py-1 bg-gray-50 border-t border-gray-200">
                    <span className="text-xs text-gray-400 font-medium">Option</span>
                    <span className="text-xs text-gray-400 font-medium mr-14">Price adjustment</span>
                  </li>
                  {groupModifiers.map(mod => {
                    const opt = productModifierOptions.find(o => o.modifier_id === mod.id);
                    if (!opt) return null;
                    return (
                      <ModifierOptionRow
                        key={mod.id}
                        productId={productId}
                        modifier={mod}
                        option={opt}
                      />
                    );
                  })}
                </ul>
              )}

              {assigned && groupModifiers.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400 bg-white border-t border-gray-200">
                  No options in this group yet — add them in the Modifiers tab.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

interface ProductFormProps {
  product?: Product;
  categories: Category[];
  ingredients: Ingredient[];
  recipeProducts: Product[];
  allProducts: Product[];
  recipeLines: RecipeLine[];
  recipeLinesByProductId: Record<string, RecipeLine[]>;
  modifierGroups: ModifierGroup[];
  allModifiers: Modifier[];
  assignedModifierGroupIds: Set<string>;
  productModifierOptions: ProductModifierOption[];
  defaultCategoryId?: string;
  gstRate: number;
  onDone: () => void;
}

function ProductForm({
  product, categories, ingredients, recipeProducts, allProducts,
  recipeLines, recipeLinesByProductId, modifierGroups, allModifiers,
  assignedModifierGroupIds, productModifierOptions, defaultCategoryId, gstRate, onDone,
}: ProductFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [productType, setProductType] = useState<ProductType>(product?.product_type ?? 'purchased');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('product_type', productType);
    fd.set('gst_rate', String(gstRate));
    startTransition(async () => {
      const result = product
        ? await updateProduct(product.id, fd)
        : await createProduct(fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  const defaultPrice = product
    ? incGSTInputValue(product.price_cents, product.gst_rate)
    : '';

  const PRODUCT_TYPES: { value: ProductType; label: string; description: string }[] = [
    { value: 'purchased', label: 'Purchased',  description: 'Buy and sell as-is (e.g. canned drink)' },
    { value: 'recipe',    label: 'Recipe',     description: 'Made from ingredients or nested recipes' },
    { value: 'combo',     label: 'Combo',      description: 'Bundle of products at a set price' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Product type selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Product type</label>
        <div className="flex gap-2">
          {PRODUCT_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setProductType(value)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                productType === value
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {PRODUCT_TYPES.find(t => t.value === productType)?.description}
        </p>
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            name="name"
            defaultValue={product?.name}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <select
            name="category_id"
            defaultValue={product?.category_id ?? defaultCategoryId}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Sell price{' '}
            <span className="font-normal text-gray-500">(inc. GST @ {gstRate}%)</span>
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultPrice}
              required
              placeholder="0.00"
              className="block w-full border border-gray-300 rounded-md pl-7 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            name="description"
            defaultValue={product?.description ?? ''}
            rows={2}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Sort order</label>
          <input
            name="sort_order"
            type="number"
            defaultValue={product?.sort_order ?? 0}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {product && (
          <div className="flex items-end pb-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="available"
                value="true"
                id="prod-available"
                defaultChecked={product.available}
              />
              <label htmlFor="prod-available" className="text-sm text-gray-700">Available</label>
              <input type="hidden" name="available" value="false" />
            </div>
          </div>
        )}
      </div>

      {/* Purchased: optional ingredient link */}
      {productType === 'purchased' && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Cost tracking ingredient{' '}
            <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <select
            name="ingredient_id"
            defaultValue={product?.ingredient_id ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">— None —</option>
            {ingredients.map(i => (
              <option key={i.id} value={i.id}>
                {i.name} ({formatNZD(i.cost_cents)} per {UNIT_LABELS[i.unit as Unit]} ex. GST)
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Link to an ingredient to track purchase cost and inherit out-of-stock status.
          </p>
        </div>
      )}

      {/* Recipe: yield fields */}
      {productType === 'recipe' && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Yield{' '}
            <span className="font-normal text-gray-500">(what this recipe produces)</span>
          </label>
          <div className="flex gap-2 mt-1">
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">Makes</span>
              <input
                name="yield_quantity"
                type="number"
                step="any"
                min="0"
                defaultValue={product?.yield_quantity ?? ''}
                placeholder="e.g. 3"
                className="block w-36 border border-gray-300 rounded-md pl-16 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <select
              name="yield_unit"
              defaultValue={product?.yield_unit ?? 'each'}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {ALL_UNITS.map(u => (
                <option key={u} value={u}>{UNIT_LABELS[u]}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Required when this recipe is used as a component in another recipe.
          </p>
        </div>
      )}

      {/* Combo: coming in Phase 6 */}
      {productType === 'combo' && (
        <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Save this product first, then use the Combos tab to add items and configure pricing.
        </div>
      )}

      {error && <ErrorMsg message={error} />}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>

      {/* Recipe builder — only shown when editing an existing recipe product */}
      {product && productType === 'recipe' && (
        <RecipeSection
          product={product}
          ingredients={ingredients}
          recipeProducts={recipeProducts}
          lines={recipeLines}
          allProducts={allProducts}
          recipeLinesByProductId={recipeLinesByProductId}
        />
      )}

      {/* Modifier group assignment — only shown when editing */}
      {product && (
        <ProductModifiersSection
          productId={product.id}
          modifierGroups={modifierGroups}
          allModifiers={allModifiers}
          assignedGroupIds={assignedModifierGroupIds}
          productModifierOptions={productModifierOptions}
        />
      )}

      {/* Cost display and history — only shown when editing */}
      {product && (
        <CostHistorySection
          product={product}
          ingredients={ingredients}
          allProducts={allProducts}
          recipeLinesByProductId={recipeLinesByProductId}
        />
      )}
    </form>
  );
}

// ─── Delete button ────────────────────────────────────────────

function DeleteButton({ action, label }: { action: () => Promise<{ error: string | null }>; label: string }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="text-xs text-red-500 hover:text-red-700">
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-gray-600">Sure?</span>
      <button
        onClick={() => { startTransition(async () => { await action(); }); }}
        disabled={pending}
        className="text-xs text-red-600 font-medium hover:text-red-800 disabled:opacity-50"
      >
        {pending ? '…' : 'Yes'}
      </button>
      <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">
        No
      </button>
    </span>
  );
}

// ─── Product type badge ───────────────────────────────────────

function ProductTypeBadge({ type }: { type: ProductType }) {
  const map: Record<ProductType, { label: string; colour: 'green' | 'blue' | 'gray' }> = {
    purchased: { label: 'Purchased', colour: 'gray'  },
    recipe:    { label: 'Recipe',    colour: 'blue'  },
    combo:     { label: 'Combo',     colour: 'green' },
  };
  const { label, colour } = map[type];
  return <Badge label={label} colour={colour} />;
}

// ─── Main MenuClient component ────────────────────────────────

interface MenuClientProps {
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  recipeLinesByProductId: Record<string, RecipeLine[]>;
  modifierGroups: ModifierGroup[];
  allModifiers: Modifier[];
  /** productId → Set of assigned modifier group IDs */
  productModifierGroups: Record<string, Set<string>>;
  /** all product_modifier_options rows for this company */
  productModifierOptions: ProductModifierOption[];
  gstRate: number;
}

export function MenuClient({
  categories, products, ingredients, recipeLinesByProductId,
  modifierGroups, allModifiers, productModifierGroups, productModifierOptions, gstRate,
}: MenuClientProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null
  );
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const visibleProducts = products.filter(p => p.category_id === selectedCategoryId);
  const recipeProducts = products.filter(p => p.product_type === 'recipe');

  return (
    <div className="flex gap-6 h-full">
      {/* ── Categories sidebar ── */}
      <div className="w-56 flex-shrink-0">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Categories</h2>
            <button
              onClick={() => { setAddingCategory(true); setEditingCategoryId(null); }}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              + Add
            </button>
          </div>

          {addingCategory && (
            <div className="p-4 border-b border-gray-100">
              <CategoryForm onDone={() => setAddingCategory(false)} />
            </div>
          )}

          <ul className="py-1">
            {categories.map(cat => (
              <li key={cat.id}>
                {editingCategoryId === cat.id ? (
                  <div className="px-4 py-2 border-b border-gray-100">
                    <CategoryForm category={cat} onDone={() => setEditingCategoryId(null)} />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setAddingProduct(false);
                      setEditingProductId(null);
                    }}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 ${
                      cat.id === selectedCategoryId ? 'bg-gray-50 font-medium' : ''
                    }`}
                  >
                    <span className="text-sm text-gray-800">{cat.name}</span>
                  </button>
                )}
              </li>
            ))}
            {categories.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400">No categories yet</li>
            )}
          </ul>
        </div>

        {selectedCategory && editingCategoryId !== selectedCategory.id && (
          <div className="mt-2 flex gap-2 px-1">
            <button
              onClick={() => setEditingCategoryId(selectedCategory.id)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Edit category
            </button>
            <DeleteButton
              action={() => deleteCategory(selectedCategory.id)}
              label="delete category"
            />
          </div>
        )}
      </div>

      {/* ── Products panel ── */}
      <div className="flex-1">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              {selectedCategory ? `${selectedCategory.name} — Products` : 'Products'}
            </h2>
            {selectedCategory && (
              <button
                onClick={() => { setAddingProduct(true); setEditingProductId(null); }}
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                + Add product
              </button>
            )}
          </div>

          {addingProduct && selectedCategoryId && (
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3">New product</h3>
              <ProductForm
                categories={categories}
                ingredients={ingredients}
                recipeProducts={recipeProducts}
                allProducts={products}
                recipeLines={[]}
                recipeLinesByProductId={recipeLinesByProductId}
                modifierGroups={modifierGroups}
                allModifiers={allModifiers}
                assignedModifierGroupIds={new Set()}
                productModifierOptions={[]}
                defaultCategoryId={selectedCategoryId}
                gstRate={gstRate}
                onDone={() => setAddingProduct(false)}
              />
            </div>
          )}

          <ul className="divide-y divide-gray-100">
            {visibleProducts.map(product => (
              <li key={product.id} className="px-4 py-3">
                {editingProductId === product.id ? (
                  <div className="py-1">
                    <ProductForm
                      product={product}
                      categories={categories}
                      ingredients={ingredients}
                      recipeProducts={recipeProducts}
                      allProducts={products}
                      recipeLines={recipeLinesByProductId[product.id] ?? []}
                      recipeLinesByProductId={recipeLinesByProductId}
                      modifierGroups={modifierGroups}
                      allModifiers={allModifiers}
                      assignedModifierGroupIds={productModifierGroups[product.id] ?? new Set()}
                      productModifierOptions={productModifierOptions.filter(o => o.product_id === product.id)}
                      gstRate={gstRate}
                      onDone={() => setEditingProductId(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{product.name}</span>
                        <ProductTypeBadge type={product.product_type} />
                        <Badge
                          label={product.available ? 'Available' : 'Unavailable'}
                          colour={product.available ? 'green' : 'red'}
                        />
                      </div>
                      {product.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{product.description}</p>
                      )}
                    </div>
                    <div className="ml-4 flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="font-medium text-gray-900 text-sm">
                          {formatExAsInc(product.price_cents, product.gst_rate)}
                        </div>
                        <div className="text-xs text-gray-400">inc. GST</div>
                      </div>
                      <button
                        onClick={() => setEditingProductId(product.id)}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        Edit
                      </button>
                      <DeleteButton
                        action={() => deleteProduct(product.id)}
                        label="delete product"
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
            {visibleProducts.length === 0 && !addingProduct && (
              <li className="px-4 py-8 text-center text-sm text-gray-400">
                {selectedCategory
                  ? 'No products in this category yet.'
                  : 'Select a category to manage its products.'}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
