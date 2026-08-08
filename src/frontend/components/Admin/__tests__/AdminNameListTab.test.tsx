/**
 * Tests for AdminNameListTab (QUAL-29) — the shared CRUD list editor that
 * replaced the near-identical bodies of CategoryTab/ActivityTab/CompanionTab.
 *
 * None of the three original Tab components had dedicated tests (confirmed
 * during the QUAL-29 investigation — AdminPanel.test.tsx stubs them out
 * entirely), so this suite is new coverage, not a port of existing
 * assertions. It exercises the shared component directly with a fake set of
 * hooks, covering: loading/error states, add, rename, deactivate,
 * re-activate, and that placeholder/loading copy is resource-specific.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminNameListTab, type NameListItem } from '../AdminNameListTab';

interface FakeItem extends NameListItem {
  id: number;
  name: string;
  is_active: boolean;
}

/** Builds a fresh set of stub hooks backed by the given items + mock mutations. */
function makeHooks(items: FakeItem[]) {
  const createMutateAsync = vi.fn().mockResolvedValue(undefined);
  const updateMutateAsync = vi.fn().mockResolvedValue(undefined);
  const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);

  return {
    useList: () => ({ data: items, isLoading: false, error: null }),
    useCreate: () => ({ mutateAsync: createMutateAsync, isPending: false, error: null }),
    useUpdate: () => ({ mutateAsync: updateMutateAsync, error: null }),
    useDelete: () => ({ mutateAsync: deleteMutateAsync, error: null }),
    createMutateAsync,
    updateMutateAsync,
    deleteMutateAsync,
  };
}

const baseProps = {
  addPlaceholder: 'New widget name…',
  loadingMessage: 'Loading widgets…',
};

describe('AdminNameListTab', () => {
  it('renders the loading state via loadingMessage', () => {
    render(
      <AdminNameListTab<FakeItem>
        useList={() => ({ data: undefined, isLoading: true, error: null })}
        useCreate={() => ({ mutateAsync: vi.fn(), isPending: false, error: null })}
        useUpdate={() => ({ mutateAsync: vi.fn(), error: null })}
        useDelete={() => ({ mutateAsync: vi.fn(), error: null })}
        {...baseProps}
      />,
    );
    expect(screen.getByText('Loading widgets…')).toBeInTheDocument();
  });

  it('renders an error state via ErrorMessage when the list query fails', () => {
    render(
      <AdminNameListTab<FakeItem>
        useList={() => ({ data: undefined, isLoading: false, error: new Error('boom') })}
        useCreate={() => ({ mutateAsync: vi.fn(), isPending: false, error: null })}
        useUpdate={() => ({ mutateAsync: vi.fn(), error: null })}
        useDelete={() => ({ mutateAsync: vi.fn(), error: null })}
        {...baseProps}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders active and inactive rows, using addPlaceholder for the input', () => {
    const hooks = makeHooks([
      { id: 1, name: 'Alpha', is_active: true },
      { id: 2, name: 'Beta', is_active: false },
    ]);
    render(<AdminNameListTab<FakeItem> {...hooks} {...baseProps} />);

    expect(screen.getByPlaceholderText('New widget name…')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('submitting the add form calls useCreate().mutateAsync with the trimmed name', () => {
    const hooks = makeHooks([]);
    render(<AdminNameListTab<FakeItem> {...hooks} {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('New widget name…'), {
      target: { value: '  Gamma  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(hooks.createMutateAsync).toHaveBeenCalledWith('Gamma');
  });

  it('does not call create when the trimmed name is empty', () => {
    const hooks = makeHooks([]);
    render(<AdminNameListTab<FakeItem> {...hooks} {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('New widget name…'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(hooks.createMutateAsync).not.toHaveBeenCalled();
  });

  it('Rename -> edit -> Save calls useUpdate().mutateAsync with the new name and exits edit mode', async () => {
    const hooks = makeHooks([{ id: 1, name: 'Alpha', is_active: true }]);
    render(<AdminNameListTab<FakeItem> {...hooks} {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const editInput = screen.getByDisplayValue('Alpha');
    fireEvent.change(editInput, { target: { value: 'Alpha Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(hooks.updateMutateAsync).toHaveBeenCalledWith({
      id: 1,
      data: { name: 'Alpha Renamed' },
    });
    // Edit mode exits once the mutateAsync promise resolves: the Save/Cancel
    // buttons are gone, Rename is back.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('Cancel exits edit mode without calling update', () => {
    const hooks = makeHooks([{ id: 1, name: 'Alpha', is_active: true }]);
    render(<AdminNameListTab<FakeItem> {...hooks} {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(hooks.updateMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('Deactivate calls useDelete().mutateAsync with the item id', () => {
    const hooks = makeHooks([{ id: 5, name: 'Alpha', is_active: true }]);
    render(<AdminNameListTab<FakeItem> {...hooks} {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(hooks.deleteMutateAsync).toHaveBeenCalledWith(5);
  });

  it('Re-activate calls useUpdate().mutateAsync with is_active: true', () => {
    const hooks = makeHooks([{ id: 7, name: 'Beta', is_active: false }]);
    render(<AdminNameListTab<FakeItem> {...hooks} {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Re-activate' }));

    expect(hooks.updateMutateAsync).toHaveBeenCalledWith({
      id: 7,
      data: { is_active: true },
    });
  });

  it('renders a create-error via ErrorMessage', () => {
    render(
      <AdminNameListTab<FakeItem>
        useList={() => ({ data: [], isLoading: false, error: null })}
        useCreate={() => ({
          mutateAsync: vi.fn(),
          isPending: false,
          error: new Error('create failed'),
        })}
        useUpdate={() => ({ mutateAsync: vi.fn(), error: null })}
        useDelete={() => ({ mutateAsync: vi.fn(), error: null })}
        {...baseProps}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('create failed');
  });
});
