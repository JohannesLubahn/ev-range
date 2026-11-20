import type { ReactNode } from 'react';
import { BATTERY_LIFE_CASE, STRESS_TESTS, type CaseMeta } from '../caseMeta';
import { BulletRows, StackedRows, TipLines, type BulletRow, type SideCell, type SideColumn, type StackSeries, type StackedRow } from '../components/Bars';
import { ConditionsPanel, PresetPicker } from '../components/Conditions';
import { CarsButton } from '../components/CarPicker';
import { CabinField, NumberField, SelectField } from '../components/Fields';
import { PassFail } from '../components/Status';
import { carePresets, matchPreset, type CareHabits, type CarePreset } from '../engine/battery/ageing';
import { YEARS_UNTIL_EOL_MAX } from '../engine/cases';
import type { DerivedCar } from '../engine/derive';
import { PROFILES, type AverageConsumption, type CapacityCheck, type CarResults, type Profile } from '../engine/types';
import { capacityLeft, fixed, hours, lifeYears, num, plural, signedPct } from '../format';
import { useEngine } from '../state/engine';
import { useInputs, type InputProps } from '../state/inputs';
import { useStore, type StressKey } from '../state/store';

const profileOptions = PROFILES.filter((p) => p.id !== 'jam').map((p) => ({ id: p.id, label: p.label, description: p.description }));
const CABIN = 'Cabin heating / AC';

/** Battery care: a preset (Gentle / Typical / Hard) or the two habits set by hand. */
function CareFields({ dc, highSoc, setBoth }: { dc: InputProps<number>; highSoc: InputProps<number>; setBoth: (h: CareHabits) => void }) {
  const { a } = useEngine();
  const value: CareHabits = { dcSharePct: dc.value, highSocTimePct: highSoc.value };
  const presets = carePresets(a);
  const current = matchPreset(a, value) ?? 'custom';
  const describe = (h: CareHabits) => `${num(h.dcSharePct, 0)} % fast charging, ${num(h.highSocTimePct, 0)} % of the time parked above 80 %`;
  const options: { id: CarePreset | 'custom'; label: string; description: string }[] = [
    { id: 'gentle', label: 'Gentle', description: `Mostly charged at home, to 80 % for daily use: ${describe(presets.gentle)}` },
    { id: 'typical', label: 'Typical', description: `The fleet average the wear model is fitted to: ${describe(presets.typical)}` },
    { id: 'hard', label: 'Hard', description: `Mostly fast-charged, always charged to 100 % and parked full: ${describe(presets.hard)}` },
    { id: 'custom', label: 'Custom', description: 'Set the two habits below' },
  ];
  return (
    <>
      <SelectField
        label="Battery care"
        value={current}
        options={options}
        onChange={(v: CarePreset | 'custom') => {
          if (v !== 'custom') setBoth(presets[v]);
        }}
      />
      <NumberField label="Charging at DC fast chargers" unit="%" min={0} max={100} step={5} {...dc} />
      <NumberField label="Time parked above 80 % charge" unit="%" min={0} max={100} step={5} {...highSoc} />
    </>
  );
}

