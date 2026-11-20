import type { Dataset } from '../data/types';
import { CONDITION_INPUTS, TEST_KEYS, TRIP_INPUTS, parseInputValue, type InputKind, type InputValue, type TestKey } from './inputs';
import type { Assumptions, Conditions, Scenario } from './types';

/** Tyre pressure in bar that older versions of the app treated as "as recommended" for every car. */
const LEGACY_REFERENCE_BAR = 2.5;

type Loose = Record<string, unknown>;

/** Values of the rows of data/standard.csv for one test ('all' = the shared conditions). */
function rowsOf(ds: Dataset, a: Assumptions, test: string, table: Record<string, InputKind>): Loose {
  const out: Loose = {};
  for (const r of ds.standard) {
    if (r.test !== test || !(r.input in table)) continue;
    const { value } = parseInputValue(table[r.input], r.value, a);
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
  const trip = (t: TestKey) => rowsOf(ds, a, t, TRIP_INPUTS[t] as Record<string, InputKind>);
  const cond = (t: TestKey) => ({ ...all, ...rowsOf(ds, a, t, CONDITION_INPUTS) }) as Conditions;
  const parts = Object.fromEntries(TEST_KEYS.map((t) => [t, trip(t)])) as unknown as Omit<Scenario, 'conditions'>;
  const standard: Scenario = { ...parts, conditions: Object.fromEntries(TEST_KEYS.map((t) => [t, cond(t)])) as Scenario['conditions'] };
  const spreadsheet: Scenario = { ...parts, conditions: Object.fromEntries(TEST_KEYS.map((t) => [t, { ...all }])) as Scenario['conditions'] };
  const r = { standard, spreadsheet };
  byA.set(a, r);
  return r;
}

/**
 * The standard inputs (data/standard.csv): the spreadsheet's trip inputs and conditions fitted to each test (e.g. the
 * traffic jam on a hot afternoon). ↺ on an input goes back to this value. Do not change the returned object.
 */
export function standardScenario(ds: Dataset, a: Assumptions): Scenario {
  return build(ds, a).standard;
}

/** The spreadsheet's inputs: the standard trip inputs, with the same conditions (the "all" rows) in every test. */
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
 * Fills in fields that scenarios saved by an older version of the app do not have yet (from the standard), and
 * converts older shapes:
 * - one set of conditions for all tests → the same conditions in each test (filled up to the old defaults, the
 *   "all" rows), so an old scenario gives the same results;
 * - Cost without its own years / distance / driving → Battery life's;
 * - absolute tyre pressure (bar) → % of the recommended pressure; heating / AC usage % → a cabin temperature.
 */
export function withDefaults(s: Scenario, ds: Dataset, a: Assumptions): Scenario {
  const base = standardScenario(ds, a);
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
  const life = { ...base.batteryLife, ...batteryLife };
  if (s.cost && !('years' in cost)) {
    // Older versions: the cost used Battery life's years, distance and driving.
    for (const k of ['years', 'kmPerYear', 'speedKmh', 'cabinC', 'profile'] as const) cost[k] = life[k];
  }
  return {
    ...s,
    trafficJam: { ...base.trafficJam, ...trafficJam },
    noCharger: { ...base.noCharger, ...noCharger },
    longTrip: { ...base.longTrip, ...longTrip },
    batteryLife: life,
    sprint: { ...base.sprint, ...sprint },
    cost: { ...base.cost, ...cost },
    conditions,
  };
}
