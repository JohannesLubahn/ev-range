// One set of inputs per test (user request 2026-11-20): the standard in data/standard.csv, old scenarios, and that
// a change in one test leaves the others alone.
import { describe, expect, it } from 'vitest';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { loadBundledDataset } from '../src/data/bundled';
import { parseStandard } from '../src/data/parse';
import { TEST_KEYS, getInput, linkedInputs, marketCostInputs, setInputs, testInputs } from '../src/engine/inputs';
import { runEngine } from '../src/engine/run';
import { baseConditions, spreadsheetScenario, standardScenario, withDefaults } from '../src/engine/scenario';
import type { Conditions, Scenario } from '../src/engine/types';
import { builtInScenario } from '../src/state/store';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const settings = { battery: 'chemistry' } as const;
const cars = ['byd-atto-3', 'neta-v', 'honda-city'];

/** The values that were hard-coded in scenario.ts before data/standard.csv (commit 41b91ef). */
const OLD_CONDITIONS: Conditions = {
  airTemperatureC: 25,
  solarWm2: 400,
  humidityPct: 60,
  altitudeM: 0,
  payloadKg: 100,
  tyrePressurePct: 100,
  thermalMode: 'managed',
  preconditionedC: 20,
  batteryKm: 100000,
  drivingStylePct: 100,
};
const c = a.cabinSetpointC;
const OLD_TRIPS = {
  trafficJam: { startPct: 60, endPct: 5, distBeforeKm: 10, distJamKm: 10, timeJamH: 5, distAfterKm: 10, speedOutsideKmh: 40, cabinOutsideC: c, cabinJamC: c, profileOutside: 'city' },
  noCharger: { distanceKm: 300, startPct: 95, endPct: 5, speedKmh: 70, cabinC: c, profile: 'rural', climbM: 0 },
  longTrip: { distanceKm: 800, speedKmh: 60, cabinC: c, climateWhileCharging: true, chargeFromPct: 20, chargeToPct: 80, profile: 'rural' },
  batteryLife: { years: 20, kmPerYear: 15000, speedKmh: 40, cabinC: c, profile: 'mixed', dcSharePct: a.careTypicalDcSharePct, highSocTimePct: a.careTypicalHighSocTimePct },
  sprint: { distanceKm: 140, startPct: 95, endPct: 5, speedKmh: 120, cabinC: c, profile: 'steady', climbM: 0 },
  cost: { energyPrice: 7.5, maintenancePerYear: 8000 },
};

/** A scenario as an older version saved it: one set of conditions, cost without its own years and driving. */
function oldScenario(conditions: Partial<Conditions> = {}): Scenario {
  return { ...structuredClone(OLD_TRIPS), conditions: { ...OLD_CONDITIONS, ...conditions } } as unknown as Scenario;
}

const run = (s: Scenario) => runEngine(ds, a, s, settings, cars).results;

describe('data/standard.csv', () => {
  it('loads without warnings and covers every input of every test', () => {
    expect(ds.loadWarnings.filter((w) => w.includes('standard.csv'))).toEqual([]);
    const s = standardScenario(ds, a);
    for (const t of TEST_KEYS) for (const ref of testInputs(t)) expect(getInput(s, ref), `${t} ${ref.key}`).not.toBeUndefined();
  });
  it('reports unknown tests and inputs, values out of range and missing rows', () => {
    const warnings: string[] = [];
    parseStandard('test,input,value\nall,airTemperatureC,99\nmoon,distanceKm,1\nsprint,warpFactor,2\nsprint,profile,flying\n', warnings);
    expect(warnings.some((w) => w.includes('airTemperatureC') && w.includes('outside'))).toBe(true);
    expect(warnings.some((w) => w.includes('unknown test "moon"'))).toBe(true);
    expect(warnings.some((w) => w.includes('unknown input "warpFactor"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"flying" is not a driving profile'))).toBe(true);
    expect(warnings.some((w) => w.includes('no row for noCharger distanceKm'))).toBe(true);
  });
  it('the spreadsheet scenario holds the values the code had before (same conditions in every test)', () => {
    const s = spreadsheetScenario(ds, a);
    expect(baseConditions(ds)).toEqual(OLD_CONDITIONS);
    for (const t of TEST_KEYS) expect(s.conditions[t]).toEqual(OLD_CONDITIONS);
    // Plus the hills (2026-11-20): flat, at the typical slope.
    const slopePct = a.hillSlopeDefaultPct;
    const lifeFlat = { ascentPer100Km: 0, slopePct };
    for (const t of ['trafficJam', 'noCharger', 'longTrip', 'sprint'] as const) expect(s[t]).toEqual({ ...OLD_TRIPS[t], climbM: 0, ascentM: 0, slopePct });
    expect(s.batteryLife).toEqual({ ...OLD_TRIPS.batteryLife, ...lifeFlat });
    // Cost: the life's driving and the market's running costs (the old one maintenance per year is gone).
    expect(s.cost).toEqual({ ...marketCostInputs(a), years: 20, kmPerYear: 15000, speedKmh: 40, cabinC: c, profile: 'mixed', ...lifeFlat });
    expect(s.cost.energyPrice).toBe(OLD_TRIPS.cost.energyPrice);
  });
  it('the standard fits the conditions to each test', () => {
    const s = standardScenario(ds, a);
    expect(s.conditions.trafficJam).toEqual({ ...OLD_CONDITIONS, airTemperatureC: 35, solarWm2: 800 });
    expect(s.conditions.longTrip).toEqual({ ...OLD_CONDITIONS, payloadKg: 350 });
    expect(s.conditions.sprint).toEqual({ ...OLD_CONDITIONS, airTemperatureC: 30 });
    for (const t of ['noCharger', 'batteryLife', 'cost'] as const) expect(s.conditions[t]).toEqual(OLD_CONDITIONS);
  });
});

