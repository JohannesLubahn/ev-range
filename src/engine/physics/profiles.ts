// Speed traces of the driving profiles (data/profiles.csv), one value per second (km/h).
//
// The speed set for a profile means what the profile's `speed` column says (user's choice 2026-11-20):
// - constant (Steady): the car holds it;
// - cruising (City, Rural, Highway, Motorway): the top of the trace. The recorded trace is stretched in time to it,
//   v'(t) = k·v(t/k) with k = speed ÷ recorded top: speeds and durations × k, accelerations as recorded. Before, the
//   speed was the average incl. stops and the speeds were multiplied, which made accelerations harder and gave a
//   "70 km/h" city drive peaks of 155 km/h;
// - own (Mixed): no speed: the whole WLTP at its recorded speeds (a mix of roads has no single speed);
// - average (the traffic jam): the trace slowed down to the jam's average speed (distance ÷ time).
// The driving style (Conditions) is applied to the stretched trace; the car's top speed caps it.
import type { Dataset, ProfileDef } from '../../data/types';
import type { Profile } from '../types';
import { styleTrace, traceDynamics, type TraceDynamics } from './style';

export interface ProfileTrace {
  profile: ProfileDef;
  /** One stretch of the trace as driven (1 value per second, km/h); it repeats over the trip. */
  speedsKmh: number[];
  /** The speed used: the one set, kept inside the profile's range; null for a profile at its own speeds. */
  speedKmh: number | null;
  /** Time factor of the stretch (1 = as recorded): speeds and durations × factor, accelerations as recorded. */
  stretch: number;
  /** Average speed incl. stops, average while moving and the highest speed of the stretch (km/h). */
  avgKmh: number;
  movingAvgKmh: number;
  topKmh: number;
  /** Length of one stretch (km; Infinity for a constant speed) and its stops, counted as it repeats. */
  lengthKm: number;
  stops: number;
  /** The car's top speed, when it capped the trace. */
  cappedAtKmh: number | null;
  description: string;
  /** Dynamics of the trace as driven (EU RDE metrics); null for a constant speed. */
  dynamics: TraceDynamics | null;
}

/** Below this speed (km/h) the car counts as standing (EU RDE: stops are speeds below 1 km/h). */
const STANDING_KMH = 1;

/** The profile's row of data/profiles.csv. */
export function profileDef(ds: Dataset, id: Profile | string): ProfileDef {
  const p = ds.profiles.find((x) => x.id === id);
  if (!p) throw new Error(`Driving profile "${id}" is missing in data/profiles.csv`);
  return p;
}

/** The speed a profile drives for the speed set: inside its range; null for a profile at its own speeds. */
export function profileSpeed(def: ProfileDef, speedKmh: number): number | null {
  if (def.speed === 'own') return null;
  if (def.speed === 'average') return speedKmh;
  const lo = def.speedMinKmh ?? speedKmh;
  const hi = def.speedMaxKmh ?? speedKmh;
  return Math.min(hi, Math.max(lo, speedKmh));
}

/** The trace stretched in time by k: v'(t) = k·v(t/k). Speeds and durations × k, accelerations unchanged. */
export function stretchTrace(speedsKmh: number[], k: number): number[] {
  const n = speedsKmh.length;
  if (k === 1 || n < 2 || !(k > 0)) return speedsKmh;
  const m = Math.max(2, Math.round((n - 1) * k) + 1);
  const out = new Array<number>(m);
  for (let i = 0; i < m; i++) {
    const t = Math.min(n - 1, i / k);
    const j = Math.min(n - 2, Math.floor(t));
    const f = t - j;
    out[i] = k * (speedsKmh[j] * (1 - f) + speedsKmh[j + 1] * f);
  }
  return out;
}

/**
 * The part of a trace between the first time it reaches `joinKmh` and the last time it is at or above it: repeated,
 * it runs on without the start from and the stop at a standstill.
 */
export function joinTrace(speedsKmh: number[], joinKmh: number): number[] {
  const i0 = speedsKmh.findIndex((v) => v >= joinKmh);
  let i1 = -1;
  for (let i = speedsKmh.length - 1; i >= 0; i--) {
    if (speedsKmh[i] >= joinKmh) {
      i1 = i;
      break;
    }
  }
  return i0 >= 0 && i1 > i0 ? speedsKmh.slice(i0, i1 + 1) : speedsKmh;
}

