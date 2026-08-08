/**
 * ModalOverlay — shared modal-shell wrapper (QUAL-31).
 *
 * The fixed-inset backdrop + centered white panel + backdrop-click-to-close +
 * stopPropagation pattern was hand-repeated at 8 render sites across 7 files
 * (ConfirmDialog, TripForm, ItemForm, PlaceDateForm, ChangeCityModal,
 * AddPlaceFlow x3, CarryForwardModal). This component holds the one shared
 * shell; each site keeps its own panel sizing/z-index/close behaviour via
 * props rather than the shell dictating them.
 *
 * z-index is applied via inline style, not a Tailwind `z-[N]` utility class —
 * Tailwind's JIT scanner needs a complete, static class-name string in source
 * to generate the corresponding CSS rule. A template-literal-interpolated
 * `z-[${zIndex}]` would not be discovered by the scanner, and the site would
 * silently lose its stacking order in a production build. `style={{ zIndex }}`
 * sidesteps that entirely — an element made positioned by `fixed` honours an
 * inline z-index exactly the way a `z-[N]` utility class would.
 *
 * Deliberately NOT added as part of this extraction (behaviour-preserving
 * refactor, not a UX pass): no ESC-key handling, no focus trap, no
 * role="dialog"/aria-modal — none of the original 8 sites had these, so
 * adding them here would be new behaviour everywhere, not a preserved one.
 */
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export interface ModalOverlayProps {
  children: ReactNode;
  /** Stacking order — every site used (and still uses) its own distinct value. */
  zIndex: number;
  /**
   * Called when the backdrop is clicked, if closeOnBackdropClick is true.
   * Optional because CarryForwardModal has no backdrop-dismiss today — see
   * closeOnBackdropClick.
   */
  onClose?: () => void;
  /**
   * Whether clicking the backdrop calls onClose. Default true (matches every
   * site except CarryForwardModal, which passes false to preserve its
   * pre-existing no-backdrop-dismiss behaviour).
   */
  closeOnBackdropClick?: boolean;
  /** Extra classes for the inner panel — width, padding, max-height, overflow. */
  panelClassName?: string;
  /**
   * Extra inline styles for the inner panel, merged after the default
   * bg-white/rounded-lg/shadow-2xl classes. Exists solely so CarryForwardModal
   * (the one pre-existing inline-style site, not Tailwind) can keep its exact
   * pre-refactor box-shadow value instead of picking up shadow-2xl's slightly
   * different blur/spread — a real, if minor, visual difference this
   * extraction should not introduce.
   */
  panelStyle?: CSSProperties;
}

/** Renders the shared fixed-backdrop + centered white panel modal shell. */
export function ModalOverlay({
  children,
  zIndex,
  onClose,
  closeOnBackdropClick = true,
  panelClassName = '',
  panelStyle,
}: ModalOverlayProps) {
  const handleBackdropClick = () => {
    if (closeOnBackdropClick) onClose?.();
  };

  const stopPropagation = (e: MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center"
      style={{ zIndex }}
      onClick={handleBackdropClick}
    >
      <div
        className={`bg-white rounded-lg shadow-2xl ${panelClassName}`}
        style={panelStyle}
        onClick={stopPropagation}
      >
        {children}
      </div>
    </div>
  );
}
