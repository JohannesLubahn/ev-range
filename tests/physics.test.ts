import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { Pack } from '../src/engine/battery/pack';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { onboardPower } from '../src/engine/onboard/loads';
import { batteryTemperature } from '../src/engine/onboard/thermal';
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

describe('onboard loads and battery temperature (Facts tab)', () => {
  it('regular car at 30 °C with AC 90 % ≈ 6.5 kW', () => {
    const p = onboardPower(ds, 'regular', 30, 90, 'managed');
    expect(p.totalKw).toBeCloseTo(0.41 + 0.35 + 0.8 + 3.5 * 0.9 + 1.8, 6);
  });
  it('battery heating/cooling power matches 200 W/K up to 2 kW', () => {
    for (const t of [0, 2, 5, 25, 28, 30]) {
      const table = onboardPower(ds, 'regular', t, 0, 'managed').batteryHvacKw;
      const need = t < 10 ? Math.min(2, (10 - t) * 0.2) : t > 21 ? Math.min(2, (t - 21) * 0.2) : 0;
      expect(table).toBeCloseTo(need, 6);
    }
  });
  it('managed pack is held at 10–21 °C while 2 kW suffice, then drifts', () => {
    expect(batteryTemperature(0, 0, 'managed', 20, a).temperatureC).toBeCloseTo(10, 6);
    expect(batteryTemperature(-20, 0, 'managed', 20, a).temperatureC).toBeCloseTo(-10, 6);
    expect(batteryTemperature(40, 0, 'managed', 20, a).temperatureC).toBeCloseTo(30, 6);
    expect(batteryTemperature(15, 0, 'managed', 20, a).temperatureC).toBeCloseTo(15, 6);
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
      const aux = d.isIce ? 0 : ds.onboardClasses[d.car.carClass].generalKw;
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
