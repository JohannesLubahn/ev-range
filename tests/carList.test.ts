// The car list: markets (data/markets.csv), model / variant columns, filters, sorting and grouping.
import { describe, expect, it } from 'vitest';
import { bundledFiles, loadBundledDataset } from '../src/data/bundled';
import { parseDataset, parseMarkets } from '../src/data/parse';
import { applyMarket, assumptionsFromDataset } from '../src/engine/assumptions';
import { deriveAll, type DerivedCar } from '../src/engine/derive';
import { marketCosts } from '../src/engine/costs';
import { marketCostInputs } from '../src/engine/inputs';
import { runEngine } from '../src/engine/run';
import { spreadsheetScenario } from '../src/engine/scenario';
import {
  ALL_MARKETS,
  EMPTY_FILTERS,
  filterOptions,
  listCars,
  migrateFilters,
  priceBandEdges,
  shownIds,
  sortValue,
} from '../src/state/carList';
import { useStore } from '../src/state/store';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const th = ds.markets.find((m) => m.id === 'TH')!;
const derived = deriveAll(ds, applyMarket(a, th));
const byId = (id: string) => derived.find((d) => d.car.id === id) as DerivedCar;
const ids = (cars: DerivedCar[]) => cars.map((d) => d.car.id);

describe('data/markets.csv and the market', () => {
  it('reads the markets; every market of cars.csv is listed or blank', () => {
    expect(th).toMatchObject({ name: 'Thailand', currency: 'THB' });
    expect(ds.runningCosts.some((r) => r.market === 'TH')).toBe(true);
    expect(ds.loadWarnings.filter((w) => w.includes('markets.csv'))).toEqual([]);
    for (const c of ds.cars) expect(c.market === '' || ds.markets.some((m) => m.id === c.market), c.id).toBe(true);
  });
  it('warns about a market twice and a car whose market is unknown', () => {
    const w: string[] = [];
    parseMarkets('id,name,currency\nTH,Thailand,THB\nth,Again,THB\n', w);
    expect(w.some((x) => x.includes('twice'))).toBe(true);
    const d2 = parseDataset({ ...bundledFiles, cars: bundledFiles.cars.replace('neta-v,Neta V,Neta,,,TH,', 'neta-v,Neta V,Neta,,,XX,') });
    expect(d2.loadWarnings.some((x) => x.includes('"XX" is not in markets.csv'))).toBe(true);
  });
  it('reads model and variant', () => {
    expect(byId('byd-seal-low').car).toMatchObject({ brand: 'BYD', model: 'Seal', variant: 'Dynamic' });
    expect(byId('byd-dolphin').car).toMatchObject({ model: 'Dolphin', variant: null });
    expect(byId('byd-atto-3').car.model).toBeNull();
  });
  it("sets the currency and running costs; a market without its own running costs uses the default market's, converted", () => {
    const at = applyMarket(a, th);
    expect(at.displayCurrency).toBe('THB');
    expect(at.costMarket).toBe('TH');
    expect(marketCosts(at).value('electricity_price', 'BEV')).toBe(7.5);
    const eu = applyMarket(a, { ...th, id: 'EU', currency: 'EUR' });
    expect(eu.displayCurrency).toBe('EUR');
    expect(eu.costMarket).toBe('TH');
    expect(marketCosts(eu).value('electricity_price', 'BEV')).toBeCloseTo(7.5 / a.fx.EUR, 6);
    expect(marketCosts(eu).value('servicing_per_year', 'ICE')).toBeCloseTo(17500 / a.fx.EUR, 6);
    // Rates, years and km are not converted.
    expect(marketCosts(eu).value('insurance_rate_pct', 'BEV')).toBe(3);
    expect(applyMarket(a, null)).toBe(a);
    // Prices follow the market's currency.
    const dEu = deriveAll(ds, eu).find((d) => d.car.id === 'hyundai-inster')!;
    expect(dEu.priceDisplay.value).toBe(24650);
  });
  it('lists only the cars of the market; All markets lists every car', () => {
    const shown = shownIds(derived, 'TH', EMPTY_FILTERS);
    expect(shown).not.toContain('hyundai-inster');
    expect(shown).toContain('byd-atto-3');
    const de = shownIds(derived, 'DE', EMPTY_FILTERS);
    expect(de).toContain('hyundai-inster');
    expect(de).not.toContain('byd-atto-3');
    expect(shownIds(derived, ALL_MARKETS, EMPTY_FILTERS)).toHaveLength(ds.cars.length);
    expect(byId('hyundai-inster').flags.some((f) => f.field === 'market')).toBe(false);
    expect(byId('mg-windsor').flags.some((f) => f.field === 'market')).toBe(true);
  });
  it('switching the market resets the cost inputs to its defaults and the price filter', () => {
    const scenario = spreadsheetScenario(ds, a);
    useStore.setState({ scenario: { ...scenario, cost: { ...scenario.cost, energyPrice: 99, servicingBev: 99, years: 7 } }, filters: { ...EMPTY_FILTERS, priceMax: 1e6 } });
    const eu = applyMarket(a, { ...th, id: 'EU', currency: 'EUR' });
    useStore.getState().setMarket('EU', marketCostInputs(eu));
    const s = useStore.getState();
    expect(s.market).toBe('EU');
    expect(s.scenario?.cost.energyPrice).toBeCloseTo(7.5 / a.fx.EUR, 6);
    expect(s.scenario?.cost.servicingBev).toBeCloseTo(5346 / a.fx.EUR, 6);
    expect(s.scenario?.cost.years).toBe(7);
    expect(s.filters.priceMax).toBeNull();
  });
});

