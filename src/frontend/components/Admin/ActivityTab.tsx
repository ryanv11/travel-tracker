/**
 * ActivityTab — Admin panel tab for managing activities (same CRUD as CategoryTab).
 */
import React, { useState } from 'react';
import { useActivities, useCreateActivity, useUpdateActivity, useDeleteActivity } from '../../hooks/useAdmin';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const inputStyle: React.CSSProperties = { padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', flex: 1, minWidth: 0 };
const btnStyle = (v: 'primary' | 'secondary' | 'danger'): React.CSSProperties => ({
  padding: '5px 12px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px',
  background: v === 'primary' ? '#2563EB' : v === 'danger' ? '#DC2626' : '#F3F4F6',
  color: v === 'secondary' ? '#374151' : '#fff',
});

export function ActivityTab() {
  const { data: activities = [], isLoading, error } = useActivities();
  const create = useCreateActivity();
  const update = useUpdateActivity();
  const del = useDeleteActivity();
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

  if (isLoading) return <LoadingSpinner message="Loading activities…" />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <form onSubmit={(e) => { void handleCreate(e); }} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New activity name…" />
        <button type="submit" style={btnStyle('primary')} disabled={create.isPending}>Add</button>
      </form>
      {create.error && <ErrorMessage error={create.error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {activities.map((act) => (
          <div key={act.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: '6px', opacity: act.is_active ? 1 : 0.5, background: act.is_active ? '#fff' : '#F9FAFB' }}>
            {editingId === act.id ? (
              <>
                <input style={{ ...inputStyle, flex: 1 }} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <button style={btnStyle('primary')} onClick={() => { void handleEditSave(act.id); }}>Save</button>
                <button style={btnStyle('secondary')} onClick={() => setEditingId(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '14px' }}>{act.name}</span>
                {!act.is_active && <span style={{ fontSize: '11px', color: '#6B7280', background: '#F3F4F6', padding: '1px 6px', borderRadius: '4px' }}>Inactive</span>}
                <button style={btnStyle('secondary')} onClick={() => { setEditingId(act.id); setEditName(act.name); }}>Rename</button>
                {act.is_active ? (
                  <button style={btnStyle('danger')} onClick={() => { void del.mutateAsync(act.id); }}>Deactivate</button>
                ) : (
                  <button style={btnStyle('secondary')} onClick={() => { void update.mutateAsync({ id: act.id, data: { is_active: true } }); }}>Re-activate</button>
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
