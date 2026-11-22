// The landing page's own scenario: sliders move the result the right way, the start charge, and saved state.
import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { longTrip } from '../src/engine/cases';
import { applyMarket, assumptionsFromDataset } from '../src/engine/assumptions';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { standardScenario } from '../src/engine/scenario';
import { landingConditions, landingTrip, landingTripInputs } from '../src/landing/calc';
import { DEFAULT_SLIDERS, LANDING_SETTINGS, LOAD_STEPS, STYLE_STEPS, SUN_STEPS, TEMPERATURE_STEPS, TYRE_STEPS } from '../src/landing/scenario';
import type { RouteResult } from '../src/route/route';
import { normalizeLanding } from '../src/state/store';

const ds = loadBundledDataset();
const a = applyMarket(assumptionsFromDataset(ds), ds.markets[0]);
const car = deriveAll(ds, a).find((d) => d.car.market === ds.markets[0].id && !d.isIce)!;
const route: RouteResult = { from: 'A', to: 'B', distanceKm: 600, climbM: 300, ascentM: 900, slopePct: 4, meanAltitudeM: 400 };
const run = (patch: Partial<typeof DEFAULT_SLIDERS>, r = route) => landingTrip(car, { ds, a }, { ...DEFAULT_SLIDERS, ...patch }, r);

describe('landing scenario', () => {
  it('uses the user\'s defaults', () => {
    const c = landingConditions(DEFAULT_SLIDERS, route);
    expect(c).toMatchObject({ airTemperatureC: 22, tyrePressurePct: 100, payloadKg: 200, drivingStylePct: 100, batteryKm: 0, thermalMode: 'managed', altitudeM: 400 });
    expect(TEMPERATURE_STEPS.map((s) => s.value)).toEqual([-20, 0, 22, 30, 40]);
    expect(SUN_STEPS.map((s) => s.value)).toEqual([1100, 800, 500, 0]);
    expect(LOAD_STEPS.map((s) => s.value)).toEqual([120, 200, 500]);
    expect(TYRE_STEPS.map((s) => s.value)).toEqual([100, 80]);
    expect(STYLE_STEPS.map((s) => s.value)).toEqual([65, 100, 170]);
  });
  it('names the load and the tyres in words, with Normal and Good as the defaults', () => {
    expect(LOAD_STEPS.map((s) => s.label)).toEqual(['Minimal', 'Normal', 'Packed']);
    expect(TYRE_STEPS.map((s) => s.label)).toEqual(['Good', 'Bad']);
    expect(LOAD_STEPS[DEFAULT_SLIDERS.load].label).toBe('Normal');
    expect(TYRE_STEPS[DEFAULT_SLIDERS.tyres].label).toBe('Good');
    for (const s of [...LOAD_STEPS, ...TYRE_STEPS]) expect(s.label).not.toMatch(/\d/);
  });
  it('takes the trip from the route', () => {
    expect(landingTripInputs(route)).toMatchObject({ distanceKm: 600, climbM: 300, ascentM: 900, slopePct: 4, profile: 'mixed', cabinC: 22 });
  });
  it('uses more energy with a full load, soft tyres, sporty driving and in the cold', () => {
    const base = run({}).energyKwh;
    expect(run({ load: 2 }).energyKwh).toBeGreaterThan(base);
    expect(run({ tyres: 1 }).energyKwh).toBeGreaterThan(base);
    expect(run({ style: 2 }).energyKwh).toBeGreaterThan(base);
    expect(run({ style: 0 }).energyKwh).toBeLessThan(base);
    expect(run({ temperature: 0 }).energyKwh).toBeGreaterThan(base);
  });
  it('a longer trip takes longer and needs more charging', () => {
    const short = run({}, { ...route, distanceKm: 100 });
    const long = run({}, { ...route, distanceKm: 1500 });
    expect(long.tripTimeH).toBeGreaterThan(short.tripTimeH);
    expect(long.chargings).toBeGreaterThan(short.chargings);
    expect(short.stops).toBe(0);
    expect(Object.is(short.stops, -0)).toBe(false);
  });
});

describe('long trip with a start charge', () => {
  const life = standardScenario(ds, a).batteryLife;
  const model = () => new CarModel(car, { ds, a, conditions: landingConditions(DEFAULT_SLIDERS, route), settings: LANDING_SETTINGS, life });
  const inputs = landingTripInputs({ ...route, distanceKm: 1000 });
  it('without a start charge it is the old result (a full window first)', () => {
    const old = longTrip(model(), inputs);
    const same = longTrip(model(), inputs, { startPct: inputs.chargeToPct });
    expect(same.chargings).toBeCloseTo(old.chargings, 6);
  });
  it('a lower start charge needs more charging', () => {
    expect(longTrip(model(), inputs, { startPct: 50 }).chargings).toBeGreaterThan(longTrip(model(), inputs, { startPct: 95 }).chargings);
  });
});

describe('saved landing state', () => {
  it('falls back to the defaults for missing or garbled storage', () => {
    for (const raw of [undefined, null, 5, 'x', {}, { sliders: { temperature: 99, sun: 'hot' } }]) {
      const l = normalizeLanding(raw);
      expect(l.sliders).toEqual(DEFAULT_SLIDERS);
      expect(l.route).toBeNull();
      expect(l.market).toBeNull();
    }
  });
  it('keeps valid values', () => {
    const l = normalizeLanding({ market: 'DE', carId: 'x', from: 'A', to: 'B', route, sliders: { temperature: 0, sun: 3, tyres: 1, load: 2, style: 0 } });
    expect(l).toMatchObject({ market: 'DE', carId: 'x', from: 'A', to: 'B', sliders: { temperature: 0, sun: 3, tyres: 1, load: 2, style: 0 } });
    expect(l.route).toEqual(route);
  });
});
