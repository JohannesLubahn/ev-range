// Battery ageing: capacity left after a distance driven, from charge cycles and from time (calendar ageing).
//
//   SoH = 1 − cycle fade − calendar fade
//   cycle fade    = (1 − EoL) × (EFC × f_cyc ÷ rated cycles)^z                  z per chemistry
//   calendar fade = k₂₅ × f_cal × exp(−Ea/R × (1/T − 1/298.15)) × years^n      k₂₅, Ea, n per chemistry
//
// EFC (equivalent full cycles) counts full discharges of the aged battery: dEFC = dE ÷ capacity at that point.
// Rated cycle counts are measured the same way (full cycles of the ageing cell until it reaches the end-of-life
// capacity), so the car's rated cycles set the size of the cycle fade and the chemistry its shape.
//
// Battery care (how the battery was charged), relative to the typical habits the size of the fade is fitted to:
//   f_cyc = (1 + s_dc × k × C) ÷ (1 + s_typ × k × C_ref)       s_dc = share of the charging at DC fast chargers,
//                                                              C = the car's fast-charging rate (capacities per hour)
//   f_cal = [t × F(SoC_high) + (1 − t) × F(SoC_normal)] ÷ (the same at t_typ)
//                                                              t = share of the time parked above 80 % charge,
//                                                              F = the chemistry's calendar rate vs. charge

import type { Dataset, DegradationMeasurement } from '../../data/types';
import type { Assumptions } from '../types';

const GAS_CONSTANT = 8.314462618;
const STEPS = 100;

export interface AgeingChemistry {
  /** Calendar capacity loss after one year at 25 °C (%). */
  calendarLossPct1y25c: number;
  /** Exponent of time in the calendar fade (0.5 = square root of time). */
  calendarTimeExponent: number;
  /** Activation energy of the calendar fade (kJ/mol). */
  calendarEaKjPerMol: number;
  /** Exponent of the cycle fade vs. equivalent full cycles. */
  cycleFadeExponent: number;
  /** Calendar-ageing rate vs. state of charge (index = %), 1 at 50 %. Missing = the charge level has no effect. */
  calendarSocFactor?: number[];
}

/** How the battery was charged over its life. */
export interface CareHabits {
  /** Share of the charging done at DC fast chargers (%). */
  dcSharePct: number;
  /** Share of the time parked above 80 % charge (%). */
  highSocTimePct: number;
}

/** Model constants of the battery care (data/assumptions.csv). */
export interface CareParams {
  wearPerC: number;
  referenceCRate: number;
  typical: CareHabits;
  highSocPct: number;
  normalSocPct: number;
}

export function careParams(a: Assumptions): CareParams {
  return {
    wearPerC: a.fastChargeWearPerC,
    referenceCRate: a.fastChargeReferenceCRate,
    typical: { dcSharePct: a.careTypicalDcSharePct, highSocTimePct: a.careTypicalHighSocTimePct },
    highSocPct: a.careHighSocPct,
    normalSocPct: a.careNormalSocPct,
  };
}

export type CarePreset = 'gentle' | 'typical' | 'hard';

export function carePresets(a: Assumptions): Record<CarePreset, CareHabits> {
  return {
    gentle: { dcSharePct: a.careGentleDcSharePct, highSocTimePct: a.careGentleHighSocTimePct },
    typical: { dcSharePct: a.careTypicalDcSharePct, highSocTimePct: a.careTypicalHighSocTimePct },
    hard: { dcSharePct: a.careHardDcSharePct, highSocTimePct: a.careHardHighSocTimePct },
  };
}

/** The preset that matches the habits, or null (custom). */
export function matchPreset(a: Assumptions, h: CareHabits): CarePreset | null {
  for (const [k, v] of Object.entries(carePresets(a)) as [CarePreset, CareHabits][]) {
    if (v.dcSharePct === h.dcSharePct && v.highSocTimePct === h.highSocTimePct) return k;
  }
  return null;
}

const pct01 = (v: number) => Math.max(0, Math.min(100, v)) / 100;

/** Wear per cycle relative to typical habits, from the share of fast charging and the car's charging rate (C). */
export function cycleWearFactor(p: CareParams, dcSharePct: number, cRate: number | null): number {
  const c = cRate !== null && Number.isFinite(cRate) && cRate > 0 ? cRate : p.referenceCRate;
  const own = 1 + pct01(dcSharePct) * p.wearPerC * c;
  const typical = 1 + pct01(p.typical.dcSharePct) * p.wearPerC * p.referenceCRate;
  return own / typical;
}

/** The chemistry's calendar-ageing rate at a state of charge (%), 1 at 50 %. */
export function socRate(chem: AgeingChemistry, socPct: number): number {
  const t = chem.calendarSocFactor;
  if (!t || t.length === 0) return 1;
  const x = Math.max(0, Math.min(t.length - 1, socPct));
  const i = Math.floor(x);
  const j = Math.min(t.length - 1, i + 1);
  return t[i] + (t[j] - t[i]) * (x - i);
}

/** Calendar-ageing rate relative to typical habits, from the share of the time parked above 80 % charge. */
export function calendarCareFactor(chem: AgeingChemistry, p: CareParams, highSocTimePct: number): number {
  const hi = socRate(chem, p.highSocPct);
  const lo = socRate(chem, p.normalSocPct);
  const mix = (t: number) => pct01(t) * hi + (1 - pct01(t)) * lo;
  const typical = mix(p.typical.highSocTimePct);
  return typical > 0 ? mix(highSocTimePct) / typical : 1;
}

