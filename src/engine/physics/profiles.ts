// Speed profiles (1 value per second, km/h) for trip segments, built from the WLTP class 3b trace.
import type { Dataset } from '../../data/types';
import type { Profile } from '../types';
import { styleTrace, traceDynamics, type TraceDynamics } from './style';

export interface ProfileTrace {
  speedsKmh: number[];
  /** Factor applied to the base speeds. */
  scale: number;
  /** Average speed of the trace while moving (km/h). */
  movingAvgKmh: number;
  description: string;
  /** Dynamics of the trace as driven (EU RDE metrics); null for a constant speed. */
  dynamics: TraceDynamics | null;
}

const PHASES: Record<Exclude<Profile, 'steady'>, string[]> = {
  motorway: ['extra_high'],
  rural: ['high'],
  city: ['low', 'medium'],
  mixed: ['low', 'medium', 'high', 'extra_high'],
  jam: ['low'],
};

const baseCache = new WeakMap<Dataset, Map<string, number[]>>();

/** The WLTP phases of the profile, driven with the style factor `style` (1 = as in the WLTP). */
function baseTrace(ds: Dataset, profile: Exclude<Profile, 'steady'>, style: number, windowS: number): number[] {
  let cache = baseCache.get(ds);
  if (!cache) {
    cache = new Map();
    baseCache.set(ds, cache);
  }
  const key = `${profile}|${style}|${windowS}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const wltp = ds.cycles.WLTP;
  if (!wltp) throw new Error('WLTP cycle (data/cycles/wltc3b.csv) is missing');
  const wanted = PHASES[profile];
  const speeds = styleTrace(
    wltp.speedsKmh.filter((_, i) => wanted.includes(wltp.phases[i])),
    style,
    windowS,
  );
  cache.set(key, speeds);
  return speeds;
}

const dynamicsCache = new WeakMap<number[], Map<number, TraceDynamics>>();

function dynamicsOf(base: number[], scale: number): TraceDynamics {
  let m = dynamicsCache.get(base);
  if (!m) dynamicsCache.set(base, (m = new Map()));
  let d = m.get(scale);
  if (!d) m.set(scale, (d = traceDynamics(scale === 1 ? base : base.map((v) => v * scale))));
  return d;
}

function styleText(style: number): string {
  return style === 1 ? '' : `, driven ${style < 1 ? 'gentler' : 'harder'} (accelerations and braking ≈ ${Math.round(style * 100)} %)`;
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

/**
 * Speed trace for a segment with the given average speed (incl. stops).
 * - steady: constant speed (the driving style does not change it).
 * - jam: the WLTP low phase slowed down (all speeds scaled) to the jam's average speed.
 * - others: the phase shape as is; if the requested average is above the shape's moving average, speeds are
 *   scaled up. A lower requested average only means more standing time, which costs no driving energy
 *   (standing time is covered by the onboard-systems energy, computed from the segment time).
 * The phases are first driven with the driving style `style` (see `styleTrace`; 1 = as in the WLTP), which keeps
 * their distance and time.
 */
export function profileTrace(ds: Dataset, profile: Profile, avgSpeedKmh: number, style = 1, windowS = 30): ProfileTrace {
  if (profile === 'steady' || avgSpeedKmh <= 0) {
    return { speedsKmh: [avgSpeedKmh, avgSpeedKmh], scale: 1, movingAvgKmh: avgSpeedKmh, description: `constant ${avgSpeedKmh} km/h`, dynamics: null };
  }
  const base = baseTrace(ds, profile, style, windowS);
  const wltpText = `WLTP ${PHASES[profile].join(' + ').replace('_', '-')}`;
  if (profile === 'jam') {
    const avg = base.reduce((s, v) => s + v, 0) / base.length;
    const scale = avgSpeedKmh / avg;
    return {
      speedsKmh: base.map((v) => v * scale),
      scale,
      movingAvgKmh: movingAverage(base) * scale,
      description: `stop-and-go, peaks up to ${Math.round(Math.max(...base) * scale)} km/h${styleText(style)}`,
      dynamics: dynamicsOf(base, scale),
    };
  }
  const mov = movingAverage(base);
  const scale = Math.max(1, avgSpeedKmh / mov);
  return {
    speedsKmh: scale === 1 ? base : base.map((v) => v * scale),
    scale,
    movingAvgKmh: mov * scale,
    description: (scale === 1 ? `${wltpText} speed shape` : `${wltpText} shape, speeds × ${scale.toFixed(2)}`) + styleText(style),
    dynamics: dynamicsOf(base, scale),
  };
}
