// The car data: data/cars.csv (one numbered row per car, shared by every market) joined with the cars each market
// sells (data/markets/<id>/offers.csv: local name, price, values that differ there).
import { describe, expect, it } from 'vitest';
import { bundledFiles, loadBundledDataset } from '../src/data/bundled';
import { OFFER_COLUMNS, parseCsv, parseDataset, perMarketCarsCsv, type MarketFolderFiles } from '../src/data/parse';
import type { Car } from '../src/data/types';

const ds = loadBundledDataset();
const folders = bundledFiles.marketFiles!;

/** The bundled data with other offers files (folder → text; undefined = none). */
function withOffers(offers: Record<string, string | undefined>, cars = bundledFiles.cars) {
  const marketFiles: Record<string, MarketFolderFiles> = { ...folders };
  for (const [folder, text] of Object.entries(offers)) marketFiles[folder] = { ...folders[folder], offers: text };
  return parseDataset({ ...bundledFiles, cars, marketFiles });
}

describe('cars.csv and the offers of each market', () => {
  it('every car is a numbered row of cars.csv sold in a market; cars.csv has no prices or markets', () => {
    expect(ds.loadWarnings).toEqual([]);
    const columns = parseCsv(bundledFiles.cars).columns;
    for (const c of OFFER_COLUMNS) expect(columns, c).not.toContain(c);
    for (const c of ds.cars) {
      expect(c.specId, c.id).toMatch(/^\d+$/);
      expect(ds.markets.some((m) => m.id === c.market), c.id).toBe(true);
      expect(c.currency, c.id).toBe(ds.markets.find((m) => m.id === c.market)!.currency);
    }
    // The ids saved in browsers and share links before the split stay the same.
    expect(ds.cars.find((c) => c.id === 'byd-atto-3')).toMatchObject({ specId: '3', market: 'TH', currency: 'THB', price: 899900, weightKg: 1750 });
    expect(ds.cars.find((c) => c.id === 'vw-golf-15-tsi')).toMatchObject({ market: 'DE', currency: 'EUR', energyPrice: 1.978, powertrain: 'ICE' });
  });

  it('one car in two markets: shared specs, its local name and price, and the values that differ there', () => {
    // Test values only: car 3 offered in Germany under another name, with another weight.
    const d = withOffers({ DE: 'id,car,name,price,weight_kg,notes\n,3,BYD ATTO 3,40000,1800,Test offer\n' });
    const th = d.cars.find((c) => c.id === 'byd-atto-3')!;
    const de = d.cars.find((c) => c.market === 'DE' && c.specId === '3')!;
    expect(de.id).toBe('byd-atto-3-de'); // blank id: name + market
    expect(de).toMatchObject({ name: 'BYD ATTO 3', brand: 'BYD', currency: 'EUR', price: 40000, weightKg: 1800 });
    expect(de.batteryKwh).toBe(th.batteryKwh);
    expect(de.ranges).toEqual(th.ranges);
    expect(de.marketColumns).toEqual(['weight_kg']);
    expect(th.weightKg).toBe(1750);
    expect(th.marketColumns).toEqual([]);
    expect(de.notes.startsWith('Test offer. ')).toBe(true); // the offer's notes, then the car's
    expect(de.raw.source_url).toBe(ds.cars.find((c) => c.specId === '3')!.raw.source_url.split(' ; ').filter((u) => !u.includes('rodfaifa')).join(' ; '));
    // The German cars are no longer offered anywhere.
    expect(d.loadWarnings).toContainEqual(expect.stringContaining("cars.csv: 11 cars in no market's offers.csv: 18 Hyundai Inster Standard Range"));
  });

  it('reports offers that do not fit: an unknown number, a name without the brand, a bloc selling cars', () => {
    const DE = folders.DE.offers!.trimEnd();
    const d = withOffers({ DE: `${DE}\nx,99,Nowhere EV,1,,,,\ny,3,Hyundai Kona,1,,,,\n`, EU: 'id,car,name\n,3,BYD Atto 3\n' });
    expect(d.loadWarnings).toContainEqual(expect.stringContaining('markets/DE/offers.csv row 13: car "99" is not a number in cars.csv'));
    expect(d.loadWarnings).toContainEqual(expect.stringContaining('"Hyundai Kona" does not contain the brand of car 3 in cars.csv (BYD)'));
    expect(d.loadWarnings).toContainEqual(expect.stringContaining('markets/EU/offers.csv: a bloc sells no cars itself'));
    expect(d.cars.some((c) => c.id === 'x')).toBe(false);
    expect(d.cars.filter((c) => c.market === 'EU')).toEqual([]);
  });

  it('cars.csv: numbers only, each once; prices belong to the offers', () => {
    const cars = 'id,name,brand,price,powertrain,battery_kwh,range_wltp_km\n1,A EV,A,5,BEV,50,400\n1,B EV,B,,BEV,50,400\nx,C EV,C,,BEV,50,400\n';
    const d = withOffers({ TH: 'id,car,name\n,1,A EV\n', DE: undefined }, cars);
    expect(d.loadWarnings).toContainEqual(expect.stringContaining('cars.csv: column price belongs in'));
    expect(d.loadWarnings).toContainEqual(expect.stringContaining('cars.csv row 3: number 1 is used twice'));
    expect(d.loadWarnings).toContainEqual(expect.stringContaining('cars.csv row 4: id "x" is not a number'));
    expect(d.cars).toHaveLength(1);
    expect(d.cars[0]).toMatchObject({ id: 'a-ev-th', specId: '1', price: null, currency: 'THB' });
  });

  it('a value from cars.csv that is not a number is reported once, not once per market', () => {
    const cars = bundledFiles.cars.replace(/^3,BYD Atto 3,BYD,,,BEV,SUV,regular,60\.5,/m, '3,BYD Atto 3,BYD,,,BEV,SUV,regular,sixty,');
    expect(cars).not.toBe(bundledFiles.cars);
    const d = withOffers({ DE: 'id,car,name\n,3,BYD ATTO 3\n' }, cars);
    expect(d.loadWarnings.filter((w) => w.includes('"sixty"'))).toEqual(['cars.csv, car 3, column battery_kwh: "sixty" is not a number and was ignored']);
  });

  it('the download (one row per car and market) loads back as the same cars', () => {
    const back = parseDataset({ ...bundledFiles, cars: perMarketCarsCsv(ds) });
    expect(back.loadWarnings).toEqual([]);
    const strip = ({ raw, marketColumns, ...c }: Car) => (void raw, void marketColumns, c);
    expect(back.cars.map(strip)).toEqual(ds.cars.map(strip));
    for (const [i, c] of ds.cars.entries()) for (const k of ds.carColumns) expect(back.cars[i].raw[k] ?? '', `${c.id} ${k}`).toBe(k === 'id' ? c.id : (c.raw[k] ?? ''));
  });
});
