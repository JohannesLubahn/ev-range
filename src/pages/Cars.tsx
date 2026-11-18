import { useMemo, useState, type ChangeEvent } from 'react';
import { bundledFiles } from '../data/bundled';
import { parseCars } from '../data/parse';
import type { FieldDef } from '../data/types';
import type { DerivedCar, Provenance } from '../engine/derive';
import { fixed, num } from '../format';
import { EMBEDDED } from '../embedded';
import { useEngine } from '../state/engine';
import { useStore } from '../state/store';
import { IconDownload, IconInfo, IconUpload, IconWarning } from '../components/Icons';

interface Cell {
  text: string;
  value: number | null;
  prov?: Provenance;
}
interface SpecRow {
  key: string;
  label: string;
  unit: string;
  better: 'higher' | 'lower' | '';
  calc?: boolean;
  description?: string;
  cells: Record<string, Cell>;
}

const GROUP_ORDER = ['Battery & charging', 'Consumption & range', 'Physics', 'Performance', 'Comfort', 'Costs', 'Identity', 'Notes'];
const SKIP = new Set(['id', 'name']);
const DERIVED_KEYS: Record<string, (d: DerivedCar) => { value: number; prov: Provenance }> = {
  drag_coefficient: (d) => ({ value: d.cd.value, prov: d.cd.provenance }),
  frontal_area_m2: (d) => ({ value: d.frontalAreaM2.value, prov: d.frontalAreaM2.provenance }),
  weight_kg: (d) => ({ value: d.curbMassKg.value, prov: d.curbMassKg.provenance }),
};

function digitsFor(v: number) {
  const a = Math.abs(v);
  return a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4;
}

function unitFor(f: FieldDef, d: DerivedCar): string {
  if (f.unit === 'currency') return d.car.currency;
  if (f.unit.startsWith('currency/')) return `${d.car.currency}/${f.unit.split('/')[1]}`;
  return f.unit;
}

