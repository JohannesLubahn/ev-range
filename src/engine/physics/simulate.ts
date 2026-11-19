// Time-step simulation of a speed trace (1 s steps) with the road-load forces.
import { wheelForces, type Environment, type VehiclePhysics } from './roadLoad';

export interface SimResult {
  distanceKm: number;
  timeS: number;
  /** Energy at the wheels while driving (positive work), kWh. */
  wheelPosKwh: number;
  /** Braking energy at the wheels (negative work, as a positive number), kWh. */
  wheelNegKwh: number;
  /** Work done against each force over the trace (kWh): air drag, rolling, slope (net), acceleration (positive part). */
  aeroKwh: number;
  rollingKwh: number;
  gradeKwh: number;
  accelKwh: number;
  /** Energy taken from the battery for driving (terminals), net of regeneration, kWh. */
  batteryKwh: number;
  /** Energy recovered by regenerative braking, kWh. */
  regenKwh: number;
  /** Braking energy at the wheels taken by the friction brakes (beyond the regeneration limits), kWh. */
  frictionKwh: number;
  /** Mean of the squared battery power (kW²), including the constant auxiliary load. */
  meanSquareKw2: number;
}

const J_PER_KWH = 3.6e6;

/**
 * Simulates the trace. Each 1-second interval uses the mean speed and the constant acceleration of the
 * interval. Positive wheel power is drawn from the battery through the drivetrain (÷ η_drive); negative
 * wheel power (braking, downhill) is recovered with η_regen, up to the regenerative brake force (the car's
 * effective mass × `regenMaxDecelMs2`) and above `regenMinKmh`; the friction brakes take the rest.
 */
export function simulate(speedsKmh: number[], veh: VehiclePhysics, env: Environment, auxKw = 0): SimResult {
  let dist = 0;
  let pos = 0;
  let neg = 0;
  let aero = 0;
  let rolling = 0;
  let grade = 0;
  let accel = 0;
  let battery = 0;
  let regen = 0;
  let friction = 0;
  let sumSq = 0;
  const n = speedsKmh.length - 1;
  for (let i = 0; i < n; i++) {
    const v0 = speedsKmh[i] / 3.6;
    const v1 = speedsKmh[i + 1] / 3.6;
    const v = (v0 + v1) / 2;
    const a = v1 - v0;
    const f = wheelForces(v, a, veh, env);
    const p = f.total * v; // W over 1 s = J
    dist += v;
    aero += f.aero * v;
    rolling += f.rolling * v;
    grade += f.grade * v;
    if (f.inertia > 0) accel += f.inertia * v;
    let pb: number;
    if (p >= 0) {
      pos += p;
      pb = p / veh.etaDrive;
    } else {
      neg += -p;
      // Regeneration brakes with at most the force that decelerates the car at the limit, and only above a
      // minimum speed; the friction brakes take the rest (heat).
      const minV = (veh.regenMinKmh ?? 0) / 3.6;
      const maxRegenN = veh.regenMaxDecelMs2 === undefined ? Infinity : veh.rotatingMassFactor * veh.massKg * veh.regenMaxDecelMs2;
      const regenFrac = v < minV ? 0 : Math.min(1, maxRegenN / -f.total);
      const recoverable = p * regenFrac;
      friction += -(p - recoverable);
      pb = recoverable * veh.etaRegen;
      regen += -pb;
    }
    battery += pb;
    const total = pb / 1000 + auxKw;
    sumSq += total * total;
  }
  return {
    distanceKm: dist / 1000,
    timeS: n,
    wheelPosKwh: pos / J_PER_KWH,
    wheelNegKwh: neg / J_PER_KWH,
    aeroKwh: aero / J_PER_KWH,
    rollingKwh: rolling / J_PER_KWH,
    gradeKwh: grade / J_PER_KWH,
    accelKwh: accel / J_PER_KWH,
    batteryKwh: battery / J_PER_KWH,
    regenKwh: regen / J_PER_KWH,
    frictionKwh: friction / J_PER_KWH,
    meanSquareKw2: n ? sumSq / n : 0,
  };
}
