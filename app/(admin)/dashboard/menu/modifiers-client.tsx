'use client';

import { useState, useTransition } from 'react';
import type { ModifierGroup, Modifier } from '@/lib/types';
import {
  createModifierGroup, updateModifierGroup, deleteModifierGroup,
  createModifier, updateModifier, deleteModifier,
} from './modifiers-actions';

// ─── Shared UI ────────────────────────────────────────────────

function ErrorMsg({ message }: { message: string }) {
  return <p className="text-sm text-red-600 mt-1">{message}</p>;
}

function DeleteButton({
  onDelete,
}: {
  onDelete: () => Promise<{ error: string | null }>;
}) {
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

// ─── Modifier group form ──────────────────────────────────────

function ModifierGroupForm({
  group,
  onDone,
}: {
  group?: ModifierGroup;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = group
        ? await updateModifierGroup(group.id, fd)
        : await createModifierGroup(fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">Group name</label>
        <input
          name="name"
          defaultValue={group?.name}
          required
          placeholder="e.g. Choose your size, Add extras"
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="flex gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Min selections
            <span className="font-normal text-gray-400 ml-1">(0 = optional)</span>
          </label>
          <input
            name="min_selections"
            type="number"
            min="0"
            defaultValue={group?.min_selections ?? 0}
            className="mt-1 block w-24 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Max selections</label>
          <input
            name="max_selections"
            type="number"
            min="1"
            defaultValue={group?.max_selections ?? 1}
            className="mt-1 block w-24 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
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

// ─── Modifier (option) form ───────────────────────────────────

function ModifierForm({
  groupId,
  modifier,
  onDone,
}: {
  groupId: string;
  modifier?: Modifier;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = modifier
        ? await updateModifier(modifier.id, fd)
        : await createModifier(groupId, fd);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600">Option name</label>
        <input
          name="name"
          defaultValue={modifier?.name}
          required
          placeholder="e.g. Large, No onion, Add egg"
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div className="flex gap-1 pb-0.5">
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? '…' : modifier ? 'Save' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
      {error && <ErrorMsg message={error} />}
    </form>
  );
}

// ─── Modifier options panel ───────────────────────────────────

function ModifiersPanel({
  group,
  modifiers,
}: {
  group: ModifierGroup;
  modifiers: Modifier[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-lg border border-gray-200 flex-1">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">{group.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {group.required ? 'Required' : 'Optional'} ·{' '}
            {group.min_selections === group.max_selections
              ? `pick exactly ${group.max_selections}`
              : `pick ${group.min_selections}–${group.max_selections}`}
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            + Add option
          </button>
        )}
      </div>

      {adding && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <ModifierForm groupId={group.id} onDone={() => setAdding(false)} />
        </div>
      )}

      {modifiers.length === 0 && !adding ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">
          No options yet. Add the first one.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {modifiers.map(mod => (
            <li key={mod.id} className="px-4 py-2.5">
              {editingId === mod.id ? (
                <ModifierForm
                  groupId={group.id}
                  modifier={mod}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-800">{mod.name}</span>
                    <span className="text-xs text-gray-400">price set per product</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setEditingId(mod.id); setAdding(false); }}
                      className="text-xs text-gray-400 hover:text-gray-700"
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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    modifierGroups[0]?.id ?? null
  );
  const [addingGroup, setAddingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const selectedGroup = modifierGroups.find(g => g.id === selectedGroupId);
  const groupModifiers = modifiers
    .filter(m => m.modifier_group_id === selectedGroupId)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="flex gap-6">
      {/* ── Groups sidebar ── */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Modifier Groups</h2>
            <button
              onClick={() => { setAddingGroup(true); setEditingGroupId(null); }}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              + Add
            </button>
          </div>

          {addingGroup && (
            <div className="p-4 border-b border-gray-100">
              <ModifierGroupForm onDone={() => setAddingGroup(false)} />
            </div>
          )}

          <ul className="py-1">
            {modifierGroups.map(group => (
              <li key={group.id}>
                {editingGroupId === group.id ? (
                  <div className="px-4 py-3 border-b border-gray-100">
                    <ModifierGroupForm
                      group={group}
                      onDone={() => setEditingGroupId(null)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setEditingGroupId(null);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      group.id === selectedGroupId ? 'bg-gray-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm text-gray-800 ${group.id === selectedGroupId ? 'font-medium' : ''}`}>
                        {group.name}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        group.required
                          ? 'bg-gray-800 text-white'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {group.required ? 'Required' : 'Optional'}
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
              <li className="px-4 py-3 text-sm text-gray-400">No groups yet</li>
            )}
          </ul>
        </div>

        {selectedGroup && editingGroupId !== selectedGroup.id && (
          <div className="mt-2 flex gap-2 px-1">
            <button
              onClick={() => setEditingGroupId(selectedGroup.id)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Edit group
            </button>
            <DeleteButton onDelete={() => deleteModifierGroup(selectedGroup.id)} />
          </div>
        )}
      </div>

      {/* ── Options panel ── */}
      <div className="flex-1">
        {selectedGroup ? (
          <ModifiersPanel group={selectedGroup} modifiers={groupModifiers} />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 flex-1 px-4 py-8 text-center text-sm text-gray-400">
            {modifierGroups.length === 0
              ? 'Create a modifier group to get started.'
              : 'Select a group to manage its options.'}
          </div>
        )}
      </div>
    </div>
  );
}
