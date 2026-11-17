import type { ReactNode } from 'react';
import { CASES } from '../caseMeta';
import { BulletRows, StackedRows, TipLines, type BulletRow, type StackedRow } from '../components/Bars';
import { ConditionsPanel, PresetPicker } from '../components/Conditions';
import { NumberField, SelectField } from '../components/Fields';
import { PassFail } from '../components/Status';
import { PROFILES, type CapacityCheck, type CarResults, type Profile, type Scenario } from '../engine/types';
import { compact, fixed, hours, money, num, plural, signedPct } from '../format';
import { useEngine } from '../state/engine';
import { useStore, type CaseKey } from '../state/store';

const profileOptions = PROFILES.filter((p) => p.id !== 'jam').map((p) => ({ id: p.id, label: p.label, description: p.description }));

function Inputs({ tab, scenario, set, physics }: { tab: CaseKey; scenario: Scenario; set: (s: Scenario) => void; physics: boolean }) {
  const usageLabel = physics ? 'Cabin AC / heating' : 'Onboard systems';
  switch (tab) {
    case 'trafficJam': {
      const i = scenario.trafficJam;
      const u = (p: Partial<typeof i>) => set({ ...scenario, trafficJam: { ...i, ...p } });
      return (
        <div className="fields">
          <NumberField label="Charge at the start" unit="%" min={5} max={100} value={i.startPct} onChange={(v) => u({ startPct: v })} />
          <NumberField label="Charge left at the end" unit="%" min={0} max={50} value={i.endPct} onChange={(v) => u({ endPct: v })} />
          <NumberField label="Time in the jam" unit="h" min={0.5} max={24} step={0.5} value={i.timeJamH} onChange={(v) => u({ timeJamH: v })} />
          <NumberField label="Distance in the jam" unit="km" min={0} max={50} value={i.distJamKm} onChange={(v) => u({ distJamKm: v })} />
          <NumberField label="Distance before the jam" unit="km" min={0} max={200} value={i.distBeforeKm} onChange={(v) => u({ distBeforeKm: v })} />
          <NumberField label="Distance after the jam" unit="km" min={0} max={200} value={i.distAfterKm} onChange={(v) => u({ distAfterKm: v })} />
          <NumberField label="Average speed outside the jam" unit="km/h" min={10} max={130} value={i.speedOutsideKmh} onChange={(v) => u({ speedOutsideKmh: v })} />
          {physics && <SelectField label="Driving outside the jam" value={i.profileOutside} options={profileOptions} onChange={(v: Profile) => u({ profileOutside: v })} />}
          <NumberField label={`${usageLabel} outside the jam`} unit="%" min={0} max={100} value={i.usageOutsidePct} onChange={(v) => u({ usageOutsidePct: v })} />
          <NumberField label={`${usageLabel} in the jam`} unit="%" min={0} max={100} value={i.usageJamPct} onChange={(v) => u({ usageJamPct: v })} />
        </div>
      );
    }
    case 'noCharger':
    case 'sprint': {
      const i = scenario[tab];
      const u = (p: Partial<typeof i>) => set({ ...scenario, [tab]: { ...i, ...p } });
      return (
        <div className="fields">
          <NumberField label="Distance between chargers" unit="km" min={10} max={1000} sliderMax={600} step={5} value={i.distanceKm} onChange={(v) => u({ distanceKm: v })} />
          <NumberField label="Average speed" unit="km/h" min={10} max={200} value={i.speedKmh} onChange={(v) => u({ speedKmh: v })} />
          {physics && <SelectField label="Driving profile" value={i.profile} options={profileOptions} onChange={(v: Profile) => u({ profile: v })} />}
          {physics && <NumberField label="Net climb (negative = descent)" unit="m" min={-2000} max={3000} step={50} value={i.climbM} onChange={(v) => u({ climbM: v })} />}
          <NumberField label="Charge at the start" unit="%" min={10} max={100} value={i.startPct} onChange={(v) => u({ startPct: v })} />
          <NumberField label="Charge on arrival" unit="%" min={0} max={50} value={i.endPct} onChange={(v) => u({ endPct: v })} />
          <NumberField label={usageLabel} unit="%" min={0} max={100} value={i.usagePct} onChange={(v) => u({ usagePct: v })} />
        </div>
      );
    }
    case 'longTrip': {
      const i = scenario.longTrip;
      const u = (p: Partial<typeof i>) => set({ ...scenario, longTrip: { ...i, ...p } });
      return (
        <div className="fields">
          <NumberField label="Trip distance" unit="km" min={50} max={3000} sliderMax={2000} step={10} value={i.distanceKm} onChange={(v) => u({ distanceKm: v })} />
          <NumberField label="Average speed" unit="km/h" min={20} max={150} value={i.speedKmh} onChange={(v) => u({ speedKmh: v })} />
          {physics && <SelectField label="Driving profile" value={i.profile} options={profileOptions} onChange={(v: Profile) => u({ profile: v })} />}
          <NumberField label="Charge from" unit="%" min={0} max={90} value={i.chargeFromPct} onChange={(v) => u({ chargeFromPct: v })} />
          <NumberField label="Charge to" unit="%" min={20} max={100} value={i.chargeToPct} onChange={(v) => u({ chargeToPct: v })} />
          <NumberField label={`${usageLabel} while driving`} unit="%" min={0} max={100} value={i.usageDrivingPct} onChange={(v) => u({ usageDrivingPct: v })} />
          <NumberField label={`${usageLabel} while charging`} unit="%" min={0} max={100} value={i.usageChargingPct} onChange={(v) => u({ usageChargingPct: v })} />
        </div>
      );
    }
    case 'batteryLife': {
      const i = scenario.batteryLife;
      const u = (p: Partial<typeof i>) => set({ ...scenario, batteryLife: { ...i, ...p } });
      return (
        <div className="fields">
          <NumberField label="Years of use" unit="years" min={1} max={40} value={i.years} onChange={(v) => u({ years: v })} />
          <NumberField label="Distance per year" unit="km" min={1000} max={80000} sliderMax={50000} step={500} value={i.kmPerYear} onChange={(v) => u({ kmPerYear: v })} />
          <NumberField label="Average speed" unit="km/h" min={10} max={120} value={i.speedKmh} onChange={(v) => u({ speedKmh: v })} />
          {physics && <SelectField label="Driving profile" value={i.profile} options={profileOptions} onChange={(v: Profile) => u({ profile: v })} />}
          <NumberField label={usageLabel} unit="%" min={0} max={100} value={i.usagePct} onChange={(v) => u({ usagePct: v })} />
        </div>
      );
    }
    case 'cost': {
      const i = scenario.cost;
      const u = (p: Partial<typeof i>) => set({ ...scenario, cost: { ...i, ...p } });
      return (
        <div className="fields">
          <NumberField label="Electricity price" unit="/kWh" min={0} max={40} step={0.1} value={i.energyPrice} onChange={(v) => u({ energyPrice: v })} />
          <NumberField label="Maintenance per year" unit="/year" min={0} max={100000} sliderMax={40000} step={500} value={i.maintenancePerYear} onChange={(v) => u({ maintenancePerYear: v })} />
          <p className="faint">
            Years and distance come from the Battery life tab ({scenario.batteryLife.years} years × {num(scenario.batteryLife.kmPerYear, 0)} km). Cars
            with their own energy price or maintenance in cars.csv keep those.
          </p>
        </div>
      );
    }
  }
}

