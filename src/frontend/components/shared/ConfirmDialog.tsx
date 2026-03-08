/**
 * ConfirmDialog — modal confirmation dialog.
 *
 * Used before destructive actions (delete item, lock trip, unlock trip).
 * Renders as a simple modal overlay with Cancel and Confirm buttons.
 */
import React from 'react';

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

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '8px',
  padding: '24px',
  maxWidth: '400px',
  width: '90%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'flex-end',
  marginTop: '20px',
};

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
    <div style={overlayStyle} onClick={onCancel}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>{title}</h3>
        <p style={{ margin: 0, color: '#4B5563', lineHeight: 1.5 }}>{message}</p>
        <div style={actionsStyle}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              background: '#DC2626',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
