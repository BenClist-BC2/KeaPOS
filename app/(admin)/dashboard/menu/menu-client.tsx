'use client';

import { useState, useTransition, useMemo } from 'react';
import type {
  Category, Product, Ingredient, RecipeLine, ProductType,
  ModifierGroup, Modifier, ProductModifierOption,
} from '@/lib/types';
import { formatEx } from '@/lib/gst';
import { formatNZD } from '@/lib/types';
import { incGSTInputValue, formatExAsInc } from '@/lib/gst';
import {
  ALL_UNITS, UNIT_LABELS, areCompatible, toBaseUnits,
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

// ─── Design tokens ────────────────────────────────────────────

const TYPE_CONFIG = {
  purchased: {
    sublabel:    'Simple item',
    label:       'Simple Item',
    description: 'You stock it and sell it as-is — a canned drink, bottled sauce, or pre-packaged food.',
    listBorder:  'border-l-slate-400',
    badge:       'bg-slate-100 text-slate-600',
    cardIdle:    'border-gray-200 hover:border-slate-300 hover:bg-slate-50',
    cardActive:  'border-slate-500 bg-slate-50 ring-2 ring-slate-100',
    icon:        '🛒',
  },
  recipe: {
    sublabel:    'Made in-house',
    label:       'Made In-House',
    description: 'Built from ingredients you measure and track — a burger, a coffee, a house-made sauce.',
    listBorder:  'border-l-amber-400',
    badge:       'bg-amber-100 text-amber-700',
    cardIdle:    'border-gray-200 hover:border-amber-300 hover:bg-amber-50',
    cardActive:  'border-amber-500 bg-amber-50 ring-2 ring-amber-100',
    icon:        '👨‍🍳',
  },
  combo: {
    sublabel:    'Combo / bundle',
    label:       'Combo / Bundle',
    description: 'Two or more products together at one set price.',
    listBorder:  'border-l-violet-400',
    badge:       'bg-violet-100 text-violet-700',
    cardIdle:    'border-gray-200 hover:border-violet-300 hover:bg-violet-50',
    cardActive:  'border-violet-500 bg-violet-50 ring-2 ring-violet-100',
    icon:        '📦',
  },
} as const;

// ─── Shared form primitives ───────────────────────────────────

function ErrorMsg({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
      <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}

const inputCls =
  'block w-full border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors';

const selectCls =
  'block w-full border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors';

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-base font-medium text-gray-700 mb-1.5">
      {children}
    </label>
  );
}

function PrimaryBtn({
  children, pending, type = 'submit', onClick, colour = 'indigo',
}: {
  children: React.ReactNode;
  pending?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  colour?: 'indigo' | 'amber';
}) {
  const colours = colour === 'amber'
    ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 focus:ring-amber-500'
    : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 focus:ring-indigo-500';
  return (
    <button
      type={type}
      disabled={pending}
      onClick={onClick}
      className={`px-6 py-3.5 text-white text-base font-semibold rounded-xl disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${colours}`}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-6 py-3.5 border border-gray-300 text-gray-700 text-base font-semibold rounded-xl hover:bg-gray-50 transition-colors"
    >
      {children}
    </button>
  );
}

// ─── Delete button ────────────────────────────────────────────

function DeleteButton({ action }: { action: () => Promise<{ error: string | null }> }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pending) {
    return <span className="text-xs text-gray-400">Deleting…</span>;
  }

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
        <span className="text-sm text-red-800 font-medium">Delete?</span>
        <button
          onClick={() => startTransition(async () => {
            const res = await action();
            if (res.error) { setError(res.error); setConfirm(false); }
          })}
          className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-red-700 transition-colors"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1.5 transition-colors"
        >
          No
        </button>
        {error && <span className="text-sm text-red-600 ml-1">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-sm text-gray-400 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
    >
      Delete
    </button>
  );
}

// ─── Product type badge ───────────────────────────────────────