function capacityRows(key: 'trafficJam' | 'noCharger' | 'sprint', ids: string[], results: Record<string, CarResults>, names: Record<string, string>, open: (id: string) => void): BulletRow[] {
  return ids
    .filter((id) => results[id])
    .sort((x, y) => results[y][key].margin - results[x][key].margin)
    .map((id) => {
      const c: CapacityCheck = results[id][key];
      const extra =
        key === 'trafficJam'
          ? `lasts ${fixed(results[id].trafficJam.maxJamHours, 1)} h in the jam`
          : `reaches ~${num(results[id][key].maxDistanceKm, 0)} km`;
      return {
        id,
        label: names[id],
        value: c.requiredKwh,
        target: c.availableKwh,
        end: <PassFail pass={c.pass} margin={c.margin} />,
        tip: (
          <TipLines
            title={names[id]}
            lines={[
              { color: 'var(--series-1)', value: `${fixed(c.requiredKwh, 1)} kWh`, label: 'needed' },
              { color: 'var(--ink)', value: `${fixed(c.availableKwh, 1)} kWh`, label: 'available' },
              { value: signedPct(c.margin), label: c.pass ? 'spare' : 'short' },
              { value: '', label: extra },
            ]}
          />
        ),
        onClick: () => open(id),
      };
    });
}

