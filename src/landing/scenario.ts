// The landing page's own scenario (2026-11-22): separate from the Enthusiast site's scenarios. The visitor sets five
// things with sliders; everything else is fixed here. Values marked "user" are the user's choices, "judgement" are mine
// and can be changed freely.
import type { ModelSettings } from '../engine/types';

/** One slider position: the value the model gets and the words the visitor sees. */
export interface Step {
  value: number;
  label: string;
}

/** Air temperature (°C): user's steps, normal 22 °C is the default. */
export const TEMPERATURE_STEPS: Step[] = [
  { value: -20, label: 'Very cold' },
  { value: 0, label: 'Cold' },
  { value: 22, label: 'Normal' },
  { value: 30, label: 'Hot' },
  { value: 40, label: 'Very hot' },
];
/**
 * Sunshine on the car (W/m²): user's steps, from the sun with long rays to the moon. Default: judgement. The steps are
 * stored from the sunniest to the moon; the slider runs the other way (the sunniest at its right end, the user's
 * choice 2026-11-22), so a saved index keeps its meaning (`reversed` in Scene.tsx).
 */
export const SUN_STEPS: Step[] = [
  { value: 1100, label: 'Blazing sun' },
  { value: 800, label: 'Sunny' },
  { value: 500, label: 'Cloudy' },
  { value: 0, label: 'Night' },
];
/** Tyre pressure as % of the recommended pressure: user's two steps, shown as Good (100 %) and Bad (80 %), no numbers. */
export const TYRE_STEPS: Step[] = [
  { value: 100, label: 'Good' },
  { value: 80, label: 'Bad' },
];
/**
 * Load in the car (kg): user's steps 120 / 200 / 500, shown as Minimal (one driver), Normal (driver and passenger,
 * the default) and Packed (family, baby and luggage), no kg numbers.
 */
export const LOAD_STEPS: Step[] = [
  { value: 120, label: 'Minimal' },
  { value: 200, label: 'Normal' },
  { value: 500, label: 'Packed' },
];
/** Driving style (% of the WLTP accelerations): the existing presets Gentle 65 / Normal 100 / Sporty 170. */
export const STYLE_STEPS: Step[] = [
  { value: 65, label: 'Gentle' },
  { value: 100, label: 'Normal' },
  { value: 170, label: 'Sporty' },
];

export interface LandingSliders {
  /** Index into the matching STEPS array. */
  temperature: number;
  sun: number;
  tyres: number;
  load: number;
  style: number;
}

export const DEFAULT_SLIDERS: LandingSliders = {
  temperature: 2, // 22 °C: user
  sun: 1, // 800 W/m²: judgement (the Long trip standard's value)
  tyres: 0, // 100 %: user
  load: 1, // Normal, 200 kg: user (2026-11-22)
  style: 1, // Normal: user
};

/** Fixed for every landing-page trip. */
export const LANDING_FIXED = {
  /** Charge at the start (%): user. */
  startPct: 95,
  /** Cabin temperature held by heating/AC (°C): user. */
  cabinC: 22,
  /** Battery thermal management: user. */
  thermalMode: 'managed' as const,
  /** A new car without battery wear: user. */
  batteryKm: 0,
  /** Mixed driving (the WLTP at its own speeds): user. */
  profile: 'mixed' as const,
  /** Charge window of the stops (%) and climate on while charging: judgement, the Long trip standard's values. */
  chargeFromPct: 20,
  chargeToPct: 90,
  climateWhileCharging: true,
  /** Humidity (%): judgement. */
  humidityPct: 60,
  /** Speed of the Mixed profile is not used; any valid value. */
  speedKmh: 100,
};

export const LANDING_SETTINGS: ModelSettings = { battery: 'chemistry' };

export function clampIndex(i: unknown, steps: Step[], fallback: number): number {
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < steps.length ? i : fallback;
}
