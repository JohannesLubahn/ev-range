// Onboard power: electronics (per car class) + cabin heating/AC from the cabin heat balance (climate.ts).
// Battery heating/cooling is not part of it: it depends on the trip and is calculated with the battery (thermal.ts).
import type { Dataset, FactsTabRow, OnboardClass } from '../../data/types';
import type { Assumptions, Conditions } from '../types';
import { interp } from '../util';
import { cabinClimate, type CabinClimate } from './climate';

export interface OnboardPower {
  totalKw: number;
  /** Electronics: control units, pumps, lights, screens, driver assistance. */
  baseKw: number;
  /** Cabin heating / AC incl. blower holding the set cabin temperature (0 when off). */
  cabinKw: number;
  /** One-time energy to heat or cool the parked cabin to the set temperature at the start of a trip. */
  startKwh: number;
  /** Heat balance of the cabin; null when the heating / AC is off. */
  climate: CabinClimate | null;
}

export function onboardClass(ds: Dataset, carClass: string): OnboardClass | undefined {
  return ds.onboardClasses[carClass] ?? ds.onboardClasses.regular ?? Object.values(ds.onboardClasses)[0];
}

/** Electronics of a car class (kW): always on while the car is on, also in the official tests. */
export function baseLoadKw(cls: OnboardClass | undefined): number {
  return cls ? cls.generalKw + cls.infotainmentKw + cls.autonomousDrivingKw : 0;
}

export function onboardPower(
  ds: Dataset,
  a: Assumptions,
  c: Conditions,
  carClass: string,
  heatPump: boolean,
  /** Cabin temperature the heating / AC holds (°C), or null when it is off (fan and windows only). */
  cabinC: number | null,
  engineHeat = false,
): OnboardPower {
  const cls = onboardClass(ds, carClass);
  const baseKw = baseLoadKw(cls);
  if (!cls) return { totalKw: 0, baseKw: 0, cabinKw: 0, startKwh: 0, climate: null };
  if (cabinC === null) return { totalKw: baseKw, baseKw, cabinKw: 0, startKwh: 0, climate: null };
  const climate = cabinClimate({
    cls,
    a,
    airC: c.airTemperatureC,
    humidityPct: c.humidityPct,
    solarWm2: c.solarWm2,
    altitudeM: c.altitudeM,
    heatPump,
    engineHeat,
    setpointC: cabinC,
  });
  const preconditioned = c.thermalMode === 'preconditioned';
  return {
    totalKw: baseKw + climate.totalKw,
    baseKw,
    cabinKw: climate.totalKw,
    // A preconditioned car starts with the cabin at the set temperature (warmed or cooled while plugged in).
    startKwh: preconditioned ? 0 : climate.startKwh,
    climate,
  };
}

/** The Facts tab's onboard power (base, cabin heating / AC on or off, battery), for comparison only. */
export function factsTabPower(
  ds: Dataset,
  carClass: string,
  airC: number,
  climateOn: boolean,
): { baseKw: number; cabinKw: number; batteryKw: number; totalKw: number } | null {
  const rows = ds.factsTab;
  if (!rows.length) return null;
  const premium = carClass === 'premium';
  const xs = rows.map((r) => r.temperatureC);
  const at = (f: (r: FactsTabRow) => number) => interp(xs, rows.map(f), airC);
  const baseKw = at((r) => (premium ? r.basePremiumKw : r.baseRegularKw));
  const cabinKw = climateOn ? at((r) => (premium ? r.cabinPremiumKw : r.cabinRegularKw)) : 0;
  const batteryKw = at((r) => r.batteryKw);
  return { baseKw, cabinKw, batteryKw, totalKw: baseKw + cabinKw + batteryKw };
}
