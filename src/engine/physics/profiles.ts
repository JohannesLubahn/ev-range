// Speed profiles (1 value per second, km/h) for trip segments, built from the WLTP class 3b trace.
import type { Dataset } from '../../data/types';
import type { Profile } from '../types';

export interface ProfileTrace {
  speedsKmh: number[];
  /** Factor applied to the base speeds. */
  scale: number;
  /** Average speed of the trace while moving (km/h). */
  movingAvgKmh: number;
  description: string;
}

const PHASES: Record<Exclude<Profile, 'steady'>, string[]> = {
  motorway: ['extra_high'],
  rural: ['high'],
  city: ['low', 'medium'],
  mixed: ['low', 'medium', 'high', 'extra_high'],
  jam: ['low'],
};

const baseCache = new WeakMap<Dataset, Map<string, number[]>>();

function baseTrace(ds: Dataset, profile: Exclude<Profile, 'steady'>): number[] {
  let cache = baseCache.get(ds);
  if (!cache) {
    cache = new Map();
    baseCache.set(ds, cache);
  }
  const hit = cache.get(profile);
  if (hit) return hit;
  const wltp = ds.cycles.WLTP;
  if (!wltp) throw new Error('WLTP cycle (data/cycles/wltc3b.csv) is missing');
  const wanted = PHASES[profile];
  const speeds = wltp.speedsKmh.filter((_, i) => wanted.includes(wltp.phases[i]));
  cache.set(profile, speeds);
  return speeds;
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
 * - steady: constant speed.
 * - jam: the WLTP low phase slowed down (all speeds scaled) to the jam's average speed.
 * - others: the phase shape as is; if the requested average is above the shape's moving average, speeds are
 *   scaled up. A lower requested average only means more standing time, which costs no driving energy
 *   (standing time is covered by the onboard-systems energy, computed from the segment time).
 */
export function profileTrace(ds: Dataset, profile: Profile, avgSpeedKmh: number): ProfileTrace {
  if (profile === 'steady' || avgSpeedKmh <= 0) {
    return { speedsKmh: [avgSpeedKmh, avgSpeedKmh], scale: 1, movingAvgKmh: avgSpeedKmh, description: `constant ${avgSpeedKmh} km/h` };
  }
  const base = baseTrace(ds, profile);
  if (profile === 'jam') {
    const avg = base.reduce((s, v) => s + v, 0) / base.length;
    const scale = avgSpeedKmh / avg;
    return {
      speedsKmh: base.map((v) => v * scale),
      scale,
      movingAvgKmh: movingAverage(base) * scale,
      description: `stop-and-go, peaks up to ${Math.round(Math.max(...base) * scale)} km/h`,
    };
  }
  const mov = movingAverage(base);
  const scale = Math.max(1, avgSpeedKmh / mov);
  return {
    speedsKmh: scale === 1 ? base : base.map((v) => v * scale),
    scale,
    movingAvgKmh: mov * scale,
    description:
      scale === 1
        ? `WLTP ${PHASES[profile].join(' + ').replace('_', '-')} speed shape`
        : `WLTP ${PHASES[profile].join(' + ').replace('_', '-')} shape, speeds × ${scale.toFixed(2)}`,
  };
}
