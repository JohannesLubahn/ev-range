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

/** Runs every stress case for the given cars (default: all cars). */
export function runEngine(ds: Dataset, a: Assumptions, scenario: Scenario, settings: ModelSettings, carIds?: string[]): EngineOutput {
  const derived = deriveAll(ds, a);
  const wanted = carIds ? new Set(carIds) : null;
  const models: Record<string, CarModel> = {};
  const results: Record<string, CarResults> = {};
  for (const d of derived) {
    const m = new CarModel(d, { ds, a, conditions: scenario.conditions, settings });
    models[d.car.id] = m;
    if (wanted && !wanted.has(d.car.id)) continue;
    if (d.consumption.value === null || d.batteryKwh === null) continue;
    results[d.car.id] = evaluateCar(m, scenario);
  }
  return { derived, models, results };
}
