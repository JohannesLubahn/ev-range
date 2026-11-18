// Battery temperature over a trip: a lumped, insulated pack with heat capacity C and heat loss UA to the air.
//
//   C · dT/dt = losses + heating − cooling − UA · (T − T_air)
//
// The pack starts at the air temperature (parked for long) or at the preconditioning temperature. "Managed" heats it
// when it would fall below the window and cools it when it would rise above, with at most the maximum power.
// Each time step uses the exact exponential solution for a constant heat input.
import type { Chemistry } from '../../data/types';
import type { Assumptions, ThermalMode } from '../types';

/** Heat capacity of a pack (J/K) from its size, pack specific energy and cell specific heat. */
export function packHeatCapacity(nominalKwh: number, chem: Chemistry): number {
  const massKg = (nominalKwh * 1000) / Math.max(1, chem.packWhPerKg);
  return massKg * chem.specificHeatJPerKgK;
}

export interface PackThermalInput {
  airC: number;
  durationH: number;
  /** Mean heat from the pack's own resistive losses (kW). */
  lossKw: number;
  heatCapacityJPerK: number;
  mode: ThermalMode;
  preconditionedC: number;
  /** Chiller COP (cooling power per electric power) at this air temperature. */
  coolingCop: number;
  a: Assumptions;
}

export interface PackThermal {
  startC: number;
  endC: number;
  /** Time-averaged pack temperature, used for the discharge model. */
  meanC: number;
  /** Electric energy for heating / cooling the pack over the trip (kWh). */
  heatingKwh: number;
  coolingKwh: number;
  description: string;
}

const f1 = (v: number) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));

export function packThermal(i: PackThermalInput): PackThermal {
  const { a } = i;
  const ua = Math.max(0, a.batteryHeatExchangeWPerK);
  const C = Math.max(1, i.heatCapacityJPerK);
  const start = i.mode === 'preconditioned' ? i.preconditionedC : i.airC;
  const managed = i.mode !== 'ambient';
  const lo = a.batteryManagedMinC;
  const hi = a.batteryManagedMaxC;
  const pmax = Math.max(0, a.batteryHvacMaxKw) * 1000;
  const qLoss = Math.max(0, i.lossKw) * 1000;
  const totalS = Math.max(0, i.durationH) * 3600;
  const n = Math.min(600, Math.max(1, Math.ceil(Math.max(0, i.durationH) * 60)));
  const dt = totalS / n;
  const e = ua > 0 ? Math.exp((-ua * dt) / C) : 1;
  // Temperature after one step with a constant heat input q (W).
  const step = (T: number, q: number) => (ua > 0 ? i.airC + q / ua + (T - i.airC - q / ua) * e : T + (q * dt) / C);
  // Heat input that ends the step exactly at `target`.
  const needed = (T: number, target: number) =>
    ua > 0 ? (ua * (target - i.airC - (T - i.airC) * e)) / (1 - e) : (C * (target - T)) / dt;

  let T = start;
  let sum = 0;
  let heatJ = 0;
  let coolJ = 0;
  if (dt > 0) {
    for (let k = 0; k < n; k++) {
      let qh = 0;
      let qc = 0;
      if (managed) {
        const free = step(T, qLoss);
        if (free < lo) qh = Math.min(pmax, Math.max(0, needed(T, lo) - qLoss));
        else if (free > hi) qc = Math.min(pmax, Math.max(0, qLoss - needed(T, hi)));
      }
      const next = step(T, qLoss + qh - qc);
      sum += (T + next) / 2;
      heatJ += qh * dt;
      coolJ += (qc / Math.max(1, i.coolingCop)) * dt;
      T = next;
    }
  }
  const meanC = dt > 0 ? sum / n : start;
  const heatingKwh = heatJ / 3.6e6;
  const coolingKwh = coolJ / 3.6e6;
  const parts = [i.mode === 'preconditioned' ? `preconditioned to ${f1(start)} °C` : `starts at the air temperature, ${f1(start)} °C`];
  if (!managed) parts.push('not heated or cooled');
  if (heatingKwh > 0.005) parts.push(`heated towards ${lo} °C`);
  if (coolingKwh > 0.005) parts.push(`cooled above ${hi} °C`);
  parts.push(`ends at ${f1(T)} °C (mean ${f1(meanC)} °C)`);
  return { startC: start, endC: T, meanC, heatingKwh, coolingKwh, description: parts.join(', ') };
}