describe('older saved scenarios', () => {
  it('one set of conditions becomes the same conditions in every test, with the same results as before', () => {
    const old = withDefaults(oldScenario({ airTemperatureC: 35, payloadKg: 200 }), ds, a);
    for (const t of TEST_KEYS) expect(old.conditions[t]).toEqual({ ...OLD_CONDITIONS, airTemperatureC: 35, payloadKg: 200 });
    // Same conditions everywhere = the app before the change: compare with the spreadsheet scenario at those conditions.
    const ref = spreadsheetScenario(ds, a);
    for (const t of TEST_KEYS) ref.conditions[t] = { ...OLD_CONDITIONS, airTemperatureC: 35, payloadKg: 200 };
    const r0 = run(ref);
    const r1 = run(old);
    for (const id of cars) {
      expect(r1[id].trafficJam.margin).toBe(r0[id].trafficJam.margin);
      expect(r1[id].noCharger.margin).toBe(r0[id].noCharger.margin);
      expect(r1[id].longTrip.tripTimeH).toBe(r0[id].longTrip.tripTimeH);
      expect(r1[id].batteryLife.capacityEndPct).toBe(r0[id].batteryLife.capacityEndPct);
      expect(r1[id].cost.costPerKm).toBe(r0[id].cost.costPerKm);
    }
  });
  it('cost takes the years, distance and driving of Battery life', () => {
    const s0 = oldScenario();
    const s = withDefaults({ ...s0, batteryLife: { ...s0.batteryLife, years: 8, kmPerYear: 22000, cabinC: null } }, ds, a);
    expect(s.cost).toMatchObject({ years: 8, kmPerYear: 22000, cabinC: null, speedKmh: 40, profile: 'mixed' });
  });
  it('a scenario of the new shape stays as it is', () => {
    const s = standardScenario(ds, a);
    expect(withDefaults(s, ds, a)).toEqual(s);
  });
});

