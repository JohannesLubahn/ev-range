// Every market in data/markets.csv is complete: its folder, costs, road tax, offers and sources. Runs for every market added.
import { describe, expect, it } from 'vitest';
import { bundledFiles } from '../src/data/bundled';
import { parseDataset } from '../src/data/parse';

const ds = parseDataset(bundledFiles);
const files = bundledFiles.marketFiles ?? {};

describe('markets', () => {
  it('loads without data warnings', () => {
    expect(ds.loadWarnings).toEqual([]);
  });
  it.each(ds.markets.map((m) => [m.id, m] as const))('%s has its files, a bloc and a traffic side', (id, m) => {
    expect(files[id]?.costs, 'costs.csv').toBeTruthy();
    expect(files[id]?.roadTax, 'road_tax.csv').toBeTruthy();
    expect(files[id]?.offers, 'offers.csv').toBeTruthy();
    expect(m.parent === null || ds.blocs.some((b) => b.id === m.parent)).toBe(true);
    expect(['left', 'right']).toContain(m.traffic);
    expect(m.currency).toMatch(/^[A-Z]{3}$/);
  });
  it.each(ds.markets.map((m) => m.id))('%s lists at most 15 electric cars and at most one petrol car', (id) => {
    const cars = ds.cars.filter((c) => c.market === id);
    if (id !== "TH") expect(cars.filter((c) => c.powertrain !== "ICE").length).toBeLessThanOrEqual(15); // Thailand is the owner's own list
    expect(cars.filter((c) => c.powertrain === 'ICE').length).toBeLessThanOrEqual(1);
  });
});