function Inputs({ tab }: { tab: StressKey }) {
  const { trip, setTrip } = useInputs(tab);
  const num = (key: string) => trip<number>(key);
  const profile = (key: string) => trip<Profile>(key);
  const cabin = (key: string) => trip<number | null>(key);
  switch (tab) {
    case 'trafficJam':
      return (
        <div className="fields">
          <NumberField label="Charge at the start" unit="%" min={5} max={100} {...num('startPct')} />
          <NumberField label="Charge left at the end" unit="%" min={0} max={50} {...num('endPct')} />
          <NumberField label="Time in the jam" unit="h" min={0.5} max={24} step={0.5} {...num('timeJamH')} />
          <NumberField label="Distance in the jam" unit="km" min={0} max={50} {...num('distJamKm')} />
          <NumberField label="Distance before the jam" unit="km" min={0} max={200} {...num('distBeforeKm')} />
          <NumberField label="Distance after the jam" unit="km" min={0} max={200} {...num('distAfterKm')} />
          <NumberField label="Average speed outside the jam" unit="km/h" min={10} max={130} {...num('speedOutsideKmh')} />
          <SelectField label="Driving outside the jam" options={profileOptions} {...profile('profileOutside')} />
          <CabinField label={`${CABIN} outside the jam`} {...cabin('cabinOutsideC')} />
          <CabinField label={`${CABIN} in the jam`} {...cabin('cabinJamC')} />
        </div>
      );
    case 'noCharger':
    case 'sprint':
      return (
        <div className="fields">
          <NumberField label="Distance between chargers" unit="km" min={10} max={1000} sliderMax={600} step={5} {...num('distanceKm')} />
          <NumberField label="Average speed" unit="km/h" min={10} max={200} {...num('speedKmh')} />
          <SelectField label="Driving profile" options={profileOptions} {...profile('profile')} />
          <NumberField label="Net climb (negative = descent)" unit="m" min={-2000} max={3000} step={50} {...num('climbM')} />
          <NumberField label="Charge at the start" unit="%" min={10} max={100} {...num('startPct')} />
          <NumberField label="Charge on arrival" unit="%" min={0} max={50} {...num('endPct')} />
          <CabinField label={CABIN} {...cabin('cabinC')} />
        </div>
      );
    case 'longTrip': {
      const climate = trip<boolean>('climateWhileCharging');
      const cab = cabin('cabinC');
      return (
        <div className="fields">
          <NumberField label="Trip distance" unit="km" min={50} max={3000} sliderMax={2000} step={10} {...num('distanceKm')} />
          <NumberField label="Average speed" unit="km/h" min={20} max={150} {...num('speedKmh')} />
          <SelectField label="Driving profile" options={profileOptions} {...profile('profile')} />
          <NumberField label="Charge from" unit="%" min={0} max={90} {...num('chargeFromPct')} />
          <NumberField label="Charge to" unit="%" min={20} max={100} {...num('chargeToPct')} />
          <CabinField label={CABIN} {...cab} />
          {cab.value !== null && (
            <label className="check">
              <input type="checkbox" checked={climate.value} onChange={(e) => climate.onChange(e.target.checked)} /> Heating / AC on while charging
              (waiting in the car)
            </label>
          )}
        </div>
      );
    }
    case 'batteryLife':
      return (
        <div className="fields">
          <NumberField label="Years of use" unit="years" min={1} max={40} {...num('years')} />
          <NumberField label="Distance per year" unit="km" min={1000} max={80000} sliderMax={50000} step={500} {...num('kmPerYear')} />
          <NumberField label="Average speed" unit="km/h" min={10} max={120} {...num('speedKmh')} />
          <SelectField label="Driving profile" options={profileOptions} {...profile('profile')} />
          <CabinField label={CABIN} {...cabin('cabinC')} />
          <CareFields dc={num('dcSharePct')} highSoc={num('highSocTimePct')} setBoth={(h) => setTrip({ ...h })} />
          <p className="faint">
            The battery wear in the stress tests (Conditions: km driven) uses this driving, battery care and the air temperature and driving
            style of this page. The <a href="#cost">cost of ownership</a> has its own years and driving; ⇉ copies a value there.
          </p>
        </div>
      );
  }
}

