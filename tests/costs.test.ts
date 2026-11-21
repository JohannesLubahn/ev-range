// Running costs of the cost of ownership (user request 2026-11-20): data/markets/<id>/ (costs.csv, road_tax.csv),
// data/costs/items.csv, data/blocs.csv (user's choice 2026-11-21: a folder per market, values inherited along
// market → bloc → World, gaps instead of borrowed values), src/engine/costs.ts and cost() in src/engine/cases.ts.
import { describe, expect, it } from 'vitest';
import { bundledFiles, loadBundledDataset } from '../src/data/bundled';
import { parseCostItems, parseDataset, parseRoadTax, parseRunningCosts } from '../src/data/parse';
import { applyMarket, assumptionsFromDataset } from '../src/engine/assumptions';
import { COST_ITEMS } from '../src/engine/costItems';
import { carValue, costChain, marketCosts, ownership, roadTaxBase, roadTaxDiscountPct, type OwnershipCar } from '../src/engine/costs';
import { marketCostInputs } from '../src/engine/inputs';
import { standardScenario } from '../src/engine/scenario';
import { runEngine } from '../src/engine/run';
import { withDefaults } from '../src/engine/scenario';
import { previousStandard } from './previousStandard';
import type { CostInputs, Scenario } from '../src/engine/types';

const ds = loadBundledDataset();
const a = applyMarket(assumptionsFromDataset(ds), ds.markets.find((m) => m.id === 'TH'));
const mc = marketCosts(a);
const std = previousStandard(ds, a);
const settings = { battery: 'chemistry' } as const;
const run = (s: Scenario, ids: string[]) => runEngine(ds, a, s, settings, ids).results;

