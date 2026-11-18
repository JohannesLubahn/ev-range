import { COST_CASE } from '../caseMeta';
import { StackedRows, TipLines, type StackedRow } from '../components/Bars';
import { ConditionsPanel, PresetPicker } from '../components/Conditions';
import { NumberField } from '../components/Fields';
import type { BatteryLifeInputs, CostInputs } from '../engine/types';
import { compact, fixed, money, num } from '../format';
import { useEngine } from '../state/engine';
import { useStore } from '../state/store';

/** Cost of ownership: purchase, energy and maintenance over the years you keep the car. */
export function CostPage() {
  const { scenario, out, selectedIds, derivedById, a, stale } = useEngine();
  const setScenario = useStore((s) => s.setScenario);
  const openDrawer = useStore((s) => s.openDrawer);
  const cur = a.displayCurrency;
  const life = scenario.batteryLife;
  const ci = scenario.cost;
  const setLife = (p: Partial<BatteryLifeInputs>) => setScenario({ ...scenario, batteryLife: { ...life, ...p } });
  const setCost = (p: Partial<CostInputs>) => setScenario({ ...scenario, cost: { ...ci, ...p } });
  const open = (id: string) => openDrawer(id, 'cost');

  const ids = selectedIds.filter((id) => out.results[id]);
  const priced = ids
    .filter((id) => out.results[id].cost.tco !== null)
    .sort((x, y) => (out.results[x].cost.costPerKm ?? 0) - (out.results[y].cost.costPerKm ?? 0));
  const missing = ids.filter((id) => out.results[id].cost.tco === null);
  const name = (id: string) => derivedById[id].car.name;

  const rows: StackedRow[] = priced.map((id) => {
    const c = out.results[id].cost;
    return {
      id,
      label: name(id),
      parts: [c.purchase ?? 0, c.energyCost, c.maintenanceCost],
      end: (
        <span>
          {fixed(c.costPerKm, 2)} <span className="faint">{cur}/km</span>
        </span>
      ),
      tip: (
        <TipLines
          title={name(id)}
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

  return (
    <div className="stack">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Cost of ownership</h1>
          <p className="muted">
            Purchase, energy and maintenance over the years you keep the car, in {cur}. Select a bar or a row for the full calculation.
          </p>
        </div>
        <PresetPicker />
      </div>
      <div className="case-grid">
        <div className="stack">
          <div className="panel stack">
            <div>
              <h2>Inputs</h2>
              <p className="muted">{COST_CASE.question}</p>
            </div>
            <div className="fields">
              <NumberField label="Years of use" unit="years" min={1} max={40} value={life.years} onChange={(v) => setLife({ years: v })} />
              <NumberField
                label="Distance per year"
                unit="km"
                min={1000}
                max={80000}
                sliderMax={50000}
                step={500}
                value={life.kmPerYear}
                onChange={(v) => setLife({ kmPerYear: v })}
              />
              <NumberField label={`Electricity price (${cur})`} unit="/kWh" min={0} max={40} step={0.1} value={ci.energyPrice} onChange={(v) => setCost({ energyPrice: v })} />
              <NumberField
                label={`Maintenance per year (${cur})`}
                unit="/year"
                min={0}
                max={100000}
                sliderMax={40000}
                step={500}
                value={ci.maintenancePerYear}
                onChange={(v) => setCost({ maintenancePerYear: v })}
              />
              <p className="faint">
                Years, distance and the driving behind the energy ({num(life.speedKmh, 0)} km/h on average, cabin AC / heating {num(life.usagePct, 0)} %
                of the time) are shared with the <a href="#stress-tests">Battery life</a> stress test. Cars with their own energy price or
                maintenance in cars.csv keep those.
              </p>
            </div>
          </div>
          <ConditionsPanel />
        </div>
        <div className={`panel stack ${stale ? 'stale' : ''}`} style={{ minWidth: 0 }}>
          {ids.length === 0 ? (
            <p className="muted">No cars selected (Compare → Cars).</p>
          ) : (
            <>
              <StackedRows
                rows={rows}
                series={[
                  { key: 'buy', label: 'Purchase', color: 'var(--series-1)' },
                  { key: 'energy', label: 'Energy', color: 'var(--series-2)' },
                  { key: 'maint', label: 'Maintenance', color: 'var(--series-3)' },
                ]}
              />
              {missing.length > 0 && <p className="faint">No price in cars.csv: {missing.map(name).join(', ')}</p>}
              <p className="faint">
                Totals over {num(life.years, 0)} years and {compact(life.years * life.kmPerYear)} km in {cur}; the bar ends show the cost per km.
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Car</th>
                      <th className="r">Purchase</th>
                      <th className="r">Energy</th>
                      <th className="r">Maintenance</th>
                      <th className="r">Total</th>
                      <th className="r">{cur}/km</th>
                      <th className="r" title="Energy paid for: from the grid, including charging losses">
                        Energy per 100 km
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...priced, ...missing].map((id) => {
                      const c = out.results[id].cost;
                      const u = derivedById[id].energyUnit;
                      return (
                        <tr key={id}>
                          <td>
                            <button type="button" className="link-btn" onClick={() => open(id)}>
                              {name(id)}
                            </button>
                          </td>
                          <td className="r">{compact(c.purchase)}</td>
                          <td className="r">{compact(c.energyCost)}</td>
                          <td className="r">{compact(c.maintenanceCost)}</td>
                          <td className="r">{compact(c.tco)}</td>
                          <td className="r">{fixed(c.costPerKm, 2)}</td>
                          <td className="r">
                            {fixed(c.energyPerKm * 100, 1)} {u}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="faint">
                Amounts in {cur} ({compact(1e6)} = 1 million). Energy per 100 km is what you pay for: from the grid, including charging losses
                ({num(a.chargingEfficiencyPct, 0)} % charging efficiency), the onboard systems and battery heating/cooling.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
