'use client';

import { useState, useTransition } from 'react';
import type { Supplier, Ingredient, StockReceipt, StockReceiptLine } from '@/lib/types';
import { ALL_UNITS, UNIT_LABELS } from '@/lib/units';
import type { Unit } from '@/lib/units';
import { formatEx } from '@/lib/gst';
import { createStockReceipt, updateStockReceipt, deleteStockReceipt } from './stock-actions';
import type { StockReceiptLineInput } from './stock-actions';

// ─── Receipt line editor row ──────────────────────────────────

interface LineRow {
  id: string; // local key only
  ingredient_id: string;
  quantity: string;
  unit: Unit;
  unit_cost_dollars: string;
}

function newRow(): LineRow {
  return {
    id: Math.random().toString(36).slice(2),
    ingredient_id: '',
    quantity: '',
    unit: 'each',
    unit_cost_dollars: '',
  };
}

function LineEditor({
  row,
  ingredients,
  onChange,
  onRemove,
  canRemove,
}: {
  row: LineRow;
  ingredients: Ingredient[];
  onChange: (updated: LineRow) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  function handleIngredientChange(id: string) {
    const ing = ingredients.find(i => i.id === id);
    onChange({ ...row, ingredient_id: id, unit: ing?.unit ?? 'each' });
  }

  return (
    <div className="grid grid-cols-[1fr_100px_100px_120px_32px] gap-2 items-end">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ingredient</label>
        <select
          value={row.ingredient_id}
          onChange={e => handleIngredientChange(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Select…</option>
          {ingredients.map(i => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
        <input
          type="number"
          min="0.001"
          step="any"
          value={row.quantity}
          onChange={e => onChange({ ...row, quantity: e.target.value })}
          placeholder="e.g. 5"
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
        <select
          value={row.unit}
          onChange={e => onChange({ ...row, unit: e.target.value as Unit })}
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {ALL_UNITS.map(u => (
            <option key={u} value={u}>{UNIT_LABELS[u]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Cost per {UNIT_LABELS[row.unit]} (ex-GST)
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={row.unit_cost_dollars}
            onChange={e => onChange({ ...row, unit_cost_dollars: e.target.value })}
            placeholder="0.00"
            className="w-full border border-gray-300 rounded-md pl-7 pr-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div className="pb-0.5">
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 rounded"
            title="Remove line"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Receipt form (shared for create + edit) ──────────────────

interface ReceiptFormProps {
  suppliers: Supplier[];
  ingredients: Ingredient[];
  /** Pre-fill values when editing an existing receipt */
  initial?: {
    id: string;
    supplier_id: string | null;
    receipt_date: string;
    invoice_number: string | null;
    notes: string | null;
    lines: LineRow[];
  };
  onDone: () => void;
}

function ReceiptForm({ suppliers, ingredients, initial, onDone }: ReceiptFormProps) {
  const today = new Date().toISOString().split('T')[0];

  const [lines, setLines] = useState<LineRow[]>(initial?.lines ?? [newRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateLine(index: number, updated: LineRow) {
    setLines(prev => prev.map((r, i) => (i === index ? updated : r)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const parsedLines: StockReceiptLineInput[] = lines.map(row => ({
      ingredient_id: row.ingredient_id,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      unit_cost_dollars: row.unit_cost_dollars,
    }));

    const receiptData = {
      supplier_id: (fd.get('supplier_id') as string) || null,
      receipt_date: fd.get('receipt_date') as string,
      invoice_number: (fd.get('invoice_number') as string)?.trim() || null,
      notes: (fd.get('notes') as string)?.trim() || null,
    };

    startTransition(async () => {
      const result = initial
        ? await updateStockReceipt(initial.id, receiptData, parsedLines)
        : await createStockReceipt(receiptData, parsedLines);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {initial && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Saving will re-apply these ingredient costs as the latest prices.
        </p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Date *</label>
          <input
            name="receipt_date"
            type="date"
            defaultValue={initial?.receipt_date ?? today}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Supplier</label>
          <select
            name="supplier_id"
            defaultValue={initial?.supplier_id ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">No supplier</option>
            {suppliers.filter(s => s.active).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Invoice #</label>
          <input
            name="invoice_number"
            defaultValue={initial?.invoice_number ?? ''}
            placeholder="e.g. INV-1234"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Items received *</label>
        <div className="space-y-2">
          {lines.map((row, i) => (
            <LineEditor
              key={row.id}
              row={row}
              ingredients={ingredients}
              onChange={updated => updateLine(i, updated)}
              onRemove={() => setLines(prev => prev.filter((_, j) => j !== i))}
              canRemove={lines.length > 1}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLines(prev => [...prev, newRow()])}
          className="mt-3 text-sm text-gray-500 hover:text-gray-900"
        >
          + Add line
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ''}
          placeholder="Optional notes about this delivery"
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Save receipt'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Receipt row in list ──────────────────────────────────────

interface ReceiptWithLines extends StockReceipt {
  lines: (StockReceiptLine & { ingredient_name: string })[];
  supplier_name: string | null;
}

function ReceiptRow({
  receipt,
  suppliers,
  ingredients,
}: {
  receipt: ReceiptWithLines;
  suppliers: Supplier[];
  ingredients: Ingredient[];
}) {
  const [mode, setMode] = useState<'collapsed' | 'expanded' | 'editing'>('collapsed');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  const date = new Date(receipt.receipt_date).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Build initial line rows from existing receipt lines for edit mode
  const initialLines: LineRow[] = receipt.lines.map(line => ({
    id: line.id,
    ingredient_id: line.ingredient_id,
    quantity: String(line.quantity),
    unit: line.unit as Unit,
    unit_cost_dollars: (line.unit_cost_cents / 100).toFixed(2),
  }));

  return (
    <li className="divide-y divide-gray-50">
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setMode(m => m === 'expanded' ? 'collapsed' : 'expanded')}
          className="flex-1 text-left flex items-center gap-4"
        >
          <span className="text-sm font-medium text-gray-900">{date}</span>
          {receipt.supplier_name && (
            <span className="text-sm text-gray-500">{receipt.supplier_name}</span>
          )}
          {receipt.invoice_number && (
            <span className="text-xs text-gray-400 font-mono">{receipt.invoice_number}</span>
          )}
          <span className="text-xs text-gray-400">
            {receipt.lines.length} line{receipt.lines.length !== 1 ? 's' : ''}
          </span>
        </button>
        <div className="flex items-center gap-3">
          {mode !== 'editing' && (
            <>
              <button
                onClick={() => setMode(m => m === 'expanded' ? 'collapsed' : 'expanded')}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                {mode === 'expanded' ? 'Collapse' : 'View'}
              </button>
              <button
                onClick={() => setMode('editing')}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Edit
              </button>
              <button
                disabled={deletePending}
                onClick={() => {
                  if (!confirm('Delete this receipt? Ingredient costs will not be rolled back.')) return;
                  startDelete(async () => {
                    const result = await deleteStockReceipt(receipt.id);
                    if (result.error) setDeleteError(result.error);
                  });
                }}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
              >
                {deletePending ? '…' : 'Delete'}
              </button>
            </>
          )}
        </div>
      </div>

      {deleteError && (
        <div className="px-4 py-1.5 text-xs text-red-600 bg-red-50">{deleteError}</div>
      )}

      {mode === 'editing' && (
        <div className="px-4 py-4 bg-gray-50">
          <ReceiptForm
            suppliers={suppliers}
            ingredients={ingredients}
            initial={{
              id: receipt.id,
              supplier_id: receipt.supplier_id,
              receipt_date: receipt.receipt_date,
              invoice_number: receipt.invoice_number,
              notes: receipt.notes,
              lines: initialLines,
            }}
            onDone={() => setMode('collapsed')}
          />
        </div>
      )}

      {mode === 'expanded' && (
        <div className="px-4 py-3 bg-gray-50">
          {receipt.notes && (
            <p className="text-xs text-gray-500 mb-3">{receipt.notes}</p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 text-left">
                <th className="pb-1 font-medium">Ingredient</th>
                <th className="pb-1 font-medium text-right">Qty</th>
                <th className="pb-1 font-medium">Unit</th>
                <th className="pb-1 font-medium text-right">Cost/unit (ex-GST)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receipt.lines.map(line => (
                <tr key={line.id}>
                  <td className="py-1 text-gray-800">{line.ingredient_name}</td>
                  <td className="py-1 text-right text-gray-600">{line.quantity}</td>
                  <td className="py-1 text-gray-500">{UNIT_LABELS[line.unit as Unit]}</td>
                  <td className="py-1 text-right text-gray-600">{formatEx(line.unit_cost_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

// ─── Main ReceiveStockClient ──────────────────────────────────

interface ReceiveStockClientProps {
  suppliers: Supplier[];
  ingredients: Ingredient[];
  receipts: ReceiptWithLines[];
}

export function ReceiveStockClient({ suppliers, ingredients, receipts }: ReceiveStockClientProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Receive Stock</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Recording a receipt updates ingredient costs to the latest price.
            </p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-700"
            >
              + New receipt
            </button>
          )}
        </div>

        {creating && (
          <div className="p-4">
            <ReceiptForm
              suppliers={suppliers}
              ingredients={ingredients}
              onDone={() => setCreating(false)}
            />
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 text-sm">Past Receipts</h2>
        </div>

        {receipts.length === 0 ? (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">No receipts yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {receipts.map(receipt => (
              <ReceiptRow
                key={receipt.id}
                receipt={receipt}
                suppliers={suppliers}
                ingredients={ingredients}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