describe('filters', () => {
  it('body type, chemistry, price and seats', () => {
    const f = (p: Partial<typeof EMPTY_FILTERS>) => shownIds(derived, 'TH', { ...EMPTY_FILTERS, ...p });
    expect(f({ bodyTypes: ['SUV'] }).every((id) => byId(id).bodyType === 'SUV')).toBe(true);
    expect(f({ bodyTypes: ['SUV', 'sedan'] }).length).toBeGreaterThan(f({ bodyTypes: ['SUV'] }).length);
    expect(f({ chemistries: ['NMC'] }).every((id) => byId(id).chemistry === 'NMC')).toBe(true);
    expect(f({ chemistries: ['ICE'] })).toEqual(['honda-city']);
    const mid = f({ priceMin: 800000, priceMax: 1200000 });
    expect(mid.every((id) => (byId(id).priceDisplay.value ?? 0) >= 800000 && (byId(id).priceDisplay.value ?? 0) <= 1200000)).toBe(true);
    expect(mid).toContain('byd-atto-3');
    // A car without a price drops out once a lower price bound is set.
    expect(f({ priceMin: 1 })).not.toContain('mg-windsor-lg');
    expect(f({ search: 'byd seal' })).toEqual(['byd-seal-low', 'byd-seal-high']);
    expect(f({ search: 'hatchback' }).every((id) => byId(id).bodyType === 'hatchback')).toBe(true);
    const seats = filterOptions(derived, 'TH').seats;
    if (seats.length > 1) {
      const top = seats[seats.length - 1];
      expect(f({ minSeats: top }).every((id) => sortValue(byId(id), 'seats') === null || (sortValue(byId(id), 'seats') as number) >= top)).toBe(true);
    }
  });
  it('options come from the cars of the market', () => {
    const o = filterOptions(derived, 'TH');
    expect(o.bodyTypes).toEqual(['SUV', 'hatchback', 'sedan']);
    expect(o.chemistries).toEqual(['ICE', 'LFP', 'NMC']);
  });
  it('migrates the old max price (millions)', () => {
    expect(migrateFilters({ search: 'x', maxPriceM: 1.2, chemistries: ['LFP'] })).toEqual({
      ...EMPTY_FILTERS,
      search: 'x',
      priceMax: 1.2e6,
      chemistries: ['LFP'],
    });
    expect(migrateFilters(null)).toEqual(EMPTY_FILTERS);
  });
});

