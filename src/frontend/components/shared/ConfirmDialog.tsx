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
        <div className="flex gap-3 justify-end mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 border-none rounded-md bg-red-600 text-white text-sm font-semibold hover:bg-red-700 cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
