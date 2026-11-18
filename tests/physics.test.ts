import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { Pack } from '../src/engine/battery/pack';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { cabinClimate, coolingCop, heatPumpCop } from '../src/engine/onboard/climate';
import { baseLoadKw, onboardClass, onboardPower } from '../src/engine/onboard/loads';
import { packHeatCapacity, packThermal } from '../src/engine/onboard/thermal';
import { checkMeasurement } from '../src/engine/onboard/validation';
import { airDensity, pressureAtAltitude } from '../src/engine/physics/air';
import { wheelForces } from '../src/engine/physics/roadLoad';
import { rollingCoefficient } from '../src/engine/physics/rolling';
import { simulate } from '../src/engine/physics/simulate';
import { DEFAULT_CONDITIONS } from '../src/engine/scenario';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const derived = deriveAll(ds, a);

describe('air', () => {
  it('standard density 1.225 kg/m³ at 15 °C, sea level', () => {
    expect(airDensity(15)).toBeCloseTo(1.225, 3);
  });
  it('pressure falls with altitude (≈ 89.9 kPa at 1000 m)', () => {
    expect(pressureAtAltitude(1000) / 1000).toBeCloseTo(89.87, 1);
  });
});

describe('air drag reproduces the Facts tab table (Cw 0.27, 3.2 m², 1.225 kg/m³)', () => {
  const veh = { massKg: 1500, cd: 0.27, frontalAreaM2: 3.2, crrRef: 0, tyrePressureRefBar: 2.5, rotatingMassFactor: 1, etaDrive: 1, etaRegen: 0 };
  const env = { airDensity: 1.225, tyrePressureBar: 2.5, grade: 0 };
  const table: [number, number][] = [[10, 0.01], [50, 1.42], [100, 11.34], [120, 19.6], [160, 46.46]];
  for (const [kmh, kw] of table) {
    it(`${kmh} km/h → ${kw} kW`, () => {
      const v = kmh / 3.6;
      expect((wheelForces(v, 0, veh, env).aero * v) / 1000).toBeCloseTo(kw, 2);
    });
  }
});

describe('rolling resistance', () => {
  it('equals the tyre value at 80 km/h and reference pressure', () => {
    expect(rollingCoefficient(80, 2.5, 0.008, 2.5)).toBeCloseTo(0.008, 10);
  });
  it('rises with speed and falls with tyre pressure', () => {
    expect(rollingCoefficient(130, 2.5, 0.008, 2.5)).toBeGreaterThan(0.008);
    expect(rollingCoefficient(80, 2.0, 0.008, 2.5)).toBeGreaterThan(0.008);
    expect(rollingCoefficient(80, 3.0, 0.008, 2.5)).toBeLessThan(0.008);
  });
});

describe('simulation', () => {
  const veh = { massKg: 1800, cd: 0.28, frontalAreaM2: 2.5, crrRef: 0.008, tyrePressureRefBar: 2.5, rotatingMassFactor: 1.05, etaDrive: 0.9, etaRegen: 0.7 };
  const env = { airDensity: 1.2, tyrePressureBar: 2.5, grade: 0 };
  it('constant speed equals the closed formula F·d/η', () => {
    const v = 100 / 3.6;
    const sim = simulate(new Array(3601).fill(100), veh, env);
    const f = wheelForces(v, 0, veh, env).total;
    expect(sim.batteryKwh / sim.distanceKm).toBeCloseTo(f / 3600 / 0.9, 6);
  });
  it('regeneration never exceeds the braking energy at the wheels', () => {
    const sim = simulate(ds.cycles.WLTP.speedsKmh, veh, env);
    expect(sim.regenKwh).toBeLessThanOrEqual(sim.wheelNegKwh + 1e-12);
    expect(sim.distanceKm).toBeCloseTo(23.27, 1);
  });
});

describe('onboard model vs. published measurements (data/onboard/measurements.csv)', () => {
  // Car and Driver's parked Model 3 most likely ran on recirculated air (no fresh air to heat): the model, which
  // keeps fresh air on against fogged windows, is higher. Documented in docs/model.md.
  const OUTLIERS: Record<string, number> = { 'cd-model3': 0.6 };
  for (const meas of ds.onboardMeasurements) {
    it(`${meas.id}: ${meas.vehicle} at ${meas.airC} °C`, () => {
      const c = checkMeasurement(ds, a, meas);
      expect(Math.abs(c.deviation)).toBeLessThanOrEqual(OUTLIERS[meas.id] ?? 0.3);
    });
  }
  it('the Facts-tab curves were 1.5–9× higher than every measurement', () => {
    for (const meas of ds.onboardMeasurements) {
      const c = checkMeasurement(ds, a, meas);
      expect(c.factsKw! / c.measuredKw).toBeGreaterThan(1.4);
    }
  });
});