describe('data/markets/<id>/ (costs.csv, road_tax.csv), data/costs/items.csv and data/blocs.csv', () => {
  it('read without warnings; Thailand and Germany have every item for both powertrains, and a road-tax table', () => {
    expect(ds.loadWarnings.filter((w) => /markets|blocs|costs\/items|road_tax/.test(w))).toEqual([]);
    for (const id of ['TH', 'DE']) {
      const m = marketCosts(applyMarket(assumptionsFromDataset(ds), ds.markets.find((x) => x.id === id)));
      expect(m.missing, id).toEqual([]);
      for (const item of COST_ITEMS) for (const pt of ['BEV', 'ICE'] as const) expect(m.value(item, pt), `${id} ${item} ${pt}`).not.toBeNull();
      for (const pt of ['BEV', 'ICE']) expect(m.roadTax.some((r) => r.powertrain === pt && r.basis !== 'age_years'), `${id} road tax ${pt}`).toBe(true);
    }
  });
  it('items.csv lists every item the cost of ownership uses; money is never inherited', () => {
    expect(ds.costItems.map((d) => d.item).sort()).toEqual([...COST_ITEMS].sort());
    for (const d of ds.costItems) if (d.money) expect(d.inherit, d.item).toBe(false);
    const w: string[] = [];
    parseCostItems('item,label,unit,money,inherit,required\nelectricity_price,x,y,yes,yes,yes\npetrol_tax,x,y,no,no,yes\n', w);
    expect(w.some((x) => x.includes('electricity_price is money and cannot be inherited'))).toBe(true);
    expect(w.some((x) => x.includes('"petrol_tax" is not used'))).toBe(true);
    expect(w.some((x) => x.includes('depreciation_pct is missing'))).toBe(true);
  });
  it('markets inherit engineering values and judgements from their bloc, then World; own values come first', () => {
    expect(ds.markets.find((m) => m.id === 'DE')?.parent).toBe('EU');
    expect(costChain('DE', a.marketParents)).toEqual(['DE', 'EU', 'WORLD']);
    expect(costChain('TH', a.marketParents)).toEqual(['TH', 'WORLD']);
    const tyre = mc.source('tyre_life_km', 'BEV');
    expect(tyre).toMatchObject({ from: 'WORLD', inherited: true });
    expect(mc.value('tyre_life_km', 'BEV')).toBe(45000);
    expect(mc.source('warranty_years', 'BEV')).toMatchObject({ from: 'TH', inherited: false });
    // A bloc value counts for its markets unless they have their own; the market's own row wins over the bloc's.
    const files = { ...bundledFiles.marketFiles, EU: { costs: 'item,powertrain,value,unit,why,source\nwarranty_years,all,2,years,Judgement,\nrepairs_pct,all,1.5,%,Judgement,\n' } };
    const d2 = parseDataset({ ...bundledFiles, marketFiles: files });
    const de = marketCosts(applyMarket(assumptionsFromDataset(d2), d2.markets.find((m) => m.id === 'DE')));
    expect(de.source('repairs_pct', 'BEV')).toMatchObject({ from: 'EU', inherited: true });
    expect(de.value('repairs_pct', 'BEV')).toBe(1.5);
    expect(de.value('warranty_years', 'BEV')).toBe(3); // Germany's own
    const th = marketCosts(applyMarket(assumptionsFromDataset(d2), d2.markets.find((m) => m.id === 'TH')));
    expect(th.value('repairs_pct', 'BEV')).toBe(1); // Thailand is not in the EU: World's
  });
  it('a market without its own data has gaps, never another market’s values', () => {
    const d2 = parseDataset({ ...bundledFiles, markets: bundledFiles.markets + 'FR,France,EU,EUR,,\n' });
    expect(d2.loadWarnings).toEqual(ds.loadWarnings);
    const fr = marketCosts(applyMarket(assumptionsFromDataset(d2), d2.markets.find((m) => m.id === 'FR')));
    expect(fr.value('electricity_price', 'BEV')).toBeNull();
    expect(fr.value('depreciation_pct', 'BEV')).toBeNull();
    expect(fr.value('tyre_life_km', 'BEV')).toBe(45000); // inherited from World
    expect(fr.missing.map((x) => x.item)).toContain('electricity_price');
    expect(fr.missing.map((x) => x.item)).not.toContain('tyre_life_km');
    expect(fr.roadTax).toEqual([]);
  });
  it('blocs pass on only inheritable items and no road tax; unknown folders and ids are reported', () => {
    const w = (files: Record<string, { costs?: string; roadTax?: string }>, extra = {}) =>
      parseDataset({ ...bundledFiles, ...extra, marketFiles: { ...bundledFiles.marketFiles, ...files } }).loadWarnings;
    expect(w({ EU: { costs: 'item,powertrain,value\nelectricity_price,all,0.5\n' } }).some((x) => x.includes('electricity_price is market data'))).toBe(true);
    expect(w({ EU: { roadTax: 'powertrain,basis,above,up_to,amount,kind,source\nBEV,weight_kg,0,,0,band,x\n' } }).some((x) => x.includes('not per bloc'))).toBe(true);
    expect(w({ XX: { costs: 'item,powertrain,value\nrepairs_pct,all,1\n' } }).some((x) => x.includes('"XX" is neither in markets.csv nor in blocs.csv'))).toBe(true);
    expect(w({}, { markets: bundledFiles.markets + 'Thai,Thailand again,WORLD,THB,,\n' }).some((x) => x.includes('not an ISO 3166 code'))).toBe(true);
    expect(w({}, { blocs: bundledFiles.blocs + 'A,Loop A,B,,\nB,Loop B,A,,\n' }).some((x) => x.includes('loop'))).toBe(true);
    expect(w({}, { markets: bundledFiles.markets + 'FR,France,NOPE,EUR,,\n' }).some((x) => x.includes('parent "NOPE"'))).toBe(true);
  });
  it('cites a listed source for every value, or says it is a judgement', () => {
    const ids = new Set(ds.sources.map((s) => s.id));
    for (const r of ds.runningCosts) {
      if (r.sources.length === 0) expect(r.why, r.item).toMatch(/^Judgement/);
      for (const id of r.sources) expect(ids.has(id), id).toBe(true);
    }
    for (const r of ds.roadTax) expect(r.sources.length).toBeGreaterThan(0);
  });
  it('reports unknown items, gaps and overlaps', () => {
    const w: string[] = [];
    parseRunningCosts('item,powertrain,value\npetrol_tax,all,1\nservicing_per_year,BEV,-1\n', 'XX', ds.costItems, w);
    expect(w.some((x) => x.includes('markets/XX/costs.csv') && x.includes('unknown item "petrol_tax"'))).toBe(true);
    expect(w.some((x) => x.includes('not a number ≥ 0'))).toBe(true);
    const w2: string[] = [];
    parseRoadTax('powertrain,basis,above,up_to,amount,kind\nBEV,weight_kg,0,1000,1,band\nBEV,weight_kg,900,2000,2,band\nBEV,weight_kg,2500,3000,3,band\n', 'XX', w2);
    expect(w2.some((x) => x.includes('overlap'))).toBe(true);
    expect(w2.some((x) => x.includes('gap between 2000 and 2500'))).toBe(true);
    const th = bundledFiles.marketFiles!.TH;
    const d2 = parseDataset({ ...bundledFiles, marketFiles: { ...bundledFiles.marketFiles, TH: { ...th, costs: th.costs + 'tyre_life_km,all,50000,km,x,no-such-source\n' } } });
    expect(d2.loadWarnings.some((x) => x.includes('"no-such-source" is not in sources.csv'))).toBe(true);
  });
  it('the standard of the cost inputs is the market', () => {
    expect(std.cost).toMatchObject({ energyPrice: 7.5, servicingBev: 5346, servicingIce: 17500, insuranceRateBev: 3, insuranceRateIce: 2.5, compulsoryInsurance: 645.21 });
    expect(std.cost).toMatchObject({ depreciationBev: 6.5, depreciationIce: 3.4, tyreLifeKm: 45000, warrantyYears: 8 });
  });
});