export interface AgeingInput {
  chem: AgeingChemistry;
  nominalKwh: number;
  /** Rated full cycles until the battery reaches `eolPct` (null = unknown: no cycle fade). */
  ratedCycles: number | null;
  /** Capacity at the end of the rated cycles (% of nominal), e.g. 80. */
  eolPct: number;
  /** Energy taken from the battery per km (kWh/km). */
  kwhPerKm: number;
  km: number;
  kmPerYear: number;
  /** Temperature the battery spends its life at (°C). */
  temperatureC: number;
  /** Battery care relative to typical habits (1 = typical). */
  cycleWearFactor?: number;
  calendarFactor?: number;
}

export interface AgeingResult {
  km: number;
  years: number;
  /** Equivalent full cycles of the ageing battery. */
  efc: number;
  /** Cycles of wear: EFC × the fast-charging factor. */
  wearEfc: number;
  cycleWearFactor: number;
  calendarFactor: number;
  cycleFadePct: number;
  calendarFadePct: number;
  /** Capacity left, % of nominal. */
  sohPct: number;
  capacityKwh: number;
  temperatureC: number;
  kmPerYear: number;
  kwhPerKm: number;
}

export function calendarFadePct(chem: AgeingChemistry, years: number, temperatureC: number, factor = 1): number {
  if (years <= 0) return 0;
  const tK = temperatureC + 273.15;
  const arrhenius = Math.exp(((-chem.calendarEaKjPerMol * 1000) / GAS_CONSTANT) * (1 / tK - 1 / 298.15));
  return chem.calendarLossPct1y25c * factor * arrhenius * years ** chem.calendarTimeExponent;
}

export function cycleFadePct(chem: AgeingChemistry, efc: number, ratedCycles: number | null, eolPct: number): number {
  if (!ratedCycles || ratedCycles <= 0 || efc <= 0) return 0;
  return (100 - eolPct) * (efc / ratedCycles) ** chem.cycleFadeExponent;
}

/** Capacity left after `km`, integrating the cycles over the distance as the capacity fades. */
export function ageBattery(i: AgeingInput): AgeingResult {
  const km = Math.max(0, i.km);
  const kmPerYear = Math.max(1, i.kmPerYear);
  const years = km / kmPerYear;
  const fCyc = i.cycleWearFactor ?? 1;
  const fCal = i.calendarFactor ?? 1;
  const soh = (efc: number, y: number) =>
    Math.max(0, 100 - cycleFadePct(i.chem, efc * fCyc, i.ratedCycles, i.eolPct) - calendarFadePct(i.chem, y, i.temperatureC, fCal));
  let efc = 0;
  if (km > 0 && i.nominalKwh > 0) {
    const dKm = km / STEPS;
    for (let s = 0; s < STEPS; s++) {
      // Capacity in the middle of the step (one predictor step).
      const yMid = ((s + 0.5) * dKm) / kmPerYear;
      const dE = i.kwhPerKm * dKm;
      const guess = soh(efc + dE / i.nominalKwh / 2, yMid);
      const cap = Math.max(1e-6, (i.nominalKwh * guess) / 100);
      efc += dE / cap;
    }
  }
  const cyc = cycleFadePct(i.chem, efc * fCyc, i.ratedCycles, i.eolPct);
  const cal = calendarFadePct(i.chem, years, i.temperatureC, fCal);
  const sohPct = Math.max(0, 100 - cyc - cal);
  return {
    km,
    years,
    efc,
    wearEfc: efc * fCyc,
    cycleWearFactor: fCyc,
    calendarFactor: fCal,
    cycleFadePct: cyc,
    calendarFadePct: cal,
    sohPct,
    capacityKwh: (i.nominalKwh * sohPct) / 100,
    temperatureC: i.temperatureC,
    kmPerYear,
    kwhPerKm: i.kwhPerKm,
  };
}

/**
 * Km driven until the capacity falls to `targetPct`, at the input's km per year (bisection: the capacity falls
 * monotonically with km). Null if the capacity is still above the target at `maxKm`.
 */
export function kmUntilSoh(i: AgeingInput, targetPct: number, maxKm: number): number | null {
  if (ageBattery({ ...i, km: maxKm }).sohPct > targetPct) return null;
  let lo = 0;
  let hi = maxKm;
  for (let n = 0; n < 50 && hi - lo > 10; n++) {
    const mid = (lo + hi) / 2;
    if (ageBattery({ ...i, km: mid }).sohPct > targetPct) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Model vs. a published real-world state of health (data/battery/degradation_measurements.csv). */
export function checkDegradation(
  ds: Dataset,
  a: Assumptions,
  m: DegradationMeasurement,
): { m: DegradationMeasurement; model: AgeingResult | null; deviationPct: number } {
  const chem = ds.chemistries[m.chemistry];
  if (!chem) return { m, model: null, deviationPct: NaN };
  const p = careParams(a);
  const model = ageBattery({
    chem,
    nominalKwh: m.nominalKwh,
    ratedCycles: m.ratedCycles,
    eolPct: a.ratedCyclesEndCapacityPct,
    kwhPerKm: m.kwhPerKm,
    km: m.km,
    kmPerYear: m.years > 0 ? m.km / m.years : m.km,
    temperatureC: m.temperatureC,
    cycleWearFactor: cycleWearFactor(p, m.dcSharePct ?? p.typical.dcSharePct, m.fastChargeCRate),
    calendarFactor: calendarCareFactor(chem, p, m.highSocTimePct ?? p.typical.highSocTimePct),
  });
  return { m, model, deviationPct: model.sohPct - m.measuredSohPct };
}
