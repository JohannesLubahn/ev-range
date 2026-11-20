// Assumptions page: the running costs of the market in use (data/running_costs.csv) as rows of the Costs group, with
// their sources like every other assumption, and the road-tax bands (data/road_tax.csv).
import { Fragment, type MouseEvent } from 'react';
import type { RoadTaxRow, RunningCostRow, Source } from '../data/types';
import { COST_ITEMS, COST_ITEM_LABELS, type CostItem } from '../engine/costItems';
import { marketCosts } from '../engine/costs';
import type { Assumptions } from '../engine/types';
import { num } from '../format';
import { useEngine } from '../state/engine';

/** "Source: Green Energy Thailand 2026; Krungsri Research 2024" with links to the numbered list; judgement if none. */
export function SourceText({ ids, sources }: { ids: string[]; sources: Source[] }) {
  if (ids.length === 0) return <>Source: judgement (no source found)</>;
  return (
    <>
      Source:{' '}
      {ids.map((id, i) => {
        const s = sources.find((x) => x.id === id);
        // Your own files by name (e.g. "EV Calculations.ods"), others by publisher and year.
        const text = !s ? id : s.topic === 'Your files' ? s.title.split(' (')[0] : [s.publisher || s.authors, s.year].filter(Boolean).join(' ') || s.title;
        return (
          <Fragment key={id}>
            {i > 0 && '; '}
            <a href={`#source-${id}`} title={s?.title} onClick={jump(`source-${id}`)}>
              {text}
            </a>
          </Fragment>
        );
      })}
    </>
  );
}

const unique = <T,>(xs: T[]) => [...new Set(xs)];

/** The page is chosen by the URL hash, so links within the page scroll instead of changing the hash. */
function jump(id: string) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}

/**
 * The running costs as assumption rows (label, value, why · source). Values are the standard of the Cost page's inputs;
 * they are changed there (for the session) or in data/running_costs.csv, so they are read-only here.
 */
export function RunningCostRows({ a }: { a: Assumptions }) {
  const { ds } = useEngine();
  const mc = marketCosts(a);
  const name = ds.markets.find((m) => m.id === mc.market)?.name ?? mc.market;
  const unitOf = (r: RunningCostRow) => r.unit.replace(mc.currency, a.displayCurrency);
  const row = (key: string, label: string, item: CostItem, r: RunningCostRow, pt: 'BEV' | 'ICE') => {
    const v = mc.value(item, pt);
    return (
      <div key={key} className="assumption">
        <label htmlFor={`rc-${key}`}>
          {label} <span className="faint">({unitOf(r)})</span>
        </label>
        <input id={`rc-${key}`} type="text" value={num(v, v % 1 === 0 ? 0 : 2)} readOnly title="Change it on the Cost of ownership page, or for good in data/running_costs.csv" />
        <span className="desc">
          {r.why} · <SourceText ids={r.sources} sources={ds.sources} />
        </span>
      </div>
    );
  };
  const tax = mc.roadTax;
  return (
    <>
      <h3 className="assumption-subhead">
        Running costs ({name}
        {mc.currency !== a.displayCurrency ? `, converted to ${a.displayCurrency}` : ''})
      </h3>
      <p className="faint assumption-note">
        The standard of the Cost of ownership&rsquo;s inputs (<span className="mono">data/running_costs.csv</span>); change them on the{' '}
        <a href="#cost">Cost of ownership</a> page. Cars can override servicing, insurance, tyre price and energy price in cars.csv.
      </p>
      {COST_ITEMS.flatMap((item) => {
        const bev = mc.row(item, 'BEV');
        const ice = mc.row(item, 'ICE');
        if (!bev || !ice) return [];
        const label = COST_ITEM_LABELS[item];
        if (bev === ice) return [row(item, label, item, bev, 'BEV')];
        return [row(`${item}-bev`, `${label}, electric`, item, bev, 'BEV'), row(`${item}-ice`, `${label}, petrol`, item, ice, 'ICE')];
      })}
      {tax.length > 0 && (
        <div className="assumption">
          <label htmlFor="rc-road-tax">
            Road tax <span className="faint">({a.displayCurrency}/year)</span>
          </label>
          <input id="rc-road-tax" type="text" value="table" readOnly title="Bands in the Road tax section (data/road_tax.csv)" />
          <span className="desc">
            Electric cars by curb weight, petrol cars by engine size (Germany: plus CO₂), less for older cars where the law says so: see{' '}
            <a href="#road-tax" onClick={jump('road-tax')}>
              Road tax
            </a> ·{' '}
            <SourceText ids={unique(tax.flatMap((r) => r.sources))} sources={ds.sources} />
          </span>
        </div>
      )}
    </>
  );
}

