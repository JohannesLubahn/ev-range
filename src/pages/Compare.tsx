import { useState } from 'react';
import { CarPicker, CarsButton } from '../components/CarPicker';
import { ConditionsPanel, ConditionsSummary, PresetPicker } from '../components/Conditions';
import { IconLink } from '../components/Icons';
import { ScoreCards, ScoreTable, sortIds } from '../components/ScoreTable';
import { useNarrow } from '../components/useNarrow';
import { EMBEDDED } from '../embedded';
import { useEngine } from '../state/engine';
import { shareLink, useStore } from '../state/store';

export function ShareButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [link, setLink] = useState('');
  return (
    <span className="row" style={{ gap: 6 }}>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          const url = shareLink();
          setLink(url);
          try {
            await navigator.clipboard.writeText(url);
            setState('copied');
          } catch {
            setState('failed');
          }
          window.setTimeout(() => setState('idle'), 4000);
        }}
      >
        <IconLink /> Share link
      </button>
      {state === 'copied' && <span className="faint">Link copied</span>}
      {state === 'failed' && (
        <input type="text" readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} style={{ width: 200 }} />
      )}
    </span>
  );
}

export function ComparePage() {
  const { selectedIds, out, derivedById, a } = useEngine();
  const sort = useStore((s) => s.sort);
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);
  const narrow = useNarrow();
  // One column (phones, small tablets): the car list opens from a button, so the results come first.
  const stacked = useNarrow(960);
  const [editing, setEditing] = useState(false);
  const names = Object.fromEntries(Object.values(derivedById).map((d) => [d.car.id, d.car.name]));
  const ids = sortIds(
    selectedIds,
    out.results,
    names,
    sort.key,
    sort.dir,
  );
  const cards = narrow || layout === 'cards';

  return (
    <div className="compare-grid">
      {!stacked && <CarPicker />}
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="page-head">
          <div className="stack" style={{ gap: 4 }}>
            <h1>Compare</h1>
            <p className="muted">
              Three stress tests check whether the battery is enough; the percentage is the spare (or missing) capacity. Battery life shows the
              capacity left after the years (green from {a.capacityGoodPct} %, orange from {a.capacityPoorPct} %, red below). Long trip and cost compare time and money. Select any cell for the full calculation.
            </p>
          </div>
        </div>
        <div className="panel stack" style={{ gap: 10 }}>
          <div className="toolbar">
            {stacked && <CarsButton />}
            <PresetPicker />
            <span className="spacer" />
            {!EMBEDDED && <ShareButton />}
            {!narrow && (
              <div className="segmented" role="group" aria-label="Layout">
                <button type="button" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}>
                  Table
                </button>
                <button type="button" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}>
                  Cards
                </button>
              </div>
            )}
          </div>
          <div className="toolbar">
            <ConditionsSummary />
            <button type="button" className="btn small" aria-expanded={editing} onClick={() => setEditing(!editing)}>
              {editing ? 'Done' : 'Edit conditions'}
            </button>
          </div>
        </div>
        {editing && <ConditionsPanel test={null} />}
        {ids.length === 0 ? (
          <div className="panel">
            <p className="muted">No cars selected. Tick cars in the list, or clear the filters.</p>
          </div>
        ) : cards ? (
          <ScoreCards ids={ids} />
        ) : (
          <ScoreTable ids={ids} />
        )}
        <p className="faint" style={{ fontSize: 12.5 }}>
          Green ✓ = the battery is enough, with the spare capacity in %. Red ✗ = not enough, with the shortfall. Battery figures: needed /
          available kWh, available = the capacity after the km driven (Conditions); petrol cars in litres of fuel. Long trip and cost: the
          thin bar shows each car relative to the slowest or most expensive one.
        </p>
      </div>
    </div>
  );
}
