/**
 * CategoryTab — Admin panel tab for managing trip categories (AD-01 to AD-06).
 *
 * List, add, edit name, deactivate, and re-activate categories.
 * Deactivated items are shown greyed-out (AD-06).
 *
 * QUAL-29: the CRUD list-editor UI itself now lives in AdminNameListTab —
 * this component just wires up the category-specific hooks and copy.
 */
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../../hooks/useAdmin';
import { AdminNameListTab } from './AdminNameListTab';

export function CategoryTab() {
  return (
    <AdminNameListTab
      useList={useCategories}
      useCreate={useCreateCategory}
      useUpdate={useUpdateCategory}
      useDelete={useDeleteCategory}
      addPlaceholder="New category name…"
      loadingMessage="Loading categories…"
    />
  );
}
