// Parity test: the Simple model, in "exact spreadsheet" mode, reproduces the Battery Sizing and Summary tabs
// of EV Calculations.ods for all 21 cars, with the per-car inputs of the sheet.
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/spreadsheet.json';
import { loadBundledDataset } from '../src/data/bundled';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { batteryLife, cost, longTrip, noCharger, sprint, trafficJam } from '../src/engine/cases';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { DEFAULT_CONDITIONS } from '../src/engine/scenario';

type Num = number | null;
interface Case {
  inputs: Record<string, Num>;
  outputs: Record<string, Num>;
}
interface FixtureCar {
  traffic_jam: Case;
  no_charger: Case;
  long_trip: Case;
  battery_life: Case;
  sprint: Case;
  cost: Case;
  summary: Record<string, Num>;
}

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const derived = Object.fromEntries(deriveAll(ds, a).map((d) => [d.car.id, d]));
const settings = { consumption: 'simple', battery: 'ideal', exactSpreadsheet: true } as const;
const cars = (fixture as { cars: Record<string, FixtureCar> }).cars;

/** Known differences, listed in the plan: the spreadsheet has no high-speed consumption and no price for these. */
const KNOWN = new Set(['mg-windsor:sprint', 'mg-windsor-lg:sprint', 'mg-windsor:cost', 'mg-windsor-lg:cost']);

function close(actual: number, expected: Num, label: string) {
  expect(expected, `${label}: fixture value missing`).not.toBeNull();
  const tol = Math.max(1e-6, Math.abs(expected as number) * 1e-6);
  expect(Math.abs(actual - (expected as number)), `${label}: got ${actual}, sheet ${expected}`).toBeLessThanOrEqual(tol);
}

const n = (v: Num) => v as number;

describe('Simple model reproduces the spreadsheet', () => {
  it('fixture covers 21 cars', () => {
    expect(Object.keys(cars)).toHaveLength(21);
  });

  for (const [id, c] of Object.entries(cars)) {
    describe(id, () => {
      const d = derived[id];
      const model = () => new CarModel(d, { ds, a, conditions: DEFAULT_CONDITIONS, settings });

      it('exists in cars.csv', () => expect(d).toBeDefined());

      it('traffic jam', () => {
        const i = c.traffic_jam.inputs;
        const r = trafficJam(model(), {
          startPct: n(i.start_pct), endPct: n(i.end_pct), distBeforeKm: n(i.dist_before_km), distJamKm: n(i.dist_jam_km),
          timeJamH: n(i.time_jam_h), distAfterKm: n(i.dist_after_km), speedOutsideKmh: n(i.speed_outside_kmh),
          usageOutsidePct: n(i.onboard_outside_pct), usageJamPct: n(i.onboard_jam_pct), profileOutside: 'city',
        });
        close(r.energyKwh, c.traffic_jam.outputs.energy_total, `${id} traffic jam energy`);
        close(r.requiredKwh, c.traffic_jam.outputs.required_kwh, `${id} traffic jam required`);
        close(r.availableKwh, c.summary.available_kwh, `${id} available`);
        close(r.margin, c.summary.traffic_jam_margin, `${id} traffic jam margin`);
      });

      it('no charger', () => {
        const i = c.no_charger.inputs;
        const r = noCharger(model(), {
          distanceKm: n(i.distance_km), startPct: n(i.start_pct), endPct: n(i.end_pct), speedKmh: n(i.speed_kmh),
          usagePct: n(i.onboard_pct), profile: 'rural', climbM: 0,
        });
        close(r.energyKwh, c.no_charger.outputs.energy, `${id} no charger energy`);
        close(r.requiredKwh, c.no_charger.outputs.required_kwh, `${id} no charger required`);
        close(r.margin, c.summary.no_charger_margin, `${id} no charger margin`);
      });

      it('long trip', () => {
        const i = c.long_trip.inputs;
        const o = c.long_trip.outputs;
        const r = longTrip(model(), {
          distanceKm: n(i.distance_km), speedKmh: n(i.speed_kmh), usageDrivingPct: n(i.onboard_driving_pct),
          usageChargingPct: n(i.onboard_charging_pct), chargeFromPct: n(i.charge_from_pct), chargeToPct: n(i.charge_to_pct), profile: 'rural',
        }, true);
        close(r.energyKwh, o.energy_driving, `${id} long trip energy`);
        close(r.capacityPerChargeKwh, o.capacity_per_charge, `${id} capacity per charge`);
        close(r.chargings, o.chargings, `${id} chargings`);
        close(r.timePerChargeH, o.time_per_charge_h, `${id} time per charge`);
        close(r.timeChargingH, o.time_charging_h, `${id} charging time`);
        close(r.tripTimeH, o.trip_time_h, `${id} trip time`);
        close(r.chargingSharePct, o.charging_share_pct, `${id} charging share`);
      });

      it('battery life', () => {
        const i = c.battery_life.inputs;
        const r = batteryLife(model(), {
          years: n(i.years), kmPerYear: n(i.km_per_year), speedKmh: n(i.speed_kmh), usagePct: n(i.onboard_pct), profile: 'mixed',
        });
        close(r.energyKwh, c.battery_life.outputs.energy, `${id} life energy`);
        close(r.cyclesRequired, c.battery_life.outputs.cycles_required, `${id} cycles`);
        close(n(r.margin), c.summary.battery_life_margin, `${id} life margin`);
      });

      it('sprint', () => {
        if (KNOWN.has(`${id}:sprint`)) return; // spreadsheet has no high-speed consumption for this car
        const i = c.sprint.inputs;
        const r = sprint(model(), {
          distanceKm: n(i.distance_km), startPct: n(i.start_pct), endPct: n(i.end_pct), speedKmh: n(i.speed_kmh),
          usagePct: n(i.onboard_pct), profile: 'steady', climbM: 0,
        });
        close(r.energyKwh, c.sprint.outputs.energy, `${id} sprint energy`);
        close(r.requiredKwh, c.sprint.outputs.required_kwh, `${id} sprint required`);
        close(r.margin, c.summary.sprint_margin, `${id} sprint margin`);
      });

      it('total cost', () => {
        if (KNOWN.has(`${id}:cost`)) return; // no price in the spreadsheet
        const li = c.battery_life.inputs;
        const ci = c.cost.inputs;
        const o = c.cost.outputs;
        const r = cost(model(), {
          years: n(li.years), kmPerYear: n(li.km_per_year), speedKmh: n(li.speed_kmh), usagePct: n(li.onboard_pct), profile: 'mixed',
        }, { energyPrice: n(ci.energy_price), maintenancePerYear: n(ci.maintenance_per_year) }, true);
        close(n(r.purchase), o.purchase, `${id} purchase`);
        close(r.energyCost, o.energy_cost, `${id} energy cost`);
        close(r.maintenanceCost, o.maintenance_cost, `${id} maintenance`);
        close(n(r.tco), o.tco, `${id} tco`);
        close(n(r.costPerKm), o.cost_per_km, `${id} cost per km`);
      });
    });
  }
});
