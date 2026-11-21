import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { ageBattery, calendarCareFactor, careParams, carePresets, checkDegradation, cycleFadePct, cycleWearFactor, matchPreset } from '../src/engine/battery/ageing';
import { Pack } from '../src/engine/battery/pack';
import { batteryLife, cost, noCharger, YEARS_UNTIL_EOL_MAX } from '../src/engine/cases';
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
import { baseConditions, spreadsheetScenario, withDefaults } from '../src/engine/scenario';

const ds = loadBundledDataset();
const DEFAULT_CONDITIONS = baseConditions(ds);
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
  const env = { airDensity: 1.225, tyrePressurePct: 100, grade: 0 };
  const table: [number, number][] = [[10, 0.01], [50, 1.42], [100, 11.34], [120, 19.6], [160, 46.46]];
  for (const [kmh, kw] of table) {
    it(`${kmh} km/h → ${kw} kW`, () => {
      const v = kmh / 3.6;
      expect((wheelForces(v, 0, veh, env).aero * v) / 1000).toBeCloseTo(kw, 2);
    });
  }
});

describe('rolling resistance', () => {
  it('equals the tyre value at 80 km/h and the recommended pressure', () => {
    expect(rollingCoefficient(80, 100, 0.008, 2.5)).toBeCloseTo(0.008, 10);
  });
  it('rises with speed and falls with tyre pressure', () => {
    expect(rollingCoefficient(130, 100, 0.008, 2.5)).toBeGreaterThan(0.008);
    expect(rollingCoefficient(80, 80, 0.008, 2.5)).toBeGreaterThan(0.008);
    expect(rollingCoefficient(80, 110, 0.008, 2.5)).toBeLessThan(0.008);
  });
  it('matches the measured effect of under-inflation (National Academies SR 286: ≈1.4 % per psi, >10 % for 32 → 24 psi)', () => {
    const psi = 0.0689476; // bar
    for (const typical of [2.2, 2.5, 2.9]) {
      // 80 % of the recommended pressure (the tyre-pressure warning limit of UN R141)
      const low = rollingCoefficient(80, 80, 0.008, typical) / 0.008;
      expect(low, `${typical} bar`).toBeGreaterThan(1.12);
      expect(low, `${typical} bar`).toBeLessThan(1.16);
    }
    const perPsi = rollingCoefficient(80, 100 * (1 - psi / 2.5), 0.008, 2.5) / 0.008 - 1;
    expect(perPsi).toBeGreaterThan(0.01);
    expect(perPsi).toBeLessThan(0.02);
  });
  it('converts the tyre pressure in bar of older saved scenarios to % of the recommended pressure', () => {
    const a0 = assumptionsFromDataset(loadBundledDataset());
    const base = spreadsheetScenario(ds, a0);
    const legacy = (bar: number) => {
      const { tyrePressurePct: _drop, ...rest } = base.conditions.noCharger;
      return withDefaults({ ...base, conditions: { ...rest, tyrePressureBar: bar } as never }, ds, a0).conditions.noCharger;
    };
    expect(legacy(2.0).tyrePressurePct).toBe(80);
    expect(legacy(2.5).tyrePressurePct).toBe(100);
    expect(legacy(1.0).tyrePressurePct).toBe(60);
    expect('tyrePressureBar' in legacy(2.0)).toBe(false);
    expect(withDefaults(base, ds, a0).conditions.noCharger.tyrePressurePct).toBe(100);
  });
});

