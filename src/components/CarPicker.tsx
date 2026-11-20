import { useEffect, useRef } from 'react';
import type { DerivedCar } from '../engine/derive';
import { marketCostInputs } from '../engine/inputs';
import { compact } from '../format';
import {
  ALL_MARKETS,
  EMPTY_FILTERS,
  filterOptions,
  hasFilters,
  inMarket,
  LIST_GROUPS,
  LIST_SORTS,
  listCars,
  type ListGroupKey,
  type ListModel,
  type ListSortKey,
  variantLabel,
} from '../state/carList';
import { useEngine } from '../state/engine';
import { useStore } from '../state/store';
import { IconClose, IconWarning } from './Icons';

/** Ticks or unticks a set of cars (a group, a model's variants, or every car shown). */
function useTick() {
  const { allIds } = useEngine();
  const selected = useStore((s) => s.selectedIds);
  const setSelected = useStore((s) => s.setSelected);
  return (ids: string[], on: boolean) => {
    const cur = selected ?? allIds;
    const next = on ? Array.from(new Set([...cur, ...ids])) : cur.filter((id) => !ids.includes(id));
    setSelected(next.length === allIds.length && allIds.every((id) => next.includes(id)) ? null : next);
  };
}

function TriCheckbox({ ids, ticked, label, onChange }: { ids: string[]; ticked: Set<string>; label: string; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const n = ids.filter((id) => ticked.has(id)).length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = n > 0 && n < ids.length;
  }, [n, ids.length]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={n === ids.length && n > 0} onChange={() => onChange(n < ids.length)} />;
}

function CarRow({ d, label, ticked, onToggle }: { d: DerivedCar; label: string; ticked: boolean; onToggle: () => void }) {
  const { flagsById } = useEngine();
  const warnings = (flagsById[d.car.id] ?? []).filter((f) => f.severity === 'warning').length;
  return (
    <li>
      <label title={d.car.name}>
        <input type="checkbox" checked={ticked} onChange={onToggle} />
        <span className="name">{label}</span>
        {warnings > 0 && (
          <span title={`${warnings} data ${warnings === 1 ? 'warning' : 'warnings'}`} style={{ display: 'inline-flex' }}>
            <IconWarning size={13} />
          </span>
        )}
        <span className="price num faint">{d.priceDisplay.value === null ? '–' : compact(d.priceDisplay.value)}</span>
        <span className="chip">{d.isIce ? 'ICE' : d.chemistry}</span>
      </label>
    </li>
  );
}

function ModelRows({ m, ticked, tick }: { m: ListModel; ticked: Set<string>; tick: (ids: string[], on: boolean) => void }) {
  if (m.cars.length === 1) {
    const d = m.cars[0];
    return <CarRow d={d} label={d.car.name} ticked={ticked.has(d.car.id)} onToggle={() => tick([d.car.id], !ticked.has(d.car.id))} />;
  }
  const ids = m.cars.map((d) => d.car.id);
  return (
    <li className="model">
      <label>
        <TriCheckbox ids={ids} ticked={ticked} label={`All variants of ${m.label}`} onChange={(on) => tick(ids, on)} />
        <span className="name">{m.label}</span>
        <span className="faint">{m.cars.length} variants</span>
      </label>
      <ul className="car-list variants">
        {m.cars.map((d) => (
          <CarRow key={d.car.id} d={d} label={variantLabel(d)} ticked={ticked.has(d.car.id)} onToggle={() => tick([d.car.id], !ticked.has(d.car.id))} />
        ))}
      </ul>
    </li>
  );
}

