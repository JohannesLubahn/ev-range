// Driving style: a more or less dynamic version of a speed trace, and the trace's dynamics metrics (EU RDE).

/**
 * The speed trace driven with a different style: the speed's deviations from its local mean (a centred moving
 * average over `windowS` seconds, stops included) are scaled by `k`:  v' = max(0, v̄ + k·(v − v̄)), then the
 * trace is rescaled to its original distance, so the time and the average speed do not change.
 * - k = 1: the trace as is.
 * - k > 1 (sporty): higher peaks, deeper slowdowns, accelerations and decelerations about k times as hard.
 * - k < 1 (gentle): speeds closer to the local mean: softer launches, slowing early instead of braking late, and
 *   rolling slowly towards a stop instead of standing (anticipation).
 */
export function styleTrace(speedsKmh: number[], k: number, windowS: number): number[] {
  if (k === 1 || !(k > 0)) return speedsKmh;
  const n = speedsKmh.length;
  const half = Math.max(1, Math.round(windowS / 2));
  const prefix = new Float64Array(n + 1);
  for (let t = 0; t < n; t++) prefix[t + 1] = prefix[t] + speedsKmh[t];
  const out = new Array<number>(n);
  let before = 0;
  let after = 0;
  for (let t = 0; t < n; t++) {
    const lo = Math.max(0, t - half);
    const hi = Math.min(n, t + half + 1);
    const mean = (prefix[hi] - prefix[lo]) / (hi - lo);
    const v = speedsKmh[t];
    const w = Math.max(0, mean + k * (v - mean));
    out[t] = w;
    before += v;
    after += w;
  }
  const scale = after > 0 ? before / after : 1;
  return out.map((w) => w * scale);
}

/** Dynamics of a speed trace (1 value per second), as defined for the EU RDE trip check. */
export interface TraceDynamics {
  /** Average speed incl. stops (km/h). */
  avgKmh: number;
  /** Relative positive acceleration (m/s²): Σ v·a⁺·Δt ÷ distance, for a > 0.1 m/s². */
  rpa: number;
  /** 95th percentile of v·a⁺ (m²/s³), for a > 0.1 m/s². */
  va95: number;
  /** Highest acceleration and deceleration (m/s², the deceleration as a positive number). */
  maxAccel: number;
  maxDecel: number;
  /** RDE bounds for this average speed: RPA at least `rpaMin`, v·a⁺[95] at most `va95Max`. */
  rpaMin: number;
  va95Max: number;
}

/**
 * RDE trip-dynamics bounds (Regulation (EU) 2017/1151, Annex IIIA, Appendix 7a, as amended by 2017/1154):
 * v·a⁺[95] ≤ 0.136·v̄ + 14.44 (v̄ ≤ 74.6 km/h), ≤ 0.0742·v̄ + 18.966 above; RPA ≥ −0.0016·v̄ + 0.1755
 * (v̄ ≤ 94.05 km/h), ≥ 0.025 above.
 */
export function rdeBounds(avgKmh: number): { rpaMin: number; va95Max: number } {
  return {
    va95Max: avgKmh <= 74.6 ? 0.136 * avgKmh + 14.44 : 0.0742 * avgKmh + 18.966,
    rpaMin: avgKmh <= 94.05 ? -0.0016 * avgKmh + 0.1755 : 0.025,
  };
}

export function traceDynamics(speedsKmh: number[]): TraceDynamics {
  const n = speedsKmh.length;
  const va: number[] = [];
  let vaSum = 0;
  let dist = 0;
  let maxAccel = 0;
  let maxDecel = 0;
  for (let i = 0; i < n; i++) {
    const v = speedsKmh[i] / 3.6;
    dist += v;
    if (i < n - 1) {
      const a1 = (speedsKmh[i + 1] - speedsKmh[i]) / 3.6;
      maxAccel = Math.max(maxAccel, a1);
      maxDecel = Math.max(maxDecel, -a1);
    }
    if (i === 0 || i === n - 1) continue;
    const a = (speedsKmh[i + 1] - speedsKmh[i - 1]) / (2 * 3.6);
    if (a > 0.1) {
      va.push(v * a);
      vaSum += v * a;
    }
  }
  va.sort((x, y) => x - y);
  const va95 = va.length ? va[Math.min(va.length - 1, Math.ceil(0.95 * va.length) - 1)] : 0;
  const avgKmh = n ? (dist / n) * 3.6 : 0;
  return { avgKmh, rpa: dist > 0 ? vaSum / dist : 0, va95, maxAccel, maxDecel, ...rdeBounds(avgKmh) };
}
