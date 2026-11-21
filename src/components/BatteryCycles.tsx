// Assumptions page: rated battery cycles — the chemistry defaults (data/battery/chemistries.csv) and the makers'
// figures for single cars (data/cars.csv battery_cycles + battery_cycles_source), with their sources.
import { Fragment } from 'react';
import { num } from '../format';
import { useEngine } from '../state/engine';
import { SourceText } from './RunningCosts';

export function BatteryCyclesTable() {
  const { ds, baseAssumptions: a } = useEngine();
  const chems = Object.values(ds.chemistries).filter((c) => c.ratedCycles !== null);
  // Every car of cars.csv with its own figure, once, with the markets that sell it (a market may rate it differently).
  const groups = new Map<string, typeof ds.cars>();
  for (const c of ds.cars) {
    if (c.powertrain !== 'BEV' || c.batteryCycles === null) continue;
    const key = [c.specId ?? c.id, c.batteryCycles, c.endOfLifeCapacityPct, c.batteryCyclesSources.join(';')].join('|');
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const makers = [...groups.values()].map((cs) => ({ ...cs[0], markets: cs.map((c) => c.market).filter(Boolean) }));
  const defaults = (chem: string) =>
    new Set(ds.cars.filter((c) => c.powertrain === 'BEV' && c.batteryCycles === null && c.batteryType === chem).map((c) => c.specId ?? c.id)).size;
  if (chems.length === 0 && makers.length === 0) return null;
  const capacity = (pct: number | null) => `${num(pct ?? a.ratedCyclesEndCapacityPct, 0)} %${pct === null ? ' (assumed)' : ''}`;
  return (
    <section className="panel stack" id="battery-cycles">
      <div>
        <h2>Rated battery cycles</h2>
        <p className="muted">
          The full charge cycles a battery is rated for set the size of its cycle wear: Battery life, and the capacity left after the km driven in the
          stress tests. A car uses its maker's figure where one was found for that car's own battery (<span className="mono">data/cars.csv</span>,
          columns <span className="mono">battery_cycles</span> and <span className="mono">battery_cycles_source</span>); every other car uses its
          chemistry's default (<span className="mono">data/battery/chemistries.csv</span>). Makers rate their batteries under their own test conditions
          and capacity limits, so the figures compare only roughly. BYD states its 5,000 cycles without a capacity limit; they are read as running
          down to the 70 % battery health BYD guarantees in its battery warranty, like XPeng's rating. That equals about 3,000 cycles to 80 %, the
          figure BYD itself gave at the Blade battery's launch and still gives in some markets. Calendar ageing (time and heat) comes on top and is
          the same for every car of a chemistry.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Not used: NREL's lab cells. Their cycle figures are higher than the defaults, but together with their own calendar ageing they predict more
          capacity than the fleet measurements show (LFP by 2.7, NMC by 7.7 points on average). The calendar ageing is therefore fitted to the fleet
          data with the defaults below.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table cycles-table">
          <thead>
            <tr>
              <th>Battery</th>
              <th className="r">Rated cycles</th>
              <th className="r">Capacity at those cycles</th>
            </tr>
          </thead>
          <tbody>
            {chems.map((c) => (
              <Fragment key={c.chemistry}>
                <tr className="main">
                  <td>
                    {c.chemistry} default
                    <div className="faint">{defaults(c.chemistry)} cars of cars.csv without a maker figure</div>
                  </td>
                  <td className="r num">{num(c.ratedCycles ?? 0, 0)}</td>
                  <td className="r num">{capacity(null)}</td>
                </tr>
                <tr className="note">
                  <td colSpan={3}>
                    {c.ratedCyclesNote} · <SourceText ids={c.ratedCyclesSources} sources={ds.sources} />
                  </td>
                </tr>
              </Fragment>
            ))}
            {makers.map((c) => {
              const used = c.batteryCyclesSources.map((id) => ds.sources.find((x) => x.id === id)?.usedFor).filter(Boolean);
              return (
                <Fragment key={c.id}>
                  <tr className="main">
                    <td>
                      {c.name}
                      <div className="faint">
                        {c.batteryType ?? ''} · {c.markets.length > 1 ? 'markets' : 'market'} {c.markets.join(', ') || '–'}
                      </div>
                    </td>
                    <td className="r num">{num(c.batteryCycles ?? 0, 0)}</td>
                    <td className="r num">{capacity(c.endOfLifeCapacityPct)}</td>
                  </tr>
                  <tr className="note">
                    <td colSpan={3}>
                      {used.map((u) => `${u} · `).join('')}
                      <SourceText ids={c.batteryCyclesSources} sources={ds.sources} />
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
