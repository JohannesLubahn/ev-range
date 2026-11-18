// The onboard model at the conditions of a published measurement (data/onboard/measurements.csv).
import type { Dataset, OnboardMeasurement } from '../../data/types';
import type { Assumptions } from '../types';
import { cabinClimate } from './climate';
import { baseLoadKw, factsTabPower, onboardClass } from './loads';

export interface MeasurementCheck {
  m: OnboardMeasurement;
  /** Measured value, or the middle of the measured range (kW). */
  measuredKw: number;
  modelKw: number;
  /** The spreadsheet's Facts-tab curves at the same temperature (100 % heating/AC). */
  factsKw: number | null;
  /** modelKw ÷ measured − 1 (0 when the model lies inside a measured range). */
  deviation: number;
}

export function checkMeasurement(ds: Dataset, a: Assumptions, m: OnboardMeasurement): MeasurementCheck {
  const cls = onboardClass(ds, m.carClass);
  const electronics = baseLoadKw(cls);
  const climate = cls
    ? cabinClimate({
        cls,
        a,
        airC: m.airC,
        humidityPct: m.humidityPct,
        solarWm2: m.solarWm2,
        altitudeM: 0,
        heatPump: m.heatPump,
        setpointC: m.cabinC,
        occupants: m.occupants,
      }).totalKw
    : 0;
  const modelKw = m.compare === 'electronics' ? electronics : m.compare === 'climate' ? climate : electronics + climate;
  const f = factsTabPower(ds, m.carClass, m.airC, 100);
  const factsKw = !f ? null : m.compare === 'electronics' ? f.baseKw : m.compare === 'climate' ? f.cabinKw + f.batteryKw : f.totalKw;
  const lo = m.measuredMinKw ?? m.measuredKw ?? 0;
  const hi = m.measuredMaxKw ?? m.measuredKw ?? 0;
  const measuredKw = (lo + hi) / 2;
  const deviation = modelKw < lo ? modelKw / lo - 1 : modelKw > hi ? modelKw / hi - 1 : 0;
  return { m, measuredKw, modelKw, factsKw, deviation };
}
