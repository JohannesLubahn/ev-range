import { useMemo } from 'react';
import { useEngine } from '../state/engine';
import { useStore } from '../state/store';
import { IconWarning } from './Icons';

/** Cars that pass the rail filters (search, price, chemistry). */
export function useFilteredIds(): string[] {
  const { out, allIds } = useEngine();
  const filters = useStore((s) => s.filters);
  return useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allIds.filter((id) => {
      const d = out.derived.find((x) => x.car.id === id);
      if (!d) return false;
      if (q && !`${d.car.name} ${d.car.brand}`.toLowerCase().includes(q)) return false;
      if (filters.maxPriceM !== null && d.priceDisplay.value !== null && d.priceDisplay.value > filters.maxPriceM * 1e6) return false;
      if (filters.chemistries.length && !filters.chemistries.includes(d.chemistry ?? (d.isIce ? 'ICE' : ''))) return false;
      return true;
    });
  }, [allIds, out, filters]);
}

export function CarPicker() {
  const { out, allIds, selectedIds, flagsById, a } = useEngine();
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const toggleCar = useStore((s) => s.toggleCar);
  const setSelected = useStore((s) => s.setSelected);
  const visible = useFilteredIds();
  const chems = Array.from(new Set(out.derived.map((d) => d.chemistry ?? (d.isIce ? 'ICE' : '')).filter(Boolean)));
  const prices = out.derived.map((d) => d.priceDisplay.value ?? 0);
  const maxPriceM = Math.ceil(Math.max(1, ...prices) / 1e5) / 10;

  return (
    <aside className="rail" aria-label="Cars and filters">
      <div className="panel stack" style={{ gap: 10 }}>
        <div className="row">
          <h3>Cars</h3>
          <span className="spacer" />
          <span className="faint num">
            {selectedIds.filter((id) => visible.includes(id)).length} of {allIds.length}
          </span>
        </div>
        <input
          id="car-search"
          type="search"
          placeholder="Search cars"
          aria-label="Search cars"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
        />
        <ul className="car-list">
          {out.derived.map((d) => {
            const on = selectedIds.includes(d.car.id);
            const hidden = !visible.includes(d.car.id);
            const warnings = (flagsById[d.car.id] ?? []).filter((f) => f.severity === 'warning').length;
            return (
              <li key={d.car.id} style={{ opacity: hidden ? 0.45 : 1 }}>
                <label title={hidden ? 'Hidden by the filters' : undefined}>
                  <input type="checkbox" checked={on} onChange={() => toggleCar(d.car.id, allIds)} />
                  <span className="name">{d.car.name}</span>
                  {warnings > 0 && (
                    <span title={`${warnings} data ${warnings === 1 ? 'warning' : 'warnings'}`} style={{ display: 'inline-flex' }}>
                      <IconWarning size={13} />
                    </span>
                  )}
                  <span className="chip">{d.isIce ? 'ICE' : d.chemistry}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn small" onClick={() => setSelected(null)}>
            All
          </button>
          <button type="button" className="btn small" onClick={() => setSelected([])}>
            None
          </button>
        </div>
      </div>
      <div className="panel stack" style={{ gap: 10 }}>
        <h3>Filters</h3>
        <div className="field">
          <label htmlFor="max-price">
            Price up to{' '}
            <b className="num">{filters.maxPriceM === null ? 'any' : `${filters.maxPriceM.toFixed(1)} M ${a.displayCurrency}`}</b>
          </label>
          <input
            id="max-price"
            type="range"
            min={0.3}
            max={maxPriceM}
            step={0.1}
            value={filters.maxPriceM ?? maxPriceM}
            onChange={(e) => {
              const v = Number(e.target.value);
              setFilters({ maxPriceM: v >= maxPriceM ? null : v });
            }}
            style={{ gridColumn: '1 / -1' }}
          />
        </div>
        <div className="row">
          {chems.map((c) => (
            <label className="check" key={c}>
              <input
                type="checkbox"
                checked={filters.chemistries.length === 0 || filters.chemistries.includes(c)}
                onChange={(e) => {
                  const cur = filters.chemistries.length ? filters.chemistries : chems;
                  const next = e.target.checked ? [...cur, c] : cur.filter((x) => x !== c);
                  setFilters({ chemistries: next.length === chems.length ? [] : next });
                }}
              />
              {c}
            </label>
          ))}
        </div>
        {(filters.search || filters.maxPriceM !== null || filters.chemistries.length > 0) && (
          <button type="button" className="btn small ghost" onClick={() => setFilters({ search: '', maxPriceM: null, chemistries: [] })}>
            Clear filters
          </button>
        )}
      </div>
    </aside>
  );
}