describe('road tax', () => {
  it('electric cars: by curb weight in bands', () => {
    expect(roadTaxBase(mc.roadTax, 'BEV', 1800, null).amount).toBe(1600);
    expect(roadTaxBase(mc.roadTax, 'BEV', 1750, null).amount).toBe(1300); // up to and including 1,750 kg
    expect(roadTaxBase(mc.roadTax, 'BEV', 1750.5, null).amount).toBe(1600);
    expect(roadTaxBase(mc.roadTax, 'BEV', 2200, null).amount).toBe(1900);
    const heavy = roadTaxBase(mc.roadTax, 'BEV', 3500, null);
    expect(heavy.amount).toBe(2200);
    expect(heavy.warning).toMatch(/highest band/);
  });
  it('petrol cars: per cc, progressive, and less from the 6th year', () => {
    expect(roadTaxBase(mc.roadTax, 'ICE', 1200, 988).amount).toBeCloseTo(600 * 0.5 + 388 * 1.5, 9);
    expect(roadTaxBase(mc.roadTax, 'ICE', 1200, 2000).amount).toBeCloseTo(300 + 1200 * 1.5 + 200 * 4, 9);
    expect(roadTaxBase(mc.roadTax, 'ICE', 1200, null).warning).toMatch(/Engine size/);
    expect([5, 6, 7, 10, 15].map((y) => roadTaxDiscountPct(mc.roadTax, 'ICE', y))).toEqual([0, 10, 20, 50, 50]);
    expect(roadTaxDiscountPct(mc.roadTax, 'BEV', 10)).toBe(0);
  });
  it('Germany, petrol: engine size plus CO₂ above 95 g/km, each gram at its band rate (ADAC: Golf 1.5 TSI 85 and 83 EUR)', () => {
    const de = marketCosts(applyMarket(assumptionsFromDataset(ds), ds.markets.find((m) => m.id === 'DE'))).roadTax;
    expect(Math.round(roadTaxBase(de, 'ICE', 1232, 1498, 122).amount!)).toBe(85); // Trend, 122 g/km
    expect(Math.round(roadTaxBase(de, 'ICE', 1232, 1498, 121).amount!)).toBe(83); // Life, 121 g/km
    expect(roadTaxBase(de, 'ICE', 1232, 1498, 90).amount).toBeCloseTo(29.96, 9); // below 95 g/km: engine size only
    expect(roadTaxBase(de, 'ICE', 1500, 2000, 200).amount).toBeCloseTo(40 + 20 * 2 + 20 * 2.2 + 20 * 2.5 + 20 * 2.9 + 20 * 3.4 + 5 * 4, 9);
    const noCo2 = roadTaxBase(de, 'ICE', 1232, 1498, null);
    expect(noCo2.amount).toBeCloseTo(29.96, 9);
    expect(noCo2.warning).toMatch(/CO₂ emissions/);
    // The Golf in cars.csv carries the values the tax needs.
    const golf = ds.cars.find((c) => c.id === 'vw-golf-15-tsi');
    expect(golf).toMatchObject({ powertrain: 'ICE', market: 'DE', engineCc: 1498, co2GPerKm: 122 });
  });
});

