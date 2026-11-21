// Petrol engine (user request 2026-11-21: petrol cars did too well in the traffic jam). Willans line: the warm engine
// burns its idle fuel all the time it runs (Argonne: 0.40 l/h per litre), driving, the belt-driven AC compressor and
// the electrics via the alternator come on top at the calibrated marginal efficiency; heating uses the coolant's share
// of the fuel burned, extra fuel only when that is not enough.
import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { applyMarket, assumptionsFromDataset } from '../src/engine/assumptions';
import { trafficJam } from '../src/engine/cases';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { standardScenario } from '../src/engine/scenario';
import type { Conditions, TrafficJamInputs } from '../src/engine/types';

const ds = loadBundledDataset();
const ICE = ['honda-city', 'vw-golf-15-tsi'];

function setup(id: string, airC = 35, solar = 800) {
  const d0 = deriveAll(ds, assumptionsFromDataset(ds)).find((x) => x.car.id === id)!;
  const a = applyMarket(assumptionsFromDataset(ds), ds.markets.find((m) => m.id === d0.car.market));
  const d = deriveAll(ds, a).find((x) => x.car.id === id)!;
  const sc = standardScenario(ds, a);
  const conditions: Conditions = { ...sc.conditions.trafficJam, airTemperatureC: airC, solarWm2: solar };
  const m = new CarModel(d, { ds, a, conditions, settings: { battery: 'chemistry' } });
  return { m, a, jam: sc.trafficJam as TrafficJamInputs };
}

describe('petrol engine', () => {
  it('idles at 0.40 l/h per litre of engine size; electric cars have no idle fuel', () => {
    expect(setup('honda-city').m.idleFuelLph).toBeCloseTo(0.4 * 0.988, 6);
    expect(setup('vw-golf-15-tsi').m.idleFuelLph).toBeCloseTo(0.4 * 1.498, 6);
    expect(setup('aion-hyptec-ht').m.idleFuelLph).toBe(0);
  });

  it('the calibrated marginal efficiency (beyond idling) is that of a petrol engine: 25–40 % of the fuel energy at the wheels', () => {
    for (const id of ICE) {
      const { m, a } = setup(id);
      const cal = m.calibration();
      expect(cal.clamped, id).toBe(false);
      expect(cal.etaDrive / a.petrolEnergyKwhPerL, id).toBeGreaterThan(0.25);
      expect(cal.etaDrive / a.petrolEnergyKwhPerL, id).toBeLessThan(0.4);
    }
  });

  it('standing in the hot jam with the AC on burns about 1 l/h (measured idling with AC: roughly 1–1.2 l/h)', () => {
    for (const id of ICE) {
      const { m } = setup(id);
      const seg = m.segment({ label: 'jam', distanceKm: 0.5, timeH: 1, profile: 'jam', cabinC: 22 });
      expect(seg.totalKwh, id).toBeGreaterThan(0.8);
      expect(seg.totalKwh, id).toBeLessThan(1.3);
      // Without heating / AC the engine still idles.
      const off = m.segment({ label: 'jam', distanceKm: 0.5, timeH: 1, profile: 'jam', cabinC: null });
      expect(off.driveKwh, id).toBeGreaterThan(m.idleFuelLph);
    }
  });

  it('the AC is driven by the belt (cooling ÷ COP at the shaft), the electronics through the alternator', () => {
    const { m, a } = setup('honda-city');
    const o = m.onboard(22);
    const cl = o.climate!;
    const eta = m.calibration().etaDrive;
    expect(o.cabinKw).toBeCloseTo((cl.compressorKw + cl.blowerKw / (a.alternatorEfficiencyPct / 100)) / eta, 9);
    expect(o.baseKw).toBeCloseTo(m.onboard(null).baseKw, 9);
  });

  it('heating uses waste heat: none extra when mild, extra fuel only when the idling engine gives off too little', () => {
    const mild = setup('honda-city', 5, 0).m.segment({ label: 'jam', distanceKm: 0.5, timeH: 1, profile: 'jam', cabinC: 22 });
    expect(mild.engineHeat!.extraL).toBe(0);
    const cold = setup('honda-city', -10, 0);
    const seg = cold.m.segment({ label: 'jam', distanceKm: 0.5, timeH: 1, profile: 'jam', cabinC: 22 });
    const eh = seg.engineHeat!;
    const heatPerL = (cold.a.engineCoolantHeatPct / 100) * cold.a.petrolEnergyKwhPerL;
    expect(eh.availableKw).toBeLessThan(eh.demandKw);
    expect(eh.extraLph).toBeCloseTo((eh.demandKw - eh.availableKw) / heatPerL, 9);
    // With the extra fuel, the coolant's share of all the fuel burned covers the heat needed.
    expect(heatPerL * (seg.totalKwh - seg.startKwh)).toBeCloseTo(eh.demandKw, 6);
    // Electric cars have no engine heat.
    expect(setup('aion-hyptec-ht', -10, 0).m.segment({ label: 'jam', distanceKm: 0.5, timeH: 1, profile: 'jam', cabinC: 22 }).engineHeat).toBeNull();
  });

  it('the longest jam uses up exactly the fuel between start and end level, idling included', () => {
    for (const id of ICE) {
      const { m, jam } = setup(id);
      const r = trafficJam(m, jam);
      const atMax = trafficJam(m, { ...jam, timeJamH: r.maxJamHours });
      expect(atMax.margin, id).toBeCloseTo(0, 3);
    }
  });

  it('is calibrated on the measured drives of data/real_world_fuel.csv, each with sources in sources.csv', () => {
    const ids = new Set(ds.sources.map((x) => x.id));
    expect(ds.loadWarnings.filter((w) => w.startsWith('real_world_fuel.csv'))).toEqual([]);
    for (const r of ds.realWorldFuel) {
      expect(r.sources.length, r.label).toBeGreaterThan(0);
      for (const id of r.sources) expect(ids.has(id), id).toBe(true);
    }
    for (const id of ICE) {
      const cal = setup(id).m.calibration();
      expect(cal.cycle, id).toBe('real-world');
      // Every drive within 7 % (one unknown η; the Honda City has one drive, reproduced exactly).
      for (const x of cal.realWorld!.drives) expect(Math.abs(x.modelL100 / x.row.lPer100Km - 1), `${id} ${x.row.label}`).toBeLessThan(0.07);
    }
    const city = setup('honda-city').m.calibration().realWorld!;
    expect(city.drives[0].modelL100).toBeCloseTo(city.drives[0].row.lPer100Km, 6);
    // The official NEDC value (4.41) is a lab value: on the road the City uses more, so the model on NEDC is higher.
    expect(city.ratedModelL100).toBeGreaterThan(city.ratedL100 * 1.05);
  });

  it('cuts the fuel off while slowing down (no idle fuel then), but idles all the time standing in the jam', () => {
    const { m } = setup('vw-golf-15-tsi');
    const town = m.segment({ label: 'town', distanceKm: 10, speedKmh: 50, profile: 'city', cabinC: null });
    expect(town.fuelCutShare).toBeGreaterThan(0.1);
    expect(town.idleKwh).toBeCloseTo(m.idleFuelLph * town.timeH * (1 - town.fuelCutShare), 9);
    const jam = m.segment({ label: 'jam', distanceKm: 0.5, timeH: 1, profile: 'jam', cabinC: null });
    expect(jam.fuelCutShare).toBe(0);
    expect(jam.idleKwh).toBeCloseTo(m.idleFuelLph, 9);
  });
});