const recordedCache = new WeakMap<Dataset, Map<string, number[]>>();

/** The recorded trace of a profile: its cycle phases, joined where the profile says so. */
export function recordedTrace(ds: Dataset, def: ProfileDef): number[] {
  let cache = recordedCache.get(ds);
  if (!cache) recordedCache.set(ds, (cache = new Map()));
  const hit = cache.get(def.id);
  if (hit) return hit;
  const cyc = ds.cycles[def.cycle];
  if (!cyc) throw new Error(`Cycle ${def.cycle} of the driving profile "${def.id}" is missing (data/cycles/index.csv)`);
  const phases = cyc.speedsKmh.filter((_, i) => def.phases.length === 0 || def.phases.includes(cyc.phases[i]));
  const trace = def.joinKmh !== null ? joinTrace(phases, def.joinKmh) : phases;
  cache.set(def.id, trace);
  return trace;
}

/** Distance (km) and time (s) of a trace, 1 value per second, the speed changing evenly within each second. */
function distanceAndTime(speedsKmh: number[]): { km: number; s: number } {
  let km = 0;
  for (let i = 1; i < speedsKmh.length; i++) km += (speedsKmh[i - 1] + speedsKmh[i]) / 2 / 3600;
  return { km, s: Math.max(0, speedsKmh.length - 1) };
}

/** Stops of a trace that repeats: each change from moving to standing, the change at the joint included. */
export function countStops(speedsKmh: number[]): number {
  const n = speedsKmh.length;
  let stops = 0;
  for (let i = 0; i < n; i++) {
    const prev = speedsKmh[(i - 1 + n) % n];
    if (prev >= STANDING_KMH && speedsKmh[i] < STANDING_KMH) stops++;
  }
  return stops;
}