describe('ownership', () => {
  const car: OwnershipCar = {
    price: 1_000_000,
    powertrain: 'BEV',
    carClass: 'regular',
    curbKg: 1800,
    massKg: 1900,
    engineCc: null,
    co2GPerKm: null,
    servicingPerYear: null,
    insurancePerYear: null,
    tyreSetPrice: null,
  };
  const ci: CostInputs = std.cost;
  const line = (o: ReturnType<typeof ownership>, label: string) => o.lines.find((l) => l.label === label)?.value as number;

  it('the value falls by the same % each year: 81.7 % after 3 years at 6.5 %', () => {
    expect(carValue(100, 6.5, 3)).toBeCloseTo(81.74, 2);
    const o = ownership(car, { ...ci, years: 3 }, 3, 45000, mc, 'THB');
    expect(o.resale).toBeCloseTo(817_400, -2);
    expect(line(o, 'Depreciation')).toBeCloseTo(1_000_000 - (o.resale as number), 6);
  });
  it('voluntary insurance follows the value, down to the lowest premium', () => {
    const one = ownership(car, ci, 1, 15000, mc, 'THB');
    expect(line(one, 'Voluntary insurance')).toBeCloseTo(30_000, 6);
    const two = ownership(car, ci, 2, 30000, mc, 'THB');
    expect(line(two, 'Voluntary insurance') - 30_000).toBeCloseTo(30_000 * 0.935, 6);
    const cheap = ownership({ ...car, price: 100_000 }, ci, 1, 15000, mc, 'THB');
    expect(line(cheap, 'Voluntary insurance')).toBe(ci.insuranceMin);
    const quote = ownership({ ...car, insurancePerYear: 12_345 }, ci, 4, 60000, mc, 'THB');
    expect(line(quote, 'Voluntary insurance')).toBeCloseTo(4 * 12_345, 6);
  });
  it('repairs start after the warranty; the 12 V battery is replaced every 4 years, not at the end', () => {
    const o = ownership(car, ci, 20, 300000, mc, 'THB');
    expect(line(o, 'Repairs after the warranty')).toBeCloseTo(0.01 * 1_000_000 * 12, 6);
    expect(line(o, '12 V battery')).toBe(4 * 3500);
    expect(line(ownership(car, ci, 8, 120000, mc, 'THB'), 'Repairs after the warranty')).toBe(0);
  });
  it('tyres wear in proportion to the mass on them', () => {
    const light = line(ownership({ ...car, massKg: 1500 }, ci, 10, 150000, mc, 'THB'), 'Tyres');
    const heavy = line(ownership({ ...car, massKg: 2250 }, ci, 10, 150000, mc, 'THB'), 'Tyres');
    expect(light).toBeCloseTo((150000 / 45000) * 20000, 6);
    expect(heavy / light).toBeCloseTo(1.5, 9);
    const premium = line(ownership({ ...car, massKg: 1500, carClass: 'premium' }, ci, 10, 150000, mc, 'THB'), 'Tyres');
    expect(premium / light).toBeCloseTo(32000 / 20000, 9);
  });
  it('a fraction of a year counts in proportion', () => {
    const o = ownership(car, ci, 2.5, 37500, mc, 'THB');
    expect(line(o, 'Road tax')).toBeCloseTo(1600 * 2.5, 6);
    expect(line(o, 'Servicing')).toBeCloseTo(5346 * 2.5, 6);
  });
});