function useRows(ids: string[], showCalc: boolean): { group: string; rows: SpecRow[] }[] {
  const { ds, derivedById, out, a, scenario } = useEngine();
  const settings = useStore((s) => s.settings);
  return useMemo(() => {
    const groups = new Map<string, SpecRow[]>();
    const add = (group: string, row: SpecRow) => {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(row);
    };
    for (const f of ds.fields) {
      if (SKIP.has(f.key)) continue;
      const cells: Record<string, Cell> = {};
      let unit = f.unit;
      for (const id of ids) {
        const d = derivedById[id];
        const derive = DERIVED_KEYS[f.key];
        if (derive) {
          const v = derive(d);
          cells[id] = { text: num(v.value, digitsFor(v.value)), value: v.value, prov: v.prov };
          continue;
        }
        if (f.key === 'heat_pump') {
          cells[id] = d.isIce ? { text: '', value: null } : { text: d.heatPump.value ? 'yes' : 'no', value: null, prov: d.heatPump.provenance };
          continue;
        }
        const raw = d.car.raw[f.key] ?? '';
        const n = f.type === 'number' && raw !== '' ? Number(raw) : null;
        cells[id] = n !== null && Number.isFinite(n) ? { text: num(n, digitsFor(n)), value: n } : { text: raw, value: null };
        if (f.unit.startsWith('currency')) unit = unitFor(f, d);
      }
      add(f.group, { key: f.key, label: f.label, unit: f.unit.startsWith('currency') ? '' : unit, better: f.better, description: f.description, cells });
    }
    // Columns in cars.csv that fields.csv does not describe yet still show up.
    for (const col of ds.carColumns) {
      if (SKIP.has(col) || ds.fields.some((f) => f.key === col)) continue;
      const cells: Record<string, Cell> = {};
      for (const id of ids) cells[id] = { text: derivedById[id].car.raw[col] ?? '', value: null };
      add('Other', { key: col, label: col, unit: '', better: '', description: 'Not described in fields.csv yet', cells });
    }
    if (showCalc) {
      const calc = (group: string, key: string, label: string, unit: string, better: SpecRow['better'], f: (d: DerivedCar) => Cell) => {
        const cells: Record<string, Cell> = {};
        for (const id of ids) cells[id] = f(derivedById[id]);
        add(group, { key, label, unit, better, calc: true, cells });
      };
      const n = (v: number | null, digits?: number, prov?: Provenance): Cell => ({ text: v === null ? '' : num(v, digits ?? digitsFor(v)), value: v, prov });
      calc('Battery & charging', 'c_longterm', 'Long-term capacity', 'kWh', 'higher', (d) => n(d.longTermKwh, 1, d.longTermPct.provenance === 'data' ? 'data' : 'calculated'));
      calc('Battery & charging', 'c_fastkw', 'Fast charging power', 'kW', 'higher', (d) => n(d.fastKw, 1));
      calc('Battery & charging', 'c_slowkw', 'Charging outside the fast window', 'kW', 'higher', (d) => n(d.slowKw, 1));
      calc('Consumption & range', 'c_basis', 'Consumption standard', '', '', (d) => ({ text: d.basis.value, value: null, prov: d.basis.provenance }));
      calc('Consumption & range', 'c_implied', 'Battery ÷ rated range', 'kWh/km', 'lower', (d) => n(d.impliedConsumption, 3));
      if (settings.consumption === 'physics') {
        calc('Consumption & range', 'c_eta', 'Drivetrain efficiency (calibrated)', '%', 'higher', (d) => {
          const m = out.models[d.car.id];
          if (!m || d.consumption.value === null || d.isIce) return { text: '', value: null };
          const cal = m.calibration();
          return { text: `${fixed(cal.etaDrive * 100, 1)}${cal.clamped ? ' (limited)' : ''}`, value: cal.etaDrive * 100 };
        });
        for (const speed of [90, 120]) {
          calc('Consumption & range', `c_v${speed}`, `Driving at ${speed} km/h (steady, no AC)`, `${'kWh'}/100 km`, 'lower', (d) => {
            const m = out.models[d.car.id];
            if (!m || d.consumption.value === null) return { text: '', value: null };
            const seg = m.segment({ label: 'x', distanceKm: 100, avgSpeedKmh: speed, profile: 'steady', usagePct: 0 });
            return n(seg.driveKwh, 1);
          });
        }
        calc('Physics', 'c_onboard', `Onboard power at ${num(scenario.conditions.airTemperatureC, 0)} °C, heating/AC on`, 'kW', 'lower', (d) => {
          const m = out.models[d.car.id];
          if (!m || d.isIce) return { text: '', value: null };
          return n(m.onboard(100).totalKw, 2);
        });
      }
      calc('Performance', 'c_hp', 'Power', 'HP', 'higher', (d) => n(d.powerHp, 0));
      if (ids.some((id) => derivedById[id].car.currency !== a.displayCurrency))
        calc('Costs', 'c_price', `Price in ${a.displayCurrency}`, a.displayCurrency, 'lower', (d) => n(d.priceDisplay.value, 0, d.priceDisplay.provenance));
    }
    const order = [...GROUP_ORDER, 'Other'];
    return [...groups.entries()]
      .sort((x, y) => (order.indexOf(x[0]) + 99 * +(order.indexOf(x[0]) < 0)) - (order.indexOf(y[0]) + 99 * +(order.indexOf(y[0]) < 0)))
      .map(([group, rows]) => ({ group, rows }));
  }, [ds, derivedById, out, ids, showCalc, settings.consumption, a.displayCurrency, scenario.conditions.airTemperatureC]);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CarsPage() {
  const { selectedIds, derivedById, flagsById, allIds } = useEngine();
  const carsCsv = useStore((s) => s.carsCsv);
  const carsCsvName = useStore((s) => s.carsCsvName);
  const loadCarsCsv = useStore((s) => s.loadCarsCsv);
  const resetCarsCsv = useStore((s) => s.resetCarsCsv);
  const [group, setGroup] = useState('All');
  const [showCalc, setShowCalc] = useState(true);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [best, setBest] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ids = selectedIds;
  const groups = useRows(ids, showCalc);
  const warnings = allIds.reduce((s, id) => s + (flagsById[id] ?? []).filter((f) => f.severity === 'warning').length, 0);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const w: string[] = [];
    const { cars, columns } = parseCars(text, w);
    if (!columns.includes('name') || cars.length === 0) {
      setError(`${file.name} has no "name" column or no rows. Use the layout of data/cars.csv (one row per car).`);
      return;
    }
    setError(null);
    loadCarsCsv(text, file.name);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Cars</h1>
          <p className="muted">
            {allIds.length} models from <span className="mono">{carsCsvName ?? 'data/cars.csv'}</span>. Showing the {ids.length} selected cars.
            Edit the CSV (one row per car) to add cars or specs; new columns appear here automatically.
          </p>
        </div>
        <div className="row">
          <label className="btn" htmlFor="csv-file" style={{ cursor: 'pointer' }}>
            <IconUpload /> Load CSV…
          </label>
          <input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} hidden />
          {!EMBEDDED && (
            <button type="button" className="btn" onClick={() => download('cars.csv', carsCsv ?? bundledFiles.cars)}>
              <IconDownload /> Download CSV
            </button>
          )}
          {carsCsv && (
            <button type="button" className="btn ghost" onClick={resetCarsCsv}>
              Use data/cars.csv again
            </button>
          )}
        </div>
      </div>
      {error && <p className="notice">{error}</p>}
      <div className="toolbar">
        <label className="muted" htmlFor="group">
          Group
        </label>
        <select id="group" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option>All</option>
          {groups.map((g) => (
            <option key={g.group}>{g.group}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={showCalc} onChange={(e) => setShowCalc(e.target.checked)} /> Show calculated values
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only rows that differ
        </label>
        <label className="check">
          <input type="checkbox" checked={best} onChange={(e) => setBest(e.target.checked)} /> Highlight best
        </label>
      </div>
      <div className="table-scroll" style={{ maxHeight: '70vh' }}>
        <table className="spec-table">
          <thead>
            <tr>
              <th scope="col">Spec</th>
              {ids.map((id) => (
                <th scope="col" key={id}>
                  {derivedById[id].car.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups
              .filter((g) => group === 'All' || g.group === group)
              .map((g) => {
                const rows = g.rows.filter((r) => !onlyDiff || new Set(ids.map((id) => r.cells[id]?.text ?? '')).size > 1);
                if (!rows.length) return null;
                return [
                  <tr className="group" key={`g-${g.group}`}>
                    <td colSpan={ids.length + 1}>{g.group}</td>
                  </tr>,
                  ...rows.map((r) => {
                    const vals = ids.map((id) => r.cells[id]?.value).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
                    const bestVal = best && r.better && vals.length > 1 ? (r.better === 'higher' ? Math.max(...vals) : Math.min(...vals)) : null;
                    return (
                      <tr key={r.key}>
                        <td title={r.description}>
                          {r.label}
                          {r.unit && <span className="unit">{r.unit}</span>}
                          {r.calc && (
                            <span className="chip" style={{ marginLeft: 6 }}>
                              calc
                            </span>
                          )}
                        </td>
                        {ids.map((id) => {
                          const c = r.cells[id];
                          const isBest = bestVal !== null && c?.value === bestVal;
                          return (
                            <td key={id} className={`num ${isBest ? 'best' : ''}`}>
                              {c && c.text !== '' ? c.text : <span className="faint">–</span>}
                              {c?.prov === 'estimated' && c.text !== '' && (
                                <span className="chip est" style={{ marginLeft: 6 }}>
                                  est.
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }),
                ];
              })}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: 12.5 }}>
        calc = calculated from other values · est. = estimated (missing in cars.csv) · ★ = best of the shown cars · – = missing
      </p>
      <section className="panel stack" aria-labelledby="data-check">
        <div className="row">
          <h2 id="data-check">Data check</h2>
          <span className="chip warn">{warnings} warnings</span>
        </div>
        <p className="muted">Missing, estimated or suspicious values per car. Fix them in data/cars.csv; the app reloads when you save.</p>
        <div className="stack" style={{ gap: 6 }}>
          {allIds.map((id) => {
            const flags = flagsById[id] ?? [];
            if (!flags.length) return null;
            const w = flags.filter((f) => f.severity === 'warning');
            return (
              <details key={id} open={w.length > 0}>
                <summary>
                  <b>{derivedById[id].car.name}</b>{' '}
                  <span className="faint">
                    {w.length} {w.length === 1 ? 'warning' : 'warnings'}, {flags.length - w.length} {flags.length - w.length === 1 ? 'note' : 'notes'}
                  </span>
                </summary>
                <ul className="flags" style={{ margin: '6px 0 8px 4px' }}>
                  {flags.map((f, i) => (
                    <li key={i}>
                      {f.severity === 'warning' ? <IconWarning size={14} /> : <IconInfo size={14} className="faint" />}
                      <span className={f.severity === 'warning' ? '' : 'muted'}>{f.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
