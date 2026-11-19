// Battery ageing: capacity left after a distance driven, from charge cycles and from time (calendar ageing).
//
//   SoH = 1 − cycle fade − calendar fade
//   cycle fade    = (1 − EoL) × (EFC ÷ rated cycles)^z               z per chemistry
//   calendar fade = k₂₅ × exp(−Ea/R × (1/T − 1/298.15)) × years^n     k₂₅, Ea, n per chemistry
//
// EFC (equivalent full cycles) counts full discharges of the aged battery: dEFC = dE ÷ capacity at that point.
// Rated cycle counts are measured the same way (full cycles of the ageing cell until it reaches the end-of-life
// capacity), so the car's rated cycles set the size of the cycle fade and the chemistry its shape.

import type { Dataset, DegradationMeasurement } from '../../data/types';

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
}

export interface AgeingResult {
  km: number;
  years: number;
  /** Equivalent full cycles of the ageing battery. */
  efc: number;
  cycleFadePct: number;
  calendarFadePct: number;
  /** Capacity left, % of nominal. */
  sohPct: number;
  capacityKwh: number;
  temperatureC: number;
  kmPerYear: number;
  kwhPerKm: number;
}

export function calendarFadePct(chem: AgeingChemistry, years: number, temperatureC: number): number {
  if (years <= 0) return 0;
  const tK = temperatureC + 273.15;
  const arrhenius = Math.exp(((-chem.calendarEaKjPerMol * 1000) / GAS_CONSTANT) * (1 / tK - 1 / 298.15));
  return chem.calendarLossPct1y25c * arrhenius * years ** chem.calendarTimeExponent;
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
  const soh = (efc: number, y: number) =>
    Math.max(0, 100 - cycleFadePct(i.chem, efc, i.ratedCycles, i.eolPct) - calendarFadePct(i.chem, y, i.temperatureC));
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
  const cyc = cycleFadePct(i.chem, efc, i.ratedCycles, i.eolPct);
  const cal = calendarFadePct(i.chem, years, i.temperatureC);
  const sohPct = Math.max(0, 100 - cyc - cal);
  return {
    km,
    years,
    efc,
    cycleFadePct: cyc,
    calendarFadePct: cal,
    sohPct,
    capacityKwh: (i.nominalKwh * sohPct) / 100,
    temperatureC: i.temperatureC,
    kmPerYear,
    kwhPerKm: i.kwhPerKm,
  };
}

/** Model vs. a published real-world state of health (data/battery/degradation_measurements.csv). */
export function checkDegradation(ds: Dataset, eolPct: number, m: DegradationMeasurement): { m: DegradationMeasurement; model: AgeingResult | null; deviationPct: number } {
  const chem = ds.chemistries[m.chemistry];
  if (!chem) return { m, model: null, deviationPct: NaN };
  const model = ageBattery({
    chem,
    nominalKwh: m.nominalKwh,
    ratedCycles: m.ratedCycles,
    eolPct,
    kwhPerKm: m.kwhPerKm,
    km: m.km,
    kmPerYear: m.years > 0 ? m.km / m.years : m.km,
    temperatureC: m.temperatureC,
  });
  return { m, model, deviationPct: model.sohPct - m.measuredSohPct };
}
