// Battery temperature while driving (steady state of a lumped pack).
//
// The Facts tab says the battery thermal management needs 0.2 kW per °C outside 10–21 °C, up to 2 kW.
// That is a heat exchange of ~200 W/K between pack and ambient: the pack is held in the window as long as
// 2 kW suffice and drifts with the ambient temperature beyond that. Resistive losses warm the pack.
import type { Assumptions, ThermalMode } from '../types';

export interface BatteryTemperature {
  temperatureC: number;
  description: string;
}

export function batteryTemperature(
  airTemperatureC: number,
  lossKw: number,
  mode: ThermalMode,
  preconditionedC: number,
  a: Assumptions,
): BatteryTemperature {
  if (mode === 'preconditioned') return { temperatureC: preconditionedC, description: `preconditioned to ${preconditionedC} °C` };
  const ua = a.batteryHeatExchangeWPerK / 1000; // kW per K
  const passive = airTemperatureC + (ua > 0 ? Math.max(0, lossKw) / ua : 0);
  if (mode === 'ambient' || ua <= 0) {
    return { temperatureC: passive, description: 'no thermal management: follows the air temperature (+ self-heating)' };
  }
  const lo = a.batteryManagedMinC;
  const hi = a.batteryManagedMaxC;
  if (passive < lo) {
    const heat = Math.min((lo - passive) * ua, a.batteryHvacMaxKw);
    const t = passive + heat / ua;
    return { temperatureC: t, description: t >= lo - 1e-9 ? `heated to ${lo} °C` : `heated, but ${a.batteryHvacMaxKw} kW only reach ${t.toFixed(1)} °C` };
  }
  if (passive > hi) {
    const cool = Math.min((passive - hi) * ua, a.batteryHvacMaxKw);
    const t = passive - cool / ua;
    return { temperatureC: t, description: t <= hi + 1e-9 ? `cooled to ${hi} °C` : `cooled, but ${a.batteryHvacMaxKw} kW only reach ${t.toFixed(1)} °C` };
  }
  return { temperatureC: passive, description: 'within the managed window' };
}
