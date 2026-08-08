/**
 * AdminNameListTab — shared CRUD list editor for Admin panel name-list
 * resources (QUAL-29).
 *
 * CategoryTab, ActivityTab and CompanionTab (AD-01 to AD-06, AD-08) were
 * near-byte-identical copies of this same add/rename/deactivate/re-activate
 * list pattern, differing only in which useAdmin.ts hooks they called and
 * their placeholder/loading copy. This component holds the one shared
 * implementation; each resource-specific Tab component now just supplies its
 * hooks and copy.
 *
 * @param T - The item shape (Category | Activity | Companion). Constrained to
 *   NameListItem so the shared render logic can read id/name/is_active
 *   without knowing the concrete resource type.
 */
import type React from 'react';
import { useState } from 'react';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

/** Minimal shape every name-list resource (Category/Activity/Companion) satisfies. */
export interface NameListItem {
  id: number;
  name: string;
  // Category/Activity serialize is_active as boolean; Companion's frontend
  // type still has it as the raw SQLite 0|1 (see types/api.ts). Both are
  // truthy/falsy-compatible for this component's read-only branching, so the
  // shared component accepts either rather than "fixing" a pre-existing,
  // out-of-scope type mismatch.
  is_active: boolean | number;
}

export interface AdminNameListTabProps<T extends NameListItem> {
  /** List query hook — e.g. useCategories / useActivities / useCompanions. */
  useList: () => { data: T[] | undefined; isLoading: boolean; error: Error | null };
  /** Create mutation hook. */
  useCreate: () => {
    mutateAsync: (name: string) => Promise<unknown>;
    isPending: boolean;
    error: Error | null;
  };
  /** Update mutation hook (rename and re-activate both go through this). */
  useUpdate: () => {
    mutateAsync: (vars: {
      id: number;
      data: { name?: string; is_active?: boolean };
    }) => Promise<unknown>;
    error: Error | null;
  };
  /** Delete (soft-deactivate) mutation hook. */
  useDelete: () => {
    mutateAsync: (id: number) => Promise<unknown>;
    error: Error | null;
  };
  /** e.g. "New category name…" */
  addPlaceholder: string;
  /** e.g. "Loading categories…" */
  loadingMessage: string;
}

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

export function AdminNameListTab<T extends NameListItem>({
  useList,
  useCreate,
  useUpdate,
  useDelete,
  addPlaceholder,
  loadingMessage,
}: AdminNameListTabProps<T>) {
  const { data: items = [], isLoading, error } = useList();
  const create = useCreate();
  const update = useUpdate();
  const del = useDelete();

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

  if (isLoading) return <LoadingSpinner message={loadingMessage} />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      {/* Add form */}
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
          placeholder={addPlaceholder}
        />
        <button type="submit" className={primaryBtnClass} disabled={create.isPending}>
          Add
        </button>
      </form>
      {create.error && <ErrorMessage error={create.error} />}

      {/* List */}
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 px-2.5 py-2 border rounded-md ${
              item.is_active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-50'
            }`}
          >
            {editingId === item.id ? (
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
                    void handleEditSave(item.id);
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
                <span className="flex-1 text-sm">{item.name}</span>
                {!item.is_active && (
                  <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    Inactive
                  </span>
                )}
                <button
                  className={secondaryBtnClass}
                  onClick={() => {
                    setEditingId(item.id);
                    setEditName(item.name);
                  }}
                >
                  Rename
                </button>
                {item.is_active ? (
                  <button
                    className={deactivateBtnClass}
                    onClick={() => {
                      void del.mutateAsync(item.id);
                    }}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    className={secondaryBtnClass}
                    onClick={() => {
                      void update.mutateAsync({ id: item.id, data: { is_active: true } });
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
