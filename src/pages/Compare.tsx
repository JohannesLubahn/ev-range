import { useEffect, useState } from 'react';
import { CarPicker, useFilteredIds } from '../components/CarPicker';
import { ConditionsPanel, ConditionsSummary, PresetPicker } from '../components/Conditions';
import { IconLink } from '../components/Icons';
import { ScoreCards, ScoreTable, sortIds } from '../components/ScoreTable';
import { EMBEDDED } from '../embedded';
import { useEngine } from '../state/engine';
import { shareLink, useStore } from '../state/store';

function useNarrow(px = 720) {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return narrow;
}

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
  const { selectedIds, out, derivedById } = useEngine();
  const filtered = useFilteredIds();
  const sort = useStore((s) => s.sort);
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);
  const settings = useStore((s) => s.settings);
  const narrow = useNarrow();
  const [editing, setEditing] = useState(false);
  const names = Object.fromEntries(Object.values(derivedById).map((d) => [d.car.id, d.car.name]));
  const ids = sortIds(
    selectedIds.filter((id) => filtered.includes(id)),
    out.results,
    names,
    sort.key,
    sort.dir,
  );
  const cards = narrow || layout === 'cards';

  return (
    <div className="compare-grid">
      <CarPicker />
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="page-head">
          <div className="stack" style={{ gap: 4 }}>
            <h1>Compare</h1>
            <p className="muted">
              Four stress tests check whether the battery is enough; the percentage is the spare (or missing) capacity. Long trip and cost
              compare time and money. Select any cell for the full calculation.
            </p>
          </div>
        </div>
        <div className="panel stack" style={{ gap: 10 }}>
          <div className="toolbar">
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
            {settings.consumption === 'physics' && (
              <button type="button" className="btn small" aria-expanded={editing} onClick={() => setEditing(!editing)}>
                {editing ? 'Done' : 'Edit conditions'}
              </button>
            )}
          </div>
        </div>
        {editing && <ConditionsPanel />}
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
          Green ✓ = the battery is enough, with the spare capacity in %. Red ✗ = not enough, with the shortfall. Battery figures are
          long-term capacities (kWh). Long trip and cost: the thin bar shows each car relative to the slowest or most expensive one.
        </p>
      </div>
    </div>
  );
}