describe('sorting and grouping', () => {
  const thCars = derived.filter((d) => d.car.market === 'TH');
  const flat = (g: ReturnType<typeof listCars>) => g.flatMap((x) => x.models.flatMap((m) => ids(m.cars)));

  it('by model: brand, model, variant; variants together under one model', () => {
    const groups = listCars(thCars, { key: 'model', dir: 1 }, 'none', 'THB');
    expect(groups).toHaveLength(1);
    const labels = groups[0].models.map((m) => m.label);
    expect(labels).toEqual([...labels].sort((x, y) => x.localeCompare(y)));
    const seal = groups[0].models.find((m) => m.label === 'BYD Seal')!;
    expect(ids(seal.cars)).toEqual(['byd-seal-low', 'byd-seal-high']); // Dynamic, Performance AWD
    expect(groups[0].models.find((m) => m.label === 'BYD Dolphin')!.cars).toHaveLength(2);
  });
  it('by price, both directions, blanks last; a model ranks by its best variant', () => {
    const up = flat(listCars(thCars, { key: 'price', dir: 1 }, 'none', 'THB'));
    expect(up[0]).toBe('neta-v');
    expect(up[1]).toBe('byd-dolphin');
    expect(up[2]).toBe('dolphin-er'); // kept with its model
    expect(up[up.length - 1]).toBe('mg-windsor-lg'); // no price
    const down = flat(listCars(thCars, { key: 'price', dir: -1 }, 'none', 'THB'));
    expect(down[0]).toBe('avatar-11');
    expect(down[down.length - 1]).toBe('mg-windsor-lg');
    const prices = up.map((id) => byId(id).priceDisplay.value).filter((v): v is number => v !== null);
    // Ascending except where a model's dearer variant follows its cheapest one.
    const models = listCars(thCars, { key: 'price', dir: 1 }, 'none', 'THB')[0].models;
    const firsts = models.map((m) => m.cars[0].priceDisplay.value).filter((v): v is number => v !== null);
    expect(firsts).toEqual([...firsts].sort((x, y) => x - y));
    expect(prices.length).toBe(up.length - 1);
  });
  it('groups by body type and brand; sorting applies inside each group', () => {
    const g = listCars(thCars, { key: 'price', dir: 1 }, 'bodyType', 'THB');
    expect(g.map((x) => x.label)).toEqual(['Hatchback', 'Sedan', 'SUV']);
    for (const x of g) {
      expect(x.ids.every((id) => byId(id).bodyType.toLowerCase() === x.key.toLowerCase())).toBe(true);
    }
    expect(g.reduce((s, x) => s + x.ids.length, 0)).toBe(thCars.length);
    const b = listCars(thCars, { key: 'model', dir: 1 }, 'brand', 'THB');
    expect(b.find((x) => x.label === 'BYD')!.ids).toHaveLength(5);
  });
  it('price bands have round edges, at most 6 bands', () => {
    expect(priceBandEdges([500000, 860000, 1200000, 2100000])).toEqual([1e6, 1.5e6, 2e6]);
    expect(priceBandEdges([24400])).toEqual([]);
    const edges = priceBandEdges(thCars.map((d) => d.priceDisplay.value).filter((v): v is number => v !== null));
    expect(edges.length).toBeGreaterThan(1);
    expect(edges.length).toBeLessThanOrEqual(5);
    const g = listCars(thCars, { key: 'price', dir: 1 }, 'priceBand', 'THB');
    expect(g[0].label).toBe(`Under 500 k THB`);
    expect(g[g.length - 1].label).toBe('No price');
  });
});

describe('calculation only for the ticked cars', () => {
  const at = applyMarket(a, th);
  const sc = spreadsheetScenario(ds, at);
  const settings = { battery: 'chemistry' as const };
  it('builds models and results only for the cars asked for; every car is still derived', () => {
    const r = runEngine(ds, at, sc, settings, ['byd-atto-3', 'neta-v']);
    expect(Object.keys(r.models).sort()).toEqual(['byd-atto-3', 'neta-v']);
    expect(Object.keys(r.results).sort()).toEqual(['byd-atto-3', 'neta-v']);
    expect(r.derived).toHaveLength(ds.cars.length);
  });
  it('reuses earlier results on the same inputs and recalculates when an input changes', () => {
    const r1 = runEngine(ds, at, sc, settings, ['byd-atto-3']);
    const r2 = runEngine(ds, at, sc, settings, ['byd-atto-3', 'neta-v'], r1.cache);
    expect(r2.results['byd-atto-3']).toBe(r1.results['byd-atto-3']);
    expect(Object.keys(r2.results).sort()).toEqual(['byd-atto-3', 'neta-v']);
    const sc2 = { ...sc, conditions: { ...sc.conditions, noCharger: { ...sc.conditions.noCharger, airTemperatureC: 0 } } };
    const r3 = runEngine(ds, at, sc2, settings, ['byd-atto-3'], r2.cache);
    expect(r3.results['byd-atto-3']).not.toBe(r1.results['byd-atto-3']);
    expect(Object.keys(r3.results)).toEqual(['byd-atto-3']);
  });
});
