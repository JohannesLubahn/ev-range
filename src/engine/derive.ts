// Derived per-car values: fallbacks for blank cells, unit conversions and the data check.
import type { Basis, Car, Dataset } from '../data/types';
import { BASES } from '../data/types';
import { toDisplayCurrency } from './assumptions';
import type { Assumptions } from './types';

export type Provenance = 'data' | 'calculated' | 'estimated' | 'missing';

export interface Val<T> {
  value: T;
  provenance: Provenance;
  note?: string;
}

export interface DataFlag {
  carId: string;
  severity: 'info' | 'warning';
  field: string;
  message: string;
}

export interface DerivedCar {
  car: Car;
  isIce: boolean;
  /** Unit of the car's energy store: kWh for battery cars, litres for petrol cars (spreadsheet approximation). */
  energyUnit: 'kWh' | 'l';
  /** Rated consumption in kWh/km (or l/km), from the same standard as the rated range. */
  consumption: Val<number | null>;
  basis: Val<Basis>;
  /** Test cycle used for the physics calibration (CLTC falls back to NEDC if no CLTC trace is available). */
  calibrationCycle: 'WLTP' | 'NEDC' | 'EPA' | 'CLTC';
  /** Battery ÷ rated range of the basis standard (kWh/km), for the consistency check. */
  impliedConsumption: number | null;
  ratedRangeKm: number | null;
  batteryKwh: number | null;
  longTermPct: Val<number>;
  longTermKwh: number | null;
  fastWindow: { from: number; to: number } | null;
  /** Charging speeds in % of state of charge per hour (from the published charging test). */
  fastPctPerH: number | null;
  slowPctPerH: number | null;
  fastKw: number | null;
  slowKw: number | null;
  bodyType: string;
  cd: Val<number>;
  frontalAreaM2: Val<number>;
  curbMassKg: Val<number>;
  /** Rolling resistance coefficient at 80 km/h and reference tyre pressure. */
  crrRef: Val<number>;
  /** Cabin heated by a heat pump (else resistive heater). */
  heatPump: Val<boolean>;
  powerHp: number | null;
  chemistry: string | null;
  priceDisplay: Val<number | null>;
  flags: DataFlag[];
}

/** Linear fit of curb weight over battery size, from all battery cars that have both values. */
export interface WeightModel {
  intercept: number;
  slope: number;
  n: number;
}

export function weightModel(cars: Car[]): WeightModel {
  const pts = cars
    .filter((c) => c.powertrain === 'BEV' && c.weightKg && c.batteryKwh)
    .map((c) => [c.batteryKwh as number, c.weightKg as number]);
  if (pts.length < 3) return { intercept: 1300, slope: 8, n: pts.length };
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { intercept: my - slope * mx, slope, n: pts.length };
}

const BASIS_PREFERENCE: Basis[] = ['WLTP', 'EPA', 'NEDC', 'CLTC'];

