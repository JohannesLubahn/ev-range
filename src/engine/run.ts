import type { Dataset } from '../data/types';
import { batteryLife, cost, longTrip, noCharger, sprint, trafficJam } from './cases';
import { deriveAll, type DerivedCar } from './derive';
import { TEST_KEYS, type TestKey } from './inputs';
import { CarModel } from './model';
import type { Assumptions, CarResults, ModelSettings, Scenario } from './types';

/** A car's models, one per test (tests with the same conditions share one). */
export type TestModels = Record<TestKey, CarModel>;

export interface EngineOutput {
  derived: DerivedCar[];
  models: Record<string, TestModels>;
  results: Record<string, CarResults>;
}

/**
 * The models of one car for every test. Each test has its own conditions; tests with equal conditions share a
 * model (and its caches). All share one calibration, and the battery's past (for the wear after the km driven)
 * comes from the Battery-life model.
 */
export function testModels(d: DerivedCar, ctx: { ds: Dataset; a: Assumptions; settings: ModelSettings }, scenario: Scenario): TestModels {
  const shared = {};
  const byConditions = new Map<string, CarModel>();
  const make = (t: TestKey, history?: CarModel) => {
    const key = JSON.stringify(scenario.conditions[t]);
    let m = byConditions.get(key);
    if (!m) {
      m = new CarModel(d, { ...ctx, conditions: scenario.conditions[t], life: scenario.batteryLife, shared, history });
      byConditions.set(key, m);
    }
    return m;
  };
  const life = make('batteryLife');
  return Object.fromEntries(TEST_KEYS.map((t) => [t, t === 'batteryLife' ? life : make(t, life)])) as TestModels;
}

export function evaluateCar(m: TestModels, scenario: Scenario): CarResults {
  const tj = trafficJam(m.trafficJam, scenario.trafficJam);
  const nc = noCharger(m.noCharger, scenario.noCharger);
  const sp = sprint(m.sprint, scenario.sprint);
  const bl = batteryLife(m.batteryLife, scenario.batteryLife);
  const checks = [tj.pass, nc.pass, sp.pass, bl.pass];
  return {
    carId: m.noCharger.d.car.id,
    trafficJam: tj,
    noCharger: nc,
    sprint: sp,
    longTrip: longTrip(m.longTrip, scenario.longTrip),
    batteryLife: bl,
    cost: cost(m.cost, scenario.cost),
    passCount: checks.filter((c) => c === true).length,
    checkCount: checks.filter((c) => c !== null).length,
  };
}

/**
 * Models and earlier results that may be reused: valid only for the same data, assumptions, scenario and settings
 * (see `runEngine`'s `cache`).
 */
export interface EngineCache {
  key: [Dataset, Assumptions, Scenario, ModelSettings];
  derived: DerivedCar[];
  models: Record<string, TestModels>;
  results: Record<string, CarResults>;
}

/**
 * Runs every stress case for the given cars (default: all cars). Only those cars get a model and results; every
 * car is still derived (specs, price, flags) for the car list. With a cache from the previous run on the same
 * inputs, cars already calculated are reused, so ticking one more car calculates only that car.
 */
export function runEngine(
  ds: Dataset,
  a: Assumptions,
  scenario: Scenario,
  settings: ModelSettings,
  carIds?: string[],
  cache?: EngineCache | null,
): EngineOutput & { cache: EngineCache } {
  const key: EngineCache['key'] = [ds, a, scenario, settings];
  const reuse = cache && cache.key.every((k, i) => k === key[i]) ? cache : null;
  const derived = reuse ? reuse.derived : deriveAll(ds, a);
  const wanted = carIds ? new Set(carIds) : null;
  const allModels: Record<string, TestModels> = reuse ? reuse.models : {};
  const allResults: Record<string, CarResults> = reuse ? reuse.results : {};
  const models: Record<string, TestModels> = {};
  const results: Record<string, CarResults> = {};
  for (const d of derived) {
    const id = d.car.id;
    if (wanted && !wanted.has(id)) continue;
    const m = (allModels[id] ??= testModels(d, { ds, a, settings }, scenario));
    models[id] = m;
    if (d.consumption.value === null || d.batteryKwh === null) continue;
    results[id] = allResults[id] ??= evaluateCar(m, scenario);
  }
  return { derived, models, results, cache: { key, derived, models: allModels, results: allResults } };
}
