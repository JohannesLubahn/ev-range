// Driving profiles (user's choice 2026-11-20): the speed set is the cruising speed (the top of the trace), the trace is
// stretched in time to it (accelerations as recorded), Mixed drives the WLTP at its own speeds, the motorway runs
// without stops, each profile keeps the speed inside its range and the car's top speed caps the trace. Old saved
// scenarios (speed = average incl. stops) are converted.
import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { longTrip, noCharger } from '../src/engine/cases';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { countStops, profileDef, profileSpeed, profileTrace, recordedTrace, stretchTrace, traceStats } from '../src/engine/physics/profiles';
import { traceDynamics } from '../src/engine/physics/style';
import { SCENARIO_VERSION, withDefaults } from '../src/engine/scenario';
import { previousStandard } from './previousStandard';
import { PROFILE_IDS, type Profile, type Scenario } from '../src/engine/types';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const sc = previousStandard(ds, a);
const derived = Object.fromEntries(deriveAll(ds, a).map((d) => [d.car.id, d]));
const model = (id: string, test: keyof Scenario['conditions'] = 'noCharger') =>
  new CarModel(derived[id], { ds, a, conditions: sc.conditions[test], settings: { battery: 'chemistry' } });
const ROAD: Profile[] = ['city', 'rural', 'highway', 'motorway'];

describe('data/profiles.csv', () => {
  it('has a row for every profile, loads without warnings and cites sources that exist', () => {
    expect(ds.loadWarnings.filter((w) => w.startsWith('profiles.csv'))).toEqual([]);
    for (const id of PROFILE_IDS) expect(ds.profiles.some((p) => p.id === id), id).toBe(true);
    const ids = new Set(ds.sources.map((s) => s.id));
    for (const p of ds.profiles) for (const s of p.sources) expect(ids.has(s), `${p.id}: ${s}`).toBe(true);
  });
  it('gives the road profiles a range of cruising speeds, Mixed none', () => {
    for (const id of ROAD) {
      const p = profileDef(ds, id);
      expect(p.speed, id).toBe('cruising');
      expect(p.speedMinKmh! < p.speedMaxKmh!, id).toBe(true);
    }
    expect(profileDef(ds, 'mixed').speed).toBe('own');
    expect(profileDef(ds, 'steady').speed).toBe('constant');
  });
});

