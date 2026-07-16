/**
 * CompanionTab — Admin panel tab for managing companions (same CRUD pattern).
 */
import type React from 'react';
import { useState } from 'react';
import {
  useCompanions,
  useCreateCompanion,
  useDeleteCompanion,
  useUpdateCompanion,
} from '../../hooks/useAdmin';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const inputClass =
  'flex-1 min-w-0 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';
// Primary matches the app's teal "+ New" affordance (TripsLayout.tsx).
const primaryBtnClass =
  'px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-md hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
// Secondary matches the app's neutral outline affordance (ItemCard.tsx Edit button).
const secondaryBtnClass =
  'px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer';
// Deactivate: quiet/neutral at rest, red only surfaces on hover (UX-06) — avoids
// a page full of rows dominated by solid destructive-red at rest.
const deactivateBtnClass =
  'px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer';

export function CompanionTab() {
  const { data: companions = [], isLoading, error } = useCompanions();
  const create = useCreateCompanion();
  const update = useUpdateCompanion();
  const del = useDeleteCompanion();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await create.mutateAsync(newName.trim());
    setNewName('');
  };

  const handleEditSave = async (id: number) => {
    if (!editName.trim()) return;
    await update.mutateAsync({ id, data: { name: editName.trim() } });
    setEditingId(null);
  };

  if (isLoading) return <LoadingSpinner message="Loading companions…" />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <form
        onSubmit={(e) => {
          void handleCreate(e);
        }}
        className="flex gap-2 mb-5"
      >
        <input
          className={inputClass}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New companion name…"
        />
        <button type="submit" className={primaryBtnClass} disabled={create.isPending}>
          Add
        </button>
      </form>
      {create.error && <ErrorMessage error={create.error} />}
      <div className="flex flex-col gap-1.5">
        {companions.map((comp) => (
          <div
            key={comp.id}
            className={`flex items-center gap-2 px-2.5 py-2 border rounded-md ${
              comp.is_active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-50'
            }`}
          >
            {editingId === comp.id ? (
              <>
                <input
                  className={inputClass}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <button
                  className={primaryBtnClass}
                  onClick={() => {
                    void handleEditSave(comp.id);
                  }}
                >
                  Save
                </button>
                <button className={secondaryBtnClass} onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{comp.name}</span>
                {!comp.is_active && (
                  <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    Inactive
                  </span>
                )}
                <button
                  className={secondaryBtnClass}
                  onClick={() => {
                    setEditingId(comp.id);
                    setEditName(comp.name);
                  }}
                >
                  Rename
                </button>
                {comp.is_active ? (
                  <button
                    className={deactivateBtnClass}
                    onClick={() => {
                      void del.mutateAsync(comp.id);
                    }}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    className={secondaryBtnClass}
                    onClick={() => {
                      void update.mutateAsync({ id: comp.id, data: { is_active: true } });
                    }}
                  >
                    Re-activate
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {(update.error ?? del.error) && <ErrorMessage error={update.error ?? del.error} />}
    </div>
  );
}
