import type { ReactNode } from 'react';
import { STRESS_TESTS } from '../caseMeta';
import { BulletRows, StackedRows, TipLines, type BulletRow, type SideCell, type SideColumn, type StackSeries, type StackedRow } from '../components/Bars';
import { ConditionsPanel, PresetPicker } from '../components/Conditions';
import { NumberField, SelectField } from '../components/Fields';
import { PassFail } from '../components/Status';
import type { DerivedCar } from '../engine/derive';
import { PROFILES, type AverageConsumption, type CapacityCheck, type CarResults, type Profile, type Scenario } from '../engine/types';
import { fixed, hours, num, plural, signedPct } from '../format';
import { useEngine } from '../state/engine';
import { useStore, type StressKey } from '../state/store';

const profileOptions = PROFILES.filter((p) => p.id !== 'jam').map((p) => ({ id: p.id, label: p.label, description: p.description }));
const USAGE = 'Cabin AC / heating';

function Inputs({ tab, scenario, set }: { tab: StressKey; scenario: Scenario; set: (s: Scenario) => void }) {
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
          <SelectField label="Driving outside the jam" value={i.profileOutside} options={profileOptions} onChange={(v: Profile) => u({ profileOutside: v })} />
          <NumberField label={`${USAGE} outside the jam`} unit="%" min={0} max={100} value={i.usageOutsidePct} onChange={(v) => u({ usageOutsidePct: v })} />
          <NumberField label={`${USAGE} in the jam`} unit="%" min={0} max={100} value={i.usageJamPct} onChange={(v) => u({ usageJamPct: v })} />
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
          <SelectField label="Driving profile" value={i.profile} options={profileOptions} onChange={(v: Profile) => u({ profile: v })} />
          <NumberField label="Net climb (negative = descent)" unit="m" min={-2000} max={3000} step={50} value={i.climbM} onChange={(v) => u({ climbM: v })} />
          <NumberField label="Charge at the start" unit="%" min={10} max={100} value={i.startPct} onChange={(v) => u({ startPct: v })} />
          <NumberField label="Charge on arrival" unit="%" min={0} max={50} value={i.endPct} onChange={(v) => u({ endPct: v })} />
          <NumberField label={USAGE} unit="%" min={0} max={100} value={i.usagePct} onChange={(v) => u({ usagePct: v })} />
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
          <SelectField label="Driving profile" value={i.profile} options={profileOptions} onChange={(v: Profile) => u({ profile: v })} />
          <NumberField label="Charge from" unit="%" min={0} max={90} value={i.chargeFromPct} onChange={(v) => u({ chargeFromPct: v })} />
          <NumberField label="Charge to" unit="%" min={20} max={100} value={i.chargeToPct} onChange={(v) => u({ chargeToPct: v })} />
          <NumberField label={`${USAGE} while driving`} unit="%" min={0} max={100} value={i.usageDrivingPct} onChange={(v) => u({ usageDrivingPct: v })} />
          <NumberField label={`${USAGE} while charging`} unit="%" min={0} max={100} value={i.usageChargingPct} onChange={(v) => u({ usageChargingPct: v })} />
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
          <SelectField label="Driving profile" value={i.profile} options={profileOptions} onChange={(v: Profile) => u({ profile: v })} />
          <NumberField label={USAGE} unit="%" min={0} max={100} value={i.usagePct} onChange={(v) => u({ usagePct: v })} />
          <p className="faint">
            The <a href="#cost">cost of ownership</a> uses the same years, distance and driving.
          </p>
        </div>
      );
    }
  }
}

const CONSUMPTION_SERIES: StackSeries[] = [
  { key: 'driving', label: 'Driving', color: 'var(--series-1)' },
  { key: 'onboard', label: 'Onboard systems', color: 'var(--series-2)' },
  { key: 'battery', label: 'Battery heating/cooling', color: 'var(--series-3)' },
];

/** The average consumption of each car in this test, as a second bar column next to the main chart. */
function consumptionColumn(ids: string[], average: (r: CarResults) => AverageConsumption, results: Record<string, CarResults>, derivedById: Record<string, DerivedCar>): SideColumn {
  const cells: Record<string, SideCell> = {};
  for (const id of ids) {
    const d = derivedById[id];
    const avg = average(results[id]);
    const u = d.energyUnit;
    const ok = Number.isFinite(avg.total);
    const rated = d.consumption.value;
    const kwh = u === 'kWh';
    const ratedLabel =
      d.consumption.provenance === 'calculated' ? `battery ÷ ${d.basis.value} range` : `rated (${d.basis.value} test${kwh ? ', from the grid' : ''})`;
    cells[id] = {
      // Litres (petrol cars) do not share the kWh scale: no bar, the value with its unit in its place.
      parts: ok && kwh ? [avg.driving, avg.onboard, avg.battery] : [],
      note: ok && !kwh ? `${fixed(avg.total, 1)} l/100 km` : undefined,
      end: !ok ? '–' : kwh ? fixed(avg.total, 1) : '',
      tip: (
        <TipLines
          title={`${d.car.name}: average consumption`}
          lines={[
            { color: 'var(--series-1)', value: `${fixed(avg.driving, 1)} ${u}`, label: 'driving' },
            { color: 'var(--series-2)', value: `${fixed(avg.onboard, 1)} ${u}`, label: 'onboard systems (heating/AC, electronics)' },
            ...(avg.battery > 0 ? [{ color: 'var(--series-3)', value: `${fixed(avg.battery, 1)} ${u}`, label: 'battery heating/cooling' }] : []),
            { value: `${fixed(avg.total, 1)} ${u}/100 km`, label: `over ${num(avg.distanceKm, 0)} km, from the ${kwh ? 'battery' : 'tank'}` },
            ...(rated !== null ? [{ value: `${fixed(rated * 100, 1)} ${u}/100 km`, label: ratedLabel }] : []),
          ]}
        />
      ),
      aria: `${d.car.name}: average consumption ${fixed(avg.total, 1)} ${u} per 100 km`,
    };
  }
  return { title: 'Average consumption, kWh/100 km', series: CONSUMPTION_SERIES, cells };
}

