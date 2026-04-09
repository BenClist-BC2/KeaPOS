'use client';

import { useState, useTransition } from 'react';
import type { Ingredient } from '@/lib/types';
import { formatEx } from '@/lib/gst';
import { ALL_UNITS, UNIT_LABELS } from '@/lib/units';
import type { Unit } from '@/lib/units';
import {
  createIngredient,
  updateIngredient,
  deleteIngredient,
  toggleIngredientStock,
} from './actions';

// ─── Shared primitives ────────────────────────────────────────

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
  'block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors';

const selectCls =
  'block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors';

// ─── Delete button ────────────────────────────────────────────

function DeleteButton({ onDelete }: { onDelete: () => Promise<{ error: string | null }> }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pending) return <span className="text-xs text-gray-400">Deleting…</span>;

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
        <span className="text-xs text-red-800 font-medium">Delete?</span>
        <button
          onClick={() => startTransition(async () => {
            const res = await onDelete();
            if (res.error) { setError(res.error); setConfirm(false); }
          })}
          className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-medium hover:bg-red-700"
        >
          Yes
        </button>
        <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-800">No</button>
        {error && <span className="text-xs text-red-600 ml-1">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
    >
      Delete
    </button>
  );
}

// ─── Stock toggle ─────────────────────────────────────────────

function StockToggle({ ingredient }: { ingredient: Ingredient }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    startTransition(async () => {
      const result = await toggleIngredientStock(ingredient.id, !ingredient.out_of_stock);
      if (result.error) setError(result.error);
    });
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        onClick={toggle}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
          ingredient.out_of_stock
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${ingredient.out_of_stock ? 'bg-red-500' : 'bg-emerald-500'}`} />
        {pending ? '…' : ingredient.out_of_stock ? 'Out of stock' : 'In stock'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

// ─── Ingredient form ──────────────────────────────────────────

function IngredientForm({ ingredient, onDone }: { ingredient?: Ingredient; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const defaultCost = ingredient ? (ingredient.cost_cents / 100).toFixed(2) : '';

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = ingredient ? await updateIngredient(ingredient.id, fd) : await createIngredient(fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            name="name" defaultValue={ingredient?.name} required
            placeholder="e.g. Beef mince, Milk, Soda water"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base unit</label>
          <select name="unit" defaultValue={ingredient?.unit ?? 'g'} required className={selectCls}>
            {ALL_UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
          </select>
        </div>
      </div>

      <div className="max-w-xs">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cost per unit <span className="font-normal text-gray-400">(ex. GST)</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            name="cost" type="number" step="0.01" min="0"
            defaultValue={defaultCost} required placeholder="0.00"
            className={`${inputCls} pl-7`}
          />
        </div>
      </div>

      {error && <ErrorMsg message={error} />}

      <div className="flex gap-2">
        <button
          type="submit" disabled={pending}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : ingredient ? 'Save changes' : 'Add ingredient'}
        </button>
        <button
          type="button" onClick={onDone}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Ingredient row ───────────────────────────────────────────

function IngredientRow({ ingredient, onEdit, isEditing, onDoneEditing }: {
  ingredient: Ingredient;
  onEdit: () => void;
  isEditing: boolean;
  onDoneEditing: () => void;
}) {
  if (isEditing) {
    return (
      <li className="px-5 py-4 bg-indigo-50/30 border-l-4 border-l-indigo-400">
        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-3">Editing ingredient</p>
        <IngredientForm ingredient={ingredient} onDone={onDoneEditing} />
      </li>
    );
  }

  return (
    <li className={`flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors border-l-4 ${
      ingredient.out_of_stock ? 'border-l-red-300' : 'border-l-transparent'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium text-sm ${ingredient.out_of_stock ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {ingredient.name}
          </span>
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            per {UNIT_LABELS[ingredient.unit as Unit]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0 ml-4">
        <span className="text-sm font-mono text-gray-700">
          {formatEx(ingredient.cost_cents)}
          <span className="text-xs text-gray-400 font-sans ml-1">ex. GST</span>
        </span>

        <StockToggle ingredient={ingredient} />

        <button
          onClick={onEdit}
          className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
        >
          Edit
        </button>

        <DeleteButton onDelete={() => deleteIngredient(ingredient.id)} />
      </div>
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────

export function IngredientsClient({ ingredients }: { ingredients: Ingredient[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Ingredients</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Track the raw ingredients used in your recipes. Costs are ex. GST.
            </p>
          </div>
          {!adding && (
            <button
              onClick={() => { setAdding(true); setEditingId(null); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add ingredient
            </button>
          )}
        </div>

        {/* Add form */}
        {adding && (
          <div className="px-5 py-4 border-b border-gray-100 bg-indigo-50/30 border-l-4 border-l-indigo-400">
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-3">New ingredient</p>
            <IngredientForm onDone={() => setAdding(false)} />
          </div>
        )}

        {/* List */}
        {ingredients.length === 0 && !adding ? (
          <div className="px-5 py-16 text-center">
            <div className="text-4xl mb-3">🧂</div>
            <p className="text-sm font-medium text-gray-600">No ingredients yet</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Add the raw ingredients used in your recipes to start tracking costs.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add first ingredient
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {ingredients.map(ingredient => (
              <IngredientRow
                key={ingredient.id}
                ingredient={ingredient}
                isEditing={editingId === ingredient.id}
                onEdit={() => { setEditingId(ingredient.id); setAdding(false); }}
                onDoneEditing={() => setEditingId(null)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
