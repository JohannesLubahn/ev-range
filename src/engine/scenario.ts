import type { Dataset } from '../data/types';
import { CONDITION_INPUTS, TEST_KEYS, TRIP_INPUTS, parseInputValue, spreadsheetValue, type InputKind, type InputValue, type TestKey } from './inputs';
import type { Assumptions, Conditions, Scenario } from './types';

/** Tyre pressure in bar that older versions of the app treated as "as recommended" for every car. */
const LEGACY_REFERENCE_BAR = 2.5;
/** The one "maintenance per year" of older versions (THB, the spreadsheet's Battery Sizing row 74). */
const LEGACY_MAINTENANCE = 8000;

type Loose = Record<string, unknown>;

/** Version of the inputs' meaning (see Scenario.version): 2 = a driving profile's speed is its cruising speed. */
export const SCENARIO_VERSION = 2;

/** The standard driving of each test before version 2, when a profile's speed was the average speed incl. stops. */
const LEGACY_DRIVING: { test: TestKey; speed: string; profile: string; speedKmh: number; profileId: string }[] = [
  { test: 'trafficJam', speed: 'speedOutsideKmh', profile: 'profileOutside', speedKmh: 40, profileId: 'city' },
  { test: 'noCharger', speed: 'speedKmh', profile: 'profile', speedKmh: 70, profileId: 'rural' },
  { test: 'sprint', speed: 'speedKmh', profile: 'profile', speedKmh: 120, profileId: 'steady' },
  { test: 'longTrip', speed: 'speedKmh', profile: 'profile', speedKmh: 60, profileId: 'rural' },
  { test: 'batteryLife', speed: 'speedKmh', profile: 'profile', speedKmh: 40, profileId: 'mixed' },
  { test: 'cost', speed: 'speedKmh', profile: 'profile', speedKmh: 40, profileId: 'mixed' },
];

/**
 * Scenarios older than version 2: a test still at the old standard driving gets the new standard (removed here, so the
 * standard fills it in); a driving the user had changed keeps its numbers, now read as the cruising speed (each
 * profile keeps the speed inside its own range).
 */
function migrateDriving(tests: Record<TestKey, Loose>): void {
  for (const l of LEGACY_DRIVING) {
    const t = tests[l.test];
    if (t[l.speed] === l.speedKmh && t[l.profile] === l.profileId) {
      delete t[l.speed];
      delete t[l.profile];
    }
  }
}

/**
 * Values of the rows of data/standard.csv for one test ('all' = the shared conditions). `spreadsheet` reads the
 * Spreadsheet preset's column where it has a value.
 */
function rowsOf(ds: Dataset, a: Assumptions, test: string, table: Record<string, InputKind>, spreadsheet = false): Loose {
  const out: Loose = {};
  for (const r of ds.standard) {
    if (r.test !== test || !(r.input in table)) continue;
    const raw = spreadsheet && r.spreadsheet ? spreadsheetValue(r.spreadsheet) : r.value;
    const { value } = parseInputValue(table[r.input], raw, a);
    if (value !== undefined) out[r.input] = value;
  }
  return out;
}

/** The conditions every test starts from (the "all" rows of data/standard.csv). */
export function baseConditions(ds: Dataset): Conditions {
  return rowsOf(ds, {} as Assumptions, 'all', CONDITION_INPUTS) as unknown as Conditions;
}

const cache = new WeakMap<Dataset, WeakMap<Assumptions, { standard: Scenario; spreadsheet: Scenario }>>();

function build(ds: Dataset, a: Assumptions): { standard: Scenario; spreadsheet: Scenario } {
  let byA = cache.get(ds);
  if (!byA) cache.set(ds, (byA = new WeakMap()));
  const hit = byA.get(a);
  if (hit) return hit;
  const all = baseConditions(ds);
  const trip = (t: TestKey, spreadsheet = false) => rowsOf(ds, a, t, TRIP_INPUTS[t] as Record<string, InputKind>, spreadsheet);
  const cond = (t: TestKey) => ({ ...all, ...rowsOf(ds, a, t, CONDITION_INPUTS) }) as Conditions;
  const parts = Object.fromEntries(TEST_KEYS.map((t) => [t, trip(t)])) as unknown as Omit<Scenario, 'conditions'>;
  const standard: Scenario = { version: SCENARIO_VERSION, ...parts, conditions: Object.fromEntries(TEST_KEYS.map((t) => [t, cond(t)])) as Scenario['conditions'] };
  const sheetParts = Object.fromEntries(TEST_KEYS.map((t) => [t, trip(t, true)])) as unknown as Omit<Scenario, 'conditions'>;
  const spreadsheet: Scenario = { version: SCENARIO_VERSION, ...sheetParts, conditions: Object.fromEntries(TEST_KEYS.map((t) => [t, { ...all }])) as Scenario['conditions'] };
  const r = { standard, spreadsheet };
  byA.set(a, r);
  return r;
}

/**
 * The standard inputs (data/standard.csv): since 2026-11-21 the user's own setup for every test (trip inputs,
 * conditions, hills); the market-specific running costs stay the market's. ↺ on an input goes back to this value. Do not change the returned object.
 */
export function standardScenario(ds: Dataset, a: Assumptions): Scenario {
  return build(ds, a).standard;
}

/** The spreadsheet's inputs: the trip inputs of the `spreadsheet` column, with the same conditions (the "all" rows) in every test. */
export function spreadsheetScenario(ds: Dataset, a: Assumptions): Scenario {
  return structuredClone(build(ds, a).spreadsheet);
}

/** The value of one input in the standard. */
export function standardValue(ds: Dataset, a: Assumptions, test: TestKey, group: 'trip' | 'conditions', key: string): InputValue {
  const s = standardScenario(ds, a);
  return ((group === 'conditions' ? s.conditions[test] : s[test]) as unknown as Record<string, InputValue>)[key];
}