function ToggleChips({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  if (options.length < 2) return null;
  return (
    <div className="chip-row" role="group" aria-label={label}>
      <span className="faint">{label}</span>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" className="chip-toggle" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** The car list: market, search, sort, group, filters and the cars to tick. In the rail on Compare, in a drawer elsewhere. */
export function CarPickerContent() {
  const { out, ds, a, marketId, shownIds, tickedIds: selectedIds, hiddenSelectedCount, assumptionsFor } = useEngine();
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const listSort = useStore((s) => s.listSort);
  const setListSort = useStore((s) => s.setListSort);
  const listGroup = useStore((s) => s.listGroup);
  const setListGroup = useStore((s) => s.setListGroup);
  const setMarket = useStore((s) => s.setMarket);
  const tick = useTick();

  const inMarketCount = out.derived.filter((d) => inMarket(d, marketId)).length;
  const opts = filterOptions(out.derived, marketId);
  const shown = new Set(shownIds);
  const groups = listCars(
    out.derived.filter((d) => shown.has(d.car.id)),
    listSort,
    listGroup,
    a.displayCurrency,
  );
  const ticked = new Set(selectedIds);
  const sortMeta = LIST_SORTS.find((s) => s.id === listSort.key) ?? LIST_SORTS[0];
  const dirLabel = listSort.key === 'model' ? (listSort.dir === 1 ? 'A–Z' : 'Z–A') : listSort.dir === 1 ? 'low → high' : 'high → low';
  const seatOptions = opts.seats.filter((s) => s > Math.min(...opts.seats));

  return (
    <div className="stack picker" style={{ gap: 12 }}>
      <div className="panel stack" style={{ gap: 10 }}>
        <div className="row">
          <h3>Cars</h3>
          <span className="spacer" />
          <span className="faint num">
            {selectedIds.length} of {inMarketCount} ticked
          </span>
        </div>
        <div className="picker-controls">
          <label htmlFor="market" className="muted">
            Market
          </label>
          <select
            id="market"
            value={marketId}
            onChange={(e) => {
              const id = e.target.value;
              setMarket(id, marketCostInputs(assumptionsFor(id)));
            }}
          >
            {ds.markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.currency})
              </option>
            ))}
            <option value={ALL_MARKETS}>All markets (in {assumptionsFor(ALL_MARKETS).displayCurrency})</option>
          </select>
          <label htmlFor="list-sort" className="muted">
            Sort
          </label>
          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <select
              id="list-sort"
              value={listSort.key}
              onChange={(e) => {
                const key = e.target.value as ListSortKey;
                setListSort({ key, dir: LIST_SORTS.find((s) => s.id === key)?.dir ?? 1 });
              }}
              style={{ flex: 1 }}
            >
              {LIST_SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small"
              onClick={() => setListSort({ ...listSort, dir: listSort.dir === 1 ? -1 : 1 })}
              aria-label={`${sortMeta.label}: ${dirLabel}. Reverse the order`}
              title="Reverse the order"
            >
              {listSort.dir === 1 ? '↑' : '↓'} {dirLabel}
            </button>
          </span>
          <label htmlFor="list-group" className="muted">
            Group
          </label>
          <select id="list-group" value={listGroup} onChange={(e) => setListGroup(e.target.value as ListGroupKey)}>
            {LIST_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <input
          id="car-search"
          type="search"
          placeholder="Search brand or model"
          aria-label="Search cars"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
        />
        <div className="car-groups">
          {groups.length === 0 && <p className="faint">No cars match. Clear the filters or pick another market.</p>}
          {groups.map((g) => {
            const n = g.ids.filter((id) => ticked.has(id)).length;
            return (
              <section key={g.key} className="car-group" aria-label={g.label || 'Cars'}>
                {g.label && (
                  <div className="car-group-head">
                    <TriCheckbox ids={g.ids} ticked={ticked} label={`All cars in ${g.label}`} onChange={(on) => tick(g.ids, on)} />
                    <b>{g.label}</b>
                    <span className="faint num">
                      {n} of {g.ids.length}
                    </span>
                  </div>
                )}
                <ul className="car-list">
                  {g.models.map((m) => (
                    <ModelRows key={m.key} m={m} ticked={ticked} tick={tick} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn small" onClick={() => tick(shownIds, true)}>
            Tick all shown
          </button>
          <button type="button" className="btn small" onClick={() => tick(shownIds, false)}>
            None
          </button>
          <span className="spacer" />
          {hiddenSelectedCount > 0 && (
            <span className="faint">
              {hiddenSelectedCount} ticked {hiddenSelectedCount === 1 ? 'car is' : 'cars are'} hidden by the filters
            </span>
          )}
        </div>
      </div>
      <div className="panel stack" style={{ gap: 10 }}>
        <h3>Filters</h3>
        <ToggleChips label="Body" options={opts.bodyTypes} value={filters.bodyTypes} onChange={(v) => setFilters({ bodyTypes: v })} />
        <ToggleChips label="Battery" options={opts.chemistries} value={filters.chemistries} onChange={(v) => setFilters({ chemistries: v })} />
        {seatOptions.length > 0 && (
          <div className="chip-row" role="group" aria-label="Seats">
            <span className="faint">Seats</span>
            <button type="button" className="chip-toggle" aria-pressed={filters.minSeats === null} onClick={() => setFilters({ minSeats: null })}>
              any
            </button>
            {seatOptions.map((s) => (
              <button key={s} type="button" className="chip-toggle" aria-pressed={filters.minSeats === s} onClick={() => setFilters({ minSeats: s })}>
                {s}+
              </button>
            ))}
          </div>
        )}
        <div className="price-range">
          <span className="faint">Price, {a.displayCurrency}</span>
          <input
            type="number"
            aria-label={`Price from (${a.displayCurrency})`}
            placeholder="from"
            min={0}
            step={priceStep(opts.priceMax)}
            value={filters.priceMin ?? ''}
            onChange={(e) => setFilters({ priceMin: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <span className="faint">–</span>
          <input
            type="number"
            aria-label={`Price up to (${a.displayCurrency})`}
            placeholder={opts.priceMax === null ? 'to' : compact(opts.priceMax)}
            min={0}
            step={priceStep(opts.priceMax)}
            value={filters.priceMax ?? ''}
            onChange={(e) => setFilters({ priceMax: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
        {hasFilters(filters) && (
          <button type="button" className="btn small ghost" onClick={() => setFilters(EMPTY_FILTERS)} style={{ alignSelf: 'flex-start' }}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/** Step of the price fields: a round number about a fiftieth of the dearest car. */
function priceStep(max: number | null): number {
  if (!max || max <= 0) return 1;
  return 10 ** Math.floor(Math.log10(max / 50));
}

/** Left rail on Compare. */
export function CarPicker() {
  return (
    <aside className="rail" aria-label="Cars and filters">
      <CarPickerContent />
    </aside>
  );
}

/** "Cars · 8 · Thailand": opens the car list in a drawer (pages other than Compare). */
export function CarsButton() {
  const { tickedIds: selectedIds, market } = useEngine();
  const setOpen = useStore((s) => s.setPickerOpen);
  return (
    <button type="button" className="btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
      Cars · <span className="num">{selectedIds.length}</span> · {market ? market.name : 'All markets'}
    </button>
  );
}

export function CarPickerDrawer() {
  const open = useStore((s) => s.pickerOpen);
  const setOpen = useStore((s) => s.setPickerOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={() => setOpen(false)} />
      <section className="drawer picker-drawer" role="dialog" aria-modal="true" aria-label="Cars">
        <div className="drawer-head">
          <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <h2>Cars</h2>
            <p className="muted">Every page compares the ticked cars that the market and filters show.</p>
          </div>
          <button ref={closeRef} type="button" className="btn ghost" onClick={() => setOpen(false)} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="drawer-body">
          <CarPickerContent />
        </div>
      </section>
    </>
  );
}
