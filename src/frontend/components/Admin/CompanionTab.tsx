/**
 * CompanionTab — Admin panel tab for managing companions (same CRUD pattern).
 *
 * QUAL-29: the CRUD list-editor UI itself now lives in AdminNameListTab —
 * this component just wires up the companion-specific hooks and copy.
 */
import {
  useCompanions,
  useCreateCompanion,
  useDeleteCompanion,
  useUpdateCompanion,
} from '../../hooks/useAdmin';
import { AdminNameListTab } from './AdminNameListTab';

export function CompanionTab() {
  return (
    <AdminNameListTab
      useList={useCompanions}
      useCreate={useCreateCompanion}
      useUpdate={useUpdateCompanion}
      useDelete={useDeleteCompanion}
      addPlaceholder="New companion name…"
      loadingMessage="Loading companions…"
    />
  );
}