describe('simulation', () => {
  const veh = { massKg: 1800, cd: 0.28, frontalAreaM2: 2.5, crrRef: 0.008, tyrePressureRefBar: 2.5, rotatingMassFactor: 1.05, etaDrive: 0.9, etaRegen: 0.7 };
  const env = { airDensity: 1.2, tyrePressurePct: 100, grade: 0 };
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
      const cl = cabinClimate({ cls, a, airC, humidityPct: 60, solarWm2: 500, altitudeM: 0, heatPump: false, setpointC: 22 });
      const net = cl.walls + cl.freshAir + cl.sun + cl.inside;
      expect(cl.loadW).toBeCloseTo(airC < 0 ? -net : net + cl.moisture, 6);
      expect(cl.totalKw).toBeCloseTo(cl.compressorKw + cl.blowerKw, 9);
    }
  });
  it('a heat pump needs less power than a resistive heater; humid air costs AC power', () => {
    const c0 = { ...DEFAULT_CONDITIONS, airTemperatureC: 0, solarWm2: 0 };
    expect(onboardPower(ds, a, c0, 'regular', true, 22).cabinKw).toBeLessThan(onboardPower(ds, a, c0, 'regular', false, 22).cabinKw * 0.7);
    const dry = { ...DEFAULT_CONDITIONS, airTemperatureC: 33, humidityPct: 20 };
    const wet = { ...dry, humidityPct: 80 };
    expect(onboardPower(ds, a, wet, 'regular', false, 22).cabinKw).toBeGreaterThan(onboardPower(ds, a, dry, 'regular', false, 22).cabinKw);
  });
  it('electronics of a regular car lie in Argonne’s measured range (0.14–0.23 kW)', () => {
    expect(onboardPower(ds, a, DEFAULT_CONDITIONS, 'regular', false, null).totalKw).toBeCloseTo(0.22, 6);
  });
  it('the cabin temperature sets the heating / AC power: cooler in the heat or warmer in the cold costs more', () => {
    const hot = { ...DEFAULT_CONDITIONS, airTemperatureC: 35, solarWm2: 800 };
    expect(onboardPower(ds, a, hot, 'regular', false, 20).cabinKw).toBeGreaterThan(onboardPower(ds, a, hot, 'regular', false, 26).cabinKw);
    const cold = { ...DEFAULT_CONDITIONS, airTemperatureC: -10, solarWm2: 0 };
    expect(onboardPower(ds, a, cold, 'regular', false, 24).cabinKw).toBeGreaterThan(onboardPower(ds, a, cold, 'regular', false, 18).cabinKw);
    // Air at the cabin temperature, no sun: only the body heat and devices need a little cooling.
    const mild = { ...DEFAULT_CONDITIONS, airTemperatureC: 22, solarWm2: 0 };
    const m = onboardPower(ds, a, mild, 'regular', false, 22);
    expect(m.climate?.mode).toBe('cooling');
    expect(m.cabinKw).toBeLessThan(0.3);
  });
  it('heating / AC off: no cabin power and no start energy, the electronics stay', () => {
    const hot = { ...DEFAULT_CONDITIONS, airTemperatureC: 35, solarWm2: 800 };
    const off = onboardPower(ds, a, hot, 'regular', false, null);
    expect(off.cabinKw).toBe(0);
    expect(off.startKwh).toBe(0);
    expect(off.climate).toBeNull();
    expect(off.totalKw).toBeCloseTo(onboardPower(ds, a, hot, 'regular', false, 22).baseKw, 9);
  });
  it('converts the heating / AC usage % of older saved scenarios to a cabin temperature', () => {
    const sc = spreadsheetScenario(ds, a);
    const legacy = {
      ...sc,
      trafficJam: { ...sc.trafficJam, cabinOutsideC: undefined, cabinJamC: undefined, usageOutsidePct: 0, usageJamPct: 90 },
      noCharger: { ...sc.noCharger, cabinC: undefined, usagePct: 50 },
      longTrip: { ...sc.longTrip, cabinC: undefined, climateWhileCharging: undefined, usageDrivingPct: 90, usageChargingPct: 0 },
    } as never;
    for (const t of ['trafficJam', 'noCharger', 'longTrip'] as const) {
      for (const k of Object.keys(legacy[t])) if ((legacy[t] as Record<string, unknown>)[k] === undefined) delete (legacy[t] as Record<string, unknown>)[k];
    }
    const s = withDefaults(legacy, ds, a);
    expect(s.trafficJam.cabinOutsideC).toBeNull();
    expect(s.trafficJam.cabinJamC).toBe(a.cabinSetpointC);
    expect(s.noCharger.cabinC).toBe(a.cabinSetpointC);
    expect(s.longTrip.cabinC).toBe(a.cabinSetpointC);
    expect(s.longTrip.climateWhileCharging).toBe(false);
    expect('usagePct' in s.noCharger).toBe(false);
    expect('usageChargingPct' in s.longTrip).toBe(false);
    expect(withDefaults(sc, ds, a)).toEqual(sc);
  });
  it('preconditioned cars start without heating or cooling the cabin', () => {
    const hot = { ...DEFAULT_CONDITIONS, airTemperatureC: 35, solarWm2: 800 };
    expect(onboardPower(ds, a, hot, 'regular', false, 22).startKwh).toBeGreaterThan(0.3);
    expect(onboardPower(ds, a, { ...hot, thermalMode: 'preconditioned' }, 'regular', false, 22).startKwh).toBe(0);
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
      const m = new CarModel(d, { ds, a, conditions: DEFAULT_CONDITIONS, settings: { battery: 'ideal' } });
      const cal = m.calibration();
      if (cal.clamped) return; // flagged in the data check; cannot reproduce by design
      const veh = m.vehicle(cal.etaDrive, true);
      const env = m.environment(0, true);
      const aux = d.isIce ? 0 : baseLoadKw(onboardClass(ds, d.car.carClass));
      const ids = d.calibrationCycle === 'EPA' ? ['EPA_CITY', 'EPA_HIGHWAY'] : [d.calibrationCycle];
      const w = d.calibrationCycle === 'EPA' ? [0.55, 0.45] : [1];
      let perKm = 0;
      // Petrol car: idle fuel all the time, electronics via the alternator at the calibrated kWh per litre.
      const iceAux = d.isIce ? baseLoadKw(onboardClass(ds, d.car.carClass)) / (a.alternatorEfficiencyPct / 100) / cal.etaDrive : 0;
      ids.forEach((id, k) => {
        const sim = simulate(ds.cycles[id].speedsKmh, veh, env, aux);
        const h = sim.timeS / 3600;
        perKm += (w[k] * (sim.batteryKwh + aux * h + (m.idleFuelLph + iceAux) * h)) / sim.distanceKm;
      });
      const chargeEff = d.isIce || d.consumption.provenance === 'calculated' ? 1 : a.chargingEfficiencyPct / 100;
      const lab = d.calibrationCycle === 'EPA' ? 0.7 : 1;
      expect(perKm / chargeEff / lab).toBeCloseTo(d.consumption.value as number, 6);
    });
  }
});

