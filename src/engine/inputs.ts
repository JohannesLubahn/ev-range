// The user inputs of every test: what kind of value each one holds, its allowed range, which inputs mean the same
// thing in several tests (for "use in all tests"), and reading / writing them in a scenario. Pure code, no UI.
import type { CostItem } from './costItems';
import { marketCosts, type Powertrain } from './costs';
import { PROFILE_IDS, type Assumptions, type Conditions, type CostInputs, type Scenario } from './types';

/** The six tests that each keep their own inputs. */
export type TestKey = 'trafficJam' | 'noCharger' | 'sprint' | 'longTrip' | 'batteryLife' | 'cost';
export const TEST_KEYS: TestKey[] = ['trafficJam', 'noCharger', 'sprint', 'longTrip', 'batteryLife', 'cost'];
export const TEST_LABELS: Record<TestKey, string> = {
  trafficJam: 'Traffic jam',
  noCharger: 'No charger',
  sprint: 'Sprint',
  longTrip: 'Long trip',
  batteryLife: 'Battery life',
  cost: 'Cost of ownership',
};

export type InputValue = number | string | boolean | null;

export type InputKind =
  /** A number in [min, max]; `fallback` gives the value of a blank cell in data/standard.csv. */
  | { type: 'number'; min: number; max: number; fallback?: (a: Assumptions) => number }
  | { type: 'profile' }
  /** Cabin temperature (°C) or null = heating / AC off; blank = the default cabin temperature. */
  | { type: 'cabin' }
  | { type: 'bool' }
  | { type: 'thermal' };

const n = (min: number, max: number, fallback?: (a: Assumptions) => number): InputKind => ({ type: 'number', min, max, fallback });
const PROFILE: InputKind = { type: 'profile' };
/** Speed of a driving profile: each profile narrows it to its own range (data/profiles.csv). */
const SPEED = n(10, 200);
/** Cost inputs whose standard is the market's value (data/running_costs.csv). */
const marketKinds = new WeakSet<InputKind>();
const market = (min: number, max: number, item: CostItem, pt: Powertrain = 'BEV'): InputKind => {
  const k = n(min, max, (a) => marketCosts(a).value(item, pt));
  marketKinds.add(k);
  return k;
};
const CABIN: InputKind = { type: 'cabin' };
/** Hills: altitude change start → finish, total climb, typical slope (blank = assumption hill_slope_default_pct). */
const SLOPE = n(0.5, 20, (a) => a.hillSlopeDefaultPct);
const TERRAIN = { climbM: n(-3000, 3000), ascentM: n(0, 30000), slopePct: SLOPE };

export const CONDITION_INPUTS: Record<keyof Conditions, InputKind> = {
  airTemperatureC: n(-30, 50),
  solarWm2: n(0, 1100),
  humidityPct: n(0, 100),
  altitudeM: n(0, 4500),
  payloadKg: n(0, 800),
  tyrePressurePct: n(60, 110),
  drivingStylePct: n(40, 200),
  batteryKm: n(0, 1_000_000),
  thermalMode: { type: 'thermal' },
  preconditionedC: n(-10, 40),
};

const LIFE_DRIVING = {
  years: n(1, 40),
  kmPerYear: n(1000, 80000),
  speedKmh: SPEED,
  cabinC: CABIN,
  profile: PROFILE,
  ascentPer100Km: n(0, 5000),
  slopePct: SLOPE,
};

