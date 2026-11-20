// Hills of a trip as a mix of uphill, downhill and flat stretches (user request 2026-11-20). The trip's altitude
// change start → finish and its total climb set how many metres go up and down; the typical slope sets how long the
// climbs and descents are. Each part is simulated on the same speed trace, so gentle descents are used against air
// drag and rolling, steeper ones go through regeneration (η_regen, limits) and the friction brakes, by the physics.
import type { SimResult } from './simulate';

export interface TerrainSpec {
  /** Altitude change start → finish (m); negative = the finish is lower. */
  netM: number;
  /** Total climb: all uphill metres (raised to the altitude change when smaller). */
  ascentM: number;
  /** Typical slope of the climbs and descents (%). */
  slopePct: number;
}

export interface TerrainMix {
  /** Metres up and down (descent = climb − altitude change). */
  ascentM: number;
  descentM: number;
  /** Slope used (%): the one set, or steeper when the hills do not fit into the distance at it. */
  slopePct: number;
  setSlopePct: number;
  steepened: boolean;
  /** The hills did not fit even at the steepest slope used (30 %): fewer metres were driven. */
  capped: boolean;
  /** Shares of the distance uphill, downhill and flat; road grade (rise over run) of the up and down stretches. */
  upFrac: number;
  downFrac: number;
  flatFrac: number;
  grade: number;
}

/** Steepest slope the mix uses when the hills do not fit at the set one (rise over run). */
const MAX_GRADE = 0.3;

export function terrainMix(distanceKm: number, t: TerrainSpec | undefined): TerrainMix {
  const setSlopePct = t?.slopePct ?? 0;
  const none: TerrainMix = { ascentM: 0, descentM: 0, slopePct: setSlopePct, setSlopePct, steepened: false, capped: false, upFrac: 0, downFrac: 0, flatFrac: 1, grade: 0 };
  if (!t || distanceKm <= 0) return none;
  let ascentM = Math.max(t.ascentM, t.netM, 0);
  let descentM = ascentM - t.netM;
  if (ascentM + descentM <= 0) return none;
  const runM = distanceKm * 1000;
  let grade = Math.max(t.slopePct, 0.1) / 100;
  // Road distance of a stretch rising h metres at grade g: h / sin(atan g).
  const sinOf = (g: number) => Math.sin(Math.atan(g));
  let steepened = false;
  let capped = false;
  if ((ascentM + descentM) / sinOf(grade) > runM) {
    steepened = true;
    const need = (ascentM + descentM) / runM;
    if (need <= sinOf(MAX_GRADE)) grade = Math.tan(Math.asin(need));
    else {
      grade = MAX_GRADE;
      capped = true;
      const k = (runM * sinOf(grade)) / (ascentM + descentM);
      ascentM *= k;
      descentM *= k;
    }
  }
  const s = sinOf(grade);
  const upFrac = ascentM / s / runM;
  const downFrac = descentM / s / runM;
  return { ascentM, descentM, slopePct: grade * 100, setSlopePct, steepened, capped, upFrac, downFrac, flatFrac: Math.max(0, 1 - upFrac - downFrac), grade };
}

/** Distance-weighted mix of simulations of one speed trace at different grades (same distance and time each). */
export function combineSims(parts: { frac: number; sim: SimResult }[]): SimResult {
  const used = parts.filter((p) => p.frac > 0);
  const base = used[0]?.sim ?? parts[0].sim;
  const sum = (f: (s: SimResult) => number) => used.reduce((acc, p) => acc + p.frac * f(p.sim), 0);
  return {
    distanceKm: base.distanceKm,
    timeS: base.timeS,
    wheelPosKwh: sum((s) => s.wheelPosKwh),
    wheelNegKwh: sum((s) => s.wheelNegKwh),
    aeroKwh: sum((s) => s.aeroKwh),
    rollingKwh: sum((s) => s.rollingKwh),
    gradeKwh: sum((s) => s.gradeKwh),
    accelKwh: sum((s) => s.accelKwh),
    batteryKwh: sum((s) => s.batteryKwh),
    regenKwh: sum((s) => s.regenKwh),
    frictionKwh: sum((s) => s.frictionKwh),
    meanSquareKw2: sum((s) => s.meanSquareKw2),
  };
}