/**
 * Older versions had "Cabin AC / heating %" (share of the time the heating / AC is on) instead of a cabin
 * temperature: 0 % becomes off, anything above becomes the default cabin temperature. The old key is dropped.
 */
function migrateUsage(test: Loose | undefined, usageKey: string, cabinKey: string, defaultC: number): void {
  if (!test || !(usageKey in test)) return;
  const usage = test[usageKey];
  delete test[usageKey];
  if (cabinKey in test) return;
  test[cabinKey] = typeof usage === 'number' && usage <= 0 ? null : defaultC;
}

/** Converts the old absolute tyre pressure (bar) to % of the recommended pressure. */
function migrateConditions(saved: Loose | undefined): Loose {
  const { tyrePressureBar, ...rest } = (saved ?? {}) as Loose & { tyrePressureBar?: number };
  if (rest.tyrePressurePct === undefined && typeof tyrePressureBar === 'number' && Number.isFinite(tyrePressureBar)) {
    rest.tyrePressurePct = Math.min(110, Math.max(60, Math.round((tyrePressureBar / LEGACY_REFERENCE_BAR) * 100)));
  }
  return rest;
}

/** Old scenarios had one set of conditions for every test (keys like airTemperatureC instead of test names). */
function isPerTest(c: unknown): c is Partial<Record<TestKey, Loose>> {
  return !!c && typeof c === 'object' && TEST_KEYS.some((t) => t in (c as Loose)) && !('airTemperatureC' in (c as Loose));
}

/**
 * Fills in fields that scenarios saved by an older version of the app do not have yet (from the Spreadsheet
 * preset's values: flat, typical battery care, the 2026-11-20 driving), and
 * converts older shapes:
 * - one set of conditions for all tests → the same conditions in each test (filled up to the old defaults, the
 *   "all" rows), so an old scenario gives the same results;
 * - Cost without its own years / distance / driving → Battery life's; one maintenance per year → servicing;
 * - absolute tyre pressure (bar) → % of the recommended pressure; heating / AC usage % → a cabin temperature;
 * - before version 2 (speed = average incl. stops): the old standard driving → the 2026-11-20 driving (see migrateDriving).
 */
export function withDefaults(s: Scenario, ds: Dataset, a: Assumptions): Scenario {
  // Inputs a saved scenario lacks (added after it was saved: hills, battery care, ...) take the Spreadsheet preset's
  // values (flat, typical care, the 2026-11-20 driving), which is what the scenario meant before they existed; not the
  // user's standard of 2026-11-21, which would add hills and hard battery care to it.
  const base = build(ds, a).spreadsheet;
  const raw = s.conditions as unknown;
  let conditions: Scenario['conditions'];
  if (isPerTest(raw)) {
    conditions = Object.fromEntries(TEST_KEYS.map((t) => [t, { ...base.conditions[t], ...migrateConditions(raw[t]) }])) as Scenario['conditions'];
  } else {
    const one = { ...baseConditions(ds), ...migrateConditions(raw as Loose | undefined) } as Conditions;
    conditions = Object.fromEntries(TEST_KEYS.map((t) => [t, { ...one }])) as Scenario['conditions'];
  }
  const copy = (t: object | undefined) => ({ ...(t ?? {}) }) as Loose;
  const trafficJam = copy(s.trafficJam);
  const noCharger = copy(s.noCharger);
  const longTrip = copy(s.longTrip);
  const batteryLife = copy(s.batteryLife);
  const sprint = copy(s.sprint);
  const cost = copy(s.cost);
  const c = a.cabinSetpointC;
  migrateUsage(trafficJam, 'usageOutsidePct', 'cabinOutsideC', c);
  migrateUsage(trafficJam, 'usageJamPct', 'cabinJamC', c);
  migrateUsage(noCharger, 'usagePct', 'cabinC', c);
  migrateUsage(sprint, 'usagePct', 'cabinC', c);
  migrateUsage(batteryLife, 'usagePct', 'cabinC', c);
  migrateUsage(longTrip, 'usageDrivingPct', 'cabinC', c);
  if ('usageChargingPct' in longTrip) {
    const usage = longTrip.usageChargingPct;
    delete longTrip.usageChargingPct;
    if (!('climateWhileCharging' in longTrip)) longTrip.climateWhileCharging = !(typeof usage === 'number' && usage <= 0);
  }
  if ((s.version ?? 1) < SCENARIO_VERSION) migrateDriving({ trafficJam, noCharger, sprint, longTrip, batteryLife, cost });
  const life = { ...base.batteryLife, ...batteryLife };
  if (s.cost && !('years' in cost)) {
    // Older versions: the cost used Battery life's years, distance and driving.
    for (const k of ['years', 'kmPerYear', 'speedKmh', 'cabinC', 'profile'] as const) cost[k] = life[k];
  }
  if ('maintenancePerYear' in cost) {
    // Older versions had one maintenance per year; a value the user had changed becomes the servicing of both
    // powertrains, the old standard gives way to the market's servicing.
    const old = cost.maintenancePerYear;
    delete cost.maintenancePerYear;
    if (typeof old === 'number' && old !== LEGACY_MAINTENANCE) {
      cost.servicingBev ??= old;
      cost.servicingIce ??= old;
    }
  }
  return {
    ...s,
    version: SCENARIO_VERSION,
    trafficJam: { ...base.trafficJam, ...trafficJam },
    noCharger: { ...base.noCharger, ...noCharger },
    longTrip: { ...base.longTrip, ...longTrip },
    batteryLife: life,
    sprint: { ...base.sprint, ...sprint },
    cost: { ...base.cost, ...cost },
    conditions,
  };
}