/** The trip inputs of each test (the keys of Scenario[test]). Ranges are those of the input fields. */
export const TRIP_INPUTS: { [T in TestKey]: Record<keyof Scenario[T], InputKind> } = {
  trafficJam: {
    startPct: n(5, 100),
    endPct: n(0, 50),
    distBeforeKm: n(0, 200),
    distJamKm: n(0, 50),
    timeJamH: n(0.5, 24),
    distAfterKm: n(0, 200),
    speedOutsideKmh: SPEED,
    profileOutside: PROFILE,
    cabinOutsideC: CABIN,
    cabinJamC: CABIN,
    ...TERRAIN,
  },
  noCharger: { distanceKm: n(10, 1000), startPct: n(10, 100), endPct: n(0, 50), speedKmh: SPEED, cabinC: CABIN, profile: PROFILE, ...TERRAIN },
  sprint: { distanceKm: n(10, 1000), startPct: n(10, 100), endPct: n(0, 50), speedKmh: SPEED, cabinC: CABIN, profile: PROFILE, ...TERRAIN },
  longTrip: {
    distanceKm: n(50, 3000),
    speedKmh: SPEED,
    cabinC: CABIN,
    climateWhileCharging: { type: 'bool' },
    chargeFromPct: n(0, 90),
    chargeToPct: n(20, 100),
    profile: PROFILE,
    ...TERRAIN,
  },
  batteryLife: {
    ...LIFE_DRIVING,
    dcSharePct: n(0, 100, (a) => a.careTypicalDcSharePct),
    highSocTimePct: n(0, 100, (a) => a.careTypicalHighSocTimePct),
  },
  cost: {
    ...LIFE_DRIVING,
    energyPrice: market(0, 1000, 'electricity_price'),
    servicingBev: market(0, 1_000_000, 'servicing_per_year', 'BEV'),
    servicingIce: market(0, 1_000_000, 'servicing_per_year', 'ICE'),
    insuranceRateBev: market(0, 20, 'insurance_rate_pct', 'BEV'),
    insuranceRateIce: market(0, 20, 'insurance_rate_pct', 'ICE'),
    insuranceMin: market(0, 1_000_000, 'insurance_min'),
    compulsoryInsurance: market(0, 1_000_000, 'compulsory_insurance'),
    tyreSetRegular: market(0, 10_000_000, 'tyre_set_regular'),
    tyreSetPremium: market(0, 10_000_000, 'tyre_set_premium'),
    tyreLifeKm: market(5000, 200_000, 'tyre_life_km'),
    repairsPct: market(0, 20, 'repairs_pct'),
    warrantyYears: market(0, 40, 'warranty_years'),
    battery12vPrice: market(0, 1_000_000, 'battery_12v_price'),
    battery12vYears: market(1, 20, 'battery_12v_years'),
    depreciationBev: market(0, 50, 'depreciation_pct', 'BEV'),
    depreciationIce: market(0, 50, 'depreciation_pct', 'ICE'),
  },
};

/** Where an input lives: a test's trip inputs or its conditions. */
export interface InputRef {
  test: TestKey;
  group: 'trip' | 'conditions';
  key: string;
}

export function inputKind(ref: InputRef): InputKind | undefined {
  const table = (ref.group === 'conditions' ? CONDITION_INPUTS : TRIP_INPUTS[ref.test]) as Record<string, InputKind>;
  return table[ref.key];
}

/** The cost inputs whose standard is the market's value, at the market of `a` (switching the market sets them). */
export function marketCostInputs(a: Assumptions): Partial<CostInputs> {
  const out: Record<string, number> = {};
  for (const [key, kind] of Object.entries(TRIP_INPUTS.cost) as [string, InputKind][]) {
    if (marketKinds.has(kind) && kind.type === 'number' && kind.fallback) out[key] = kind.fallback(a);
  }
  return out as Partial<CostInputs>;
}

/**
 * Reads one value of data/standard.csv. Returns the value, or an error message. A blank cell gives the kind's
 * fallback (cabin: the default cabin temperature), or `undefined` when there is none.
 */