describe('battery ageing (capacity after the km driven)', () => {
  const lfp = ds.chemistries.LFP;
  const nmc = ds.chemistries.NMC;
  const base = { nominalKwh: 60, ratedCycles: 2000, eolPct: 80, kwhPerKm: 0.15, km: 100000, kmPerYear: 15000, temperatureC: 25 };
  it('a new battery has its full capacity; capacity falls with every km', () => {
    expect(ageBattery({ ...base, chem: lfp, km: 0 }).sohPct).toBe(100);
    let last = 100;
    for (const km of [20000, 50000, 100000, 200000, 300000]) {
      const s = ageBattery({ ...base, chem: lfp, km }).sohPct;
      expect(s).toBeLessThan(last);
      last = s;
    }
  });
  it('hotter air ages the battery faster (calendar ageing)', () => {
    const at = (t: number) => ageBattery({ ...base, chem: lfp, temperatureC: t });
    expect(at(35).calendarFadePct).toBeGreaterThan(at(25).calendarFadePct);
    expect(at(25).calendarFadePct).toBeGreaterThan(at(10).calendarFadePct);
  });
  it('more km per year: the same km in fewer years, so less calendar ageing', () => {
    const slow = ageBattery({ ...base, chem: nmc, kmPerYear: 10000 });
    const fast = ageBattery({ ...base, chem: nmc, kmPerYear: 30000 });
    expect(fast.years).toBeCloseTo(slow.years / 3, 9);
    expect(fast.sohPct).toBeGreaterThan(slow.sohPct);
  });
  it('more rated cycles: less cycle wear; at the rated cycles the wear is 100 % − end-of-life capacity', () => {
    expect(ageBattery({ ...base, chem: lfp, ratedCycles: 3000 }).cycleFadePct).toBeLessThan(ageBattery({ ...base, chem: lfp }).cycleFadePct);
    expect(cycleFadePct(lfp, 2000, 2000, 80)).toBeCloseTo(20, 9);
    expect(cycleFadePct(nmc, 1100, 1100, 70)).toBeCloseTo(30, 9);
  });
  it('full cycles count discharges of the ageing battery (more than energy ÷ nominal)', () => {
    const g = ageBattery({ ...base, chem: lfp });
    const nominalCycles = (base.kwhPerKm * base.km) / base.nominalKwh;
    expect(g.efc).toBeGreaterThan(nominalCycles);
    expect(g.efc).toBeLessThan(nominalCycles / (g.sohPct / 100));
  });
  it('LFP and NMC age differently', () => {
    const l = ageBattery({ ...base, chem: lfp, ratedCycles: 1500 });
    const n = ageBattery({ ...base, chem: nmc, ratedCycles: 1500 });
    expect(Math.abs(l.sohPct - n.sohPct)).toBeGreaterThan(0.5);
  });
  it('matches every published fleet measurement within ±4 percentage points', () => {
    expect(ds.degradationMeasurements.length).toBeGreaterThanOrEqual(4);
    expect(ds.loadWarnings.filter((w) => w.includes('degradation_measurements'))).toEqual([]);
    const ids = new Set(ds.sources.map((s) => s.id));
    for (const m of ds.degradationMeasurements) {
      const k = checkDegradation(ds, a, m);
      expect(Math.abs(k.deviationPct), `${m.id}: model ${k.model?.sohPct.toFixed(1)} vs ${m.measuredSohPct}`).toBeLessThan(4);
      expect(ids.has(m.sourceId), m.id).toBe(true);
    }
  });
  it('the stress tests use nominal × capacity left; battery life and cost ignore the km driven', () => {
    const d = derived.find((x) => x.car.id === 'byd-atto-3')!;
    const sc = spreadsheetScenario(ds, a);
    const at = (km: number) => new CarModel(d, { ds, a, conditions: { ...sc.conditions.noCharger, batteryKm: km }, settings: { battery: 'chemistry' }, life: sc.batteryLife });
    const m0 = at(0);
    const m1 = at(100000);
    const g = m1.ageing()!;
    expect(m0.capacityKwh()).toBeCloseTo(60.5, 9);
    expect(m1.battery(10, 1, 1).availableKwh).toBeCloseTo((60.5 * g.sohPct) / 100, 9);
    expect(g.sohPct).toBeGreaterThan(85);
    expect(g.sohPct).toBeLessThan(95);
    const nc0 = noCharger(m0, sc.noCharger);
    const nc1 = noCharger(m1, sc.noCharger);
    expect(nc1.margin).toBeLessThan(nc0.margin);
    expect(nc1.energyKwh).toBeCloseTo(nc0.energyKwh, 6);
    expect(batteryLife(m1, sc.batteryLife).cyclesRequired).toBeCloseTo(batteryLife(m0, sc.batteryLife).cyclesRequired, 9);
    expect(cost(m1, sc.cost).costPerKm).toBeCloseTo(cost(m0, sc.cost).costPerKm as number, 9);
    expect(batteryLife(m1, sc.batteryLife).capacityEndPct).toBeLessThan(g.sohPct);
  });
  it('petrol cars do not age; old saved scenarios get the default km', () => {
    const honda = derived.find((x) => x.car.id === 'honda-city')!;
    const m = new CarModel(honda, { ds, a, conditions: DEFAULT_CONDITIONS, settings: { battery: 'chemistry' } });
    expect(m.ageing()).toBeNull();
    expect(m.capacityKwh()).toBe(honda.batteryKwh);
    const base0 = spreadsheetScenario(ds, a);
    const { batteryKm, ...old } = base0.conditions.noCharger;
    expect(batteryKm).toBe(100000);
    expect(withDefaults({ ...base0, conditions: old as never }, ds, a).conditions.noCharger.batteryKm).toBe(100000);
  });
});

