// Cabin heating and air conditioning from a steady heat balance of the cabin.
//
//   heat into the cabin  Q = UA·(T_air − T_cabin)            walls and windows
//                          + ṁ_fresh·c_p·(T_air − T_cabin)    outside air blown in
//                          + I_sun·A_sun                       sunshine through the glass
//                          + people + screens + blower         heat released inside
//   Q < 0 → heating: electric power = |Q| ÷ COP (heat pump) or |Q| (resistive heater)
//   Q > 0 → cooling: electric power = (Q + moisture to condense) ÷ COP (AC)
//
// COP = share of the ideal (Carnot) COP between the cold and hot side of the refrigerant cycle, so it falls as the
// temperature lift grows. Parameters: data/onboard/classes.csv (per car class) and data/assumptions.csv.
import type { OnboardClass } from '../../data/types';
import { airDensity, pressureAtAltitude } from '../physics/air';
import type { Assumptions } from '../types';
import { clamp } from '../util';

const CP_AIR = 1006; // J/(kg·K)
const H_FG = 2.45e6; // J/kg, heat released when water vapour condenses (~20 °C)
const KELVIN = 273.15;
/** COP limit for very small temperature lifts. */
export const COP_MAX = 5;

/** Saturation vapour pressure over water (Pa), Magnus formula (Alduchov & Eskridge 1996). */
export function saturationPressure(tC: number): number {
  return 610.94 * Math.exp((17.625 * tC) / (tC + 243.04));
}

/** Humidity ratio: kg of water vapour per kg of dry air. */
export function humidityRatio(tC: number, rhPct: number, pressurePa: number): number {
  const pv = (clamp(rhPct, 0, 100) / 100) * saturationPressure(tC);
  return (0.622 * pv) / Math.max(1, pressurePa - pv);
}

/** AC (and battery chiller) COP: cooling power per electric power. */
export function coolingCop(airC: number, a: Assumptions): number {
  const te = a.acEvaporatorC + KELVIN;
  const tc = airC + a.acCondenserApproachK + KELVIN;
  if (tc <= te) return COP_MAX;
  return clamp(((a.acCarnotEfficiencyPct / 100) * te) / (tc - te), 1, COP_MAX);
}

/** Heat pump COP: heating power per electric power. */
export function heatPumpCop(airC: number, a: Assumptions): number {
  const tc = a.hpCondenserC + KELVIN;
  const te = airC - a.hpEvaporatorApproachK + KELVIN;
  if (tc <= te) return COP_MAX;
  return clamp(((a.hpCarnotEfficiencyPct / 100) * tc) / (tc - te), 1, COP_MAX);
}

/** Share of the heat a heat pump delivers; the resistive heater supplies the rest in deep cold. */
export function heatPumpShare(airC: number, a: Assumptions): number {
  if (a.hpFullC <= a.hpOffC) return airC >= a.hpFullC ? 1 : 0;
  return clamp((airC - a.hpOffC) / (a.hpFullC - a.hpOffC), 0, 1);
}

export interface ClimateInput {
  cls: OnboardClass;
  airC: number;
  humidityPct: number;
  solarWm2: number;
  altitudeM: number;
  heatPump: boolean;
  /** Petrol car: the cabin is heated with waste heat of the engine. */
  engineHeat?: boolean;
  /** Overrides for checks against measurements (default: assumptions). */
  setpointC?: number;
  occupants?: number;
  a: Assumptions;
}

export interface CabinClimate {
  mode: 'heating' | 'cooling' | 'none';
  setpointC: number;
  /** Heat flows into the cabin (W); negative = the cabin loses heat. */
  walls: number;
  freshAir: number;
  sun: number;
  /** Body heat of the occupants plus heat of screens and blower (W). */
  inside: number;
  /** Moisture the AC condenses, as heat (W); cooling only. */
  moisture: number;
  /** Heat to supply (heating) or remove (cooling), W. */
  loadW: number;
  /** Heat delivered or removed per kW of electricity (incl. the resistive share when heating). */
  cop: number;
  /** Share of the heat from the heat pump (heating). */
  heatPumpShare: number;
  /** Electric power of compressor / heater (kW). */
  compressorKw: number;
  blowerKw: number;
  /** Electric power with the climate control on all the time (kW). */
  totalKw: number;
  /** Cabin temperature when the trip starts (parked: air temperature + sun). */
  soakC: number;
  /** Electric energy to bring the cabin from soakC to the setpoint (kWh). */
  startKwh: number;
}

export function cabinClimate(i: ClimateInput): CabinClimate {
  const { cls, a } = i;
  const set = i.setpointC ?? a.cabinSetpointC;
  const occupants = i.occupants ?? a.cabinOccupants;
  const p = pressureAtAltitude(i.altitudeM);
  const rho = airDensity(i.airC, p);
  const dT = i.airC - set;
  const freshKgS = ((dT < 0 ? cls.freshAirHeatingM3h : cls.freshAirCoolingM3h) * rho) / 3600;
  const walls = cls.cabinUaWPerK * dT;
  const freshAir = freshKgS * CP_AIR * dT;
  const sun = Math.max(0, i.solarWm2) * cls.solarAreaM2;
  const inside = occupants * a.occupantSensibleW + (cls.infotainmentKw + cls.blowerKw) * 1000;
  const net = walls + freshAir + sun + inside;

  const heatShare = i.heatPump && !i.engineHeat ? heatPumpShare(i.airC, a) : 0;
  const hpCop = heatPumpCop(i.airC, a);
  // Electric energy per unit of heat when heating (resistive heater: 1).
  const heatElecPerHeat = i.engineHeat ? 0 : heatShare / hpCop + (1 - heatShare);
  const acCop = coolingCop(i.airC, a);

  let mode: CabinClimate['mode'] = 'none';
  let loadW = 0;
  let moisture = 0;
  let compressorKw = 0;
  let cop = 1;
  if (net < 0) {
    mode = 'heating';
    loadW = -net;
    compressorKw = (loadW * heatElecPerHeat) / 1000;
    cop = heatElecPerHeat > 0 ? 1 / heatElecPerHeat : Infinity;
  } else if (net > 0) {
    mode = 'cooling';
    const wAir = humidityRatio(i.airC, i.humidityPct, p);
    const wCoil = humidityRatio(a.acEvaporatorC, 100, p);
    moisture = freshKgS * Math.max(0, wAir - wCoil) * H_FG + occupants * a.occupantLatentW;
    loadW = net + moisture;
    cop = acCop;
    compressorKw = loadW / acCop / 1000;
  }
  const blowerKw = cls.blowerKw;

  // Start of a trip: the parked cabin is at air temperature, plus the warming by the sun.
  const soakC = i.airC + (a.cabinSoakK * Math.max(0, i.solarWm2)) / 1000;
  const startJ = cls.cabinHeatCapacityKjPerK * 1000 * Math.abs(soakC - set);
  const startKwh = soakC > set ? startJ / acCop / 3.6e6 : (startJ * heatElecPerHeat) / 3.6e6;

  return {
    mode,
    setpointC: set,
    walls,
    freshAir,
    sun,
    inside,
    moisture,
    loadW,
    cop,
    heatPumpShare: heatShare,
    compressorKw,
    blowerKw,
    totalKw: compressorKw + blowerKw,
    soakC,
    startKwh,
  };
}