export function parseInputValue(kind: InputKind, raw: string, a?: Assumptions): { value?: InputValue; error?: string } {
  const v = raw.trim();
  switch (kind.type) {
    case 'number': {
      if (v === '') return kind.fallback ? { value: a ? kind.fallback(a) : undefined } : { error: 'needs a number' };
      const x = Number(v);
      if (!Number.isFinite(x)) return { error: `"${raw}" is not a number` };
      if (x < kind.min || x > kind.max) return { error: `${x} is outside ${kind.min}…${kind.max}` };
      return { value: x };
    }
    case 'cabin': {
      if (v === '') return { value: a?.cabinSetpointC };
      if (v.toLowerCase() === 'off') return { value: null };
      const x = Number(v);
      return Number.isFinite(x) && x >= 10 && x <= 32 ? { value: x } : { error: `"${raw}" is not off or a cabin temperature (°C)` };
    }
    case 'profile':
      return (PROFILE_IDS as string[]).includes(v) && v !== 'jam'
        ? { value: v }
        : { error: `"${raw}" is not a driving profile (${PROFILE_IDS.filter((p) => p !== 'jam').join(', ')})` };
    case 'bool':
      if (/^(yes|true|1)$/i.test(v)) return { value: true };
      if (/^(no|false|0)$/i.test(v)) return { value: false };
      return { error: `"${raw}" is not yes or no` };
    case 'thermal':
      return ['managed', 'ambient', 'preconditioned'].includes(v) ? { value: v } : { error: `"${raw}" is not managed, ambient or preconditioned` };
  }
}

export function getInput(s: Scenario, ref: InputRef): InputValue {
  const obj = (ref.group === 'conditions' ? s.conditions[ref.test] : s[ref.test]) as unknown as Record<string, InputValue>;
  return obj[ref.key];
}

/** A copy of the scenario with every given input set to `value`. */
export function setInputs(s: Scenario, refs: InputRef[], value: InputValue): Scenario {
  let next: Scenario = { ...s, conditions: { ...s.conditions } };
  for (const ref of refs) {
    if (ref.group === 'conditions') next.conditions[ref.test] = { ...next.conditions[ref.test], [ref.key]: value };
    else next = { ...next, [ref.test]: { ...next[ref.test], [ref.key]: value } };
  }
  return next;
}

/** A copy of the scenario with each given input set to its value in `from` (e.g. the standard). */
export function copyInputs(s: Scenario, refs: InputRef[], from: Scenario): Scenario {
  let next = s;
  for (const ref of refs) next = setInputs(next, [ref], getInput(from, ref));
  return next;
}

/** Driving of the life that Battery life and Cost both have: "use in all" copies these between the two. */
const SHARED_LIFE_KEYS = new Set(['years', 'kmPerYear', 'speedKmh', 'profile', 'ascentPer100Km']);

/**
 * The other inputs that mean the same thing as `ref`, which "use in all tests" sets to its value:
 * - a condition: the same condition in every other test;
 * - a cabin temperature: every other cabin temperature (both of the traffic jam's included);
 * - the typical slope of the hills: the slope of every other test;
 * - years, km per year, speed, profile and climb per 100 km of the life: between Battery life and Cost.
 * Other inputs (a trip's distance, start charge, …) belong to their test only: none.
 */
export function linkedInputs(ref: InputRef): InputRef[] {
  if (ref.group === 'conditions') return TEST_KEYS.filter((t) => t !== ref.test).map((t) => ({ test: t, group: 'conditions', key: ref.key }));
  const kind = inputKind(ref);
  if (kind?.type === 'cabin') {
    const all: InputRef[] = [];
    for (const t of TEST_KEYS) {
      for (const [k, kk] of Object.entries(TRIP_INPUTS[t]) as [string, InputKind][]) {
        if (kk.type === 'cabin' && !(t === ref.test && k === ref.key)) all.push({ test: t, group: 'trip', key: k });
      }
    }
    return all;
  }
  if (ref.key === 'slopePct') return TEST_KEYS.filter((t) => t !== ref.test).map((t) => ({ test: t, group: 'trip', key: 'slopePct' }));
  if ((ref.test === 'batteryLife' || ref.test === 'cost') && SHARED_LIFE_KEYS.has(ref.key)) {
    return [{ test: ref.test === 'cost' ? 'batteryLife' : 'cost', group: 'trip', key: ref.key }];
  }
  return [];
}

/** Every input of a test (its trip inputs and its conditions). */
export function testInputs(test: TestKey): InputRef[] {
  return [
    ...Object.keys(TRIP_INPUTS[test]).map((key): InputRef => ({ test, group: 'trip', key })),
    ...Object.keys(CONDITION_INPUTS).map((key): InputRef => ({ test, group: 'conditions', key })),
  ];
}