describe('battery care (fast charging, time parked full)', () => {
  const lfp = ds.chemistries.LFP;
  const nmc = ds.chemistries.NMC;
  const p = careParams(a);
  const base = { nominalKwh: 60, ratedCycles: 2000, eolPct: 80, kwhPerKm: 0.15, km: 100000, kmPerYear: 15000, temperatureC: 25 };
  it('typical habits at the reference charging rate change nothing (the fleet fit stays valid)', () => {
    expect(cycleWearFactor(p, p.typical.dcSharePct, p.referenceCRate)).toBeCloseTo(1, 12);
    expect(cycleWearFactor(p, p.typical.dcSharePct, null)).toBeCloseTo(1, 12);
    expect(calendarCareFactor(lfp, p, p.typical.highSocTimePct)).toBeCloseTo(1, 12);
    expect(calendarCareFactor(nmc, p, p.typical.highSocTimePct)).toBeCloseTo(1, 12);
    expect(matchPreset(a, carePresets(a).typical)).toBe('typical');
    expect(matchPreset(a, { dcSharePct: 33, highSocTimePct: 50 })).toBeNull();
  });
  it('more fast charging, or a faster charging rate, wears each cycle more', () => {
    expect(cycleWearFactor(p, 60, 1)).toBeGreaterThan(cycleWearFactor(p, 25, 1));
    expect(cycleWearFactor(p, 25, 2)).toBeGreaterThan(cycleWearFactor(p, 25, 1));
    expect(cycleWearFactor(p, 5, 1)).toBeLessThan(1);
    const g = (f: number) => ageBattery({ ...base, chem: nmc, cycleWearFactor: f });
    expect(g(1.2).cycleFadePct).toBeGreaterThan(g(1).cycleFadePct);
    expect(g(1.2).calendarFadePct).toBeCloseTo(g(1).calendarFadePct, 12);
  });
  it('calendar ageing rises with the charge level (BLAST-Lite anode potential), more for NMC than LFP', () => {
    for (const c of [lfp, nmc]) {
      expect(c.calendarSocFactor[50]).toBeCloseTo(1, 3);
      expect(c.calendarSocFactor[90]).toBeGreaterThan(c.calendarSocFactor[55]);
      expect(c.calendarSocFactor[20]).toBeLessThan(1);
    }
    expect(nmc.calendarSocFactor[90] / nmc.calendarSocFactor[55]).toBeGreaterThan(lfp.calendarSocFactor[90] / lfp.calendarSocFactor[55]);
    expect(calendarCareFactor(nmc, p, 90)).toBeGreaterThan(calendarCareFactor(lfp, p, 90));
    expect(calendarCareFactor(lfp, p, 90)).toBeGreaterThan(1);
    expect(calendarCareFactor(nmc, p, 20)).toBeLessThan(1);
  });
  it('fast-charging wear matches INL’s DC vs. AC Nissan Leaf test (27.4 % vs. 24.8 % lost after 50,000 miles)', () => {
    // 24 kWh packs, 80,467 km in about 1.5 years in Phoenix (≈ 24 °C mean air), 50 kW DC ≈ 1.5 C on average.
    // INL's Leaf is LMO/NMC, not one of the chemistries here: the NMC shape is used and its rated cycles are fitted to
    // the AC cars, so only the difference made by fast charging is checked.
    const leaf = { chem: nmc, nominalKwh: 24, eolPct: 80, kwhPerKm: 0.15, km: 80467, kmPerYear: 80467 / 1.5, temperatureC: 24 };
    const loss = (rated: number, dc: number) => 100 - ageBattery({ ...leaf, ratedCycles: rated, cycleWearFactor: cycleWearFactor(p, dc, 1.5) }).sohPct;
    let lo = 50;
    let hi = 5000;
    for (let n = 0; n < 60; n++) {
      const mid = (lo + hi) / 2;
      if (loss(mid, 0) > 24.8) lo = mid;
      else hi = mid;
    }
    expect(loss(lo, 0)).toBeCloseTo(24.8, 1);
    expect(loss(lo, 100) - loss(lo, 0)).toBeGreaterThan(2.6 - 1);
    expect(loss(lo, 100) - loss(lo, 0)).toBeLessThan(2.6 + 1);
  });
  it('the Geotab groups keep their order (more fast charging / more time full: less capacity)', () => {
    const soh = (id: string) => checkDegradation(ds, a, ds.degradationMeasurements.find((m) => m.id === id)!).model!.sohPct;
    expect(soh('geotab-dc-low')).toBeGreaterThan(soh('geotab-dc-often-lowpower'));
    expect(soh('geotab-dc-often-lowpower')).toBeGreaterThan(soh('geotab-dc-often-highpower'));
    expect(soh('geotab-soc-low')).toBeGreaterThan(soh('geotab-soc-medium'));
    expect(soh('geotab-soc-medium')).toBeGreaterThan(soh('geotab-soc-high'));
  });
  it('battery life passes when the capacity at the end stays at or above the end-of-life capacity', () => {
    const sc = spreadsheetScenario(ds, a);
    let passes = 0;
    let fails = 0;
    for (const d of derived) {
      const m = new CarModel(d, { ds, a, conditions: sc.conditions.noCharger, settings: { battery: 'chemistry' }, life: sc.batteryLife });
      const b = batteryLife(m, sc.batteryLife);
      if (b.pass === null) continue;
      expect(b.pass).toBe((b.capacityEndPct as number) >= b.eolPct);
      if (b.pass) passes++;
      else fails++;
      // The years until the end of life land on the end-of-life capacity.
      if (b.yearsUntilEol !== null && b.yearsUntilEol < YEARS_UNTIL_EOL_MAX) {
        const input = m.ageingInput(b.yearsUntilEol * sc.batteryLife.kmPerYear, sc.batteryLife)!;
        expect(ageBattery(input).sohPct, d.car.id).toBeCloseTo(b.eolPct, 1);
        expect(b.yearsUntilEol >= sc.batteryLife.years, d.car.id).toBe(b.pass);
      }
    }
    expect(passes + fails).toBeGreaterThan(10);
  });
  it('care changes the km-driven wear of the stress tests and the battery-life verdict, not the cost', () => {
    const d = derived.find((x) => x.car.id === 'zeekr-x')!;
    const sc = spreadsheetScenario(ds, a);
    const presets = carePresets(a);
    const at = (h: { dcSharePct: number; highSocTimePct: number }) => {
      const life = { ...sc.batteryLife, ...h };
      return { life, m: new CarModel(d, { ds, a, conditions: sc.conditions.noCharger, settings: { battery: 'chemistry' }, life }) };
    };
    const gentle = at(presets.gentle);
    const hard = at(presets.hard);
    expect(hard.m.ageing()!.sohPct).toBeLessThan(gentle.m.ageing()!.sohPct);
    expect(hard.m.capacityKwh()).toBeLessThan(gentle.m.capacityKwh());
    expect(batteryLife(hard.m, hard.life).capacityEndPct as number).toBeLessThan(batteryLife(gentle.m, gentle.life).capacityEndPct as number);
    expect(cost(hard.m, sc.cost).costPerKm).toBeCloseTo(cost(gentle.m, sc.cost).costPerKm as number, 9);
  });
  it('old saved scenarios get the typical habits', () => {
    const base0 = spreadsheetScenario(ds, a);
    const { dcSharePct, highSocTimePct, ...old } = base0.batteryLife;
    expect([dcSharePct, highSocTimePct]).toEqual([a.careTypicalDcSharePct, a.careTypicalHighSocTimePct]);
    const s = withDefaults({ ...base0, batteryLife: old as never }, ds, a);
    expect(s.batteryLife.dcSharePct).toBe(a.careTypicalDcSharePct);
    expect(s.batteryLife.highSocTimePct).toBe(a.careTypicalHighSocTimePct);
  });
});
