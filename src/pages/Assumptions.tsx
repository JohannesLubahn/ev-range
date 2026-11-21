import { IconExternal } from '../components/Icons';
import type { Source } from '../data/types';
import { NUMERIC_KEYS } from '../engine/assumptions';
import type { Assumptions } from '../engine/types';
import { RoadTaxTables, RunningCostRows } from '../components/RunningCosts';
import { BatteryCyclesTable } from '../components/BatteryCycles';
import { ProfileTable } from '../components/Driving';
import { TerrainTable } from '../components/Terrain';
import { num } from '../format';
import { ALL_MARKETS } from '../state/carList';
import { useEngine } from '../state/engine';
import { useStore } from '../state/store';

type Key = Exclude<keyof Assumptions, 'fx'>;

const GROUP_ORDER = ['Battery', 'Cabin climate', 'Charging', 'Driving physics', 'Driving style', 'Test conditions', 'Costs', 'Exchange rates'];

/** The source list (data/sources.csv), numbered across topics, with clickable links. */
function SourceList({ sources }: { sources: Source[] }) {
  const topics = [...new Set(sources.map((s) => s.topic))];
  let n = 0;
  return (
    <div className="sources">
      {topics.map((topic) => {
        const items = sources.filter((s) => s.topic === topic);
        const start = n + 1;
        n += items.length;
        return (
          <div key={topic} className="source-group">
            <h3>{topic}</h3>
            <ol start={start}>
              {items.map((s) => (
                <li key={s.id || s.title} id={s.id ? `source-${s.id}` : undefined}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                      <IconExternal size={12} className="ext" />
                    </a>
                  ) : (
                    <span className="title">{s.title}</span>
                  )}
                  <div className="meta">{[s.authors, s.publisher, s.year].filter(Boolean).join(' · ')}</div>
                  {s.usedFor && <div className="used">Used for: {s.usedFor}</div>}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

export function AssumptionsPage() {
  const { ds, baseAssumptions, assumptionsFor, market } = useEngine();
  // The assumptions as set here, before the market's currency and prices (data/markets.csv) replace some of them.
  const a = assumptionsFor(ALL_MARKETS);
  // Running costs and road tax: those of the market picked in the car list (All markets: the default cost market).
  const costA = market ? assumptionsFor(market.id) : a;
  const overrides = useStore((s) => s.assumptionOverrides);
  const fxOverrides = useStore((s) => s.fxOverrides);
  const setAssumption = useStore((s) => s.setAssumption);
  const setFx = useStore((s) => s.setFx);
  const reset = useStore((s) => s.resetAssumptions);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const defs = Object.values(ds.assumptions);
  const groups = [...new Set(defs.map((d) => d.group))].sort((x, y) => {
    const ix = GROUP_ORDER.indexOf(x);
    const iy = GROUP_ORDER.indexOf(y);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
  });
  const changed = Object.keys(overrides).length + Object.keys(fxOverrides).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Assumptions</h1>
          <p className="muted">
            Every constant the model uses. Defaults come from <span className="mono">data/assumptions.csv</span>; changes here are kept in this
            browser. To change a default for good, edit the CSV.
          </p>
        </div>
        <button type="button" className="btn" disabled={changed === 0} onClick={reset}>
          Reset to defaults{changed ? ` (${changed} changed)` : ''}
        </button>
      </div>

      <section className="panel stack">
        <h2>Model</h2>
        <div className="row">
          <span className="muted" style={{ minWidth: 120 }}>
            Battery
          </span>
          <div className="segmented" role="group" aria-label="Battery model">
            <button type="button" aria-pressed={settings.battery === 'chemistry'} onClick={() => setSettings({ battery: 'chemistry' })}>
              Chemistry curves
            </button>
            <button type="button" aria-pressed={settings.battery === 'ideal'} onClick={() => setSettings({ battery: 'ideal' })}>
              Ideal (no losses)
            </button>
          </div>
        </div>
        <p className="faint">
          Consumption comes from the physics: air drag, rolling resistance, slope and acceleration on real speed profiles, calibrated per car;
          heating and AC from a heat balance of the cabin (air temperature, sun, humidity); battery temperature from the pack’s heat capacity,
          its losses and the thermal management. Chemistry curves: open-circuit voltage, internal resistance and capacity per battery type and
          temperature. Ideal: every kWh of the charge window is delivered, at any temperature and load, as in your spreadsheet.
        </p>
      </section>

      <div className="assumption-groups">
        {groups.map((g) => (
          <section key={g} className="panel">
            <h2 style={{ marginBottom: 4 }}>{g}</h2>
            {defs
              .filter((d) => d.group === g)
              .map((d) => {
                const fxMatch = /^fx_([A-Z]{3})$/i.exec(d.key);
                const key = NUMERIC_KEYS[d.key] as Key | undefined;
                const TEXT_KEYS: Record<string, 'defaultBasis' | 'displayCurrency' | 'costMarket'> = {
                  default_basis: 'defaultBasis',
                  display_currency: 'displayCurrency',
                  cost_default_market: 'costMarket',
                };
                const textKey = TEXT_KEYS[d.key];
                const current = fxMatch ? a.fx[fxMatch[1].toUpperCase()] : key ? (a[key] as number) : textKey ? (a[textKey] as string) : d.value;
                const base = fxMatch
                  ? baseAssumptions.fx[fxMatch[1].toUpperCase()]
                  : key
                    ? (baseAssumptions[key] as number)
                    : d.value;
                const isChanged = String(current) !== String(base);
                const id = `as-${d.key}`;
                return (
                  <div key={d.key} className={`assumption ${isChanged ? 'changed' : ''}`}>
                    <label htmlFor={id}>
                      {d.label} {d.unit && <span className="faint">({d.unit})</span>}
                    </label>
                    {d.key === 'default_basis' ? (
                      <select id={id} value={String(current)} onChange={(e) => setAssumption('defaultBasis', e.target.value)}>
                        {['WLTP', 'NEDC', 'CLTC', 'EPA'].map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    ) : d.key === 'display_currency' || d.key === 'cost_default_market' ? (
                      <input id={id} type="text" value={String(current)} readOnly title="Set in data/assumptions.csv" />
                    ) : (
                      <input
                        id={id}
                        type="number"
                        step="any"
                        value={typeof current === 'number' ? current : Number(current)}
                        onChange={(e) => {
                          const v = e.target.value === '' ? undefined : Number(e.target.value);
                          if (v !== undefined && !Number.isFinite(v)) return;
                          if (fxMatch) setFx(fxMatch[1].toUpperCase(), v);
                          else if (key) setAssumption(key, v === base ? undefined : v);
                        }}
                      />
                    )}
                    <span className="desc">
                      {[
                        d.description,
                        d.source ? `Source: ${d.source}` : '',
                        isChanged ? `default ${typeof base === 'number' ? num(base, 4) : base}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                );
              })}
            {g === 'Costs' && <RunningCostRows a={costA} />}
          </section>
        ))}
      </div>

      <section className="panel stack" id="markets">
        <div>
          <h2>Markets</h2>
          <p className="muted">
            The market picked in the car list sets the cars listed, the currency and the running costs below. Kept in{' '}
            <span className="mono">data/markets.csv</span>; the <span className="mono">market</span> column of cars.csv refers to its ids.
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Currency</th>
                <th>Running costs</th>
              </tr>
            </thead>
            <tbody>
              {ds.markets.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name} <span className="faint mono">{m.id}</span>
                  </td>
                  <td>{m.currency}</td>
                  <td className="muted">{ds.runningCosts.some((r) => r.market === m.id) ? 'own (below)' : `${baseAssumptions.costMarket}'s, converted`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <BatteryCyclesTable />

      <ProfileTable />

      <TerrainTable />

      <RoadTaxTables a={costA} />

      <section className="panel stack" id="sources">
        <div>
          <h2>Sources</h2>
          <p className="muted">
            Everything the values above and the model tables rest on, with links. The list is kept in{' '}
            <span className="mono">data/sources.csv</span>: add a row there when you cite a new source.
          </p>
        </div>
        <SourceList sources={ds.sources} />
      </section>

      <section className="panel stack">
        <h2>Other model tables</h2>
        <p className="muted">These tables are edited directly as CSV files; the Physics page charts them.</p>
        <ul className="flags">
          <li>
            <span className="mono">data/body_types.csv</span> <span className="muted">default drag coefficient and frontal area per body type</span>
          </li>
          <li>
            <span className="mono">data/onboard/classes.csv</span>{' '}
            <span className="muted">electronics and cabin properties (walls, fresh air, sun area, heat capacity) per car class, with sources</span>
          </li>
          <li>
            <span className="mono">data/onboard/measurements.csv</span>{' '}
            <span className="muted">published onboard-power measurements the model is checked against (Physics page)</span>
          </li>
          <li>
            <span className="mono">data/onboard/facts_tab.csv</span>{' '}
            <span className="muted">your Facts-tab onboard curves, kept for comparison only</span>
          </li>
          <li>
            <span className="mono">data/battery/*.csv</span> <span className="muted">voltage curves, resistance and capacity vs. temperature per chemistry</span>
          </li>
          <li>
            <span className="mono">data/cycles/*.csv</span> <span className="muted">official test-cycle speed traces used for the calibration</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
