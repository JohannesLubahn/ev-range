import type { CarResults } from '../engine/types';
import { compact, fixed, hours, num, plural } from '../format';
import { useEngine } from '../state/engine';
import { useStore, type CaseKey, type SortKey } from '../state/store';
import { PassFail } from './Status';

type CapKey = 'trafficJam' | 'noCharger' | 'sprint';

export function sortIds(ids: string[], results: Record<string, CarResults>, names: Record<string, string>, key: SortKey, dir: 1 | -1): string[] {
  const val = (id: string): number | null => {
    const r = results[id];
    if (!r) return null;
    switch (key) {
      case 'overall':
        return -(r.passCount * 1e6) + (r.cost.costPerKm ?? 1e5);
      case 'trafficJam':
      case 'noCharger':
      case 'sprint':
        return -r[key].margin;
      case 'batteryLife':
        return r.batteryLife.margin === null ? null : -r.batteryLife.margin;
      case 'longTrip':
        return r.longTrip.tripTimeH;
      case 'cost':
        return r.cost.costPerKm;
      default:
        return null;
    }
  };
  return [...ids].sort((x, y) => {
    if (key === 'name') return dir * names[x].localeCompare(names[y]);
    const a = val(x);
    const b = val(y);
    if (a === null || !Number.isFinite(a)) return 1;
    if (b === null || !Number.isFinite(b)) return -1;
    return dir * (a - b);
  });
}

function CapacityCell({ id, k, r, unit }: { id: string; k: CapKey; r: CarResults; unit: string }) {
  const open = useStore((s) => s.openDrawer);
  const c = r[k];
  return (
    <button type="button" className={`cell-btn ${c.pass ? 'good' : 'bad'}`} onClick={() => open(id, k)}>
      <PassFail pass={c.pass} margin={c.margin} />
      <span className="detail">
        {fixed(c.requiredKwh, 0)} / {fixed(c.availableKwh, 0)} {unit}
      </span>
    </button>
  );
}

function LifeCell({ id, r }: { id: string; r: CarResults }) {
  const open = useStore((s) => s.openDrawer);
  const b = r.batteryLife;
  return (
    <button type="button" className={`cell-btn ${b.pass === null ? '' : b.pass ? 'good' : 'bad'}`} onClick={() => open(id, 'batteryLife')}>
      <PassFail pass={b.pass} margin={b.margin} />
      <span className="detail">
        {num(b.cyclesRequired, 0)} / {num(b.cyclesAvailable, 0)} cycles
      </span>
    </button>
  );
}

function MetricCell({ id, k, text, detail, frac }: { id: string; k: CaseKey; text: string; detail: string; frac: number | null }) {
  const open = useStore((s) => s.openDrawer);
  return (
    <button type="button" className="cell-btn" onClick={() => open(id, k)}>
      <span className="num">{text}</span>
      <span className="detail">{detail}</span>
      {frac !== null && (
        <span className="mini-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(3, frac * 100)}%` }} />
        </span>
      )}
    </button>
  );
}

const COLUMNS: { key: SortKey; label: string; sub: (s: ReturnType<typeof useEngine>['scenario']) => string }[] = [
  { key: 'trafficJam', label: 'Traffic jam', sub: (s) => `${s.trafficJam.timeJamH} h jam` },
  { key: 'noCharger', label: 'No charger', sub: (s) => `${s.noCharger.distanceKm} km` },
  { key: 'sprint', label: 'Sprint', sub: (s) => `${s.sprint.distanceKm} km @ ${s.sprint.speedKmh}` },
  { key: 'longTrip', label: 'Long trip', sub: (s) => `${s.longTrip.distanceKm} km` },
  { key: 'batteryLife', label: 'Battery life', sub: (s) => `${s.batteryLife.years} years` },
  { key: 'cost', label: 'Cost', sub: () => 'per km' },
];

