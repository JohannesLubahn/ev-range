// Rated battery cycles (user's choice 2026-11-21): chemistry defaults in data/battery/chemistries.csv (the user's
// research), a maker's figure per car only where one was found for that car's own battery, each with its source.
import { describe, expect, it } from 'vitest';
import { bundledFiles, loadBundledDataset } from '../src/data/bundled';
import { parseDataset } from '../src/data/parse';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { batteryLife } from '../src/engine/cases';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { previousStandard } from './previousStandard';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const derived = deriveAll(ds, a);
const byId = (id: string) => derived.find((d) => d.car.id === id)!;

describe('rated battery cycles', () => {
  it('the chemistries carry the defaults (LFP 2,000, NMC 1,100) with sources in sources.csv', () => {
    expect(ds.chemistries.LFP.ratedCycles).toBe(2000);
    expect(ds.chemistries.NMC.ratedCycles).toBe(1100);
    const ids = new Set(ds.sources.map((s) => s.id));
    for (const c of Object.values(ds.chemistries)) {
      expect(c.ratedCyclesSources.length).toBeGreaterThan(0);
      for (const id of c.ratedCyclesSources) expect(ids.has(id), id).toBe(true);
    }
  });

  it('every maker figure in cars.csv names its source, and the data loads without warnings', () => {
    const ids = new Set(ds.sources.map((s) => s.id));
    for (const c of ds.cars.filter((x) => x.batteryCycles !== null)) {
      expect(c.batteryCyclesSources.length, c.id).toBeGreaterThan(0);
      for (const id of c.batteryCyclesSources) expect(ids.has(id), `${c.id} ${id}`).toBe(true);
    }
    expect(ds.loadWarnings.filter((w) => w.includes('battery_cycles') || w.includes('chemistries'))).toEqual([]);
  });

  it('a car without a maker figure uses its chemistry default (estimated); petrol cars have none', () => {
    for (const d of derived) {
      if (d.isIce) {
        expect(d.ratedCycles.value, d.car.id).toBeNull();
        continue;
      }
      if (d.car.batteryCycles === null) {
        expect(d.ratedCycles.provenance, d.car.id).toBe('estimated');
        expect(d.ratedCycles.value, d.car.id).toBe(ds.chemistries[d.chemistry!].ratedCycles);
      } else {
        expect(d.ratedCycles.provenance, d.car.id).toBe('data');
        expect(d.ratedCycles.value, d.car.id).toBe(d.car.batteryCycles);
      }
    }
    expect(byId('byd-atto-3').ratedCycles.value).toBe(5000);
    expect(byId('aion-hyptec-ht').ratedCycles.value).toBe(2000);
  });

  it("a rating to 70 % (XPeng) sets the cycle wear, but 'years until' uses the same 80 % for every car", () => {
    const sc = previousStandard(ds, a);
    const life = (id: string) => {
      const m = new CarModel(byId(id), { ds, a, conditions: sc.conditions.batteryLife, settings: { battery: 'chemistry' }, life: sc.batteryLife });
      return batteryLife(m, sc.batteryLife);
    };
    const g6 = life('xpeng-g6');
    expect(byId('xpeng-g6').eolPct.value).toBe(70);
    expect(g6.eolPct).toBe(a.ratedCyclesEndCapacityPct);
    // More rated cycles, less wear: the Atto 3 (BYD: 5,000, read as running to BYD's 70 % warranty limit — user's choice
    // 2026-11-21) keeps more than with the LFP default, but less than 5,000 cycles to 80 % would give.
    expect(byId('byd-atto-3').eolPct.value).toBe(70);
    const atto = life('byd-atto-3').capacityEndPct!;
    const ds80 = parseDataset({ ...bundledFiles, cars: bundledFiles.cars.replace(',70,LFP,5000,byd-atto3-eu;', ',,LFP,5000,byd-atto3-eu;') });
    const d80 = deriveAll(ds80, a).find((d) => d.car.id === 'byd-atto-3')!;
    const m80 = new CarModel(d80, { ds: ds80, a, conditions: sc.conditions.batteryLife, settings: { battery: 'chemistry' }, life: sc.batteryLife });
    expect(atto).toBeLessThan(batteryLife(m80, sc.batteryLife).capacityEndPct! - 1);
    const ds2 = parseDataset({ ...bundledFiles, cars: bundledFiles.cars.replace(',70,LFP,5000,byd-atto3-eu;byd-warranty-es-2025,', ',,LFP,,,') });
    const d2 = deriveAll(ds2, a).find((d) => d.car.id === 'byd-atto-3')!;
    expect(d2.ratedCycles.value).toBe(2000);
    const m2 = new CarModel(d2, { ds: ds2, a, conditions: sc.conditions.batteryLife, settings: { battery: 'chemistry' }, life: sc.batteryLife });
    expect(atto).toBeGreaterThan(batteryLife(m2, sc.batteryLife).capacityEndPct! + 1);
  });
});