export function deriveCar(car: Car, ds: Dataset, a: Assumptions, wm: WeightModel): DerivedCar {
  const flags: DataFlag[] = [];
  const flag = (severity: DataFlag['severity'], field: string, message: string) =>
    flags.push({ carId: car.id, severity, field, message });
  const isIce = car.powertrain === 'ICE';
  const battery = car.batteryKwh;
  if (battery === null) flag('warning', 'battery_kwh', 'Battery capacity is missing');

  // --- consumption standard: from the filled range column (your rule: consumption and range share a source)
  const filled = BASES.filter((b) => car.ranges[b] !== undefined);
  let basis: Val<Basis>;
  if (car.consumptionBasis) {
    basis = { value: car.consumptionBasis, provenance: 'data' };
  } else if (filled.length === 1) {
    basis = { value: filled[0], provenance: 'calculated', note: `from the rated ${filled[0]} range` };
  } else if (filled.length > 1) {
    const pick = BASIS_PREFERENCE.find((b) => filled.includes(b)) as Basis;
    basis = { value: pick, provenance: 'estimated', note: `ranges for ${filled.join(' and ')} given; ${pick} assumed` };
    flag('warning', 'consumption_basis', `Ranges for ${filled.join(' and ')} are given - set consumption_basis to say which standard the consumption belongs to (${pick} assumed)`);
  } else {
    const def = (BASES as string[]).includes(a.defaultBasis) ? (a.defaultBasis as Basis) : 'WLTP';
    basis = { value: def, provenance: 'estimated', note: 'no rated range; default standard assumed' };
    flag('warning', 'consumption_basis', `No rated range, so the test standard of the consumption is unknown (${def} assumed)`);
  }
  const ratedRange = car.ranges[basis.value] ?? null;
  const implied = battery && ratedRange ? battery / ratedRange : null;

  let consumption: Val<number | null>;
  if (car.consumptionKwhPerKm !== null) consumption = { value: car.consumptionKwhPerKm, provenance: 'data' };
  else if (implied !== null)
    consumption = { value: implied, provenance: 'calculated', note: `battery ÷ ${basis.value} range` };
  else {
    consumption = { value: null, provenance: 'missing' };
    flag('warning', 'consumption_kwh_per_km', 'Consumption and rated range are both missing - the car cannot be calculated');
  }
  if (!isIce && car.consumptionKwhPerKm !== null && implied !== null) {
    const diff = car.consumptionKwhPerKm / implied - 1;
    if (Math.abs(diff) > 0.25) {
      flag('warning', 'consumption_kwh_per_km',
        `Stated consumption ${car.consumptionKwhPerKm.toFixed(3)} kWh/km is ${diff > 0 ? '+' : ''}${Math.round(diff * 100)} % vs. battery ÷ ${basis.value} range (${implied.toFixed(3)}) - from the same source?`);
    }
  }

  let calibrationCycle: DerivedCar['calibrationCycle'] = basis.value;
  if (basis.value === 'CLTC' && !ds.cycles.CLTC) {
    calibrationCycle = 'NEDC';
    flag('info', 'consumption_basis', 'No CLTC-P speed trace in data/cycles - calibrated on NEDC (closest public cycle)');
  }

  // --- battery and charging
  const ltPct: Val<number> =
    car.longTermCapacityPct !== null
      ? { value: car.longTermCapacityPct, provenance: 'data' }
      : { value: a.longTermCapacityPct, provenance: 'estimated', note: 'assumption' };
  const longTermKwh = battery !== null ? (battery * ltPct.value) / 100 : null;
  const from = car.fastWindowFromPct ?? car.chargeFromPct;
  const to = car.fastWindowToPct ?? car.chargeToPct;
  const fastWindow = from !== null && to !== null ? { from, to } : null;
  let fastPctPerH: number | null = null;
  let fastKw: number | null = null;
  if (car.chargeFromPct !== null && car.chargeToPct !== null && car.chargeTimeMin) {
    fastPctPerH = ((car.chargeToPct - car.chargeFromPct) / car.chargeTimeMin) * 60;
    if (battery !== null) fastKw = (((car.chargeToPct - car.chargeFromPct) / 100) * battery * 60) / car.chargeTimeMin;
  } else if (!isIce) {
    flag('warning', 'charge_time_min', 'Charging test (from / to / time) incomplete - long trip cannot be calculated');
  }
  const taper = a.taperSpeedFactorPct / 100;

  // --- physics parameters
  const bodyKey = (car.bodyType || '').toLowerCase();
  const body = ds.bodyTypes[bodyKey] ?? ds.bodyTypes.suv ?? Object.values(ds.bodyTypes)[0];
  if (!ds.bodyTypes[bodyKey]) flag('warning', 'body_type', `Body type "${car.bodyType}" unknown - ${body?.bodyType ?? 'default'} values used`);
  const cd: Val<number> =
    car.dragCoefficient !== null
      ? { value: car.dragCoefficient, provenance: 'data' }
      : { value: body?.dragCoefficient ?? 0.3, provenance: 'estimated', note: `${body?.bodyType ?? 'default'} default` };
  let frontalAreaM2: Val<number>;
  if (car.frontalAreaM2 !== null) frontalAreaM2 = { value: car.frontalAreaM2, provenance: 'data' };
  else if (car.widthMm && car.heightMm)
    frontalAreaM2 = {
      value: (a.frontalAreaFactor * car.widthMm * car.heightMm) / 1e6,
      provenance: 'calculated',
      note: `${a.frontalAreaFactor} × width × height`,
    };
  else frontalAreaM2 = { value: body?.frontalAreaM2 ?? 2.4, provenance: 'estimated', note: `${body?.bodyType ?? 'default'} default` };
  const curbMassKg: Val<number> =
    car.weightKg !== null
      ? { value: car.weightKg, provenance: 'data' }
      : {
          value: wm.intercept + wm.slope * (battery ?? 60),
          provenance: 'estimated',
          note: `from battery size (fit over ${wm.n} cars: ${Math.round(wm.intercept)} + ${wm.slope.toFixed(1)} kg/kWh)`,
        };
  const crrRef: Val<number> =
    car.tyreRr !== null
      ? { value: car.tyreRr / 1000, provenance: 'data' }
      : { value: a.rollingResistanceNPerKn / 1000, provenance: 'estimated', note: 'assumption (tyre label)' };
  const heatPump: Val<boolean> =
    car.heatPump !== null
      ? { value: car.heatPump, provenance: 'data' }
      : { value: false, provenance: 'estimated', note: 'unknown: resistive heater assumed' };
  const powerHp = car.powerKw !== null ? car.powerKw * 1.341 : null;

  let chemistry: string | null = null;
  if (!isIce) {
    if (car.batteryType && ds.chemistries[car.batteryType]) chemistry = car.batteryType;
    else {
      chemistry = ds.chemistries.LFP ? 'LFP' : Object.keys(ds.chemistries)[0] ?? null;
      flag('warning', 'battery_type', `Battery type ${car.batteryType ? `"${car.batteryType}" unknown` : 'missing'} - ${chemistry} curves used`);
    }
  }

  // --- costs
  let priceDisplay: Val<number | null>;
  if (car.price === null) {
    priceDisplay = { value: null, provenance: 'missing' };
    flag('warning', 'price', 'Price is missing - total cost cannot be calculated');
  } else {
    const conv = toDisplayCurrency(car.price, car.currency, a);
    if (conv === null) {
      priceDisplay = { value: null, provenance: 'missing' };
      flag('warning', 'currency', `No exchange rate for ${car.currency} in assumptions.csv`);
    } else priceDisplay = { value: conv, provenance: car.currency === a.displayCurrency ? 'data' : 'calculated', note: car.currency !== a.displayCurrency ? `${car.currency} converted` : undefined };
  }

  // --- plausibility checks
  if (car.raw.turning_radius_m && Number(car.raw.turning_radius_m) > 8)
    flag('warning', 'turning_radius_m', `Turning radius ${car.raw.turning_radius_m} m looks like a turning diameter`);
  if (isIce) flag('info', 'powertrain', 'Petrol car modelled with the EV method (litres instead of kWh) - approximation');
  if (cd.provenance !== 'data') flag('info', 'drag_coefficient', `Drag coefficient estimated (${cd.note})`);
  if (frontalAreaM2.provenance === 'estimated') flag('info', 'frontal_area_m2', `Frontal area estimated (${frontalAreaM2.note})`);
  if (curbMassKg.provenance === 'estimated') flag('info', 'weight_kg', `Weight estimated ${curbMassKg.note}`);

  return {
    car,
    isIce,
    energyUnit: isIce ? 'l' : 'kWh',
    consumption,
    basis,
    calibrationCycle,
    impliedConsumption: implied,
    ratedRangeKm: ratedRange,
    batteryKwh: battery,
    longTermPct: ltPct,
    longTermKwh,
    fastWindow,
    fastPctPerH,
    slowPctPerH: fastPctPerH !== null ? fastPctPerH * taper : null,
    fastKw,
    slowKw: fastKw !== null ? fastKw * taper : null,
    bodyType: body?.bodyType ?? car.bodyType,
    cd,
    frontalAreaM2,
    curbMassKg,
    crrRef,
    heatPump,
    powerHp,
    chemistry,
    priceDisplay,
    flags,
  };
}

export function deriveAll(ds: Dataset, a: Assumptions): DerivedCar[] {
  const wm = weightModel(ds.cars);
  return ds.cars.map((c) => deriveCar(c, ds, a, wm));
}
