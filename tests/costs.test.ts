// Running costs of the cost of ownership (user request 2026-11-20): data/running_costs.csv, data/road_tax.csv,
// src/engine/costs.ts and cost() in src/engine/cases.ts.
import { describe, expect, it } from 'vitest';
import { bundledFiles, loadBundledDataset } from '../src/data/bundled';
import { parseDataset, parseRoadTax, parseRunningCosts } from '../src/data/parse';
import { applyMarket, assumptionsFromDataset } from '../src/engine/assumptions';
import { COST_ITEMS } from '../src/engine/costItems';
import { carValue, marketCosts, ownership, roadTaxBase, roadTaxDiscountPct, type OwnershipCar } from '../src/engine/costs';
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

describe('data/running_costs.csv and data/road_tax.csv', () => {
  it('read without warnings; Thailand has every item for both powertrains', () => {
    expect(ds.loadWarnings.filter((w) => w.includes('running_costs') || w.includes('road_tax'))).toEqual([]);
    for (const item of COST_ITEMS) for (const pt of ['BEV', 'ICE'] as const) expect(mc.row(item, pt), `${item} ${pt}`).toBeDefined();
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
    parseRunningCosts('market,item,powertrain,value\nXX,petrol_tax,all,1\nXX,servicing_per_year,BEV,-1\n', w);
    expect(w.some((x) => x.includes('unknown item "petrol_tax"'))).toBe(true);
    expect(w.some((x) => x.includes('not a number ≥ 0'))).toBe(true);
    expect(w.some((x) => x.includes('XX has no'))).toBe(false); // no valid row: the market is not listed at all
    const w2: string[] = [];
    parseRoadTax('market,powertrain,basis,above,up_to,amount,kind\nXX,BEV,weight_kg,0,1000,1,band\nXX,BEV,weight_kg,900,2000,2,band\nXX,BEV,weight_kg,2500,3000,3,band\n', w2);
    expect(w2.some((x) => x.includes('overlap'))).toBe(true);
    expect(w2.some((x) => x.includes('gap between 2000 and 2500'))).toBe(true);
    const d2 = parseDataset({ ...bundledFiles, runningCosts: bundledFiles.runningCosts + 'TH,tyre_life_km,all,50000,km,x,no-such-source\n' });
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
    expect(Math.round(roadTaxBase(de, 'ICE', 1232, 1498, 122).amount)).toBe(85); // Trend, 122 g/km
    expect(Math.round(roadTaxBase(de, 'ICE', 1232, 1498, 121).amount)).toBe(83); // Life, 121 g/km
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
  const ids = ['byd-atto-3', 'tesla-model-3-2021', 'honda-city', 'neta-v'];
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
    // Tesla Model 3 (2,150 kg in cars.csv, premium) pays more tax and tyres than the Atto 3 (1,750 kg).
    expect(part('tesla-model-3-2021', 'tax')).toBeGreaterThan(part('byd-atto-3', 'tax'));
    expect(part('tesla-model-3-2021', 'tyres')).toBeGreaterThan(part('byd-atto-3', 'tyres'));
    expect(part('tesla-model-3-2021', 'insurance')).toBeGreaterThan(part('byd-atto-3', 'insurance'));
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