describe('cost of ownership per car', () => {
  const ids = ['byd-atto-3', 'aion-hyptec-ht', 'honda-city', 'neta-v'];
  const r = run(std, ids);
  it('the parts add up to the total: purchase − value at the end + running costs', () => {
    for (const id of ids) {
      const c = r[id].cost;
      const dep = c.parts.find((p) => p.key === 'depreciation')?.value as number;
      expect(dep, id).toBeCloseTo((c.purchase as number) - (c.resale as number), 6);
      const sum = c.parts.reduce((s, p) => s + (p.value ?? 0), 0);
      expect(c.tco, id).toBeCloseTo(sum, 6);
      expect(c.costPerKm, id).toBeCloseTo((c.tco as number) / (std.cost.years * std.cost.kmPerYear), 9);
    }
  });
  it('depends on the car: weight (tax, tyres), price (insurance, resale), powertrain (servicing, petrol tax by cc)', () => {
    const part = (id: string, key: string) => r[id].cost.parts.find((p) => p.key === key)?.value as number;
    // Aion Hyptec HT (2,220 kg, premium, 1,199,000) pays more tax, tyres and insurance than the Atto 3 (1,750 kg, 899,900).
    expect(part('aion-hyptec-ht', 'tax')).toBeGreaterThan(part('byd-atto-3', 'tax'));
    expect(part('aion-hyptec-ht', 'tyres')).toBeGreaterThan(part('byd-atto-3', 'tyres'));
    expect(part('aion-hyptec-ht', 'insurance')).toBeGreaterThan(part('byd-atto-3', 'insurance'));
    // Honda City: 988 cc → 882 THB/year, less from year 6; servicing of a petrol car.
    expect(part('honda-city', 'tax')).toBeLessThan(882 * 20);
    expect(part('honda-city', 'tax')).toBeGreaterThan(882 * 10);
    expect(part('honda-city', 'servicing')).toBeGreaterThan(part('byd-atto-3', 'servicing'));
    expect(r['honda-city'].cost.warnings).toEqual([]);
  });
  it('the drawer lists every category', () => {
    const labels = r['byd-atto-3'].cost.steps.map((s) => s.label);
    for (const l of ['Value at the end', 'Energy', 'Voluntary insurance', 'Compulsory insurance', 'Road tax', 'Servicing', 'Repairs after the warranty', '12 V battery', 'Tyres', 'Total cost of ownership']) {
      expect(labels, l).toContain(l);
    }
  });
  it('an old scenario with a changed maintenance per year keeps it as servicing', () => {
    const old = { ...std, cost: { energyPrice: 7.5, maintenancePerYear: 12000 } } as unknown as Scenario;
    const s = withDefaults(old, ds, a);
    expect(s.cost).toMatchObject({ servicingBev: 12000, servicingIce: 12000 });
    expect('maintenancePerYear' in s.cost).toBe(false);
    const untouched = withDefaults({ ...std, cost: { energyPrice: 7.5, maintenancePerYear: 8000 } } as unknown as Scenario, ds, a);
    expect(untouched.cost.servicingBev).toBe(5346);
  });
});