describe('each test has its own inputs', () => {
  const base = spreadsheetScenario(ds, a);
  const r0 = run(base);
  it("the traffic jam's air temperature changes only the traffic jam", () => {
    const r = run(setInputs(base, [{ test: 'trafficJam', group: 'conditions', key: 'airTemperatureC' }], 38));
    for (const id of cars) {
      expect(r[id].trafficJam.energyKwh).not.toBe(r0[id].trafficJam.energyKwh);
      expect(r[id].noCharger.energyKwh).toBe(r0[id].noCharger.energyKwh);
      expect(r[id].sprint.energyKwh).toBe(r0[id].sprint.energyKwh);
      expect(r[id].longTrip.tripTimeH).toBe(r0[id].longTrip.tripTimeH);
      expect(r[id].batteryLife.energyKwh).toBe(r0[id].batteryLife.energyKwh);
      expect(r[id].cost.costPerKm).toBe(r0[id].cost.costPerKm);
    }
  });
  it("a test's km driven changes only that test's battery", () => {
    const r = run(setInputs(base, [{ test: 'sprint', group: 'conditions', key: 'batteryKm' }], 250000));
    expect(r['byd-atto-3'].sprint.availableKwh).toBeLessThan(r0['byd-atto-3'].sprint.availableKwh);
    expect(r['byd-atto-3'].noCharger.availableKwh).toBe(r0['byd-atto-3'].noCharger.availableKwh);
  });
  it("Battery life's climate is the battery's past: it changes the wear in every stress test", () => {
    const r = run(setInputs(base, [{ test: 'batteryLife', group: 'conditions', key: 'airTemperatureC' }], 35));
    for (const t of ['trafficJam', 'noCharger', 'sprint'] as const) expect(r['byd-atto-3'][t].availableKwh).toBeLessThan(r0['byd-atto-3'][t].availableKwh);
    // A stress test's own temperature is the trip's weather, not the battery's past.
    const r2 = run(setInputs(base, [{ test: 'noCharger', group: 'conditions', key: 'airTemperatureC' }], 35));
    expect(r2['byd-atto-3'].noCharger.availableKwh).toBe(r0['byd-atto-3'].noCharger.availableKwh);
  });
  it('cost has its own years', () => {
    const r = run(setInputs(base, [{ test: 'cost', group: 'trip', key: 'years' }], 10));
    const tax = (x: typeof r) => x['byd-atto-3'].cost.parts.find((p) => p.key === 'tax')?.value as number;
    expect(tax(r)).toBeCloseTo(tax(r0) / 2, 6);
    expect(r['byd-atto-3'].batteryLife.energyKwh).toBe(r0['byd-atto-3'].batteryLife.energyKwh);
  });
  it('tests with the same conditions share one model; every model shares one calibration', () => {
    const same = runEngine(ds, a, base, settings, ['byd-atto-3']).models['byd-atto-3'];
    for (const t of TEST_KEYS) expect(same[t]).toBe(same.noCharger);
    const std = runEngine(ds, a, standardScenario(ds, a), settings, ['byd-atto-3']).models['byd-atto-3'];
    expect(std.trafficJam).not.toBe(std.noCharger);
    expect(std.noCharger).toBe(std.batteryLife);
    expect(std.trafficJam.calibration()).toBe(std.noCharger.calibration());
  });
});

describe('use in all tests (⇉) and presets', () => {
  it('a condition links to the same condition of the five other tests', () => {
    const linked = linkedInputs({ test: 'sprint', group: 'conditions', key: 'payloadKg' });
    expect(linked.map((l) => l.test).sort()).toEqual(TEST_KEYS.filter((t) => t !== 'sprint').sort());
  });
  it('a cabin temperature links to every other cabin temperature, both of the traffic jam included', () => {
    const linked = linkedInputs({ test: 'noCharger', group: 'trip', key: 'cabinC' });
    expect(linked).toContainEqual({ test: 'trafficJam', group: 'trip', key: 'cabinOutsideC' });
    expect(linked).toContainEqual({ test: 'trafficJam', group: 'trip', key: 'cabinJamC' });
    expect(linked).toContainEqual({ test: 'cost', group: 'trip', key: 'cabinC' });
    expect(linked).not.toContainEqual({ test: 'noCharger', group: 'trip', key: 'cabinC' });
  });
  it('years and driving link Battery life and Cost; trip inputs link nowhere', () => {
    expect(linkedInputs({ test: 'batteryLife', group: 'trip', key: 'years' })).toEqual([{ test: 'cost', group: 'trip', key: 'years' }]);
    expect(linkedInputs({ test: 'cost', group: 'trip', key: 'kmPerYear' })).toEqual([{ test: 'batteryLife', group: 'trip', key: 'kmPerYear' }]);
    expect(linkedInputs({ test: 'noCharger', group: 'trip', key: 'distanceKm' })).toEqual([]);
    expect(linkedInputs({ test: 'batteryLife', group: 'trip', key: 'dcSharePct' })).toEqual([]);
  });
  it('the weather presets set every test, on top of the standard', () => {
    const hot = builtInScenario('thai-hot', ds, a) as Scenario;
    for (const t of TEST_KEYS) expect(hot.conditions[t].airTemperatureC).toBe(35);
    expect(hot.conditions.longTrip.payloadKg).toBe(350);
    expect(builtInScenario('standard', ds, a)).toBeNull();
    expect(builtInScenario('spreadsheet', ds, a)).toEqual(spreadsheetScenario(ds, a));
  });
});