describe('speed traces', () => {
  it('the cruising speed is the top of the trace, and the trace is stretched in time (accelerations as recorded)', () => {
    for (const id of ROAD) {
      const def = profileDef(ds, id);
      const rec = recordedTrace(ds, def);
      const recAccel = traceDynamics(rec).maxAccel;
      for (const v of [def.speedMinKmh!, def.speedMaxKmh!]) {
        const tr = profileTrace(ds, id, v);
        expect(tr.topKmh, `${id} ${v}`).toBeCloseTo(v, 6);
        expect(tr.stretch, `${id} ${v}`).toBeCloseTo(v / Math.max(...rec), 9);
        expect(tr.speedsKmh.length, `${id} ${v}`).toBe(Math.round((rec.length - 1) * tr.stretch) + 1);
        // Linear interpolation between the recorded seconds: not harder than recorded (the top fitted to the speed
        // set adds well under 1 %), and close to it.
        expect(tr.dynamics!.maxAccel, `${id} ${v}`).toBeLessThanOrEqual(recAccel * 1.01);
        expect(tr.dynamics!.maxAccel, `${id} ${v}`).toBeGreaterThan(0.8 * recAccel);
        // Speeds and durations × k: the average speed scales with the cruising speed, the length with its square.
        const st = traceStats(rec);
        expect(tr.avgKmh / st.avgKmh, `${id} ${v}`).toBeCloseTo(tr.stretch, 2);
        expect(tr.lengthKm / st.lengthKm, `${id} ${v}`).toBeCloseTo(tr.stretch ** 2, 2);
        expect(tr.stops, `${id} ${v}`).toBe(st.stops);
      }
    }
  });
  it('a stretch by 1 is the recording itself; stretching keeps the shape', () => {
    const rec = recordedTrace(ds, profileDef(ds, 'highway'));
    expect(stretchTrace(rec, 1)).toBe(rec);
    const half = stretchTrace(rec, 0.5);
    expect(half.length).toBe(Math.round((rec.length - 1) * 0.5) + 1);
    expect(Math.max(...half)).toBeCloseTo(Math.max(...rec) / 2, 6);
  });
  it('Mixed drives the whole WLTP at its own speeds, whatever speed is set', () => {
    const t1 = profileTrace(ds, 'mixed', 40);
    const t2 = profileTrace(ds, 'mixed', 150);
    expect(t1.speedsKmh).toBe(t2.speedsKmh);
    expect(t1.speedKmh).toBeNull();
    expect(t1.avgKmh).toBeCloseTo(ds.cycles.WLTP.speedsKmh.reduce((s, v) => s + v, 0) / ds.cycles.WLTP.speedsKmh.length, 0);
    expect(t1.topKmh).toBeCloseTo(131.3, 1);
  });
  it('the motorway runs on without stops: the extra-high phase joined at 105 km/h', () => {
    const def = profileDef(ds, 'motorway');
    const rec = recordedTrace(ds, def);
    expect(rec[0]).toBeGreaterThanOrEqual(105);
    expect(rec[rec.length - 1]).toBeGreaterThanOrEqual(105);
    expect(Math.abs(rec[0] - rec[rec.length - 1])).toBeLessThan(3);
    expect(Math.min(...rec)).toBeGreaterThan(100);
    expect(countStops(rec)).toBe(0);
    expect(profileTrace(ds, 'motorway', 130).stops).toBe(0);
  });
  it('the highway stops once per stretch, the city often', () => {
    expect(profileTrace(ds, 'highway', 90).stops).toBe(1);
    expect(profileTrace(ds, 'city', 50).stops).toBeGreaterThan(4);
  });
  it('each profile keeps the speed inside its range; Steady holds any speed', () => {
    expect(profileSpeed(profileDef(ds, 'city'), 100)).toBe(60);
    expect(profileSpeed(profileDef(ds, 'highway'), 30)).toBe(60);
    expect(profileSpeed(profileDef(ds, 'motorway'), 200)).toBe(160);
    expect(profileSpeed(profileDef(ds, 'steady'), 150)).toBe(150);
    expect(profileSpeed(profileDef(ds, 'mixed'), 150)).toBeNull();
    expect(profileTrace(ds, 'city', 100).topKmh).toBeCloseTo(60, 6);
  });
  it("the car's top speed caps the trace, with a warning", () => {
    const slow = Object.values(derived).find((d) => d.car.topSpeedKmh !== null && d.car.topSpeedKmh < 140 && d.consumption.value !== null)!;
    expect(slow).toBeDefined();
    const m = model(slow.car.id);
    const tr = m.profileTrace('motorway', 160);
    expect(tr.topKmh).toBeCloseTo(slow.car.topSpeedKmh!, 6);
    expect(tr.cappedAtKmh).toBe(slow.car.topSpeedKmh);
    const r = noCharger(m, { ...sc.noCharger, profile: 'motorway', speedKmh: 160 });
    expect(r.warnings.some((w) => w.includes('Top speed'))).toBe(true);
    // Steady above the top speed: driven at the top speed.
    expect(m.profileTrace('steady', 200).avgKmh).toBe(slow.car.topSpeedKmh);
  });
});

