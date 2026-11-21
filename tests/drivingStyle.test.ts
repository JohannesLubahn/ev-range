// Driving style (Conditions): a more or less dynamic speed trace, friction braking beyond the regeneration limits,
// and its effect on every stress test and the cost.
import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { batteryLife, cost, longTrip, noCharger, sprint, trafficJam } from '../src/engine/cases';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { profileTrace } from '../src/engine/physics/profiles';
import { simulate } from '../src/engine/physics/simulate';
import { rdeBounds, styleTrace, traceDynamics } from '../src/engine/physics/style';
import { spreadsheetScenario, withDefaults } from '../src/engine/scenario';
import type { Assumptions, Profile, Scenario } from '../src/engine/types';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const sc = spreadsheetScenario(ds, a);
const derived = Object.fromEntries(deriveAll(ds, a).map((d) => [d.car.id, d]));
const W = a.drivingStyleWindowS;
const model = (id: string, stylePct: number, assumptions: Assumptions = a) =>
  new CarModel(derived[id], { ds, a: assumptions, conditions: { ...sc.conditions.noCharger, drivingStylePct: stylePct }, settings: { battery: 'chemistry' } });
const wltp = ds.cycles.WLTP;
const phases = (...p: string[]) => wltp.speedsKmh.filter((_, i) => p.includes(wltp.phases[i]));
const sum = (x: number[]) => x.reduce((s, v) => s + v, 0);
const evIds = Object.values(derived)
  .filter((d) => !d.isIce && d.consumption.value !== null && d.batteryKwh !== null)
  .map((d) => d.car.id);

describe('styleTrace: the speed trace driven gentler or harder', () => {
  const city = phases('low', 'medium');
  it('100 % is the trace as is', () => {
    expect(styleTrace(city, 1, W)).toBe(city);
  });
  it('keeps the distance and the time, never drives backwards', () => {
    for (const k of [0.5, 0.65, 1.7, 2]) {
      const t = styleTrace(city, k, W);
      expect(t).toHaveLength(city.length);
      expect(sum(t)).toBeCloseTo(sum(city), 6);
      expect(Math.min(...t)).toBeGreaterThanOrEqual(0);
    }
  });
  it('accelerations and braking grow with the style', () => {
    const d = [0.5, 1, 1.5, 2].map((k) => traceDynamics(styleTrace(city, k, W)));
    for (let i = 1; i < d.length; i++) {
      expect(d[i].rpa).toBeGreaterThan(d[i - 1].rpa);
      expect(d[i].maxAccel).toBeGreaterThan(d[i - 1].maxAccel);
      expect(d[i].maxDecel).toBeGreaterThan(d[i - 1].maxDecel);
    }
    // Roughly in proportion: twice the style, about twice the hardest acceleration.
    expect(d[3].maxAccel / d[1].maxAccel).toBeGreaterThan(1.6);
    expect(d[3].maxAccel / d[1].maxAccel).toBeLessThan(2.4);
  });
  it('the RDE bounds (Regulation (EU) 2017/1151, Annex IIIA, Appendix 7a)', () => {
    expect(rdeBounds(30)).toEqual({ va95Max: 0.136 * 30 + 14.44, rpaMin: -0.0016 * 30 + 0.1755 });
    expect(rdeBounds(100)).toEqual({ va95Max: 0.0742 * 100 + 18.966, rpaMin: 0.025 });
  });
});

describe('the presets against the EU RDE dynamics bounds', () => {
  it('Normal: the WLTP itself is inside the bounds', () => {
    for (const t of [phases('low'), phases('low', 'medium'), phases('high'), phases('extra_high')]) {
      const d = traceDynamics(t);
      expect(d.rpa).toBeGreaterThanOrEqual(d.rpaMin);
      expect(d.va95).toBeLessThanOrEqual(d.va95Max);
    }
  });
  it('Gentle: the smoothest driving RDE accepts (RPA of the low phase at its lower bound)', () => {
    const k = a.drivingStyleGentlePct / 100;
    const low = traceDynamics(styleTrace(phases('low'), k, W));
    expect(low.rpa).toBeGreaterThanOrEqual(low.rpaMin - 0.002);
    expect(low.rpa).toBeLessThan(low.rpaMin + 0.01);
    for (const p of [['low', 'medium'], ['high'], ['extra_high']]) {
      const d = traceDynamics(styleTrace(phases(...p), k, W));
      expect(d.rpa, p.join('+')).toBeGreaterThanOrEqual(d.rpaMin);
    }
  });
  it('Sporty: the most dynamic driving RDE accepts (v·a⁺[95] of the city phases at its upper bound)', () => {
    const k = a.drivingStyleSportyPct / 100;
    const city = traceDynamics(styleTrace(phases('low', 'medium'), k, W));
    expect(city.va95).toBeLessThanOrEqual(city.va95Max);
    expect(city.va95).toBeGreaterThan(city.va95Max - 1);
    for (const p of [['low'], ['high'], ['extra_high']]) {
      const d = traceDynamics(styleTrace(phases(...p), k, W));
      expect(d.va95, p.join('+')).toBeLessThanOrEqual(d.va95Max);
    }
  });
});

