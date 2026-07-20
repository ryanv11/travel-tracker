import { ErrorMessage } from './ErrorMessage';

interface ConfirmDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Dialog title text. */
  title: string;
  /** Explanatory message shown in the dialog body. */
  message: string;
  /** Label for the confirm button (default: "Confirm"). */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel"). */
  cancelLabel?: string;
  /** Called when the user clicks the confirm button. */
  onConfirm: () => void;
  /** Called when the user clicks cancel or the backdrop. */
  onCancel: () => void;
  /**
   * Optional error to render below the message (e.g. a failed mutation).
   * When set, the dialog stays open so the user sees why the action failed
   * instead of the dialog silently closing on a rejected promise.
   */
  error?: string | Error | null;
  /**
   * When true, disables both buttons (action in flight) — prevents a
   * double-submit while the mutation is pending.
   */
  isConfirming?: boolean;
  /** Confirm-button label while isConfirming is true (default: confirmLabel + "…"). */
  confirmingLabel?: string;
}

/**
 * Renders a modal confirmation dialog. Nothing renders when isOpen is false.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  error,
  isConfirming = false,
  confirmingLabel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[1000]"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-sm w-[90%] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="m-0 mb-3 text-base font-semibold text-gray-900">{title}</h3>
        <p className="m-0 text-gray-600 leading-relaxed text-sm">{message}</p>
        {error && (
          <div className="mt-3">
            <ErrorMessage error={error} />
          </div>
        )}
        <div className="flex gap-3 justify-end mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="px-4 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="px-4 py-2 border-none rounded-md bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 cursor-pointer"
          >
            {isConfirming ? (confirmingLabel ?? `${confirmLabel}…`) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
