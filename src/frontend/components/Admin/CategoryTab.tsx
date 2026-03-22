/**
 * CategoryTab — Admin panel tab for managing trip categories (AD-01 to AD-06).
 *
 * List, add, edit name, deactivate, and re-activate categories.
 * Deactivated items are shown greyed-out (AD-06).
 */
import type React from 'react';
import { useState } from 'react';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../../hooks/useAdmin';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '14px',
  flex: 1,
  minWidth: 0,
};
const btnStyle = (variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties => ({
  padding: '5px 12px',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
  fontSize: '13px',
  background: variant === 'primary' ? '#2563EB' : variant === 'danger' ? '#DC2626' : '#F3F4F6',
  color: variant === 'secondary' ? '#374151' : '#fff',
});

export function CategoryTab() {
  const { data: categories = [], isLoading, error } = useCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const del = useDeleteCategory();

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

  if (isLoading) return <LoadingSpinner message="Loading categories…" />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      {/* Add form */}
      <form
        onSubmit={(e) => {
          void handleCreate(e);
        }}
        style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}
      >
        <input
          style={inputStyle}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name…"
        />
        <button type="submit" style={btnStyle('primary')} disabled={create.isPending}>
          Add
        </button>
      </form>
      {create.error && <ErrorMessage error={create.error} />}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {categories.map((cat) => (
          <div
            key={cat.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              opacity: cat.is_active ? 1 : 0.5,
              background: cat.is_active ? '#fff' : '#F9FAFB',
            }}
          >
            {editingId === cat.id ? (
              <>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <button
                  style={btnStyle('primary')}
                  onClick={() => {
                    void handleEditSave(cat.id);
                  }}
                >
                  Save
                </button>
                <button style={btnStyle('secondary')} onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '14px' }}>{cat.name}</span>
                {!cat.is_active && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#6B7280',
                      background: '#F3F4F6',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    Inactive
                  </span>
                )}
                <button
                  style={btnStyle('secondary')}
                  onClick={() => {
                    setEditingId(cat.id);
                    setEditName(cat.name);
                  }}
                >
                  Rename
                </button>
                {cat.is_active ? (
                  <button
                    style={btnStyle('danger')}
                    onClick={() => {
                      void del.mutateAsync(cat.id);
                    }}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    style={btnStyle('secondary')}
                    onClick={() => {
                      void update.mutateAsync({ id: cat.id, data: { is_active: true } });
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
