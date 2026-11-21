import { capacityLeft, fixed, signedPct } from '../format';
import { useEngine } from '../state/engine';
import { IconCheck, IconCross } from './Icons';

/** Pass/fail with icon + label: colour never carries the meaning alone. */
export function PassFail({ pass, margin, text }: { pass: boolean | null; margin: number | null; text?: string }) {
  if (pass === null) return <span className="faint">–</span>;
  return (
    <span className={`status ${pass ? 'good' : 'bad'}`}>
      {pass ? <IconCheck size={14} /> : <IconCross size={14} />}
      <span>{text ?? signedPct(margin)}</span>
      <span className="sr-only">{pass ? 'enough' : 'not enough'}</span>
    </span>
  );
}

export type CapacityBand = 'good' | 'fair' | 'poor';

/** Colour band of the capacity left (assumptions capacity_good_pct / capacity_poor_pct): green, orange, red. */
export function capacityBand(pct: number, goodPct: number, poorPct: number): CapacityBand {
  return pct >= goodPct ? 'good' : pct >= poorPct ? 'fair' : 'poor';
}

/**
 * Battery life: the capacity left, colour coded (green / orange / red) without a pass or fail: users judge for
 * themselves (user's choice 2026-11-21). A dot of the band colour and the band in words for screen readers.
 */
export function CapacityLeft({ pct }: { pct: number | null }) {
  const { a } = useEngine();
  if (pct === null || !Number.isFinite(pct)) return <span className="faint">–</span>;
  const band = capacityBand(pct, a.capacityGoodPct, a.capacityPoorPct);
  const words =
    band === 'good'
      ? `${fixed(a.capacityGoodPct, 0)} % or more`
      : band === 'fair'
        ? `${fixed(a.capacityPoorPct, 0)}–${fixed(a.capacityGoodPct, 0)} %`
        : `below ${fixed(a.capacityPoorPct, 0)} %`;
  return (
    <span className={`status cap ${band}`}>
      <i className="dot" aria-hidden="true" />
      <span>{capacityLeft(pct)}</span>
      <span className="sr-only">({words})</span>
    </span>
  );
}