describe('friction braking beyond the regeneration limits', () => {
  const veh = {
    massKg: 1600,
    cd: 0.28,
    frontalAreaM2: 2.3,
    crrRef: 0.008,
    tyrePressureRefBar: 2.5,
    rotatingMassFactor: 1.05,
    etaDrive: 0.9,
    etaRegen: 0.7,
    regenMaxDecelMs2: 2,
    regenMinKmh: 10,
  };
  const env = { airDensity: 1.2, tyrePressurePct: 100, grade: 0 };
  const stop = (decel: number) => {
    const s: number[] = [];
    for (let v = 72; v > 0; v -= decel * 3.6) s.push(v);
    s.push(0);
    return s;
  };
  it('gentle braking above the minimum speed is all regenerated; braking energy = regen ÷ η + friction', () => {
    const sim = simulate([72, 72 - 3.6, 72 - 7.2], veh, env);
    expect(sim.frictionKwh).toBe(0);
    expect(sim.regenKwh / veh.etaRegen).toBeCloseTo(sim.wheelNegKwh, 12);
  });
  it('harder braking loses more to the friction brakes; the energy adds up', () => {
    const soft = simulate(stop(1.5), veh, env);
    const hard = simulate(stop(4), veh, env);
    expect(soft.frictionKwh).toBeGreaterThan(0); // the last 10 km/h
    expect(hard.frictionKwh / hard.wheelNegKwh).toBeGreaterThan(soft.frictionKwh / soft.wheelNegKwh + 0.3);
    for (const s of [soft, hard]) expect(s.regenKwh / veh.etaRegen + s.frictionKwh).toBeCloseTo(s.wheelNegKwh, 12);
  });
  it('without limits everything is regenerated (as before)', () => {
    const { regenMaxDecelMs2: _a, regenMinKmh: _b, ...plain } = veh;
    expect(simulate(stop(4), plain, env).frictionKwh).toBe(0);
  });
});

describe('driving style in the consumption', () => {
  const gentle = a.drivingStyleGentlePct;
  const sporty = a.drivingStyleSportyPct;
  // Energy for moving the car: a petrol engine's idle fuel (per hour, the same for any style) is left out.
  const perKm = (id: string, style: number, profile: Profile, speed: number) => {
    const s = model(id, style).segment({ label: 'x', distanceKm: 100, speedKmh: speed, profile, cabinC: null });
    return (s.driveKwh - s.idleKwh) / 100;
  };

  it('every car: Gentle < Normal < Sporty in the city, on rural roads and in a jam; Steady is unchanged', () => {
    for (const d of Object.values(derived)) {
      if (d.consumption.value === null) continue;
      const id = d.car.id;
      for (const [profile, speed] of [['city', 30], ['rural', 60], ['mixed', 45], ['jam', 5]] as [Profile, number][]) {
        const g = perKm(id, gentle, profile, speed);
        const n = perKm(id, 100, profile, speed);
        const s = perKm(id, sporty, profile, speed);
        expect(g, `${id} ${profile}`).toBeLessThan(n);
        expect(s, `${id} ${profile}`).toBeGreaterThan(n);
      }
      expect(perKm(id, sporty, 'steady', 120)).toBe(perKm(id, 100, 'steady', 120));
    }
  });
  it('city driving: Normal → Sporty is of the order Bingham et al. (2012) measured for moderate → aggressive (~30 %)', () => {
    for (const id of evIds) {
      const up = perKm(id, sporty, 'city', 30) / perKm(id, 100, 'city', 30);
      expect(up, id).toBeGreaterThan(1.15);
      expect(up, id).toBeLessThan(1.45);
      // The full range of the RDE bounds (Gentle → Sporty) is wider, but bounded.
      expect(perKm(id, sporty, 'city', 30) / perKm(id, gentle, 'city', 30), id).toBeLessThan(1.8);
    }
  });
  it('a petrol car (no regeneration) is hit harder than an EV', () => {
    const ice = Object.values(derived).find((d) => d.isIce && d.consumption.value !== null)!;
    const iceRatio = perKm(ice.car.id, sporty, 'city', 30) / perKm(ice.car.id, 100, 'city', 30);
    const evRatio = perKm(evIds[0], sporty, 'city', 30) / perKm(evIds[0], 100, 'city', 30);
    expect(iceRatio).toBeGreaterThan(evRatio);
  });
  it('the friction brakes take a bigger share of the braking when driving hard', () => {
    const seg = (style: number) => model(evIds[0], style).segment({ label: 'x', distanceKm: 10, speedKmh: 50, profile: 'city', cabinC: null });
    expect(seg(sporty).physics.frictionPerKm).toBeGreaterThan(2 * seg(100).physics.frictionPerKm);
    expect(seg(gentle).physics.frictionPerKm).toBeLessThan(seg(100).physics.frictionPerKm);
    expect(seg(sporty).physics.dynamics!.maxAccel).toBeGreaterThan(seg(100).physics.dynamics!.maxAccel);
    expect(seg(100).physics.dynamics).not.toBeNull();
  });
  it('the test-cycle calibration does not depend on the driving style', () => {
    for (const id of evIds) expect(model(id, sporty).calibration().etaDrive).toBe(model(id, 100).calibration().etaDrive);
  });
  it('the regeneration limits change Normal driving only a little (re-calibrated on the test cycle)', () => {
    const noLimits = { ...a, regenMaxDecelMs2: 100, regenMinKmh: 0 };
    for (const id of evIds) {
      const seg = (as: Assumptions) => model(id, 100, as).segment({ label: 'x', distanceKm: 100, speedKmh: 45, profile: 'mixed', cabinC: null }).driveKwh;
      expect(seg(a) / seg(noLimits), id).toBeGreaterThan(0.97);
      expect(seg(a) / seg(noLimits), id).toBeLessThan(1.03);
    }
  });
});

