import type { Dataset } from '../data/types';
import { batteryLife, cost, longTrip, noCharger, sprint, trafficJam } from './cases';
import { deriveAll, type DerivedCar } from './derive';
import { CarModel } from './model';
import type { Assumptions, CarResults, ModelSettings, Scenario } from './types';

export interface EngineOutput {
  derived: DerivedCar[];
  models: Record<string, CarModel>;
  results: Record<string, CarResults>;
}

export function evaluateCar(m: CarModel, scenario: Scenario): CarResults {
  const tj = trafficJam(m, scenario.trafficJam);
  const nc = noCharger(m, scenario.noCharger);
  const sp = sprint(m, scenario.sprint);
  const bl = batteryLife(m, scenario.batteryLife);
  const checks = [tj.pass, nc.pass, sp.pass, bl.pass];
  return {
    carId: m.d.car.id,
    trafficJam: tj,
    noCharger: nc,
    sprint: sp,
    longTrip: longTrip(m, scenario.longTrip),
    batteryLife: bl,
    cost: cost(m, scenario.batteryLife, scenario.cost),
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
  models: Record<string, CarModel>;
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
  const allModels: Record<string, CarModel> = reuse ? reuse.models : {};
  const allResults: Record<string, CarResults> = reuse ? reuse.results : {};
  const models: Record<string, CarModel> = {};
  const results: Record<string, CarResults> = {};
  for (const d of derived) {
    const id = d.car.id;
    if (wanted && !wanted.has(id)) continue;
    const m = (allModels[id] ??= new CarModel(d, { ds, a, conditions: scenario.conditions, settings, life: scenario.batteryLife }));
    models[id] = m;
    if (d.consumption.value === null || d.batteryKwh === null) continue;
    results[id] = allResults[id] ??= evaluateCar(m, scenario);
  }
  return { derived, models, results, cache: { key, derived, models: allModels, results: allResults } };
}
