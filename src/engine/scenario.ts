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
};

/** Tyre pressure in bar that older versions of the app treated as "as recommended" for every car. */
const LEGACY_REFERENCE_BAR = 2.5;

/**
 * Fills in fields that scenarios saved by an older version of the app do not have yet, and converts the old
 * absolute tyre pressure (bar) to % of the recommended pressure.
 */
export function withDefaults(s: Scenario): Scenario {
  const { tyrePressureBar, ...saved } = (s.conditions ?? {}) as Partial<Conditions> & { tyrePressureBar?: number };
  const conditions: Conditions = { ...DEFAULT_CONDITIONS, ...saved };
  if (saved.tyrePressurePct === undefined && typeof tyrePressureBar === 'number' && Number.isFinite(tyrePressureBar)) {
    conditions.tyrePressurePct = Math.min(110, Math.max(60, Math.round((tyrePressureBar / LEGACY_REFERENCE_BAR) * 100)));
  }
  return { ...s, conditions };
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
      usageOutsidePct: 90,
      usageJamPct: 90,
      profileOutside: 'city',
    },
    noCharger: { distanceKm: 300, startPct: 95, endPct: 5, speedKmh: 70, usagePct: 50, profile: 'rural', climbM: 0 },
    longTrip: {
      distanceKm: 800,
      speedKmh: 60,
      usageDrivingPct: 90,
      usageChargingPct: 90,
      chargeFromPct: 20,
      chargeToPct: 80,
      profile: 'rural',
    },
    batteryLife: { years: 20, kmPerYear: 15000, speedKmh: 40, usagePct: 60, profile: 'mixed' },
    sprint: { distanceKm: 140, startPct: 95, endPct: 5, speedKmh: 120, usagePct: 90, profile: 'steady', climbM: 0 },
    cost: { energyPrice: a.electricityPrice, maintenancePerYear: a.maintenancePerYear },
    conditions: { ...DEFAULT_CONDITIONS },
  };
}
