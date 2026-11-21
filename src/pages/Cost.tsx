import type { ReactNode } from 'react';
import { COST_CASE } from '../caseMeta';
import { StackedRows, TipLines, type StackedRow, type StackSeries } from '../components/Bars';
import { ConditionsPanel, PresetPicker } from '../components/Conditions';
import { CarsButton } from '../components/CarPicker';
import { DrivingFields } from '../components/Driving';
import { CabinField, NumberField } from '../components/Fields';
import { LifeTerrainFields } from '../components/Terrain';
import { PART_LABELS, PART_ORDER, marketCosts } from '../engine/costs';
import type { CostInputs, CostPartKey } from '../engine/types';
import { compact, fixed, money, num } from '../format';
import { useEngine } from '../state/engine';
import { useInputs } from '../state/inputs';
import { useStore } from '../state/store';
import { InputsPanel } from './StressTests';

const SERIES: StackSeries[] = PART_ORDER.map((key, i) => ({ key, label: PART_LABELS[key], color: `var(--series-${i + 1})` }));
const COLOR: Record<CostPartKey, string> = Object.fromEntries(SERIES.map((s) => [s.key, s.color])) as Record<CostPartKey, string>;

/**
 * A collapsible group of inputs; the summary line shows the main values and whether any differs from the standard.
 * A group with a value the market's data lacks (`gap`) starts open and says so.
 */
function Group({
  title,
  summary,
  keys,
  open,
  gap,
  children,
}: {
  title: string;
  summary: string;
  keys: (keyof CostInputs)[];
  open?: boolean;
  gap?: (k: keyof CostInputs) => boolean;
  children: ReactNode;
}) {
  const { scenario, standard } = useEngine();
  const changed = keys.some((k) => scenario.cost[k] !== standard.cost[k]);
  const missing = !!gap && keys.some(gap);
  return (
    <details className="input-group" open={open || missing}>
      <summary>
        <span className="input-group-title">{title}</span>
        <span className="faint input-group-summary">{summary}</span>
        {missing ? <span className="chip warn">missing</span> : changed && <span className="chip">changed</span>}
      </summary>
      <div className="fields">{children}</div>
    </details>
  );
}