function TaxRange({ r, unit }: { r: RoadTaxRow; unit: string }) {
  if (unit === 'years') {
    if (r.upTo === null) return <>from year {num(r.above + 1, 0)}</>;
    return r.upTo - r.above > 1 ? (
      <>
        years {num(r.above + 1, 0)}–{num(r.upTo, 0)}
      </>
    ) : (
      <>year {num(r.upTo, 0)}</>
    );
  }
  if (r.upTo === null) return r.above === 0 ? <>every {unit}</> : <>above {num(r.above, 0)} {unit}</>;
  return (
    <>
      {num(r.above, 0)}–{num(r.upTo, 0)} {unit}
    </>
  );
}

/** The road-tax bands of the market in use (in its own currency, as in data/road_tax.csv). */
export function RoadTaxTables({ a }: { a: Assumptions }) {
  const { ds } = useEngine();
  const mc = marketCosts(a);
  const name = ds.markets.find((m) => m.id === mc.market)?.name ?? mc.market;
  const cur = mc.currency;
  const tax = ds.roadTax.filter((r) => r.market === mc.market);
  if (tax.length === 0) return null;
  // A band is the tax of the whole band; a per-unit row is a rate per kg, cc or g/km within its band.
  const amount = (r: RoadTaxRow, unit: string) =>
    r.kind === 'band' ? `${num(r.amount, 0)} ${cur}/year` : `${num(r.amount, r.amount < 0.1 ? 4 : 2)} ${cur} per ${unit}`;
  const all: { title: string; rows: RoadTaxRow[]; unit: string; fmt: (r: RoadTaxRow) => string }[] = [
    { title: 'Electric cars, by curb weight', rows: tax.filter((r) => r.powertrain === 'BEV' && r.basis === 'weight_kg'), unit: 'kg', fmt: (r) => amount(r, 'kg') },
    { title: 'Electric cars, new', rows: tax.filter((r) => r.powertrain === 'BEV' && r.basis === 'age_years'), unit: 'years', fmt: (r) => `−${num(r.amount, 0)} %` },
    { title: 'Petrol cars, by engine size', rows: tax.filter((r) => r.powertrain === 'ICE' && r.basis === 'engine_cc'), unit: 'cc', fmt: (r) => amount(r, 'cc') },
    { title: 'Petrol cars, by CO₂ (added)', rows: tax.filter((r) => r.powertrain === 'ICE' && r.basis === 'co2_g_km'), unit: 'g/km', fmt: (r) => amount(r, 'g/km') },
    { title: 'Petrol cars, older', rows: tax.filter((r) => r.powertrain === 'ICE' && r.basis === 'age_years'), unit: 'years', fmt: (r) => `−${num(r.amount, 0)} %` },
  ];
  const groups = all.filter((g) => g.rows.length > 0);
  return (
    <section className="panel stack" id="road-tax">
      <div>
        <h2>Road tax ({name})</h2>
        <p className="muted">
          Per year, in {cur}. Kept in <span className="mono">data/road_tax.csv</span>.{' '}
          {unique(tax.map((r) => r.why).filter(Boolean))
            .map((w) => (/[.!?]$/.test(w) ? w : `${w}.`))
            .join(' ')}{' '}
          <SourceText ids={unique(tax.flatMap((r) => r.sources))} sources={ds.sources} />.
        </p>
      </div>
      <div className="tax-groups">
        {groups.map((g) => (
          <div key={g.title} style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{g.title}</th>
                  <th className="r">Tax</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.above}>
                    <td>
                      <TaxRange r={r} unit={g.unit} />
                    </td>
                    <td className="r num">{g.fmt(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