function ProductTypeBadge({ type }: { type: ProductType }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.badge}`}>
      <span>{cfg.icon}</span>
      {cfg.sublabel}
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
  if (visited.has(productId)) return null;
  visited.add(productId);
  const lines = recipeLinesByProductId[productId] ?? [];
  let total = 0;
  for (const line of lines) {
    if (line.ingredient_id) {
      const ing = ingredients.find(i => i.id === line.ingredient_id);
      if (!ing) return null;
      const lineBaseQty = toBaseUnits(line.quantity, line.unit as Unit);
      const ingBaseQty  = toBaseUnits(1, ing.unit as Unit);
      total += (lineBaseQty / ingBaseQty) * ing.cost_cents;
    } else if (line.component_product_id) {
      const comp = products.find(p => p.id === line.component_product_id);
      if (!comp || !comp.yield_quantity || !comp.yield_unit) return null;
      const compCost = calcRecipeCost(comp.id, products, ingredients, recipeLinesByProductId, new Set(visited));
      if (compCost === null) return null;
      const yieldBase = toBaseUnits(comp.yield_quantity, comp.yield_unit as Unit);
      const lineBase  = toBaseUnits(line.quantity, line.unit as Unit);
      total += (lineBase / yieldBase) * compCost;
    }
  }
  return total;
}

// ─── Cost history ─────────────────────────────────────────────

function CostHistorySection({
  product, ingredients, allProducts, recipeLinesByProductId,
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

  const REASON_LABELS: Record<string, string> = {
    product_created:         'Product created',
    recipe_change:           'Recipe changed',
    ingredient_price_change: 'Ingredient price changed',
  };

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost</span>
          {currentCost !== null ? (
            <span className="text-sm font-mono text-gray-800">
              {formatEx(currentCost)}
              <span className="text-xs text-gray-400 font-sans ml-1">ex. GST</span>
            </span>
          ) : (
            <span className="text-xs text-gray-400 italic">Not calculated</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!open && snapshots === null) {
              startTransition(async () => {
                const r = await getProductCostHistory(product.id);
                if (r.error) setLoadError(r.error);
                else setSnapshots(r.snapshots);
              });
            }
            setOpen(v => !v);
          }}
          disabled={pending}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 transition-colors"
        >
          {pending ? 'Loading…' : open ? 'Hide history' : 'View history'}
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          {loadError && <p className="text-xs text-red-600">{loadError}</p>}
          {snapshots !== null && snapshots.length === 0 && (
            <p className="text-xs text-gray-400 italic">No cost history recorded yet.</p>
          )}
          {snapshots !== null && snapshots.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-100">
                  <th className="pb-1.5 font-medium">Date</th>
                  <th className="pb-1.5 font-medium text-right">Cost (ex. GST)</th>
                  <th className="pb-1.5 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 text-gray-600">
                      {new Date(s.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-1.5 text-right font-mono text-gray-700">{formatEx(s.cost_cents)}</td>
                    <td className="py-1.5 text-gray-500">
                      {REASON_LABELS[s.reason] ?? s.reason}
                      {s.triggered_by && <span className="text-gray-400"> · {s.triggered_by}</span>}
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
        <Label>Name</Label>
        <input name="name" defaultValue={category?.name} required placeholder="e.g. Drinks, Mains" className={inputCls} />
      </div>
      <div>
        <Label>Sort order</Label>
        <input
          name="sort_order" type="number" defaultValue={category?.sort_order ?? 0}
          className={`${inputCls} w-24`}
        />
      </div>
      {category && (
        <div className="flex items-center gap-2">
          <input type="checkbox" name="active" value="true" id="cat-active" defaultChecked={category.active}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          <label htmlFor="cat-active" className="text-sm text-gray-700">Active</label>
          <input type="hidden" name="active" value="false" />
        </div>
      )}
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <PrimaryBtn pending={pending}>{pending ? 'Saving…' : 'Save'}</PrimaryBtn>
        <SecondaryBtn onClick={onDone}>Cancel</SecondaryBtn>
      </div>
    </form>
  );
}

// ─── Recipe line row ──────────────────────────────────────────

function RecipeLineRow({ line, ingredients, products }: {
  line: RecipeLine; ingredients: Ingredient[]; products: Product[];
}) {
  const [pending, startTransition] = useTransition();

  const label = line.ingredient_id
    ? ingredients.find(i => i.id === line.ingredient_id)?.name ?? 'Unknown ingredient'
    : products.find(p => p.id === line.component_product_id)?.name ?? 'Unknown product';

  const isIngredient = !!line.ingredient_id;

  return (
    <li className="flex items-center justify-between px-4 py-2.5 group hover:bg-amber-50/40 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
          isIngredient ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
        }`}>
          {isIngredient ? 'ingredient' : 'recipe'}
        </span>
        <span className="text-sm text-gray-800 font-medium truncate">{label}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
          {line.quantity} {UNIT_LABELS[line.unit as Unit]}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await deleteRecipeLine(line.id); })}
          className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-40 opacity-0 group-hover:opacity-100 transition-all px-2 py-0.5 rounded hover:bg-red-50"
        >
          {pending ? '…' : 'Remove'}
        </button>
      </div>
    </li>
  );
}

