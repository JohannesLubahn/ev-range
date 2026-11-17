// Onboard power vs. air temperature, from the spreadsheet's Facts tab (data/onboard/*.csv).
import type { Dataset } from '../../data/types';
import { interp } from '../util';
import type { ThermalMode } from '../types';

export interface OnboardPower {
  totalKw: number;
  /** Lights, brakes & suspension, idling + infotainment + autonomous driving. */
  baseKw: number;
  /** Cabin heating or air conditioning at the given usage. */
  cabinKw: number;
  /** Battery heating or cooling (thermal management). */
  batteryHvacKw: number;
  /** Cabin heating/AC at 100 % usage. */
  cabinFullKw: number;
}

export function onboardPower(
  ds: Dataset,
  carClass: string,
  airTemperatureC: number,
  cabinUsagePct: number,
  thermalMode: ThermalMode,
): OnboardPower {
  const cls = ds.onboardClasses[carClass] ?? ds.onboardClasses.regular ?? Object.values(ds.onboardClasses)[0];
  const baseKw = cls ? cls.generalKw + cls.infotainmentKw + cls.autonomousDrivingKw : 0;
  const temps = ds.hvac.map((h) => h.temperatureC);
  const premium = carClass === 'premium';
  const cabinFullKw = interp(temps, ds.hvac.map((h) => (premium ? h.cabinPremiumKw : h.cabinRegularKw)), airTemperatureC);
  const cabinKw = (cabinFullKw * cabinUsagePct) / 100;
  const batteryHvacKw = thermalMode === 'ambient' ? 0 : interp(temps, ds.hvac.map((h) => h.batteryKw), airTemperatureC);
  return { totalKw: baseKw + cabinKw + batteryHvacKw, baseKw, cabinKw, batteryHvacKw, cabinFullKw };
}