/** The inputs panel of a test: title, question, "Reset this test" and the fields. */
export function InputsPanel({ test, title, question, children }: { test: StressKey | 'cost'; title: string; question: string; children: ReactNode }) {
  const { changed, resetTest } = useInputs(test);
  return (
    <div className="panel stack">
      <div className="panel-title">
        <div>
          <h2>{title}</h2>
          <p className="muted">{question}</p>
        </div>
        {changed && (
          <button type="button" className="btn small" onClick={resetTest} title="Every input and condition of this test back to its standard">
            Reset this test
          </button>
        )}
      </div>
      {children}
    </div>
  );
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

/**
 * One test: its inputs and the conditions on the left, the chart on the right. Used by the Stress tests page (with its
 * tabs) and by the Battery life page.
 */
function TestView({ tab, meta, title, intro, tabs, inputsTitle }: { tab: StressKey; meta: CaseMeta; title: string; intro: string; tabs?: ReactNode; inputsTitle: string }) {
  const { scenario, out, selectedIds, derivedById, stale, a } = useEngine();
  const openDrawer = useStore((s) => s.openDrawer);
  const names = Object.fromEntries(Object.values(derivedById).map((d) => [d.car.id, d.car.name]));
  const ids = selectedIds.filter((id) => out.results[id]);
  const open = (id: string) => openDrawer(id, tab);
  const side = consumptionColumn(ids, (r) => r[tab].average, out.results, derivedById);

  let chart: ReactNode = null;
  let howFar: ReactNode = null;
  if (tab === 'trafficJam' || tab === 'noCharger' || tab === 'sprint') {
    chart = (
      <BulletRows rows={capacityRows(tab, ids, out.results, derivedById, open)} valueName="Battery needed (kWh)" targetName="Battery available" side={side} />
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
    const life = scenario.batteryLife;
    const rows: BulletRow[] = ids
      .filter((id) => out.results[id].batteryLife.pass !== null && out.results[id].batteryLife.capacityEndPct !== null)
      .sort((x, y) => (out.results[y].batteryLife.capacityEndPct ?? -9) - (out.results[x].batteryLife.capacityEndPct ?? -9))
      .map((id) => {
        const b = out.results[id].batteryLife;
        const cap = b.capacityEndPct ?? 0;
        return {
          id,
          label: names[id],
          value: cap,
          target: b.eolPct,
          end: <PassFail pass={b.pass} margin={b.margin} text={capacityLeft(cap)} />,
          tip: (
            <TipLines
              title={names[id]}
              lines={[
                { color: 'var(--series-1)', value: `${fixed(cap, 1)} %`, label: `capacity left after ${num(life.years, 0)} years` },
                { color: 'var(--ink)', value: `${fixed(b.eolPct, 0)} %`, label: 'must stay at or above' },
                { value: lifeYears(b.yearsUntilEol, YEARS_UNTIL_EOL_MAX), label: `until ${fixed(b.eolPct, 0)} % is reached` },
                { value: `${num(b.cyclesRequired, 0)} of ${num(b.cyclesAvailable, 0)}`, label: 'full cycles used of the rated cycles' },
              ]}
            />
          ),
          onClick: () => open(id),
        };
      });
    const unjudged = ids.filter((id) => out.results[id].batteryLife.pass === null && !derivedById[id].isIce);
    chart = (
      <div className="stack">
        <BulletRows rows={rows} valueName={`Capacity left after ${num(life.years, 0)} years (%)`} targetName={`${num(a.ratedCyclesEndCapacityPct, 0)} % (must stay at or above)`} side={side} />
        {unjudged.length > 0 && <p className="faint">No rated cycles or chemistry in cars.csv: {unjudged.map((id) => names[id]).join(', ')}</p>}
      </div>
    );
    howFar = (
      <div className="stack" style={{ gap: 8 }}>
        <h3>Years until {num(a.ratedCyclesEndCapacityPct, 0)} % capacity is left</h3>
        <HowFar
          items={rows
            .map((r) => r.id)
            .sort((x, y) => (out.results[y].batteryLife.yearsUntilEol ?? 0) - (out.results[x].batteryLife.yearsUntilEol ?? 0))
            .map((id) => ({ id, name: names[id], value: lifeYears(out.results[id].batteryLife.yearsUntilEol, YEARS_UNTIL_EOL_MAX) }))}
        />
        <h3>Full charge cycles used of the rated cycles</h3>
        <HowFar
          items={rows
            .map((r) => r.id)
            .sort((x, y) => out.results[x].batteryLife.cyclesRequired - out.results[y].batteryLife.cyclesRequired)
            .map((id) => ({
              id,
              name: names[id],
              value: `${num(out.results[id].batteryLife.cyclesRequired, 0)} / ${num(out.results[id].batteryLife.cyclesAvailable, 0)}`,
            }))}
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
          <h1>{title}</h1>
          <p className="muted">{intro}</p>
        </div>
        <div className="row">
          <CarsButton />
          <PresetPicker />
        </div>
      </div>
      {tabs}
      <div className="case-grid">
        <div className="stack">
          <InputsPanel test={tab} title={inputsTitle} question={meta.question}>
            <Inputs tab={tab} />
          </InputsPanel>
          <ConditionsPanel test={tab} />
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

export function StressTestsPage() {
  const tab = useStore((s) => s.stressTab);
  const setTab = useStore((s) => s.setStressTab);
  const meta = STRESS_TESTS.find((c) => c.key === tab) ?? STRESS_TESTS[0];
  return (
    <TestView
      tab={meta.key}
      meta={meta}
      title="Stress tests"
      intro="Change the inputs on the left; every selected car is recalculated. Select a bar for the full calculation."
      inputsTitle={meta.label}
      tabs={
        <div className="tabs" role="tablist" aria-label="Stress test">
          {STRESS_TESTS.map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={meta.key === c.key} onClick={() => setTab(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      }
    />
  );
}

/** Battery life: capacity left after the years of use, on its own page between the stress tests and the cost. */
export function BatteryLifePage() {
  return (
    <TestView
      tab="batteryLife"
      meta={BATTERY_LIFE_CASE}
      title={BATTERY_LIFE_CASE.label}
      intro="Capacity left after the years you keep the car, from charge cycles and age. Change the inputs on the left; select a bar for the full calculation."
      inputsTitle="Inputs"
    />
  );
}
