import type { Dataset } from '../data/types';
import { longTrip } from '../engine/cases';
import type { DerivedCar } from '../engine/derive';
import { CarModel, type Calibration } from '../engine/model';
import { standardScenario } from '../engine/scenario';
import type { Assumptions, Conditions, LongTripInputs, LongTripResult } from '../engine/types';
import type { RouteResult } from '../route/route';
import { LANDING_FIXED, LANDING_SETTINGS, LOAD_STEPS, STYLE_STEPS, SUN_STEPS, TEMPERATURE_STEPS, TYRE_STEPS, type LandingSliders } from './scenario';

/** The model's conditions for the landing page: the sliders, the fixed values and the route's mean altitude. */
export function landingConditions(s: LandingSliders, route: Pick<RouteResult, 'meanAltitudeM'>): Conditions {
  return {
    airTemperatureC: TEMPERATURE_STEPS[s.temperature].value,
    solarWm2: SUN_STEPS[s.sun].value,
    humidityPct: LANDING_FIXED.humidityPct,
    altitudeM: route.meanAltitudeM,
    payloadKg: LOAD_STEPS[s.load].value,
    tyrePressurePct: TYRE_STEPS[s.tyres].value,
    thermalMode: LANDING_FIXED.thermalMode,
    preconditionedC: 20,
    batteryKm: LANDING_FIXED.batteryKm,
    drivingStylePct: STYLE_STEPS[s.style].value,
  };
}

export function landingTripInputs(route: Pick<RouteResult, 'distanceKm' | 'climbM' | 'ascentM' | 'slopePct'>): LongTripInputs {
  return {
    distanceKm: route.distanceKm,
    speedKmh: LANDING_FIXED.speedKmh,
    cabinC: LANDING_FIXED.cabinC,
    climateWhileCharging: LANDING_FIXED.climateWhileCharging,
    chargeFromPct: LANDING_FIXED.chargeFromPct,
    chargeToPct: LANDING_FIXED.chargeToPct,
    profile: LANDING_FIXED.profile,
    climbM: route.climbM,
    ascentM: route.ascentM,
    slopePct: route.slopePct,
  };
}

/** Long trip for one car on the landing scenario: starts at 95 %, new battery, mixed driving. */
export function landingTrip(d: DerivedCar, ctx: { ds: Dataset; a: Assumptions }, s: LandingSliders, route: RouteResult, shared: { calibration?: Calibration } = {}): LongTripResult {
  const life = standardScenario(ctx.ds, ctx.a).batteryLife;
  const model = new CarModel(d, { ...ctx, conditions: landingConditions(s, route), settings: LANDING_SETTINGS, life, shared });
  return longTrip(model, landingTripInputs(route), { startPct: LANDING_FIXED.startPct });
}
