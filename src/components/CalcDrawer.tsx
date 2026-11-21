import { useEffect, useRef } from 'react';
import { CASES } from '../caseMeta';
import { YEARS_UNTIL_EOL_MAX } from '../engine/cases';
import type { AverageConsumption, CapacityCheck, CarResults, Step } from '../engine/types';
import { fixed, hours, lifeYears, money, num, plural } from '../format';
import { useEngine } from '../state/engine';
import { useStore, type CaseKey } from '../state/store';
import { IconClose, IconInfo, IconWarning } from './Icons';
import { CapacityLeft, PassFail } from './Status';

function StepsTable({ steps }: { steps: Step[] }) {
  return (
    <table className="steps">
      <tbody>
        {steps.map((s, i) => (
          <tr key={i} className={s.kind ?? ''}>
            <td className="label">{s.label}</td>
            <td className="formula">{s.formula}</td>
            <td className="value">
              {s.value === null ? '' : `${num(s.value, Math.abs(s.value) >= 100 ? 0 : Math.abs(s.value) >= 1 ? 2 : 4)} ${s.unit}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "18.4 kWh/100 km on average", or nothing without a distance. */
function averageText(avg: AverageConsumption, unit: string): string {
  return Number.isFinite(avg.total) ? ` · ${fixed(avg.total, 1)} ${unit}/100 km on average` : '';
}

function CapacitySummary({ r, unit, howFar }: { r: CapacityCheck; unit: string; howFar: string }) {
  const max = Math.max(r.requiredKwh, r.availableKwh, 1e-9) * 1.04;
  const w = (v: number) => `${Math.min(100, (Math.max(0, Number.isFinite(v) ? v : max) / max) * 100)}%`;
  const short = r.requiredKwh - r.availableKwh;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="bars compact">
        <span className="label">Needed</span>
        <div className="track">
          <span className="bar" style={{ width: w(r.requiredKwh) }} />
        </div>
        <span className="value">
          {fixed(r.requiredKwh, 1)} {unit}
        </span>
        <span className="label">Available</span>
        <div className="track">
          <span className="bar" style={{ width: w(r.availableKwh), background: 'var(--line-strong)' }} />
        </div>
        <span className="value">
          {fixed(r.availableKwh, 1)} {unit}
        </span>
      </div>
      <div className="row">
        <PassFail pass={r.pass} margin={r.margin} />
        <span className="muted">
          {r.pass ? `${fixed(-short, 1)} ${unit} spare` : `${fixed(short, 1)} ${unit} short`} · {howFar}
          {averageText(r.average, unit)}
        </span>
      </div>
    </div>
  );
}

function summaryFor(key: CaseKey, r: CarResults, unit: string, currency: string) {
  switch (key) {
    case 'trafficJam':
      return <CapacitySummary r={r.trafficJam} unit={unit} howFar={`lasts up to ${fixed(r.trafficJam.maxJamHours, 1)} h in the jam`} />;
    case 'noCharger':
      return <CapacitySummary r={r.noCharger} unit={unit} howFar={`reaches about ${num(r.noCharger.maxDistanceKm, 0)} km`} />;
    case 'sprint':
      return <CapacitySummary r={r.sprint} unit={unit} howFar={`reaches about ${num(r.sprint.maxDistanceKm, 0)} km at this speed`} />;
    case 'batteryLife': {
      const b = r.batteryLife;
      if (b.pass === null) {
        // Not judged: no traction battery (petrol car), or no rated cycles / chemistry.
        return (
          <div className="row">
            <PassFail pass={null} margin={null} />
            <span className="muted">
              {unit === 'l' ? 'Petrol car: no traction battery to wear out' : 'Not judged: rated cycles or chemistry missing in cars.csv'}
              {averageText(b.average, unit)}
            </span>
          </div>
        );
      }
      return (
        <div className="row">
          <CapacityLeft pct={b.capacityEndPct} />
          <span className="muted">
            {fixed(b.eolPct, 0)} % reached in {lifeYears(b.yearsUntilEol, YEARS_UNTIL_EOL_MAX)} ·{' '}
            {num(b.cyclesRequired, 0)} of {num(b.cyclesAvailable, 0)} rated cycles used
            {averageText(b.average, unit)}
          </span>
        </div>
      );
    }
    case 'longTrip': {
      const t = r.longTrip;
      return (
        <div className="row">
          <b className="num" style={{ fontSize: 20 }}>{hours(t.tripTimeH)}</b>
          <span className="muted">
            {hours(t.timeDrivingH)} driving + {hours(t.timeChargingH)} charging ({plural(t.stops, "stop", "stops")}, {fixed(t.chargingSharePct, 0)} %)
            {averageText(t.average, unit)}
          </span>
        </div>
      );
    }
    case 'cost': {
      const c = r.cost;
      return (
        <div className="row">
          <b className="num" style={{ fontSize: 20 }}>{c.costPerKm === null ? '–' : `${fixed(c.costPerKm, 2)} ${currency}/km`}</b>
          <span className="muted">total {money(c.tco, currency)}</span>
        </div>
      );
    }
  }
}

export function CalcDrawer() {
  const drawer = useStore((s) => s.drawer);
  const close = useStore((s) => s.closeDrawer);
  const { out, derivedById, flagsById, a } = useEngine();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawer) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, close]);

  if (!drawer) return null;
  const r = out.results[drawer.carId];
  const d = derivedById[drawer.carId];
  const meta = CASES.find((c) => c.key === drawer.caseKey);
  if (!d || !meta) return null;
  const unit = d.energyUnit;
  const caseResult = r ? r[drawer.caseKey] : null;
  const steps = caseResult?.steps ?? [];
  const warnings = caseResult?.warnings ?? [];
  const flags = flagsById[d.car.id] ?? [];

  return (
    <>
      <div className="backdrop" onClick={close} />
      <section className="drawer" role="dialog" aria-modal="true" aria-label={`${d.car.name}: ${meta.label}`}>
        <div className="drawer-head">
          <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <span className="eyebrow">{meta.label}</span>
            <h2>{d.car.name}</h2>
            <p className="muted">{meta.question}</p>
          </div>
          <button ref={closeRef} type="button" className="btn ghost" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="drawer-body">
          {!r && <p className="notice">This car cannot be calculated: consumption or battery data is missing.</p>}
          {r && summaryFor(drawer.caseKey, r, unit, a.displayCurrency)}
          {warnings.map((w) => (
            <p key={w} className="notice">
              {w}
            </p>
          ))}
          {steps.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h3>How it is calculated</h3>
              <StepsTable steps={steps} />
            </div>
          )}
          {flags.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h3>Data notes for this car</h3>
              <ul className="flags">
                {flags.map((f, i) => (
                  <li key={i}>
                    {f.severity === 'warning' ? <IconWarning size={14} /> : <IconInfo size={14} className="faint" />}
                    <span className={f.severity === 'warning' ? '' : 'muted'}>{f.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