// ─── Recipe section (amber-themed) ───────────────────────────

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

  const estimatedCost = calcRecipeCost(product.id, allProducts, ingredients, recipeLinesByProductId);

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

  const unitIsCompatible = compatibleUnits.includes(unit);

  function handleAdd() {
    if (!qty || parseFloat(qty) <= 0) { setAddError('Enter a valid quantity'); return; }
    if (componentType === 'ingredient' && !selectedIngredientId) { setAddError('Select an ingredient'); return; }
    if (componentType === 'product' && !selectedProductId) { setAddError('Select a recipe product'); return; }
    if (!unitIsCompatible) { setAddError('Unit is not compatible with this ingredient'); return; }

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
    <div className="rounded-xl border border-amber-200 overflow-hidden">
      {/* Amber header */}
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🧑‍🍳</span>
          <div>
            <h4 className="text-sm font-semibold text-amber-900">Recipe Components</h4>
            <p className="text-xs text-amber-700">The ingredients that go into making this product</p>
          </div>
        </div>
        {estimatedCost !== null && (
          <div className="text-right">
            <div className="text-sm font-semibold text-amber-900">{formatNZD(Math.round(estimatedCost))}</div>
            <div className="text-xs text-amber-600">est. cost ex. GST</div>
          </div>
        )}
      </div>

      {/* Lines list */}
      {lines.length > 0 ? (
        <ul className="divide-y divide-amber-100 bg-white">
          {lines.map(line => (
            <RecipeLineRow key={line.id} line={line} ingredients={ingredients} products={allProducts} />
          ))}
        </ul>
      ) : !adding ? (
        <div className="px-4 py-6 text-center bg-white">
          <p className="text-sm text-gray-500">No components added yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add the ingredients that make up this product below.</p>
        </div>
      ) : null}

      {/* Add component */}
      <div className="p-3 bg-amber-50/60 border-t border-amber-100">
        {adding ? (
          <div className="space-y-2.5">
            {/* Toggle: ingredient vs nested recipe */}
            <div className="flex gap-2">
              {(['ingredient', 'product'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setComponentType(t);
                    setSelectedIngredientId('');
                    setSelectedProductId('');
                  }}
                  className={`flex-1 py-3 text-sm font-semibold rounded-xl border transition-colors ${
                    componentType === t
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'
                  }`}
                >
                  {t === 'ingredient' ? '🧂 Ingredient' : '🍳 Nested recipe'}
                </button>
              ))}
            </div>

            {/* Selector */}
            <select
              value={componentType === 'ingredient' ? selectedIngredientId : selectedProductId}
              onChange={e =>
                componentType === 'ingredient'
                  ? setSelectedIngredientId(e.target.value)
                  : setSelectedProductId(e.target.value)
              }
              className="block w-full border border-gray-300 rounded-xl px-4 py-3.5 text-base bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
            >
              <option value="">
                {componentType === 'ingredient' ? 'Select an ingredient…' : 'Select a recipe product…'}
              </option>
              {componentType === 'ingredient'
                ? ingredients.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (per {UNIT_LABELS[i.unit as Unit]})
                    </option>
                  ))
                : recipeProducts
                    .filter(p => p.id !== product.id)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.yield_quantity && p.yield_unit ? ` (makes ${p.yield_quantity} ${p.yield_unit})` : ''}
                      </option>
                    ))
              }
            </select>

            {/* Qty + unit + add */}
            <div className="flex gap-2">
              <input
                type="number" min="0" step="any" value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="Quantity"
                className="flex-1 border border-gray-300 rounded-xl px-4 py-3.5 text-base bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
              />
              <select
                value={unitIsCompatible ? unit : (compatibleUnits[0] ?? unit)}
                onChange={e => setUnit(e.target.value as Unit)}
                className="border border-gray-300 rounded-xl px-4 py-3.5 text-base bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
              >
                {compatibleUnits.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
              </select>
              <button
                type="button" onClick={handleAdd} disabled={addPending}
                className="px-5 py-3.5 bg-amber-600 text-white text-base font-semibold rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {addPending ? '…' : 'Add'}
              </button>
            </div>

            {addError && <ErrorMsg message={addError} />}

            <button
              type="button"
              onClick={() => { setAdding(false); setAddError(null); }}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button" onClick={() => setAdding(true)}
            className="w-full py-3.5 text-base text-amber-700 font-semibold border border-dashed border-amber-300 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-colors"
          >
            + Add ingredient or component
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Modifier option row ──────────────────────────────────────

function ModifierOptionRow({
  productId, modifier, option,
}: {
  productId: string; modifier: Modifier; option: ProductModifierOption;
}) {
  const [price, setPrice] = useState((option.price_adjustment_cents / 100).toFixed(2));
  const [savePending, startSaveTransition] = useTransition();
  const [togglePending, startToggleTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function savePrice() {
    const cents = Math.round(parseFloat(price) * 100);
    if (isNaN(cents) || cents === option.price_adjustment_cents) return;
    startSaveTransition(async () => {
      const result = await updateProductModifierOption(productId, modifier.id, { price_adjustment_cents: cents });
      if (result.error) setError(result.error);
    });
  }

  function toggleEnabled() {
    startToggleTransition(async () => {
      const result = await updateProductModifierOption(productId, modifier.id, { enabled: !option.enabled });
      if (result.error) setError(result.error);
    });
  }

  const priceNum = parseFloat(price);
  const priceLabel = isNaN(priceNum) || priceNum === 0 ? 'free' : priceNum > 0 ? 'extra' : 'discount';
  const priceColour = isNaN(priceNum) || priceNum === 0
    ? 'text-gray-400' : priceNum > 0 ? 'text-gray-700' : 'text-emerald-700';

  return (
    <li className={`flex items-center justify-between py-2.5 px-3 transition-opacity ${option.enabled ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-2.5">
        <button
          type="button" onClick={toggleEnabled} disabled={togglePending}
          title={option.enabled ? 'Disable on this product' : 'Enable on this product'}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 ${
            option.enabled ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300'
          }`}
        >
          {option.enabled && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 10 10">
              <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <span className="text-sm text-gray-800">{modifier.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
          <input
            type="number" step="0.01" value={price}
            onChange={e => setPrice(e.target.value)}
            onBlur={savePrice}
            disabled={savePending || !option.enabled}
            className={`w-24 border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 ${priceColour}`}
          />
        </div>
        <span className="text-xs text-gray-400 w-12">{priceLabel}</span>
        {savePending && <span className="text-xs text-gray-400">saving…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </li>
  );
}

// ─── Modifier group assignment ────────────────────────────────

function ProductModifiersSection({
  productId, modifierGroups, allModifiers, assignedGroupIds, productModifierOptions,
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
      else setToggleErrors(prev => { const n = { ...prev }; delete n[groupId]; return n; });
    });
  }

  if (modifierGroups.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 p-4 bg-gray-50 text-center">
        <p className="text-sm text-gray-500">No modifier groups yet.</p>
        <p className="text-xs text-gray-400 mt-1">
          Create them in the <span className="font-medium text-gray-600">Modifiers</span> tab, then assign them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        Assign modifier groups, then configure which options apply and their prices. Prices are ex. GST.
      </p>
      <ul className="space-y-2">
        {modifierGroups.map(group => {
          const assigned = assignedGroupIds.has(group.id);
          const groupModifiers = allModifiers.filter(m => m.modifier_group_id === group.id);

          return (
            <li key={group.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-3 bg-gray-50">
                <input
                  type="checkbox" id={`mg-${productId}-${group.id}`}
                  checked={assigned} disabled={togglePending}
                  onChange={() => toggle(group.id, assigned)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor={`mg-${productId}-${group.id}`}
                  className="flex-1 text-sm font-medium text-gray-700 cursor-pointer">
                  {group.name}
                </label>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  group.required ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-600'
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

              {assigned && groupModifiers.length > 0 && (
                <ul className="divide-y divide-gray-100 bg-white">
                  <li className="flex items-center justify-between px-3 py-1.5 bg-gray-50/50 border-t border-gray-200">
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
                <p className="px-3 py-2.5 text-xs text-gray-400 bg-white border-t border-gray-200 italic">
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

// ─── Product form ─────────────────────────────────────────────

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
      const result = product ? await updateProduct(product.id, fd) : await createProduct(fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  const defaultPrice = product ? incGSTInputValue(product.price_cents, product.gst_rate) : '';

  const PRODUCT_TYPES: { value: ProductType }[] = [
    { value: 'purchased' },
    { value: 'recipe' },
    { value: 'combo' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Product type selector ── */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">What type of product is this?</p>
        <div className="grid grid-cols-3 gap-4">
          {PRODUCT_TYPES.map(({ value }) => {
            const cfg = TYPE_CONFIG[value];
            const active = productType === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setProductType(value)}
                className={`p-5 rounded-xl border-2 text-left transition-all ${
                  active ? cfg.cardActive : cfg.cardIdle
                }`}
              >
                <div className="text-3xl mb-3">{cfg.icon}</div>
                <div className={`text-base font-semibold mb-1.5 ${active ? 'text-gray-900' : 'text-gray-700'}`}>
                  {cfg.label}
                </div>
                <div className="text-sm text-gray-500 leading-snug">{cfg.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Core fields ── */}
      <div className="space-y-3">
        <div>
          <Label htmlFor="prod-name">Name</Label>
          <input
            id="prod-name" name="name" defaultValue={product?.name} required
            placeholder="e.g. Flat White, Beef Burger, Combo Meal"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="prod-category">Category</Label>
            <select
              id="prod-category" name="category_id"
              defaultValue={product?.category_id ?? defaultCategoryId} required
              className={selectCls}
            >
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="prod-price">
              Sell price{' '}
              <span className="font-normal text-gray-400">(inc. GST @ {gstRate}%)</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                id="prod-price" name="price" type="number" step="0.01" min="0"
                defaultValue={defaultPrice} required placeholder="0.00"
                className={`${inputCls} pl-7`}
              />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="prod-desc">Description <span className="font-normal text-gray-400">(optional)</span></Label>
          <textarea
            id="prod-desc" name="description" defaultValue={product?.description ?? ''} rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        <div className="flex items-center gap-6">
          <div className="w-24">
            <Label htmlFor="prod-sort">Sort order</Label>
            <input
              id="prod-sort" name="sort_order" type="number" defaultValue={product?.sort_order ?? 0}
              className={inputCls}
            />
          </div>
          {product && (
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox" name="available" value="true" id="prod-available"
                defaultChecked={product.available}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="prod-available" className="text-sm text-gray-700">Available on the menu</label>
              <input type="hidden" name="available" value="false" />
            </div>
          )}
        </div>
      </div>

      {/* ── Type-specific fields ── */}
      {productType === 'purchased' && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <Label htmlFor="prod-ingredient">
            Cost tracking ingredient <span className="font-normal text-gray-400">(optional)</span>
          </Label>
          <select
            id="prod-ingredient" name="ingredient_id"
            defaultValue={product?.ingredient_id ?? ''}
            className={selectCls}
          >
            <option value="">— Not linked —</option>
            {ingredients.map(i => (
              <option key={i.id} value={i.id}>
                {i.name} ({formatNZD(i.cost_cents)} per {UNIT_LABELS[i.unit as Unit]} ex. GST)
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-2">
            Link an ingredient to track your purchase cost and inherit its out-of-stock status.
          </p>
        </div>
      )}

      {productType === 'recipe' && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <Label htmlFor="prod-yield-qty">
            Yield <span className="font-normal text-amber-600">(what this recipe produces — needed when used inside another recipe)</span>
          </Label>
          <div className="flex gap-2 mt-1">
            <div className="relative flex-1 max-w-[140px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-xs font-medium">Makes</span>
              <input
                id="prod-yield-qty" name="yield_quantity" type="number" step="any" min="0"
                defaultValue={product?.yield_quantity ?? ''}
                placeholder="e.g. 3"
                className="block w-full border border-amber-300 rounded-lg pl-14 pr-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <select
              name="yield_unit"
              defaultValue={product?.yield_unit ?? 'each'}
              className="border border-amber-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            >
              {ALL_UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
            </select>
          </div>
        </div>
      )}

      {productType === 'combo' && (
        <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-sm text-violet-800">
          <strong>Next step:</strong> Save this product first, then use the Combos section to add the items and configure pricing.
        </div>
      )}

      {error && <ErrorMsg message={error} />}

      <div className="flex gap-2 pt-1">
        <PrimaryBtn pending={pending}>{pending ? 'Saving…' : product ? 'Save changes' : 'Create product'}</PrimaryBtn>
        <SecondaryBtn onClick={onDone}>Cancel</SecondaryBtn>
      </div>

      {/* Recipe builder — only for existing recipe products */}
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

      {/* Modifier group assignment — only when editing */}
      {product && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Modifier groups</h4>
          <ProductModifiersSection
            productId={product.id}
            modifierGroups={modifierGroups}
            allModifiers={allModifiers}
            assignedGroupIds={assignedModifierGroupIds}
            productModifierOptions={productModifierOptions}
          />
        </div>
      )}

      {/* Cost history — only when editing */}
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

// ─── Product drawer (right-side panel) ───────────────────────

function ProductModal({
  title, onClose, children,
}: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Centred panel */}
      <div className="relative min-h-full flex items-start justify-center p-4 pt-10 pb-16">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[calc(100vh-6rem)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Scrollable content */}
          <div className="overflow-y-auto px-8 py-7">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main MenuClient ──────────────────────────────────────────

interface MenuClientProps {
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  recipeLinesByProductId: Record<string, RecipeLine[]>;
  modifierGroups: ModifierGroup[];
  allModifiers: Modifier[];
  productModifierGroups: Record<string, Set<string>>;
  productModifierOptions: ProductModifierOption[];
  gstRate: number;
}

export function MenuClient({
  categories, products, ingredients, recipeLinesByProductId,
  modifierGroups, allModifiers, productModifierGroups, productModifierOptions, gstRate,
}: MenuClientProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const visibleProducts = products.filter(p => p.category_id === selectedCategoryId);
  const recipeProducts = products.filter(p => p.product_type === 'recipe');

  const productCountByCategory = products.reduce((acc, p) => {
    acc[p.category_id] = (acc[p.category_id] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function openAddProduct() { setAddingProduct(true); setEditingProductId(null); }
  function openEditProduct(id: string) { setEditingProductId(id); setAddingProduct(false); }
  function closeDrawer() { setAddingProduct(false); setEditingProductId(null); }

  const editingProduct = editingProductId ? products.find(p => p.id === editingProductId) : undefined;

  return (
    <div className="flex gap-6">
      {/* ── Category sidebar ── */}
      <div className="w-72 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Categories</h2>
          </div>

          {addingCategory && (
            <div className="p-5 border-b border-gray-100 bg-indigo-50/40">
              <p className="text-sm font-semibold text-indigo-700 uppercase tracking-wider mb-4">New category</p>
              <CategoryForm onDone={() => setAddingCategory(false)} />
            </div>
          )}

          <ul className="py-2">
            {categories.map(cat => (
              <li key={cat.id}>
                {editingCategoryId === cat.id ? (
                  <div className="px-4 py-4 border-b border-gray-100">
                    <CategoryForm category={cat} onDone={() => setEditingCategoryId(null)} />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      closeDrawer();
                    }}
                    className={`w-full text-left px-4 py-3.5 flex items-center justify-between mx-1.5 rounded-xl transition-colors ${
                      cat.id === selectedCategoryId
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    style={{ width: 'calc(100% - 12px)' }}
                  >
                    <span className={`text-base truncate ${cat.id === selectedCategoryId ? 'font-semibold' : 'font-medium'}`}>
                      {cat.name}
                    </span>
                    <span className={`ml-2 text-sm px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                      cat.id === selectedCategoryId
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {productCountByCategory[cat.id] ?? 0}
                    </span>
                  </button>
                )}
              </li>
            ))}
            {categories.length === 0 && (
              <li className="px-5 py-6 text-base text-gray-400 text-center">No categories yet</li>
            )}
          </ul>

          <div className="p-4 border-t border-gray-100 space-y-2">
            {!addingCategory && (
              <button
                onClick={() => { setAddingCategory(true); setEditingCategoryId(null); }}
                className="w-full py-3 text-base text-indigo-600 font-semibold border border-dashed border-indigo-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                + Add category
              </button>
            )}
            {selectedCategory && editingCategoryId !== selectedCategory.id && (
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setEditingCategoryId(selectedCategory.id)}
                  className="text-sm text-gray-400 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Edit
                </button>
                <DeleteButton action={() => deleteCategory(selectedCategory.id)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Products panel ── */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-700 uppercase tracking-wider">
                {selectedCategory ? selectedCategory.name : 'Products'}
              </h2>
              {selectedCategory && (
                <p className="text-sm text-gray-400 mt-0.5">
                  {visibleProducts.length} product{visibleProducts.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {selectedCategory && (
              <button
                onClick={openAddProduct}
                className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add product
              </button>
            )}
          </div>

          {/* Product list */}
          {visibleProducts.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {visibleProducts.map(product => {
                const cfg = TYPE_CONFIG[product.product_type];
                const isEditing = editingProductId === product.id;

                return (
                  <li
                    key={product.id}
                    className={`flex items-center justify-between px-6 py-5 border-l-4 transition-colors ${cfg.listBorder} ${
                      isEditing ? 'bg-indigo-50/30' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className={`font-semibold text-lg ${isEditing ? 'text-indigo-700' : 'text-gray-900'}`}>
                          {product.name}
                        </span>
                        <ProductTypeBadge type={product.product_type} />
                        <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                          product.available
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-600'
                        }`}>
                          {product.available ? 'Available' : 'Unavailable'}
                        </span>
                      </div>
                      {product.description && (
                        <p className="text-sm text-gray-400 mt-1 truncate">{product.description}</p>
                      )}
                    </div>

                    <div className="ml-5 flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="font-semibold text-gray-900 text-lg">
                          {formatExAsInc(product.price_cents, product.gst_rate)}
                        </div>
                        <div className="text-sm text-gray-400">inc. GST</div>
                      </div>
                      <button
                        onClick={() => isEditing ? closeDrawer() : openEditProduct(product.id)}
                        className={`text-sm px-4 py-2.5 rounded-xl font-semibold transition-colors ${
                          isEditing
                            ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        {isEditing ? 'Editing…' : 'Edit'}
                      </button>
                      <DeleteButton action={() => deleteProduct(product.id)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-6 py-20 text-center">
              {selectedCategory ? (
                <>
                  <div className="text-5xl mb-4">🍽️</div>
                  <p className="text-lg font-medium text-gray-600">No products in {selectedCategory.name} yet</p>
                  <p className="text-base text-gray-400 mt-1 mb-5">Add your first product to this category.</p>
                  <button
                    onClick={openAddProduct}
                    className="inline-flex items-center gap-2 px-6 py-3.5 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add first product
                  </button>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3">👈</div>
                  <p className="text-sm text-gray-400">Select a category to manage its products.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right-side product drawer ── */}
      {addingProduct && selectedCategoryId && (
        <ProductModal title="New product" onClose={closeDrawer}>
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
            onDone={closeDrawer}
          />
        </ProductModal>
      )}

      {editingProduct && (
        <ProductModal title={`Edit — ${editingProduct.name}`} onClose={closeDrawer}>
          <ProductForm
            product={editingProduct}
            categories={categories}
            ingredients={ingredients}
            recipeProducts={recipeProducts}
            allProducts={products}
            recipeLines={recipeLinesByProductId[editingProduct.id] ?? []}
            recipeLinesByProductId={recipeLinesByProductId}
            modifierGroups={modifierGroups}
            allModifiers={allModifiers}
            assignedModifierGroupIds={productModifierGroups[editingProduct.id] ?? new Set()}
            productModifierOptions={productModifierOptions.filter(o => o.product_id === editingProduct.id)}
            gstRate={gstRate}
            onDone={closeDrawer}
          />
        </ProductModal>
      )}
    </div>
  );
}
