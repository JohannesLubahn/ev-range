// Hills (user request 2026-11-20): altitude change start → finish, total climb and typical slope, driven as a mix of
// uphill, downhill and flat stretches (src/engine/physics/terrain.ts, CarModel.segment). Checks the mix, energy
// conservation and the losses of regeneration against the hand calculation.
import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { parseTerrain } from '../src/data/parse';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { deriveAll } from '../src/engine/derive';
import { linkedInputs, TEST_KEYS } from '../src/engine/inputs';
import { CarModel, type SegmentSpec } from '../src/engine/model';
import { terrainMix } from '../src/engine/physics/terrain';
import { runEngine } from '../src/engine/run';
import { spreadsheetScenario, standardScenario } from '../src/engine/scenario';
import type { Profile, Scenario } from '../src/engine/types';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const sc = spreadsheetScenario(ds, a);
const derived = Object.fromEntries(deriveAll(ds, a).map((d) => [d.car.id, d]));
const model = (id: string) => new CarModel(derived[id], { ds, a, conditions: sc.conditions.noCharger, settings: { battery: 'chemistry' } });
const spec = (profile: Profile, speed: number, netM: number, ascentM: number, slopePct: number): SegmentSpec => ({
  label: 'Trip',
  distanceKm: 100,
  speedKmh: speed,
  profile,
  cabinC: null,
  terrain: { netM, ascentM, slopePct },
});
const G = 9.81;

describe('terrainMix', () => {
  it('splits the distance into up, down and flat; the net rise is the altitude change', () => {
    const m = terrainMix(100, { netM: 200, ascentM: 800, slopePct: 5 });
    expect(m.ascentM).toBe(800);
    expect(m.descentM).toBe(600);
    expect(m.upFrac + m.downFrac + m.flatFrac).toBeCloseTo(1, 12);
    const sin = Math.sin(Math.atan(m.grade));
    expect((m.upFrac - m.downFrac) * 100_000 * sin).toBeCloseTo(200, 6);
    expect(m.steepened).toBe(false);
  });
  it('raises the total climb to the altitude change, and the slope when the hills do not fit', () => {
    expect(terrainMix(100, { netM: 500, ascentM: 0, slopePct: 5 }).ascentM).toBe(500);
    const descent = terrainMix(100, { netM: -500, ascentM: 0, slopePct: 5 });
    expect([descent.ascentM, descent.descentM]).toEqual([0, 500]);
    const steep = terrainMix(10, { netM: 0, ascentM: 600, slopePct: 5 });
    expect(steep.steepened).toBe(true);
    expect(steep.slopePct).toBeGreaterThan(12);
    expect(steep.flatFrac).toBeCloseTo(0, 9);
  });
  it('is flat without hills', () => {
    expect(terrainMix(100, { netM: 0, ascentM: 0, slopePct: 5 })).toMatchObject({ upFrac: 0, downFrac: 0, flatFrac: 1 });
  });
});

describe('hills in the physics', () => {
  const atto = model('byd-atto-3');
  it('no hills give exactly the flat result', () => {
    const flat = atto.segment({ ...spec('rural', 70, 0, 0, 5), terrain: undefined });
    const zero = atto.segment(spec('rural', 70, 0, 0, 5));
    expect(zero.driveKwh).toBe(flat.driveKwh);
    expect(zero.physics.hills).toBeNull();
  });
  it('a climb only costs about the same as the old evenly spread net climb', () => {
    const hills = atto.segment(spec('rural', 70, 500, 500, 5));
    // At a slope just steep enough to spread 500 m over the whole 100 km (the old model).
    const even = atto.segment(spec('rural', 70, 500, 500, 0.5));
    expect(hills.driveKwh / even.driveKwh).toBeGreaterThan(0.97);
    expect(hills.driveKwh / even.driveKwh).toBeLessThan(1.03);
    const h = hills.physics.hills!;

    // Climbing m·g·h through the drivetrain; a little less on a dynamic profile, as the slope does part of the braking.
    const r = (h.climbExtraKwh * atto.calibration().etaDrive) / h.climbPotentialKwh;
    expect(r).toBeGreaterThan(0.9);
    expect(r).toBeLessThan(1.02);
  });
  it('the net slope work is m·g·Δh', () => {
    const s = atto.segment(spec('rural', 70, 300, 900, 6));
    const mass = s.physics.massKg;
    expect((s.physics.gradePerKm * 100 * 3.6e6) / (mass * G * 300)).toBeCloseTo(1, 3);
  });
  it('up and down the same height costs more the steeper the hills (regeneration < 100 %)', () => {
    const net = (slope: number) => atto.segment(spec('steady', 100, 0, 500, slope)).physics.hills!.netKwh;
    const [n1, n3, n5, n8] = [1, 3, 5, 8].map(net);
    const mgh = (atto.segment(spec('steady', 100, 0, 500, 5)).physics.massKg * G * 500) / 3.6e6;
    // 1 % at 100 km/h: gravity on the descents is smaller than air drag + rolling, so it is used completely.
    expect(Math.abs(n1)).toBeLessThan(0.02 * mgh);
    expect(n3).toBeGreaterThanOrEqual(n1 - 1e-9);
    expect(n5).toBeGreaterThan(n3);
    expect(n8).toBeGreaterThan(n5);
  });
  it('steep descents: the excess over the road load comes back at η_regen (hand calculation, steady speed)', () => {
    const s = atto.segment(spec('steady', 100, 0, 500, 8));
    const h = s.physics.hills!;
    const eta = atto.calibration().etaDrive;
    const etaRegen = a.regenEfficiencyPct / 100;
    // Road load on the descents at the flat's air drag + rolling (kWh at the wheels).
    const roadLoadKwh = (s.physics.aeroPerKm + s.physics.rollingPerKm) * h.downKm;
    const expected = (h.descentPotentialKwh - roadLoadKwh) * (1 / eta - etaRegen);
    expect(h.netKwh / expected).toBeGreaterThan(0.95);
    expect(h.netKwh / expected).toBeLessThan(1.05);
    expect(h.descentUsedShare).toBeLessThan(1);
    expect(h.descentUsedShare).toBeGreaterThan(etaRegen * eta);
  });
  it('a petrol car gets less of the descent back than an electric one', () => {
    const ice = model('honda-city').segment(spec('rural', 70, 0, 800, 6)).physics.hills!;
    const ev = atto.segment(spec('rural', 70, 0, 800, 6)).physics.hills!;
    expect(ice.descentUsedShare).toBeLessThan(ev.descentUsedShare);
  });
  it('beyond the regeneration limits the friction brakes take the rest', () => {
    const steep = atto.segment(spec('city', 25, 0, 300, 15)).physics.hills!;
    expect(steep.descentFrictionKwh).toBeGreaterThan(0);
    const gentle = atto.segment(spec('steady', 100, 0, 300, 5)).physics.hills!;
    expect(gentle.descentFrictionKwh).toBeCloseTo(0, 6);
  });
});

