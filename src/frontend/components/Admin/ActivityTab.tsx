/**
 * ActivityTab — Admin panel tab for managing activities (same CRUD as CategoryTab).
 *
 * QUAL-29: the CRUD list-editor UI itself now lives in AdminNameListTab —
 * this component just wires up the activity-specific hooks and copy.
 */
import {
  useActivities,
  useCreateActivity,
  useDeleteActivity,
  useUpdateActivity,
} from '../../hooks/useAdmin';
import { AdminNameListTab } from './AdminNameListTab';

export function ActivityTab() {
  return (
    <AdminNameListTab
      useList={useActivities}
      useCreate={useCreateActivity}
      useUpdate={useUpdateActivity}
      useDelete={useDeleteActivity}
      addPlaceholder="New activity name…"
      loadingMessage="Loading activities…"
    />
  );
}