describe('the speed in the tests', () => {
  it('No charger: the time comes from the profile average (Highway at 90 km/h: about 72 km/h)', () => {
    const m = model('aion-hyptec-ht');
    const seg = m.segment({ label: 'Trip', distanceKm: 300, speedKmh: 90, profile: 'highway', cabinC: null });
    expect(seg.avgSpeedKmh).toBeGreaterThan(70);
    expect(seg.avgSpeedKmh).toBeLessThan(75);
    expect(seg.timeH).toBeCloseTo(300 / seg.avgSpeedKmh, 9);
  });
  it('Long trip: the driving time is the distance at the profile average, not at the speed set', () => {
    const m = model('byd-atto-3', 'longTrip');
    const r = longTrip(m, sc.longTrip);
    const avg = m.profileTrace(sc.longTrip.profile, sc.longTrip.speedKmh).avgKmh;
    expect(r.timeDrivingH).toBeCloseTo(sc.longTrip.distanceKm / avg, 6);
    expect(r.timeDrivingH).toBeGreaterThan(sc.longTrip.distanceKm / sc.longTrip.speedKmh);
  });
  it('faster cruising costs more on country roads, highways and motorways; in town the speed hardly changes the driving energy', () => {
    for (const id of ['aion-hyptec-ht', 'byd-dolphin', 'vw-golf-15-tsi']) {
      const m = model(id);
      const seg = (p: Profile, v: number) => m.segment({ label: 'x', distanceKm: 100, speedKmh: v, profile: p, cabinC: 22 });
      // A petrol engine's idle fuel is per hour: it falls per km with speed, so only the energy for moving is checked
      // for it (its total per km has a minimum at moderate speeds, as measured fuel-economy curves do).
      for (const p of ['rural', 'highway', 'motorway'] as Profile[]) {
        const def = profileDef(ds, p);
        let last = { drive: 0, total: 0 };
        for (let v = def.speedMinKmh!; v <= def.speedMaxKmh!; v += 10) {
          const s = seg(p, v);
          const drive = s.driveKwh - s.idleKwh;
          expect(drive, `${id} ${p} ${v}`).toBeGreaterThan(last.drive);
          if (s.idleKwh === 0) expect(s.totalKwh, `${id} ${p} ${v}`).toBeGreaterThan(last.total);
          last = { drive, total: s.totalKwh };
        }
      }
      // Town: accelerations and stops per km stay the same at any cruising speed (the trace is stretched in time), so
      // the driving energy stays about the same; per km a slow crawl costs more onboard energy (more hours).
      const city = [30, 40, 50, 60].map((v) => seg('city', v));
      const drive = city.map((s) => s.driveKwh - s.idleKwh);
      expect(Math.max(...drive) / Math.min(...drive), id).toBeLessThan(1.12);
      for (let i = 1; i < city.length; i++) expect(city[i].onboardKwh, id).toBeLessThan(city[i - 1].onboardKwh);
    }
  });
  it('at the same speed the profiles differ by tens of per cent, not by a factor of two (Hyptec HT at 60 km/h)', () => {
    const m = model('aion-hyptec-ht');
    const per100 = (p: Profile) => {
      const s = m.segment({ label: 'x', distanceKm: 100, speedKmh: 60, profile: p, cabinC: 22 });
      return s.totalKwh;
    };
    const values = (['steady', ...ROAD] as Profile[]).map(per100);
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.6);
  });
  it('the No-charger standard gives the Hyptec HT about 13 kWh/100 km (the owner sees 20–30 % below the old 16.8)', () => {
    const r = noCharger(model('aion-hyptec-ht'), sc.noCharger);
    expect(r.average.total).toBeGreaterThan(12);
    expect(r.average.total).toBeLessThan(14);
  });
});

describe('older saved scenarios', () => {
  const old = (patch: Partial<Scenario>): Scenario => ({ ...structuredClone(sc), version: undefined, ...patch }) as Scenario;
  it('the old standard driving becomes the new standard', () => {
    const s = withDefaults(
      old({
        noCharger: { ...sc.noCharger, speedKmh: 70, profile: 'rural' },
        longTrip: { ...sc.longTrip, speedKmh: 60, profile: 'rural' },
        trafficJam: { ...sc.trafficJam, speedOutsideKmh: 40, profileOutside: 'city' },
        batteryLife: { ...sc.batteryLife, speedKmh: 40, profile: 'mixed' },
        cost: { ...sc.cost, speedKmh: 40, profile: 'mixed' },
      }),
      ds,
      a,
    );
    expect(s.version).toBe(SCENARIO_VERSION);
    expect([s.noCharger.speedKmh, s.noCharger.profile]).toEqual([90, 'highway']);
    expect([s.longTrip.speedKmh, s.longTrip.profile]).toEqual([90, 'highway']);
    expect([s.trafficJam.speedOutsideKmh, s.trafficJam.profileOutside]).toEqual([50, 'city']);
    expect([s.batteryLife.speedKmh, s.batteryLife.profile]).toEqual([90, 'mixed']);
    expect([s.cost.speedKmh, s.cost.profile]).toEqual([90, 'mixed']);
  });
  it('a driving the user had changed keeps its numbers (read as the cruising speed)', () => {
    const s = withDefaults(old({ noCharger: { ...sc.noCharger, speedKmh: 80, profile: 'rural' } }), ds, a);
    expect([s.noCharger.speedKmh, s.noCharger.profile]).toEqual([80, 'rural']);
  });
  it('a scenario of version 2 is not converted again', () => {
    const s = withDefaults({ ...structuredClone(sc), noCharger: { ...sc.noCharger, speedKmh: 70, profile: 'rural' } }, ds, a);
    expect([s.noCharger.speedKmh, s.noCharger.profile]).toEqual([70, 'rural']);
  });
});
