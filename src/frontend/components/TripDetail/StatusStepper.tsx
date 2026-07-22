import type { TripStatus } from '../../types/api';

interface StatusStepperProps {
  /** Current trip status — determines which step is "current" vs "done"/"upcoming". */
  status: TripStatus;
  /**
   * 'desktop' (22px dots, 36px connecting lines) or 'mobile' (18px dots, 20px
   * connecting lines) per spec's "Status stepper" section (both desktop Right
   * panel and mobile Detail view subsections). Defaults to 'desktop'.
   */
  size?: 'desktop' | 'mobile';
}

/** The 4 steps in trip-status order, per spec's `buildSteps()` reference. */
const STEPS: { status: TripStatus; label: string }[] = [
  { status: 'planning', label: 'Plan' },
  { status: 'active', label: 'Active' },
  { status: 'review_pending', label: 'Review' },
  { status: 'locked', label: 'Locked' },
];

/**
 * Renders the 4-dot status stepper (Plan → Active → Review → Locked) — spec's
 * replacement for the old flat status bar. Renders ONLY the dots/connectors/
 * labels; the next-step hint + CTA button (and the Unlock affordance, C2) are
 * composed separately by the caller since their presentation differs between
 * desktop (inline, same card) and mobile (separate highlighted callout box) —
 * see spec's Right panel "Status stepper" vs mobile Detail view sections.
 *
 * Dot/line state logic is an EXACT behavior to replicate (spec is explicit that
 * giving "current" a distinct highlight color would be a defect against spec,
 * however reasonable it looks): "done" (i < idx) is pine-filled showing a
 * checkmark with a pine connecting line to its right; "current" (i === idx) is
 * the SAME pine fill as done but shows its ordinal number instead of a
 * checkmark; "upcoming" (i > idx) is a neutral, muted dot/label/line.
 *
 * @param status - Current trip status.
 * @param size - 'desktop' or 'mobile' sizing (spec's two explicit size sets).
 */
export function StatusStepper({ status, size = 'desktop' }: StatusStepperProps) {
  const idx = STEPS.findIndex((s) => s.status === status);
  const dotSize = size === 'desktop' ? 22 : 18;
  const lineWidth = size === 'desktop' ? 36 : 20;

  return (
    <div className="flex items-center" data-testid="status-stepper">
      {STEPS.map((step, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : 'upcoming';
        const isPine = state === 'done' || state === 'current';
        return (
          <div key={step.status} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex items-center justify-center rounded-full font-ui font-bold flex-shrink-0 ${
                  isPine ? 'bg-wp-primary text-white' : 'bg-wp-bg-chip text-wp-ink-faint'
                }`}
                style={{ width: dotSize, height: dotSize, fontSize: Math.round(dotSize * 0.5) }}
                data-step-state={state}
              >
                {state === 'done' ? '✓' : i + 1}
              </div>
              <span
                className={`font-ui font-bold text-[10.5px] mt-1 whitespace-nowrap ${
                  isPine ? 'text-wp-primary' : 'text-wp-ink-faint'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-[2px] flex-shrink-0 ${i < idx ? 'bg-wp-primary' : 'bg-wp-border'}`}
                style={{ width: lineWidth }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