describe('gaps: a market without cost data (user’s choice 2026-11-21: show the gap, let the user type the value)', () => {
  const d2 = parseDataset({ ...bundledFiles, markets: bundledFiles.markets + 'FR,France,EU,EUR,,\n' });
  const base = assumptionsFromDataset(d2);
  const aFr = applyMarket(base, d2.markets.find((m) => m.id === 'FR'));
  const aDe = applyMarket(base, d2.markets.find((m) => m.id === 'DE'));
  const id = 'hyundai-inster';
  const sc = standardScenario(d2, aFr);

  it("the standard of a value the market lacks is empty, not another market's", () => {
    expect(sc.cost.energyPrice).toBeNull();
    expect(sc.cost.depreciationBev).toBeNull();
    expect(sc.cost.roadTaxPerYear).toBeNull();
    expect(sc.cost.tyreLifeKm).toBe(45000); // World's
    expect(marketCostInputs(aFr).energyPrice).toBeNull(); // switching to the market empties the field
  });
  it('the lines that need a missing value show a gap; the total has none', () => {
    const c = runEngine(d2, aFr, sc, settings, [id]).results[id].cost;
    expect(c.tco).toBeNull();
    expect(c.costPerKm).toBeNull();
    expect(c.purchase).not.toBeNull();
    expect(c.missing).toEqual(expect.arrayContaining(['electricity price', 'loss of value', 'compulsory insurance', 'road tax', 'servicing']));
    expect(c.missing).not.toContain('tyre life');
    expect(c.warnings.some((w) => w.startsWith("Missing in France's cost data"))).toBe(true);
    expect(c.parts.find((p) => p.key === 'energy')?.value).toBeNull();
    expect(c.steps.find((s) => s.label === 'Energy')?.formula).toMatch(/missing in the market's data: electricity price/);
  });
  it('typing the values (here Germany’s, and a road tax) gives the total', () => {
    const typed = { ...sc, cost: { ...sc.cost, ...marketCostInputs(aDe), roadTaxPerYear: 50 } };
    const c = runEngine(d2, aFr, typed, settings, [id]).results[id].cost;
    expect(c.missing).toEqual([]);
    expect(c.tco).not.toBeNull();
    expect(c.parts.find((p) => p.key === 'tax')?.value).toBeCloseTo(50 * typed.cost.years, 6);
    // A market with a road-tax table ignores a typed road tax.
    const de = runEngine(d2, aDe, { ...standardScenario(d2, aDe), cost: { ...standardScenario(d2, aDe).cost, roadTaxPerYear: 999 } }, settings, [id]).results[id].cost;
    expect(de.parts.find((p) => p.key === 'tax')?.value).toBe(runEngine(d2, aDe, standardScenario(d2, aDe), settings, [id]).results[id].cost.parts.find((p) => p.key === 'tax')?.value);
  });
  it('ownership: one missing value nulls its line and part, not the others', () => {
    const car: OwnershipCar = { price: 1_000_000, powertrain: 'BEV', carClass: 'regular', curbKg: 1800, massKg: 1900, engineCc: null, co2GPerKm: null, servicingPerYear: null, insurancePerYear: null, tyreSetPrice: null };
    const o = ownership(car, { ...std.cost, compulsoryInsurance: null }, 5, 75000, mc, 'THB');
    expect(o.missing).toEqual(['compulsory insurance']);
    expect(o.lines.find((l) => l.label === 'Compulsory insurance')?.value).toBeNull();
    expect(o.lines.find((l) => l.label === 'Voluntary insurance')?.value).toBeGreaterThan(0);
    expect(o.lines.find((l) => l.label === 'Servicing')?.value).toBeGreaterThan(0);
    // A car's own servicing (cars.csv) does not need the market's.
    expect(ownership({ ...car, servicingPerYear: 5000 }, { ...std.cost, servicingBev: null }, 5, 75000, mc, 'THB').missing).toEqual([]);
  });
});

describe('extra costs and credits (user request 2026-11-21: on top of everything, + a cost, − money back)', () => {
  const sc = standardScenario(ds, a);
  const ids = ['byd-atto-3', 'honda-city'];
  const base = run(sc, ids);
  const extras = { extraUpfrontBev: 30_000, extraYearlyBev: -2_000, extraEndBev: 5_000, extraUpfrontIce: 0, extraYearlyIce: 1_000, extraEndIce: -10_000 };
  const withExtras = run({ ...sc, cost: { ...sc.cost, ...extras } }, ids);
  const years = sc.cost.years;

  it('are 0 in the standard, in old saved scenarios and after switching the market', () => {
    for (const k of Object.keys(extras) as (keyof typeof extras)[]) {
      expect(sc.cost[k], k).toBe(0);
      expect(marketCostInputs(a)[k], k).toBe(0);
    }
    const old: Partial<CostInputs> = { ...sc.cost };
    delete old.extraUpfrontBev;
    delete old.extraYearlyBev;
    delete old.extraEndBev;
    expect(withDefaults({ ...sc, cost: old as CostInputs }, ds, a).cost).toMatchObject({ extraUpfrontBev: 0, extraYearlyBev: 0, extraEndBev: 0 });
    for (const id of ids) {
      expect(base[id].cost.extras, id).toBe(0);
      expect(base[id].cost.parts.find((p) => p.key === 'extras')?.value, id).toBe(0);
      expect(base[id].cost.steps.some((s) => s.label.startsWith('Your extra')), id).toBe(false);
    }
  });
  it('add to the total as they are, electric and petrol apart, without changing the other parts', () => {
    const bev = withExtras['byd-atto-3'].cost;
    const ice = withExtras['honda-city'].cost;
    expect(bev.extras).toBeCloseTo(30_000 - 2_000 * years + 5_000, 6);
    expect(ice.extras).toBeCloseTo(1_000 * years - 10_000, 6);
    for (const id of ids) {
      const b = base[id].cost;
      const c = withExtras[id].cost;
      expect(c.tco, id).toBeCloseTo((b.tco ?? NaN) + c.extras, 6);
      expect(c.runningCost, id).toBe(b.runningCost);
      expect(c.resale, id).toBe(b.resale);
      for (const k of ['depreciation', 'insurance', 'servicing'] as const) expect(c.parts.find((p) => p.key === k)?.value, `${id} ${k}`).toBe(b.parts.find((p) => p.key === k)?.value);
    }
    expect(bev.steps.filter((s) => s.label.startsWith('Your extra') && s.kind !== 'subtotal').map((s) => s.formula)).toEqual([
      '+30,000 THB once (your input)',
      `−2,000 THB/year (your input) × ${years} years`,
      '+5,000 THB once (your input)',
    ]);
    expect(bev.steps.find((s) => s.label === 'Total cost of ownership')?.formula).toBe('purchase − value at the end + running costs + your extras');
  });
});
