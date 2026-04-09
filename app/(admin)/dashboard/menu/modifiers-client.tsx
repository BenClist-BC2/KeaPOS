'use client';

import { useState, useTransition } from 'react';
import type { ModifierGroup, Modifier } from '@/lib/types';
import {
  createModifierGroup, updateModifierGroup, deleteModifierGroup,
  createModifier, updateModifier, deleteModifier,
} from './modifiers-actions';

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
  'block w-full border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors';

function DeleteButton({
  onDelete,
}: {
  onDelete: () => Promise<{ error: string | null }>;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pending) return <span className="text-xs text-gray-400">Deleting…</span>;

  if (confirm) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
          <span className="text-xs text-red-800 font-medium">Delete?</span>
          <button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await onDelete();
                if (result.error) { setError(result.error); setConfirm(false); }
              });
            }}
            className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-medium hover:bg-red-700"
          >
            Yes
          </button>
          <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-800">
            No
          </button>
        </span>
        {error && <span className="text-xs text-red-600 max-w-xs text-right">{error}</span>}
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

// ─── Modifier group form ──────────────────────────────────────

function ModifierGroupForm({ group, onDone }: { group?: ModifierGroup; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = group ? await updateModifierGroup(group.id, fd) : await createModifierGroup(fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Group name</label>
        <input
          name="name" defaultValue={group?.name} required
          placeholder="e.g. Choose your size, Add extras"
          className={inputCls}
        />
      </div>
      <div className="flex gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min <span className="font-normal text-gray-400">(0 = optional)</span>
          </label>
          <input
            name="min_selections" type="number" min="0"
            defaultValue={group?.min_selections ?? 0}
            className={`${inputCls} w-24`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max selections</label>
          <input
            name="max_selections" type="number" min="1"
            defaultValue={group?.max_selections ?? 1}
            className={`${inputCls} w-24`}
          />
        </div>
      </div>
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button
          type="submit" disabled={pending}
          className="px-6 py-3.5 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : group ? 'Save changes' : 'Create group'}
        </button>
        <button
          type="button" onClick={onDone}
          className="px-6 py-3.5 border border-gray-300 text-gray-700 text-base font-semibold rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Modifier (option) form ───────────────────────────────────

function ModifierForm({ groupId, modifier, onDone }: {
  groupId: string; modifier?: Modifier; onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = modifier ? await updateModifier(modifier.id, fd) : await createModifier(groupId, fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600 mb-1">Option name</label>
        <input
          name="name" defaultValue={modifier?.name} required
          placeholder="e.g. Large, No onion, Add egg"
          className={inputCls}
        />
      </div>
      <div className="flex gap-1 pb-0.5">
        <button
          type="submit" disabled={pending}
          className="px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {pending ? '…' : modifier ? 'Save' : 'Add'}
        </button>
        <button
          type="button" onClick={onDone}
          className="px-3 py-2 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && <ErrorMsg message={error} />}
    </form>
  );
}

// ─── Modifier options panel ───────────────────────────────────

function ModifiersPanel({ group, modifiers }: { group: ModifierGroup; modifiers: Modifier[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{group.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium mr-1.5 ${
              group.required ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {group.required ? 'Required' : 'Optional'}
            </span>
            {group.min_selections === group.max_selections
              ? `Pick exactly ${group.max_selections}`
              : `Pick ${group.min_selections}–${group.max_selections}`}
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add option
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-5 py-4 border-b border-gray-100 bg-indigo-50/30 border-l-4 border-l-indigo-400">
          <ModifierForm groupId={group.id} onDone={() => setAdding(false)} />
        </div>
      )}

      {/* Options list */}
      {modifiers.length === 0 && !adding ? (
        <div className="px-5 py-12 text-center">
          <div className="text-3xl mb-3">🔘</div>
          <p className="text-sm font-medium text-gray-600">No options yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Add the choices customers will see for this group.</p>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add first option
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {modifiers.map(mod => (
            <li key={mod.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
              {editingId === mod.id ? (
                <ModifierForm groupId={group.id} modifier={mod} onDone={() => setEditingId(null)} />
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
                    <span className="text-base text-gray-800 font-medium">{mod.name}</span>
                    <span className="text-sm text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg">price set per product</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => { setEditingId(mod.id); setAdding(false); }}
                      className="text-sm text-gray-400 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Edit
                    </button>
                    <DeleteButton onDelete={() => deleteModifier(mod.id)} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main ModifiersClient ─────────────────────────────────────

interface ModifiersClientProps {
  modifierGroups: ModifierGroup[];
  modifiers: Modifier[];
}

export function ModifiersClient({ modifierGroups, modifiers }: ModifiersClientProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(modifierGroups[0]?.id ?? null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const selectedGroup = modifierGroups.find(g => g.id === selectedGroupId);
  const groupModifiers = modifiers
    .filter(m => m.modifier_group_id === selectedGroupId)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="flex gap-6">
      {/* ── Groups sidebar ── */}
      <div className="w-60 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Modifier groups</h2>
          </div>

          {addingGroup && (
            <div className="p-4 border-b border-gray-100 bg-indigo-50/30 border-l-4 border-l-indigo-400">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-3">New group</p>
              <ModifierGroupForm onDone={() => setAddingGroup(false)} />
            </div>
          )}

          <ul className="py-1.5">
            {modifierGroups.map(group => (
              <li key={group.id}>
                {editingGroupId === group.id ? (
                  <div className="px-3 py-3 border-b border-gray-100">
                    <ModifierGroupForm group={group} onDone={() => setEditingGroupId(null)} />
                  </div>
                ) : (
                  <button
                    onClick={() => { setSelectedGroupId(group.id); setEditingGroupId(null); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg mx-1 transition-colors ${
                      group.id === selectedGroupId
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${group.id === selectedGroupId ? 'font-semibold' : 'font-medium'}`}>
                        {group.name}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                        group.required ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {group.required ? 'Req' : 'Opt'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {modifiers.filter(m => m.modifier_group_id === group.id).length} option(s)
                    </p>
                  </button>
                )}
              </li>
            ))}
            {modifierGroups.length === 0 && (
              <li className="px-4 py-4 text-sm text-gray-400 text-center">No groups yet</li>
            )}
          </ul>

          <div className="p-3 border-t border-gray-100 space-y-1">
            {!addingGroup && (
              <button
                onClick={() => { setAddingGroup(true); setEditingGroupId(null); }}
                className="w-full py-2 text-sm text-indigo-600 font-medium border border-dashed border-indigo-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                + Add group
              </button>
            )}
            {selectedGroup && editingGroupId !== selectedGroup.id && (
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setEditingGroupId(selectedGroup.id)}
                  className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                >
                  Edit
                </button>
                <DeleteButton onDelete={() => deleteModifierGroup(selectedGroup.id)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Options panel ── */}
      <div className="flex-1">
        {selectedGroup ? (
          <ModifiersPanel group={selectedGroup} modifiers={groupModifiers} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-16 text-center">
            <div className="text-4xl mb-3">🔧</div>
            <p className="text-sm font-medium text-gray-600">
              {modifierGroups.length === 0 ? 'No modifier groups yet' : 'Select a group'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {modifierGroups.length === 0
                ? 'Create a group like "Choose size" or "Add extras" to get started.'
                : 'Select a group from the left to manage its options.'}
            </p>
            {modifierGroups.length === 0 && (
              <button
                onClick={() => setAddingGroup(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create first group
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
