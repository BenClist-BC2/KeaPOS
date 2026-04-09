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
} from '../menu/actions';

// ─── Shared UI ────────────────────────────────────────────────

function ErrorMsg({ message }: { message: string }) {
  return <p className="text-sm text-red-600 mt-1">{message}</p>;
}

// ─── Ingredient form ──────────────────────────────────────────

interface IngredientFormProps {
  ingredient?: Ingredient;
  onDone: () => void;
}

function IngredientForm({ ingredient, onDone }: IngredientFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const defaultCost = ingredient
    ? (ingredient.cost_cents / 100).toFixed(2)
    : '';

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = ingredient
        ? await updateIngredient(ingredient.id, fd)
        : await createIngredient(fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            name="name"
            defaultValue={ingredient?.name}
            required
            placeholder="e.g. Beef mince, Soda water, Coke can"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Base unit</label>
          <select
            name="unit"
            defaultValue={ingredient?.unit ?? 'g'}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {ALL_UNITS.map(u => (
              <option key={u} value={u}>{UNIT_LABELS[u]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-w-xs">
        <label className="block text-sm font-medium text-gray-700">
          Cost per unit <span className="font-normal text-gray-500">(ex. GST)</span>
        </label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultCost}
            required
            placeholder="0.00"
            className="block w-full border border-gray-300 rounded-md pl-7 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {error && <ErrorMsg message={error} />}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Delete button ────────────────────────────────────────────

function DeleteButton({ onDelete }: { onDelete: () => Promise<{ error: string | null }> }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="text-xs text-red-500 hover:text-red-700">
        Delete
      </button>
    );
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1">
        <span className="text-xs text-gray-600">Sure?</span>
        <button
          onClick={() => {
            startTransition(async () => {
              const result = await onDelete();
              if (result.error) { setError(result.error); setConfirm(false); }
            });
          }}
          disabled={pending}
          className="text-xs text-red-600 font-medium hover:text-red-800 disabled:opacity-50"
        >
          {pending ? '…' : 'Yes'}
        </button>
        <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">
          No
        </button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
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
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
          ingredient.out_of_stock
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        }`}
      >
        {pending ? '…' : ingredient.out_of_stock ? 'Out of stock' : 'In stock'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

// ─── Ingredient row ───────────────────────────────────────────

interface IngredientRowProps {
  ingredient: Ingredient;
  onEdit: () => void;
  isEditing: boolean;
  onDoneEditing: () => void;
}

function IngredientRow({ ingredient, onEdit, isEditing, onDoneEditing }: IngredientRowProps) {
  if (isEditing) {
    return (
      <li className="px-4 py-4 bg-gray-50">
        <IngredientForm ingredient={ingredient} onDone={onDoneEditing} />
      </li>
    );
  }

  return (
    <li className="px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <span className={`font-medium text-sm ${ingredient.out_of_stock ? 'text-gray-400' : 'text-gray-900'}`}>
          {ingredient.name}
        </span>
        <span className="ml-2 text-xs text-gray-500">
          per {UNIT_LABELS[ingredient.unit as Unit]}
        </span>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="text-sm text-gray-700 font-mono">
          {formatEx(ingredient.cost_cents)}
          <span className="text-xs text-gray-400 font-sans ml-1">ex. GST</span>
        </span>

        <StockToggle ingredient={ingredient} />

        <button
          onClick={onEdit}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          Edit
        </button>

        <DeleteButton onDelete={() => deleteIngredient(ingredient.id)} />
      </div>
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────

interface IngredientsClientProps {
  ingredients: Ingredient[];
}

export function IngredientsClient({ ingredients }: IngredientsClientProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Ingredients</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Stock items used in recipes and purchased-for-resale products. Costs are ex. GST per base unit.
            </p>
          </div>
          {!adding && (
            <button
              onClick={() => { setAdding(true); setEditingId(null); }}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              + Add ingredient
            </button>
          )}
        </div>

        {adding && (
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-700 mb-3">New ingredient</h3>
            <IngredientForm onDone={() => setAdding(false)} />
          </div>
        )}

        {ingredients.length === 0 && !adding ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            No ingredients yet. Add one to start tracking stock costs.
          </p>
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