export function ScoreTable({ ids }: { ids: string[] }) {
  const { out, scenario, derivedById, a, stale } = useEngine();
  const sort = useStore((s) => s.sort);
  const setSort = useStore((s) => s.setSort);
  const tripMax = Math.max(1e-9, ...ids.map((id) => out.results[id]?.longTrip.tripTimeH ?? 0).filter(Number.isFinite));
  const costMax = Math.max(1e-9, ...ids.map((id) => out.results[id]?.cost.costPerKm ?? 0).filter(Number.isFinite));
  const arrow = (k: SortKey) => (sort.key === k ? (sort.dir === 1 ? ' ↓' : ' ↑') : '');
  return (
    <div className={`table-scroll ${stale ? 'stale' : ''}`}>
      <table className="score-table">
        <thead>
          <tr>
            <th scope="col">
              <button type="button" onClick={() => setSort('name')}>
                Car{arrow('name')}
              </button>
            </th>
            <th scope="col">
              <button type="button" onClick={() => setSort('overall')} title="Checks passed, then cost per km">
                Pass{arrow('overall')}
                <span className="sub">of 4</span>
              </button>
            </th>
            {COLUMNS.map((c) => (
              <th scope="col" key={c.key}>
                <button type="button" onClick={() => setSort(c.key)}>
                  {c.label}
                  {arrow(c.key)}
                  <span className="sub">{c.sub(scenario)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const d = derivedById[id];
            const r = out.results[id];
            const unit = d.energyUnit;
            return (
              <tr key={id}>
                <td className="carname">
                  <div className="row" style={{ gap: 6 }}>
                    <b>{d.car.name}</b>
                    <span className="chip">{d.isIce ? 'ICE' : d.chemistry}</span>
                  </div>
                  <span className="faint num" style={{ fontSize: 12 }}>
                    {d.priceDisplay.value !== null ? `${compact(d.priceDisplay.value)} ${a.displayCurrency}` : 'no price'} · {fixed(d.batteryKwh, 1)} {unit}
                  </span>
                </td>
                {!r ? (
                  <td colSpan={7} className="faint">
                    Not calculated: consumption or battery data missing (see Cars → Data check)
                  </td>
                ) : (
                  <>
                    <td>
                      <span className="pass-count">
                        {r.passCount}/{r.checkCount}
                      </span>
                    </td>
                    <td className="cell">
                      <CapacityCell id={id} k="trafficJam" r={r} unit={unit} />
                    </td>
                    <td className="cell">
                      <CapacityCell id={id} k="noCharger" r={r} unit={unit} />
                    </td>
                    <td className="cell">
                      <CapacityCell id={id} k="sprint" r={r} unit={unit} />
                    </td>
                    <td className="cell">
                      <MetricCell
                        id={id}
                        k="longTrip"
                        text={hours(r.longTrip.tripTimeH)}
                        detail={`${plural(r.longTrip.stops, "stop", "stops")} · ${hours(r.longTrip.timeChargingH)} charging`}
                        frac={Number.isFinite(r.longTrip.tripTimeH) ? r.longTrip.tripTimeH / tripMax : null}
                      />
                    </td>
                    <td className="cell">
                      <LifeCell id={id} r={r} />
                    </td>
                    <td className="cell">
                      <MetricCell
                        id={id}
                        k="cost"
                        text={r.cost.costPerKm === null ? '–' : fixed(r.cost.costPerKm, 2)}
                        detail={r.cost.tco === null ? 'price missing' : `${compact(r.cost.tco)} total`}
                        frac={r.cost.costPerKm === null ? null : r.cost.costPerKm / costMax}
                      />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ScoreCards({ ids }: { ids: string[] }) {
  const { out, derivedById, a, stale } = useEngine();
  return (
    <div className={`cards ${stale ? 'stale' : ''}`}>
      {ids.map((id) => {
        const d = derivedById[id];
        const r = out.results[id];
        return (
          <article key={id} className="panel car-card">
            <div className="row">
              <h3>{d.car.name}</h3>
              <span className="chip">{d.isIce ? 'ICE' : d.chemistry}</span>
              <span className="spacer" />
              {r && (
                <span className="pass-count">
                  {r.passCount}/{r.checkCount}
                </span>
              )}
            </div>
            <span className="faint num" style={{ fontSize: 12 }}>
              {d.priceDisplay.value !== null ? `${compact(d.priceDisplay.value)} ${a.displayCurrency}` : 'no price'} · {fixed(d.batteryKwh, 1)} {d.energyUnit}
            </span>
            {!r ? (
              <p className="faint">Not calculated: data missing</p>
            ) : (
              <div className="checks">
                <CapacityCell id={id} k="trafficJam" r={r} unit={d.energyUnit} />
                <CapacityCell id={id} k="noCharger" r={r} unit={d.energyUnit} />
                <CapacityCell id={id} k="sprint" r={r} unit={d.energyUnit} />
                <MetricCell id={id} k="longTrip" text={`Trip ${hours(r.longTrip.tripTimeH)}`} detail={plural(r.longTrip.stops, "stop", "stops")} frac={null} />
                <LifeCell id={id} r={r} />
                <MetricCell
                  id={id}
                  k="cost"
                  text={r.cost.costPerKm === null ? 'Cost –' : `${fixed(r.cost.costPerKm, 2)} ${a.displayCurrency}/km`}
                  detail={r.cost.tco === null ? 'price missing' : `${compact(r.cost.tco)} total`}
                  frac={null}
                />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
