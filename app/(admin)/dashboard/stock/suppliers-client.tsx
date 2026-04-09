'use client';

import { useState, useTransition } from 'react';
import type { Supplier } from '@/lib/types';
import { createSupplier, updateSupplier, deleteSupplier, deactivateSupplier } from './stock-actions';

function ErrorMsg({ message }: { message: string }) {
  return <p className="text-sm text-red-600 mt-1">{message}</p>;
}

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
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await onDelete();
              if (result.error) { setError(result.error); setConfirm(false); }
            });
          }}
          className="text-xs text-red-600 font-medium hover:text-red-800 disabled:opacity-50"
        >
          {pending ? '…' : 'Yes'}
        </button>
        <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">
          No
        </button>
      </span>
      {error && <span className="text-xs text-red-600 max-w-xs text-right">{error}</span>}
    </span>
  );
}

function SupplierForm({
  supplier,
  onDone,
}: {
  supplier?: Supplier;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = supplier
        ? await updateSupplier(supplier.id, fd)
        : await createSupplier(fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Supplier name *</label>
          <input
            name="name"
            defaultValue={supplier?.name}
            required
            placeholder="e.g. City Fresh Produce"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Contact name</label>
          <input
            name="contact_name"
            defaultValue={supplier?.contact_name ?? ''}
            placeholder="e.g. Jane Smith"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            name="phone"
            defaultValue={supplier?.phone ?? ''}
            placeholder="e.g. 09 123 4567"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={supplier?.email ?? ''}
            placeholder="e.g. orders@supplier.co.nz"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
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
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

interface SuppliersClientProps {
  suppliers: Supplier[];
}

export function SuppliersClient({ suppliers }: SuppliersClientProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deactivating, startDeactivate] = useTransition();
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const active = suppliers.filter(s => s.active);
  const inactive = suppliers.filter(s => !s.active);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Suppliers</h2>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            + Add supplier
          </button>
        )}
      </div>

      {adding && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <SupplierForm onDone={() => setAdding(false)} />
        </div>
      )}

      {deactivateError && (
        <div className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b border-red-100">
          {deactivateError}
        </div>
      )}

      {active.length === 0 && !adding ? (
        <p className="px-4 py-8 text-sm text-gray-400 text-center">No active suppliers. Add one to get started.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {active.map(supplier => (
            <li key={supplier.id} className="px-4 py-3">
              {editingId === supplier.id ? (
                <SupplierForm supplier={supplier} onDone={() => setEditingId(null)} />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{supplier.name}</p>
                    <div className="flex gap-4 mt-0.5">
                      {supplier.contact_name && (
                        <span className="text-xs text-gray-500">{supplier.contact_name}</span>
                      )}
                      {supplier.phone && (
                        <span className="text-xs text-gray-500">{supplier.phone}</span>
                      )}
                      {supplier.email && (
                        <span className="text-xs text-gray-500">{supplier.email}</span>
                      )}
                      {!supplier.contact_name && !supplier.phone && !supplier.email && (
                        <span className="text-xs text-gray-400">No contact details</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <button
                      onClick={() => { setEditingId(supplier.id); setAdding(false); }}
                      className="text-xs text-gray-400 hover:text-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      disabled={deactivating}
                      onClick={() => {
                        startDeactivate(async () => {
                          const result = await deactivateSupplier(supplier.id);
                          if (result.error) setDeactivateError(result.error);
                        });
                      }}
                      className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50"
                    >
                      Deactivate
                    </button>
                    <DeleteButton onDelete={() => deleteSupplier(supplier.id)} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {inactive.length > 0 && (
        <details className="border-t border-gray-100">
          <summary className="px-4 py-3 text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600">
            {inactive.length} inactive supplier{inactive.length !== 1 ? 's' : ''}
          </summary>
          <ul className="divide-y divide-gray-100">
            {inactive.map(supplier => (
              <li key={supplier.id} className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{supplier.name}</p>
                  {supplier.contact_name && (
                    <p className="text-xs text-gray-300">{supplier.contact_name}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Inactive</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
