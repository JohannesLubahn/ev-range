import { G } from './air';
import { rollingCoefficient } from './rolling';

export interface VehiclePhysics {
  massKg: number;
  cd: number;
  frontalAreaM2: number;
  crrRef: number;
  tyrePressureRefBar: number;
  rotatingMassFactor: number;
  /** Battery → wheel efficiency while driving (calibrated per car). */
  etaDrive: number;
  /** Wheel → battery efficiency while braking (0 for cars without regeneration). */
  etaRegen: number;
  /** Deceleration up to which regeneration alone brakes (m/s²); harder braking adds the friction brakes. */
  regenMaxDecelMs2?: number;
  /** Below this speed (km/h) the friction brakes do the braking. */
  regenMinKmh?: number;
  /** Petrol engine: overrun fuel cut-off while the car slows down above this speed (km/h); none when unset. */
  fuelCutMinKmh?: number;
}

export interface Environment {
  airDensity: number;
  /** Tyre pressure as % of the car's recommended pressure. */
  tyrePressurePct: number;
  /** Road slope as rise over run (e.g. 0.02 = 2 %). */
  grade: number;
}

export interface Forces {
  aero: number;
  rolling: number;
  grade: number;
  inertia: number;
  total: number;
  crr: number;
}

/** Forces at the wheels (N) at speed v (m/s) and acceleration a (m/s²). */
export function wheelForces(v: number, a: number, veh: VehiclePhysics, env: Environment): Forces {
  const aero = 0.5 * env.airDensity * veh.cd * veh.frontalAreaM2 * v * v;
  const crr = rollingCoefficient(v * 3.6, env.tyrePressurePct, veh.crrRef, veh.tyrePressureRefBar);
  const moving = v > 0.01;
  const rolling = moving ? crr * veh.massKg * G * Math.cos(Math.atan(env.grade)) : 0;
  const grade = moving ? veh.massKg * G * Math.sin(Math.atan(env.grade)) : 0;
  const inertia = veh.rotatingMassFactor * veh.massKg * a;
  return { aero, rolling, grade, inertia, total: aero + rolling + grade + inertia, crr };
}