function HowFar({ items }: { items: { id: string; name: string; value: string }[] }) {
  return (
    <div className="howfar">
      {items.map((it) => (
        <div key={it.id}>
          <span className="faint">{it.name}</span>
          <b className="num">{it.value}</b>
        </div>
      ))}
    </div>
  );
}

export function StressTestsPage() {
  const { scenario, out, selectedIds, derivedById, a, stale } = useEngine();
  const tab = useStore((s) => s.stressTab);
  const setTab = useStore((s) => s.setStressTab);
  const setScenario = useStore((s) => s.setScenario);
  const settings = useStore((s) => s.settings);
  const openDrawer = useStore((s) => s.openDrawer);
  const physics = settings.consumption === 'physics';
  const names = Object.fromEntries(Object.values(derivedById).map((d) => [d.car.id, d.car.name]));
  const ids = selectedIds.filter((id) => out.results[id]);
  const meta = CASES.find((c) => c.key === tab) ?? CASES[0];
  const open = (id: string) => openDrawer(id, tab);

  let chart: ReactNode = null;
  let howFar: ReactNode = null;
  if (tab === 'trafficJam' || tab === 'noCharger' || tab === 'sprint') {
    chart = <BulletRows rows={capacityRows(tab, ids, out.results, names, open)} valueName="Battery needed (kWh, long-term)" targetName="Battery available" />;
    const sorted = [...ids].sort((x, y) =>
      tab === 'trafficJam'
        ? out.results[y].trafficJam.maxJamHours - out.results[x].trafficJam.maxJamHours
        : out.results[y][tab].maxDistanceKm - out.results[x][tab].maxDistanceKm,
    );
    howFar = (
      <div className="stack" style={{ gap: 8 }}>
        <h3>{tab === 'trafficJam' ? 'Longest jam each car can sit out' : 'How far each car gets in this charge window'}</h3>
        <HowFar
          items={sorted.map((id) => ({
            id,
            name: names[id],
            value: tab === 'trafficJam' ? `${fixed(out.results[id].trafficJam.maxJamHours, 1)} h` : `${num(out.results[id][tab].maxDistanceKm, 0)} km`,
          }))}
        />
      </div>
    );
  } else if (tab === 'batteryLife') {
    const rows: BulletRow[] = ids
      .filter((id) => out.results[id].batteryLife.cyclesAvailable !== null)
      .sort((x, y) => (out.results[y].batteryLife.margin ?? -9) - (out.results[x].batteryLife.margin ?? -9))
      .map((id) => {
        const b = out.results[id].batteryLife;
        return {
          id,
          label: names[id],
          value: b.cyclesRequired,
          target: b.cyclesAvailable,
          end: <PassFail pass={b.pass} margin={b.margin} />,
          tip: (
            <TipLines
              title={names[id]}
              lines={[
                { color: 'var(--series-1)', value: num(b.cyclesRequired, 0), label: 'full cycles needed' },
                { color: 'var(--ink)', value: num(b.cyclesAvailable, 0), label: 'rated cycles' },
                { value: `${fixed(b.yearsUntilRated, 1)} years`, label: 'until the rated cycles are used' },
              ]}
            />
          ),
          onClick: () => open(id),
        };
      });
    chart = <BulletRows rows={rows} valueName="Full charge cycles needed" targetName="Rated cycles" />;
    howFar = (
      <div className="stack" style={{ gap: 8 }}>
        <h3>Years until the rated cycles are used up</h3>
        <HowFar
          items={[...ids]
            .sort((x, y) => (out.results[y].batteryLife.yearsUntilRated ?? 0) - (out.results[x].batteryLife.yearsUntilRated ?? 0))
            .map((id) => ({ id, name: names[id], value: `${fixed(out.results[id].batteryLife.yearsUntilRated, 1)} years` }))}
        />
      </div>
    );
  } else if (tab === 'longTrip') {
    const rows: StackedRow[] = [...ids]
      .sort((x, y) => out.results[x].longTrip.tripTimeH - out.results[y].longTrip.tripTimeH)
      .map((id) => {
        const t = out.results[id].longTrip;
        return {
          id,
          label: names[id],
          parts: [t.timeDrivingH, t.timeChargingH],
          end: (
            <span>
              {hours(t.tripTimeH)} <span className="faint">· {plural(t.stops, "stop", "stops")}</span>
            </span>
          ),
          tip: (
            <TipLines
              title={names[id]}
              lines={[
                { color: 'var(--series-1)', value: hours(t.timeDrivingH), label: 'driving' },
                { color: 'var(--series-2)', value: hours(t.timeChargingH), label: `charging (${plural(t.stops, "stop", "stops")})` },
                { value: hours(t.tripTimeH), label: 'total' },
              ]}
            />
          ),
          onClick: () => open(id),
        };
      });
    chart = (
      <StackedRows
        rows={rows}
        series={[
          { key: 'drive', label: 'Driving', color: 'var(--series-1)' },
          { key: 'charge', label: 'Charging', color: 'var(--series-2)' },
        ]}
      />
    );
  } else {
    const cur = a.displayCurrency;
    const rows: StackedRow[] = ids
      .filter((id) => out.results[id].cost.tco !== null)
      .sort((x, y) => (out.results[x].cost.costPerKm ?? 0) - (out.results[y].cost.costPerKm ?? 0))
      .map((id) => {
        const c = out.results[id].cost;
        return {
          id,
          label: names[id],
          parts: [c.purchase ?? 0, c.energyCost, c.maintenanceCost],
          end: (
            <span>
              {fixed(c.costPerKm, 2)} <span className="faint">{cur}/km</span>
            </span>
          ),
          tip: (
            <TipLines
              title={names[id]}
              lines={[
                { color: 'var(--series-1)', value: money(c.purchase, cur), label: 'purchase' },
                { color: 'var(--series-2)', value: money(c.energyCost, cur), label: 'energy' },
                { color: 'var(--series-3)', value: money(c.maintenanceCost, cur), label: 'maintenance' },
                { value: money(c.tco, cur), label: 'total' },
              ]}
            />
          ),
          onClick: () => open(id),
        };
      });
    const missing = ids.filter((id) => out.results[id].cost.tco === null);
    chart = (
      <div className="stack">
        <StackedRows
          rows={rows}
          series={[
            { key: 'buy', label: 'Purchase', color: 'var(--series-1)' },
            { key: 'energy', label: 'Energy', color: 'var(--series-2)' },
            { key: 'maint', label: 'Maintenance', color: 'var(--series-3)' },
          ]}
        />
        {missing.length > 0 && <p className="faint">No price in cars.csv: {missing.map((id) => names[id]).join(', ')}</p>}
        <p className="faint">Totals over {scenario.batteryLife.years} years in {cur}; the bar ends show cost per km. Hover a bar for its parts ({compact(1e6)} = 1 million).</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Stress tests</h1>
          <p className="muted">Change the inputs on the left; every selected car is recalculated. Select a bar for the full calculation.</p>
        </div>
        <PresetPicker />
      </div>
      <div className="tabs" role="tablist" aria-label="Stress test">
        {CASES.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={tab === c.key} onClick={() => setTab(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="case-grid">
        <div className="stack">
          <div className="panel stack">
            <div>
              <h2>{meta.label}</h2>
              <p className="muted">{meta.question}</p>
            </div>
            <Inputs tab={tab} scenario={scenario} set={setScenario} physics={physics} />
          </div>
          {physics && <ConditionsPanel />}
        </div>
        <div className={`panel stack ${stale ? 'stale' : ''}`} style={{ minWidth: 0 }}>
          {ids.length === 0 ? <p className="muted">No cars selected (Compare → Cars).</p> : chart}
          {howFar}
        </div>
      </div>
    </div>
  );
}