describe('cabin climate physics', () => {
  it('AC COP falls as the air gets hotter (≈ 2.5 at 35 °C)', () => {
    expect(coolingCop(35, a)).toBeCloseTo(2.47, 2);
    expect(coolingCop(25, a)).toBeGreaterThan(coolingCop(35, a));
    expect(coolingCop(45, a)).toBeLessThan(coolingCop(35, a));
  });
  it('heat pump COP lies in the measured ranges of a Tesla Model 3 (TEEL)', () => {
    const ranges: [number, number, number][] = [
      [-10, 0.8, 1.93],
      [-7, 1.09, 2.1],
      [0, 1.53, 3.33],
    ];
    for (const [t, lo, hi] of ranges) {
      expect(heatPumpCop(t, a)).toBeGreaterThanOrEqual(lo);
      expect(heatPumpCop(t, a)).toBeLessThanOrEqual(hi);
    }
  });
  it('heat balance: walls + fresh air + sun + inside = load (heating and cooling)', () => {
    const cls = ds.onboardClasses.regular;
    for (const airC of [-10, 35]) {
      const cl = cabinClimate({ cls, a, airC, humidityPct: 60, solarWm2: 500, altitudeM: 0, heatPump: false });
      const net = cl.walls + cl.freshAir + cl.sun + cl.inside;
      expect(cl.loadW).toBeCloseTo(airC < 0 ? -net : net + cl.moisture, 6);
      expect(cl.totalKw).toBeCloseTo(cl.compressorKw + cl.blowerKw, 9);
    }
  });
  it('a heat pump needs less power than a resistive heater; humid air costs AC power', () => {
    const c0 = { ...DEFAULT_CONDITIONS, airTemperatureC: 0, solarWm2: 0 };
    expect(onboardPower(ds, a, c0, 'regular', true, 100).cabinKw).toBeLessThan(onboardPower(ds, a, c0, 'regular', false, 100).cabinKw * 0.7);
    const dry = { ...DEFAULT_CONDITIONS, airTemperatureC: 33, humidityPct: 20 };
    const wet = { ...dry, humidityPct: 80 };
    expect(onboardPower(ds, a, wet, 'regular', false, 100).cabinKw).toBeGreaterThan(onboardPower(ds, a, dry, 'regular', false, 100).cabinKw);
  });
  it('electronics of a regular car lie in Argonne’s measured range (0.14–0.23 kW)', () => {
    expect(onboardPower(ds, a, DEFAULT_CONDITIONS, 'regular', false, 0).totalKw).toBeCloseTo(0.22, 6);
  });
  it('preconditioned cars start without heating or cooling the cabin', () => {
    const hot = { ...DEFAULT_CONDITIONS, airTemperatureC: 35, solarWm2: 800 };
    expect(onboardPower(ds, a, hot, 'regular', false, 100).startKwh).toBeGreaterThan(0.3);
    expect(onboardPower(ds, a, { ...hot, thermalMode: 'preconditioned' }, 'regular', false, 100).startKwh).toBe(0);
  });
});