function movingAverage(speeds: number[]): number {
  let sum = 0;
  let n = 0;
  for (const v of speeds) {
    if (v > 0.5) {
      sum += v;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Average speed incl. stops, top speed, length (km) and stops of one stretch of a trace that repeats. */
export function traceStats(speedsKmh: number[]): { avgKmh: number; topKmh: number; lengthKm: number; stops: number } {
  const { km, s } = distanceAndTime(speedsKmh);
  return { avgKmh: s > 0 ? (km / s) * 3600 : 0, topKmh: Math.max(...speedsKmh), lengthKm: km, stops: countStops(speedsKmh) };
}

/** "a stop every 14 km", "no stops". */
export function stopsText(lengthKm: number, stops: number): string {
  if (stops === 0 || !Number.isFinite(lengthKm)) return 'no stops';
  const every = lengthKm / stops;
  return `a stop every ${every < 10 ? every.toFixed(1) : Math.round(every)} km`;
}

/** Name of the recorded trace, e.g. "WLTP high phase" or "US EPA Highway Fuel Economy Test (HWFET)". */
export function traceName(ds: Dataset, def: ProfileDef): string {
  const phases = def.phases.map((p) => p.replace('_', '-'));
  const base = phases.length
    ? `${def.cycle} ${phases.join(' + ')} phase${phases.length > 1 ? 's' : ''}`
    : def.cycle === 'WLTP'
      ? 'the whole WLTP'
      : (ds.cycles[def.cycle]?.description ?? def.cycle);
  return def.joinKmh !== null ? `${base}, joined at ${def.joinKmh} km/h` : base;
}

function styleText(style: number): string {
  return style === 1 ? '' : `, driven ${style < 1 ? 'gentler' : 'harder'} (accelerations and braking ≈ ${Math.round(style * 100)} %)`;
}

const r0 = (v: number) => Math.round(v);
const r2 = (v: number) => v.toFixed(2);

const traceCache = new WeakMap<Dataset, Map<string, ProfileTrace>>();

/**
 * The speed trace of a profile for the speed set (see the file header), driven with the driving style `style`
 * (1 = as recorded; see `styleTrace`) and capped at the car's top speed `capKmh` (null = no cap).
 */
export function profileTrace(ds: Dataset, profile: Profile | string, speedKmh: number, style = 1, windowS = 30, capKmh: number | null = null): ProfileTrace {
  let cache = traceCache.get(ds);
  if (!cache) traceCache.set(ds, (cache = new Map()));
  const key = `${profile}|${speedKmh}|${style}|${windowS}|${capKmh}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 500) cache.clear();
  const tr = buildTrace(ds, profileDef(ds, profile), speedKmh, style, windowS, capKmh);
  cache.set(key, tr);
  return tr;
}

function buildTrace(ds: Dataset, def: ProfileDef, speedSet: number, style: number, windowS: number, capKmh: number | null): ProfileTrace {
  const speed = profileSpeed(def, speedSet);
  const cap = capKmh !== null && capKmh > 0 ? capKmh : null;
  if (def.speed === 'constant' || (speed !== null && speed <= 0)) {
    const v = Math.max(0, speed ?? 0);
    const driven = cap !== null && v > cap ? cap : v;
    const capped = driven < v ? cap : null;
    return {
      profile: def,
      speedsKmh: [driven, driven],
      speedKmh: v,
      stretch: 1,
      avgKmh: driven,
      movingAvgKmh: driven,
      topKmh: driven,
      lengthKm: Infinity,
      stops: 0,
      cappedAtKmh: capped,
      description: `constant ${r0(driven)} km/h${capped !== null ? ` (the car's top speed; ${r0(v)} km/h set)` : ''}`,
      dynamics: null,
    };
  }
  const recorded = recordedTrace(ds, def);
  const name = traceName(ds, def);
  let speeds: number[];
  let stretch = 1;
  let what: string;
  if (def.speed === 'average') {
    // The traffic jam: the recorded stop-and-go, slowed down (all speeds scaled) to the jam's average speed.
    const styled = styleTrace(recorded, style, windowS);
    const avg = distanceAndTime(styled);
    const scale = avg.s > 0 && avg.km > 0 ? (speed ?? 0) / ((avg.km / avg.s) * 3600) : 0;
    speeds = styled.map((v) => v * scale);
    what = `stop-and-go (${name}) slowed down to ${r0(speed ?? 0)} km/h on average`;
  } else if (def.speed === 'own') {
    speeds = styleTrace(recorded, style, windowS);
    what = `${name} at its recorded speeds`;
  } else {
    const top = Math.max(...recorded);
    stretch = top > 0 ? (speed ?? top) / top : 1;
    // The resampled seconds can miss the recorded peak by a little: scale the stretch so its top is the speed set
    // (a change of well under 1 %).
    const stretched = stretchTrace(recorded, stretch);
    const sampledTop = Math.max(...stretched);
    const exact = sampledTop > 0 && Math.abs(stretch - 1) > 1e-9 ? (speed ?? top) / sampledTop : 1;
    speeds = styleTrace(exact === 1 ? stretched : stretched.map((v) => v * exact), style, windowS);
    what =
      Math.abs(stretch - 1) < 1e-9
        ? `${name} as recorded (top ${r0(top)} km/h)`
        : `${name} stretched to a top speed of ${r0(speed ?? top)} km/h (speeds and durations × ${r2(stretch)}, accelerations as recorded)`;
  }
  const uncappedTop = Math.max(...speeds);
  const capped = cap !== null && uncappedTop > cap ? cap : null;
  if (capped !== null) speeds = speeds.map((v) => Math.min(v, capped));
  const { avgKmh, topKmh, lengthKm, stops } = traceStats(speeds);
  return {
    profile: def,
    speedsKmh: speeds,
    speedKmh: speed,
    stretch,
    avgKmh,
    movingAvgKmh: movingAverage(speeds),
    topKmh,
    lengthKm,
    stops,
    cappedAtKmh: capped,
    description:
      `${what}; average ${r0(avgKmh)} km/h, ${stopsText(lengthKm, stops)}` +
      styleText(style) +
      (capped !== null ? `; capped at the car's top speed of ${r0(capped)} km/h` : ''),
    dynamics: traceDynamics(speeds),
  };
}