describe('driving style reaches every stress test and the cost', () => {
  const id = evIds[0];
  const run = (style: number, s: Scenario = sc) => {
    const m = model(id, style);
    return {
      tj: trafficJam(m, s.trafficJam).energyKwh,
      nc: noCharger(m, s.noCharger).energyKwh,
      sp: sprint(m, s.sprint).energyKwh,
      lt: longTrip(m, s.longTrip).energyKwh,
      bl: batteryLife(m, s.batteryLife).energyKwh,
      cost: cost(m, s.cost).energyCost,
      soh: m.ageing()?.sohPct ?? 0,
    };
  };
  it('Sporty uses more energy in every test with a speed profile, and costs more', () => {
    const n = run(100);
    const s = run(a.drivingStyleSportyPct);
    expect(s.tj).toBeGreaterThan(n.tj);
    expect(s.nc).toBeGreaterThan(n.nc);
    expect(s.lt).toBeGreaterThan(n.lt);
    expect(s.bl).toBeGreaterThan(n.bl);
    expect(s.cost).toBeGreaterThan(n.cost);
    // More energy per km = more cycles = a little more battery wear after the same km.
    expect(s.soh).toBeLessThan(n.soh);
    // The sprint drives at a steady 120 km/h (cruise control): no change.
    expect(sc.sprint.profile).toBe('steady');
    expect(s.sp).toBe(n.sp);
    // A sprint on the motorway profile does change.
    const mw = { ...sc, sprint: { ...sc.sprint, profile: 'motorway' as Profile } };
    expect(run(a.drivingStyleSportyPct, mw).sp).toBeGreaterThan(run(100, mw).sp);
  });
  it('the explanation shows the trace dynamics and the friction-brake losses', () => {
    const steps = trafficJam(model(id, a.drivingStyleSportyPct), sc.trafficJam).steps;
    expect(steps.some((st) => /driving dynamics/.test(st.label) && /RDE/.test(st.formula))).toBe(true);
    expect(steps.some((st) => /friction brakes/.test(st.formula))).toBe(true);
  });
  it('old saved scenarios get Normal driving', () => {
    const { drivingStylePct: _d, ...old } = sc.conditions.noCharger;
    const s = withDefaults({ ...sc, conditions: old as never }, ds, a);
    expect(s.conditions.noCharger.drivingStylePct).toBe(100);
  });
  it('the trace description names the style', () => {
    expect(profileTrace(ds, 'city', 30, 1.7, W).description).toMatch(/harder/);
    expect(profileTrace(ds, 'city', 30, 0.65, W).description).toMatch(/gentler/);
    expect(profileTrace(ds, 'steady', 120, 1.7, W).dynamics).toBeNull();
  });
});