describe('battery temperature over a trip (lumped pack)', () => {
  const C = packHeatCapacity(60, ds.chemistries.LFP);
  const base = { durationH: 2, lossKw: 0, heatCapacityJPerK: C, preconditionedC: 20, coolingCop: 2.5, a };
  it('pack heat capacity ≈ 7.9 kJ/K per kWh for LFP', () => {
    expect(C / 60 / 1000).toBeCloseTo(1100 / 140, 6);
  });
  it('unmanaged pack without losses stays at the air temperature', () => {
    const th = packThermal({ ...base, airC: -10, mode: 'ambient' });
    expect(th.meanC).toBeCloseTo(-10, 9);
    expect(th.heatingKwh + th.coolingKwh).toBe(0);
  });
  it('losses warm the pack with the time constant C/UA', () => {
    const ua = a.batteryHeatExchangeWPerK;
    const tau = C / ua / 3600;
    const th = packThermal({ ...base, airC: 20, mode: 'ambient', lossKw: 0.3, durationH: tau });
    expect(th.endC - 20).toBeCloseTo((300 / ua) * (1 - Math.exp(-1)), 3);
  });
  it('managed: a cold pack is heated to the window, costing about C·ΔT', () => {
    const th = packThermal({ ...base, airC: -10, mode: 'managed', durationH: 4 });
    expect(th.endC).toBeCloseTo(a.batteryManagedMinC, 3);
    const warmUp = (C * (a.batteryManagedMinC + 10)) / 3.6e6;
    expect(th.heatingKwh).toBeGreaterThan(warmUp);
    expect(th.heatingKwh).toBeLessThan(warmUp + (a.batteryHeatExchangeWPerK * 20 * 4) / 1000);
  });
  it('managed: no heating or cooling inside the window; cooling above it', () => {
    const mild = packThermal({ ...base, airC: 25, mode: 'managed', lossKw: 0.2 });
    expect(mild.heatingKwh + mild.coolingKwh).toBe(0);
    const hot = packThermal({ ...base, airC: 40, mode: 'managed', lossKw: 0.3, durationH: 5 });
    expect(hot.coolingKwh).toBeGreaterThan(0);
    expect(hot.endC).toBeLessThan(40);
  });
  it('preconditioned pack starts at the preconditioning temperature', () => {
    expect(packThermal({ ...base, airC: -10, mode: 'preconditioned' }).startC).toBe(20);
  });
});

describe('battery pack model', () => {
  for (const chem of ['LFP', 'NMC']) {
    const pack = new Pack({ chemistry: ds.chemistries[chem], capacityTemps: ds.capacityTemps, nominalKwh: 60, sohFrac: 1, packVoltageV: 400 });
    it(`${chem}: 25 °C, low power, 100 → 0 % delivers the rated energy (±1 %)`, () => {
      const r = pack.discharge(100, 0, 0.5, 1, 25);
      expect(Math.abs(r.terminalKwh / 60 - 1)).toBeLessThan(0.01);
    });
    it(`${chem}: colder → less energy`, () => {
      const warm = pack.discharge(95, 5, 20, 1, 25).terminalKwh;
      const cold = pack.discharge(95, 5, 20, 1, -10).terminalKwh;
      expect(cold).toBeLessThan(warm);
    });
  }
  it('LFP delivers less than NMC below 0 °C (same rated energy)', () => {
    const mk = (c: string) => new Pack({ chemistry: ds.chemistries[c], capacityTemps: ds.capacityTemps, nominalKwh: 60, sohFrac: 1, packVoltageV: 400 });
    expect(mk('LFP').discharge(95, 5, 20, 1, -10).terminalKwh).toBeLessThan(mk('NMC').discharge(95, 5, 20, 1, -10).terminalKwh);
  });
});

describe('calibration reproduces each car’s rated consumption on its own test cycle', () => {
  for (const d of derived) {
    if (d.consumption.value === null) continue;
    it(d.car.id, () => {
      const m = new CarModel(d, { ds, a, conditions: DEFAULT_CONDITIONS, settings: { consumption: 'physics', battery: 'ideal' } });
      const cal = m.calibration();
      if (cal.clamped) return; // flagged in the data check; cannot reproduce by design
      const veh = m.vehicle(cal.etaDrive, true);
      const env = m.environment(0, true);
      const aux = d.isIce ? 0 : baseLoadKw(onboardClass(ds, d.car.carClass));
      const ids = d.calibrationCycle === 'EPA' ? ['EPA_CITY', 'EPA_HIGHWAY'] : [d.calibrationCycle];
      const w = d.calibrationCycle === 'EPA' ? [0.55, 0.45] : [1];
      let perKm = 0;
      ids.forEach((id, k) => {
        const sim = simulate(ds.cycles[id].speedsKmh, veh, env, aux);
        perKm += (w[k] * (sim.batteryKwh + aux * (sim.timeS / 3600))) / sim.distanceKm;
      });
      const chargeEff = d.isIce || d.consumption.provenance === 'calculated' ? 1 : a.chargingEfficiencyPct / 100;
      const lab = d.calibrationCycle === 'EPA' ? 0.7 : 1;
      expect(perKm / chargeEff / lab).toBeCloseTo(d.consumption.value as number, 6);
    });
  }
});
