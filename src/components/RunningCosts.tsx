// Assumptions page: the running costs of the market in use (data/running_costs.csv) and its road tax (data/road_tax.csv).
import type { RoadTaxRow, RunningCostRow } from '../data/types';
import { COST_ITEMS, COST_ITEM_LABELS } from '../engine/costItems';
import { num } from '../format';
import { useEngine } from '../state/engine';

function SourceLinks({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <span className="chip est">judgement</span>;
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <a href={`#source-${id}`}>{id}</a>
        </span>
      ))}
    </>
  );
}

const value = (r: RunningCostRow | undefined) => (r ? num(r.value, r.value % 1 === 0 ? 0 : 2) : '–');

function TaxRange({ r, unit }: { r: RoadTaxRow; unit: string }) {
  if (r.upTo === null) return <>above {num(r.above, 0)} {unit}</>;
  return (
    <>
      {num(r.above, 0)}–{num(r.upTo, 0)} {unit}
    </>
  );
}

export function RunningCosts() {
  const { ds, a, market } = useEngine();
  const m = a.costMarket;
  const name = ds.markets.find((x) => x.id === m)?.name ?? m;
  const currency = a.marketCurrencies[m] ?? a.displayCurrency;
  const rows = ds.runningCosts.filter((r) => r.market === m);
  const tax = ds.roadTax.filter((r) => r.market === m);
  const find = (item: string, pt: 'BEV' | 'ICE') => rows.find((r) => r.item === item && r.powertrain === pt) ?? rows.find((r) => r.item === item && r.powertrain === 'all');
  const allGroups: { title: string; rows: RoadTaxRow[]; unit: string; fmt: (r: RoadTaxRow) => string }[] = [
    { title: 'Electric cars, by curb weight', rows: tax.filter((r) => r.powertrain === 'BEV' && r.basis === 'weight_kg'), unit: 'kg', fmt: (r) => `${num(r.amount, 0)} ${currency}/year` },
    { title: 'Petrol cars, by engine size', rows: tax.filter((r) => r.powertrain === 'ICE' && r.basis === 'engine_cc'), unit: 'cc', fmt: (r) => `${num(r.amount, 2)} ${currency} per cc` },
    { title: 'Petrol cars, older', rows: tax.filter((r) => r.powertrain === 'ICE' && r.basis === 'age_years'), unit: 'years', fmt: (r) => `−${num(r.amount, 0)} %` },
  ];
  const taxGroups = allGroups.filter((g) => g.rows.length > 0);
  return (
    <section className="panel stack" id="running-costs">
      <div>
        <h2>Running costs ({name})</h2>
        <p className="muted">
          The standard of the Cost of ownership&rsquo;s inputs, in {currency}
          {market ? '' : ` (All markets: ${name}'s, converted to ${a.displayCurrency})`}. Change them for one session on the Cost page, or for good
          in <span className="mono">data/running_costs.csv</span> and <span className="mono">data/road_tax.csv</span>. Values without a source are
          judgement values. Cars can override servicing, insurance, tyre price and energy price in cars.csv.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="r">Electric</th>
              <th className="r">Petrol</th>
              <th>Unit</th>
              <th>Why</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {COST_ITEMS.map((item) => {
              const bev = find(item, 'BEV');
              const ice = find(item, 'ICE');
              const same = bev === ice;
              const rs = same ? [bev] : [bev, ice];
              return (
                <tr key={item}>
                  <td>{COST_ITEM_LABELS[item]}</td>
                  {same ? (
                    <td className="r num" colSpan={2}>
                      {value(bev)}
                    </td>
                  ) : (
                    <>
                      <td className="r num">{value(bev)}</td>
                      <td className="r num">{value(ice)}</td>
                    </>
                  )}
                  <td className="muted">{bev?.unit ?? ''}</td>
                  <td className="muted" style={{ minWidth: 260 }}>
                    {rs.map((r, i) => (
                      <div key={i}>{r?.why}</div>
                    ))}
                  </td>
                  <td>
                    <SourceLinks ids={[...new Set(rs.flatMap((r) => r?.sources ?? []))]} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {taxGroups.length > 0 && (
        <>
          <h3>Road tax per year</h3>
          <div className="tax-groups">
            {taxGroups.map((g) => (
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
                      <tr key={`${r.above}`}>
                        <td>
                          {g.unit === 'years' ? (
                            r.upTo === null ? (
                              <>from year {num(r.above + 1, 0)}</>
                            ) : (
                              <>year {num(r.upTo, 0)}</>
                            )
                          ) : (
                            <TaxRange r={r} unit={g.unit} />
                          )}
                        </td>
                        <td className="r num">{g.fmt(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="faint">
            {[...new Set(tax.map((r) => r.why).filter(Boolean))].join(' ')} Sources: <SourceLinks ids={[...new Set(tax.flatMap((r) => r.sources))]} />
          </p>
        </>
      )}
    </section>
  );
}