function capacityRows(key: 'trafficJam' | 'noCharger' | 'sprint', ids: string[], results: Record<string, CarResults>, derivedById: Record<string, DerivedCar>, open: (id: string) => void): BulletRow[] {
  return ids
    .filter((id) => results[id])
    .sort((x, y) => results[y][key].margin - results[x][key].margin)
    .map((id) => {
      const c: CapacityCheck = results[id][key];
      const d = derivedById[id];
      const u = d.energyUnit;
      const extra =
        key === 'trafficJam'
          ? `lasts ${fixed(results[id].trafficJam.maxJamHours, 1)} h in the jam`
          : `reaches ~${num(results[id][key].maxDistanceKm, 0)} km`;
      return {
        id,
        label: d.car.name,
        value: c.requiredKwh,
        target: c.availableKwh,
        end: <PassFail pass={c.pass} margin={c.margin} />,
        tip: (
          <TipLines
            title={d.car.name}
            lines={[
              { color: 'var(--series-1)', value: `${fixed(c.requiredKwh, 1)} ${u}`, label: 'needed' },
              { color: 'var(--ink)', value: `${fixed(c.availableKwh, 1)} ${u}`, label: 'available' },
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
  const { scenario, out, selectedIds, derivedById, stale } = useEngine();
  const tab = useStore((s) => s.stressTab);
  const setTab = useStore((s) => s.setStressTab);
  const setScenario = useStore((s) => s.setScenario);
  const openDrawer = useStore((s) => s.openDrawer);
  const names = Object.fromEntries(Object.values(derivedById).map((d) => [d.car.id, d.car.name]));
  const ids = selectedIds.filter((id) => out.results[id]);
  const meta = STRESS_TESTS.find((c) => c.key === tab) ?? STRESS_TESTS[0];
  const open = (id: string) => openDrawer(id, tab);
  const side = consumptionColumn(ids, (r) => r[tab].average, out.results, derivedById);

  let chart: ReactNode = null;
  let howFar: ReactNode = null;
  if (tab === 'trafficJam' || tab === 'noCharger' || tab === 'sprint') {
    chart = (
      <BulletRows rows={capacityRows(tab, ids, out.results, derivedById, open)} valueName="Battery needed (kWh, long-term)" targetName="Battery available" side={side} />
    );
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
    const noCycles = ids.filter((id) => out.results[id].batteryLife.cyclesAvailable === null);
    chart = (
      <div className="stack">
        <BulletRows rows={rows} valueName="Full charge cycles needed" targetName="Rated cycles" side={side} />
        {noCycles.length > 0 && <p className="faint">No rated cycles in cars.csv: {noCycles.map((id) => names[id]).join(', ')}</p>}
      </div>
    );
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
  } else {
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
              {hours(t.tripTimeH)} <span className="faint">· {plural(t.stops, 'stop', 'stops')}</span>
            </span>
          ),
          tip: (
            <TipLines
              title={names[id]}
              lines={[
                { color: 'var(--series-1)', value: hours(t.timeDrivingH), label: 'driving' },
                { color: 'var(--series-2)', value: hours(t.timeChargingH), label: `charging (${plural(t.stops, 'stop', 'stops')})` },
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
          { key: 'drive', label: 'Driving time', color: 'var(--series-1)' },
          { key: 'charge', label: 'Charging time', color: 'var(--series-2)' },
        ]}
        side={side}
      />
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
        {STRESS_TESTS.map((c) => (
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
            <Inputs tab={tab} scenario={scenario} set={setScenario} />
          </div>
          <ConditionsPanel />
        </div>
        <div className={`panel stack ${stale ? 'stale' : ''}`} style={{ minWidth: 0 }}>
          {ids.length === 0 ? (
            <p className="muted">No cars selected (Compare → Cars).</p>
          ) : (
            <>
              {chart}
              <p className="faint">
                Average consumption: the energy taken from the battery over the test ÷ its distance, including the onboard systems (heating/AC,
                electronics, cooling or warming the parked cabin) and battery heating/cooling. Petrol cars: litres per 100 km.
              </p>
            </>
          )}
          {howFar}
        </div>
      </div>
    </div>
  );
}