describe('terrain inputs', () => {
  it('data/terrain.csv loads with sourced slopes', () => {
    expect(ds.loadWarnings.filter((w) => w.includes('terrain.csv'))).toEqual([]);
    expect(ds.terrain.map((t) => t.id)).toEqual(['flat', 'rolling', 'hilly', 'mountain']);
    for (const t of ds.terrain) expect(t.sources.length).toBeGreaterThan(0);
    const w: string[] = [];
    parseTerrain('id,label,climb_per_100km_m,slope_pct\nx,X,-1,5\ny,Y,100,50\n', w);
    expect(w.length).toBe(2);
  });
  it('the standard is flat at the typical slope', () => {
    const s = standardScenario(ds, a);
    for (const t of ['trafficJam', 'noCharger', 'sprint', 'longTrip'] as const) expect([s[t].climbM, s[t].ascentM, s[t].slopePct]).toEqual([0, 0, a.hillSlopeDefaultPct]);
    for (const t of ['batteryLife', 'cost'] as const) expect([s[t].ascentPer100Km, s[t].slopePct]).toEqual([0, a.hillSlopeDefaultPct]);
  });
  it('use in all tests: the slope goes to every test, the climb per 100 km between Battery life and Cost', () => {
    expect(linkedInputs({ test: 'sprint', group: 'trip', key: 'slopePct' }).map((r) => r.test)).toEqual(TEST_KEYS.filter((t) => t !== 'sprint'));
    expect(linkedInputs({ test: 'cost', group: 'trip', key: 'ascentPer100Km' })).toEqual([{ test: 'batteryLife', group: 'trip', key: 'ascentPer100Km' }]);
    expect(linkedInputs({ test: 'noCharger', group: 'trip', key: 'ascentM' })).toEqual([]);
  });
  it('hills raise the stress tests and the cost; a descent to the finish lowers the energy', () => {
    const std = standardScenario(ds, a);
    const run = (s: Scenario) => runEngine(ds, a, s, { battery: 'chemistry' }, ['byd-atto-3']).results['byd-atto-3'];
    const base = run(std);
    const hilly = run({
      ...std,
      noCharger: { ...std.noCharger, ascentM: 2400 },
      trafficJam: { ...std.trafficJam, ascentM: 200 },
      longTrip: { ...std.longTrip, ascentM: 6400 },
      cost: { ...std.cost, ascentPer100Km: 800 },
    });
    const down = run({ ...std, noCharger: { ...std.noCharger, climbM: -500 } });
    expect(hilly.noCharger.energyKwh).toBeGreaterThan(base.noCharger.energyKwh);
    expect(down.noCharger.energyKwh).toBeLessThan(base.noCharger.energyKwh);
    expect(hilly.trafficJam.energyKwh).toBeGreaterThan(base.trafficJam.energyKwh);
    expect(hilly.longTrip.energyKwh).toBeGreaterThan(base.longTrip.energyKwh);
    expect(hilly.cost.energyCost).toBeGreaterThan(base.cost.energyCost);
    expect(hilly.noCharger.steps.some((s) => s.label === 'Hills')).toBe(true);
  });
});
