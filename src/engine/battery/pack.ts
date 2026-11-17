// Battery pack as an equivalent circuit: open-circuit voltage (per chemistry, vs. state of charge) plus an
// internal resistance that rises in the cold (Arrhenius), and a deliverable capacity that falls in the cold.
//
//   P = (V_oc − R·I)·I  →  I = (V_oc − √(V_oc² − 4·R·P)) / (2·R)
//   losses = R·I²·(RMS/mean)²     terminal energy = V_oc·dq − losses
//
// At 25 °C and low power a full 100 → 0 % discharge delivers the rated (nominal) energy by construction,
// because the cell's nominal voltage is the mean of its open-circuit voltage curve.
import type { Chemistry } from '../../data/types';
import { interp } from '../util';

const GAS_CONSTANT = 8.314462618;
const SOC_STEP = 0.25;

export interface DischargeResult {
  /** Energy delivered at the pack terminals (kWh). */
  terminalKwh: number;
  /** Resistive losses inside the pack (kWh). */
  lossKwh: number;
  /** State of charge at the end (%). */
  endSocPct: number;
  /** The voltage reached the cut-off before the target (cold and/or high power). */
  cutoff: boolean;
  /** The requested power exceeded what the pack can deliver at some point. */
  powerLimited: boolean;
}

export interface PackOptions {
  chemistry: Chemistry;
  /** Temperatures of the capacity table (Dataset.capacityTemps). */
  capacityTemps: number[];
  nominalKwh: number;
  /** Long-term state of health (0..1), e.g. 0.8. */
  sohFrac: number;
  packVoltageV: number;
}

export class Pack {
  readonly opts: PackOptions;
  readonly nSeries: number;
  /** Nominal capacity in Ah (new pack). */
  readonly capacityAh: number;
  /** Internal resistance at 25 °C (Ω), from the voltage drop at 1C. */
  readonly r25: number;

  constructor(opts: PackOptions) {
    this.opts = opts;
    this.nSeries = opts.packVoltageV / opts.chemistry.nominalCellV;
    this.capacityAh = (opts.nominalKwh * 1000) / opts.packVoltageV;
    const i1c = this.capacityAh;
    this.r25 = i1c > 0 ? ((opts.chemistry.dv1c25cPct / 100) * opts.packVoltageV) / i1c : 0;
  }

  /** Resistance factor relative to 25 °C (Arrhenius with the chemistry's activation energy). */
  resistanceFactor(tempC: number): number {
    const ea = this.opts.chemistry.resistanceEaKjPerMol * 1000;
    return Math.exp((ea / GAS_CONSTANT) * (1 / (tempC + 273.15) - 1 / 298.15));
  }

  resistance(tempC: number): number {
    return this.r25 * this.resistanceFactor(tempC);
  }

  /** Deliverable share of the rated capacity at this temperature (0..1). */
  capacityFactor(tempC: number): number {
    return interp(this.opts.capacityTemps, this.opts.chemistry.capacityPct, tempC) / 100;
  }

  /** Pack open-circuit voltage at a state of charge (%). */
  ocv(socPct: number): number {
    const ocv = this.opts.chemistry.ocv;
    const s = Math.min(100, Math.max(0, socPct));
    const i = Math.min(99, Math.floor(s));
    const cell = ocv[i] + (ocv[i + 1] - ocv[i]) * (s - i);
    return cell * this.nSeries;
  }

  /**
   * Discharges from `fromPct` towards `toPct` at a constant mean power (kW). `rmsFactor` (RMS/mean power ≥ 1)
   * accounts for higher losses of a fluctuating load. Stops early at `stopAtKwh` terminal energy, at the
   * voltage cut-off, or when the requested power cannot be delivered.
   */
  discharge(fromPct: number, toPct: number, powerKw: number, rmsFactor: number, tempC: number, stopAtKwh?: number): DischargeResult {
    const q = this.capacityAh * this.opts.sohFrac * this.capacityFactor(tempC); // Ah between 0 and 100 %
    const r = this.resistance(tempC);
    const k = r * rmsFactor * rmsFactor;
    const vCut = this.opts.chemistry.cutoffCellV * this.nSeries;
    const p = Math.max(0, powerKw) * 1000;
    let term = 0;
    let loss = 0;
    let soc = fromPct;
    let cutoff = false;
    let powerLimited = false;
    while (soc > toPct + 1e-9) {
      const ds = Math.min(SOC_STEP, soc - toPct);
      const v = this.ocv(soc - ds / 2);
      const dq = (ds / 100) * q; // Ah
      let i: number;
      if (p <= 0 || k <= 0) i = p > 0 ? p / v : 0;
      else {
        const disc = v * v - 4 * k * p;
        if (disc < 0) {
          powerLimited = true;
          i = v / (2 * k);
        } else i = (v - Math.sqrt(disc)) / (2 * k);
      }
      if (v - r * i < vCut) {
        cutoff = true;
        break;
      }
      const dLoss = (k * i * dq) / 1000; // kWh
      const dTerm = (v * dq) / 1000 - dLoss;
      if (stopAtKwh !== undefined && term + dTerm >= stopAtKwh) {
        const f = dTerm > 0 ? (stopAtKwh - term) / dTerm : 0;
        term = stopAtKwh;
        loss += dLoss * f;
        soc -= ds * f;
        return { terminalKwh: term, lossKwh: loss, endSocPct: soc, cutoff, powerLimited };
      }
      term += dTerm;
      loss += dLoss;
      soc -= ds;
    }
    return { terminalKwh: term, lossKwh: loss, endSocPct: soc, cutoff, powerLimited };
  }

  /**
   * Discharge curve: cell terminal voltage vs. delivered charge (% of the rated capacity) at a constant
   * power, from 100 % until the voltage cut-off.
   */
  dischargeCurve(powerKw: number, tempC: number): { deliveredPct: number; cellV: number }[] {
    const kcap = this.capacityFactor(tempC);
    const q = this.capacityAh * this.opts.sohFrac * kcap;
    const r = this.resistance(tempC);
    const vCut = this.opts.chemistry.cutoffCellV * this.nSeries;
    const p = Math.max(0, powerKw) * 1000;
    const pts: { deliveredPct: number; cellV: number }[] = [];
    for (let soc = 100; soc >= 0; soc -= 1) {
      const v = this.ocv(soc);
      const disc = v * v - 4 * r * p;
      if (disc < 0) break;
      const i = r > 0 ? (v - Math.sqrt(disc)) / (2 * r) : p / v;
      const vt = v - r * i;
      pts.push({ deliveredPct: (100 - soc) * kcap, cellV: vt / this.nSeries });
      if (vt < vCut) break;
    }
    void q;
    return pts;
  }

  withNominal(nominalKwh: number): Pack {
    return new Pack({ ...this.opts, nominalKwh });
  }
}
