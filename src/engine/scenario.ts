import type { Assumptions, Conditions, Scenario } from './types';

export const DEFAULT_CONDITIONS: Conditions = {
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

/** Tyre pressure in bar that older versions of the app treated as "as recommended" for every car. */
const LEGACY_REFERENCE_BAR = 2.5;

type Loose = Record<string, unknown>;

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

/**
 * Fills in fields that scenarios saved by an older version of the app do not have yet, converts the old absolute
 * tyre pressure (bar) to % of the recommended pressure, and the old heating / AC usage % to a cabin temperature.
 */
export function withDefaults(s: Scenario, a: Assumptions): Scenario {
  const { tyrePressureBar, ...saved } = (s.conditions ?? {}) as Partial<Conditions> & { tyrePressureBar?: number };
  const conditions: Conditions = { ...DEFAULT_CONDITIONS, ...saved };
  if (saved.tyrePressurePct === undefined && typeof tyrePressureBar === 'number' && Number.isFinite(tyrePressureBar)) {
    conditions.tyrePressurePct = Math.min(110, Math.max(60, Math.round((tyrePressureBar / LEGACY_REFERENCE_BAR) * 100)));
  }
  const base = spreadsheetDefaults(a);
  const copy = (t: object | undefined) => ({ ...(t ?? {}) }) as Loose;
  const trafficJam = copy(s.trafficJam);
  const noCharger = copy(s.noCharger);
  const longTrip = copy(s.longTrip);
  const batteryLife = copy(s.batteryLife);
  const sprint = copy(s.sprint);
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
  return {
    ...s,
    trafficJam: { ...base.trafficJam, ...trafficJam },
    noCharger: { ...base.noCharger, ...noCharger },
    longTrip: { ...base.longTrip, ...longTrip },
    batteryLife: { ...base.batteryLife, ...batteryLife },
    sprint: { ...base.sprint, ...sprint },
    cost: { ...base.cost, ...s.cost },
    conditions,
  };
}

/** The inputs of the spreadsheet's Battery Sizing tab (column D), as one scenario for all cars. */
export function spreadsheetDefaults(a: Assumptions): Scenario {
  return {
    trafficJam: {
      startPct: 60,
      endPct: 5,
      distBeforeKm: 10,
      distJamKm: 10,
      timeJamH: 5,
      distAfterKm: 10,
      speedOutsideKmh: 40,
      cabinOutsideC: a.cabinSetpointC,
      cabinJamC: a.cabinSetpointC,
      profileOutside: 'city',
    },
    noCharger: { distanceKm: 300, startPct: 95, endPct: 5, speedKmh: 70, cabinC: a.cabinSetpointC, profile: 'rural', climbM: 0 },
    longTrip: {
      distanceKm: 800,
      speedKmh: 60,
      cabinC: a.cabinSetpointC,
      climateWhileCharging: true,
      chargeFromPct: 20,
      chargeToPct: 80,
      profile: 'rural',
    },
    batteryLife: {
      years: 20,
      kmPerYear: 15000,
      speedKmh: 40,
      cabinC: a.cabinSetpointC,
      profile: 'mixed',
      dcSharePct: a.careTypicalDcSharePct,
      highSocTimePct: a.careTypicalHighSocTimePct,
    },
    sprint: { distanceKm: 140, startPct: 95, endPct: 5, speedKmh: 120, cabinC: a.cabinSetpointC, profile: 'steady', climbM: 0 },
    cost: { energyPrice: a.electricityPrice, maintenancePerYear: a.maintenancePerYear },
    conditions: { ...DEFAULT_CONDITIONS },
  };
}