/** Cost of ownership: purchase − value at the end, energy, insurance, tax, servicing and tyres over the years of use. */
export function CostPage() {
  const { scenario, out, selectedIds, derivedById, a, stale } = useEngine();
  const { trip, setTrip } = useInputs('cost');
  const openDrawer = useStore((s) => s.openDrawer);
  const cur = a.displayCurrency;
  const c = scenario.cost;
  const mc = marketCosts(a);
  const open = (id: string) => openDrawer(id, 'cost');

  const ids = selectedIds.filter((id) => out.results[id]);
  const anyIce = ids.some((id) => derivedById[id].isIce);
  const anyPremium = ids.some((id) => derivedById[id].car.carClass === 'premium');
  const priced = ids
    .filter((id) => out.results[id].cost.tco !== null)
    .sort((x, y) => (out.results[x].cost.costPerKm ?? 0) - (out.results[y].cost.costPerKm ?? 0));
  const missing = ids.filter((id) => out.results[id].cost.tco === null);
  const noPrice = missing.filter((id) => out.results[id].cost.purchase === null);
  /** Values the market's data lacks that the ticked cars need (each named once). */
  const gapItems = [...new Set(ids.flatMap((id) => out.results[id].cost.missing))];
  const name = (id: string) => derivedById[id].car.name;
  const part = (id: string, key: CostPartKey) => out.results[id].cost.parts.find((p) => p.key === key)?.value ?? null;

  const rows: StackedRow[] = priced.map((id) => {
    const r = out.results[id].cost;
    return {
      id,
      label: name(id),
      parts: PART_ORDER.map((k) => Math.max(0, part(id, k) ?? 0)),
      end: (
        <span>
          {fixed(r.costPerKm, 2)} <span className="faint">{cur}/km</span>
        </span>
      ),
      tip: (
        <TipLines
          title={name(id)}
          lines={[
            ...PART_ORDER.map((k) => ({ color: COLOR[k], value: money(part(id, k), cur), label: PART_LABELS[k].toLowerCase() })),
            { value: `${money(r.purchase, cur)} → ${money(r.resale, cur)}`, label: 'purchase → value at the end' },
            { value: money(r.tco, cur), label: 'total' },
          ]}
        />
      ),
      onClick: () => open(id),
    };
  });

  /** "3 % of the value", or with a petrol car ticked "3 / 2.5 % of the value (electric / petrol)". */
  const ev = (bev: string, ice: string, rest: string) => (anyIce ? `${bev} / ${ice}${rest} (electric / petrol)` : `${bev}${rest}`);
  const refKg = mc.value('tyre_reference_kg', 'BEV');
  /** The market has no road-tax table for a ticked car's powertrain: the user types the road tax instead. */
  const taxGap = ids.some((id) => !mc.roadTax.some((r) => r.powertrain === (derivedById[id].isIce ? 'ICE' : 'BEV') && r.basis !== 'age_years'));
  /** An input shown on the page whose value the market's data lacks (and the user has not typed). */
  const gap = (k: keyof CostInputs) =>
    c[k] === null && (k.endsWith('Ice') ? anyIce : k === 'tyreSetPremium' ? anyPremium : k === 'roadTaxPerYear' ? taxGap : true);

  return (
    <div className="stack">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Cost of ownership</h1>
          <p className="muted">
            What the car costs over the years you keep it, in {cur}: the value it loses, energy, insurance, road tax, servicing and repairs, and
            tyres. Select a bar or a row for the full calculation.
          </p>
        </div>
        <div className="row">
          <CarsButton />
          <PresetPicker />
        </div>
      </div>
      <div className="case-grid">
        <div className="stack">
          <InputsPanel test="cost" title="Inputs" question={COST_CASE.question}>
            <div className="input-groups">
              <Group gap={gap}
                title="Use"
                summary={`${num(c.years, 0)} years × ${compact(c.kmPerYear)} km${c.ascentPer100Km > 0 ? ` · hills ${num(c.ascentPer100Km, 0)} m/100 km` : ''}`}
                keys={['years', 'kmPerYear', 'speedKmh', 'profile', 'cabinC', 'ascentPer100Km', 'slopePct']}
                open
              >
                <NumberField label="Years of use" unit="years" min={1} max={40} {...trip<number>('years')} />
                <NumberField label="Distance per year" unit="km" min={1000} max={80000} sliderMax={50000} step={500} {...trip<number>('kmPerYear')} />
                <DrivingFields test="cost" />
                <CabinField label="Cabin heating / AC" {...trip<number | null>('cabinC')} />
                <LifeTerrainFields ascent={trip<number>('ascentPer100Km')} slope={trip<number>('slopePct')} set={setTrip} />
                <p className="faint">
                  Years, distance, driving and hills start as on the <a href="#battery-life">Battery life</a> page; ⇉ copies a value there.
                </p>
              </Group>
              <Group gap={gap} title="Energy" summary={`${num(c.energyPrice, 2)} ${cur}/kWh`} keys={['energyPrice']} open>
                <NumberField
                  label={`Electricity price (${cur})`}
                  unit="/kWh"
                  min={0}
                  max={40}
                  step={0.1}
                  hint={mc.market === 'TH' ? 'Standard: public DC chargers (5.3–9.5 THB/kWh). Charging at home: about 4.2, off-peak (TOU) about 2.6 THB/kWh.' : undefined}
                  {...trip<number | null>('energyPrice')}
                />
                {anyIce && <p className="faint">Petrol cars use their own price per litre from the market&rsquo;s offers.csv.</p>}
              </Group>
              <Group gap={gap}
                title="Insurance & tax"
                summary={ev(num(c.insuranceRateBev, 1), num(c.insuranceRateIce, 1), ' % of the value')}
                keys={['insuranceRateBev', 'insuranceRateIce', 'insuranceMin', 'compulsoryInsurance', 'roadTaxPerYear']}
              >
                <NumberField label={anyIce ? 'Voluntary insurance, electric' : 'Voluntary insurance (class 1)'} unit="%" min={0} max={20} sliderMax={8} step={0.1} {...trip<number | null>('insuranceRateBev')} />
                {anyIce && <NumberField label="Voluntary insurance, petrol" unit="%" min={0} max={20} sliderMax={8} step={0.1} {...trip<number | null>('insuranceRateIce')} />}
                <NumberField label={`Lowest premium (${cur})`} unit="/year" min={0} max={1_000_000} sliderMax={30000} step={500} {...trip<number | null>('insuranceMin')} />
                <NumberField label={`Compulsory insurance (${cur})`} unit="/year" min={0} max={1_000_000} sliderMax={5000} step={0.01} {...trip<number | null>('compulsoryInsurance')} />
                {taxGap && <NumberField label={`Road tax (${cur})`} unit="/year" min={0} max={1_000_000} sliderMax={5000} step={10} {...trip<number | null>('roadTaxPerYear')} />}
                <p className="faint">
                  Voluntary insurance: % of the car&rsquo;s value at the start of each year, so it falls as the car loses value, down to the lowest
                  premium.{' '}
                  {taxGap ? (
                    <>The market has no road-tax table yet: the road tax you type applies to every car.</>
                  ) : (
                    <>
                      Road tax follows from the car&rsquo;s weight (petrol cars: engine size), see{' '}
                      <a href="#assumptions" onClick={() => setTimeout(() => document.getElementById('road-tax')?.scrollIntoView(), 50)}>
                        Assumptions
                      </a>
                      .
                    </>
                  )}
                </p>
              </Group>
              <Group gap={gap}
                title="Servicing & repairs"
                summary={ev(num(c.servicingBev, 0), num(c.servicingIce, 0), ` ${cur}/year`)}
                keys={['servicingBev', 'servicingIce', 'repairsPct', 'warrantyYears', 'battery12vPrice', 'battery12vYears']}
              >
                <NumberField label={`Servicing${anyIce ? ', electric' : ''} (${cur})`} unit="/year" min={0} max={1_000_000} sliderMax={50000} step={100} {...trip<number | null>('servicingBev')} />
                {anyIce && <NumberField label={`Servicing, petrol (${cur})`} unit="/year" min={0} max={1_000_000} sliderMax={50000} step={100} {...trip<number | null>('servicingIce')} />}
                <NumberField label="Repairs after the warranty" unit="%/yr" min={0} max={20} sliderMax={5} step={0.1} {...trip<number | null>('repairsPct')} />
                <NumberField label="Warranty" unit="years" min={0} max={40} sliderMax={15} {...trip<number | null>('warrantyYears')} />
                <NumberField label={`12 V battery (${cur})`} unit="" min={0} max={1_000_000} sliderMax={15000} step={100} {...trip<number | null>('battery12vPrice')} />
                <NumberField label="12 V battery lasts" unit="years" min={1} max={20} sliderMax={10} {...trip<number | null>('battery12vYears')} />
                <p className="faint">Repairs: % of the purchase price each year after the warranty. Cars with their own servicing cost in the market&rsquo;s offers.csv keep it.</p>
              </Group>
              <Group gap={gap} title="Tyres" summary={`${compact(c.tyreSetRegular)} ${cur} per ${compact(c.tyreLifeKm)} km`} keys={['tyreSetRegular', 'tyreSetPremium', 'tyreLifeKm']}>
                <NumberField label={`Set of 4${anyPremium ? ', regular car' : ''} (${cur})`} unit="" min={0} max={10_000_000} sliderMax={80000} step={500} {...trip<number | null>('tyreSetRegular')} />
                {anyPremium && <NumberField label={`Set of 4, premium car (${cur})`} unit="" min={0} max={10_000_000} sliderMax={80000} step={500} {...trip<number | null>('tyreSetPremium')} />}
                <NumberField label="Tyre life" unit="km" min={5000} max={200000} sliderMax={100000} step={1000} {...trip<number | null>('tyreLifeKm')} />
                {refKg !== null && (
                  <p className="faint">
                    The life applies at {num(refKg, 0)} kg; wear grows with the mass on the tyres, so a car of {num(refKg * 1.3, 0)} kg (car + load) gets
                    {` ${num(100 / 1.3, 0)}`} % of it.
                  </p>
                )}
              </Group>
              <Group
                gap={gap}
                title="Value"
                summary={c.depreciationBev === null ? '' : `−${ev(num(c.depreciationBev, 1), num(c.depreciationIce, 1), ' % per year')}`}
                keys={['depreciationBev', 'depreciationIce']}
              >
                <NumberField label={`Loss of value${anyIce ? ', electric' : ''}`} unit="%/yr" min={0} max={50} sliderMax={25} step={0.1} {...trip<number | null>('depreciationBev')} />
                {anyIce && <NumberField label="Loss of value, petrol" unit="%/yr" min={0} max={50} sliderMax={25} step={0.1} {...trip<number | null>('depreciationIce')} />}
                <p className="faint">
                  The car loses this % of its value each year; what is left at the end is the resale value.
                  {c.depreciationBev !== null && ` After ${num(c.years, 0)} years an electric car keeps ${num(100 * Math.pow(1 - c.depreciationBev / 100, c.years), 0)} % of its price.`}
                </p>
              </Group>
            </div>
          </InputsPanel>
          <ConditionsPanel test="cost" />
        </div>
        <div className={`panel stack ${stale ? 'stale' : ''}`} style={{ minWidth: 0 }}>
          {ids.length === 0 ? (
            <p className="muted">No cars selected (Compare → Cars).</p>
          ) : (
            <>
              <StackedRows rows={rows} series={SERIES} />
              {gapItems.length > 0 && (
                <p className="notice">
                  {a.marketNames[mc.market] ?? mc.market}&rsquo;s cost data lacks: {gapItems.join(', ')}. Type values in the inputs marked
                  &ldquo;missing&rdquo; to get totals; the market does not borrow another market&rsquo;s values.
                </p>
              )}
              {noPrice.length > 0 && <p className="faint">No price in the market&rsquo;s offers.csv: {noPrice.map(name).join(', ')}</p>}
              <p className="faint">
                Totals over {num(c.years, 0)} years and {compact(c.years * c.kmPerYear)} km in {cur}: purchase − value at the end + running costs. The
                bar ends show the cost per km.
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Car</th>
                      <th className="r">Purchase</th>
                      <th className="r">Value at the end</th>
                      {PART_ORDER.map((k) => (
                        <th key={k} className="r">
                          {PART_LABELS[k]}
                        </th>
                      ))}
                      <th className="r">Total</th>
                      <th className="r">{cur}/km</th>
                      <th className="r" title="Energy paid for: from the grid, including charging losses">
                        Energy per 100 km
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...priced, ...missing].map((id) => {
                      const r = out.results[id].cost;
                      const u = derivedById[id].energyUnit;
                      return (
                        <tr key={id}>
                          <td>
                            <button type="button" className="link-btn" onClick={() => open(id)}>
                              {name(id)}
                            </button>
                          </td>
                          <td className="r">{compact(r.purchase)}</td>
                          <td className="r">{compact(r.resale)}</td>
                          {PART_ORDER.map((k) => (
                            <td key={k} className="r">
                              {compact(part(id, k))}
                            </td>
                          ))}
                          <td className="r">{compact(r.tco)}</td>
                          <td className="r">{fixed(r.costPerKm, 2)}</td>
                          <td className="r">
                            {fixed(r.energyPerKm * 100, 1)} {u}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="faint">
                Amounts in {cur} ({compact(1e6)} = 1 million). Depreciation = purchase − value at the end. Insurance = voluntary + compulsory. Energy
                per 100 km is what you pay for: from the grid, including charging losses ({num(a.chargingEfficiencyPct, 0)} % charging efficiency),
                the onboard systems and battery heating/cooling. A battery replacement is not included.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
