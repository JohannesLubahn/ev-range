import type { Mode } from '../state/store';

/**
 * The large slider in the top bar: Fun-sized (the clean landing page, the default) or Enthusiast (the full site).
 * One button with role="switch"; the thumb slides behind the active label.
 */
export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const on = mode === 'enthusiast';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Enthusiast mode"
      title={on ? 'Switch to the fun-sized page' : 'Switch to the full site'}
      className="mode-switch"
      data-mode={mode}
      onClick={() => onChange(on ? 'fun' : 'enthusiast')}
    >
      <span className="mode-switch-thumb" aria-hidden="true" />
      <span className="mode-switch-label" data-active={!on || undefined}>
        Fun-sized
      </span>
      <span className="mode-switch-label" data-active={on || undefined}>
        Enthusiast
      </span>
    </button>
  );
}
