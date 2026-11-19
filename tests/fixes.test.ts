// The spreadsheet issues fixed in the website, checked on the physics model, and the stress tests' average
// consumption.
import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { batteryLife, cost, longTrip, noCharger, sprint, trafficJam } from '../src/engine/cases';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { spreadsheetDefaults } from '../src/engine/scenario';
import type { BatteryModel } from '../src/engine/types';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const sc = spreadsheetDefaults(a);
const derived = Object.fromEntries(deriveAll(ds, a).map((d) => [d.car.id, d]));
const model = (id: string, battery: BatteryModel = 'chemistry') => new CarModel(derived[id], { ds, a, conditions: sc.conditions, settings: { battery } });

describe('1+2: charging time uses consistent units and the fast window correctly', () => {
  // Neta V charges 30 → 80 % in 30 min: 100 %/h inside that window, 50 %/h (taper) outside it.
  const m = model('neta-v');
  const drain = (m.onboard(sc.longTrip.cabinC).totalKw / m.capacityKwh()) * 100; // %/h of the aged battery
  it('Neta V 20 → 80 %: 10 % below the window at half speed, 50 % inside, onboard drain in %/h', () => {
    expect(drain).toBeGreaterThan(0);
    expect(longTrip(m, sc.longTrip).timePerChargeH).toBeCloseTo(10 / (50 - drain) + 50 / (100 - drain), 9);
  });
  it('charging above the fast window is slow (the sheet counted it as fast)', () => {
    const above = longTrip(m, { ...sc.longTrip, chargeToPct: 90 });
    expect(above.timePerChargeH).toBeCloseTo(10 / (50 - drain) + 50 / (100 - drain) + 10 / (50 - drain), 9);
  });
});

describe('3: every car gets a sprint result from the physics (the sheet showed 0.8 kWh for the MG Windsor)', () => {
  it('MG Windsor uses more per km at 120 km/h than at 70 km/h and needs a sensible battery', () => {
    const m = model('mg-windsor');
    const sp = sprint(m, sc.sprint);
    expect(sp.average.driving).toBeGreaterThan(noCharger(m, sc.noCharger).average.driving);
    expect(sp.requiredKwh).toBeGreaterThan(15);
  });
});

describe('4: total cost includes the onboard systems and the charging losses', () => {
  it('energy paid for = battery energy over the life ÷ charging efficiency', () => {
    const m = model('neta-v');
    const life = batteryLife(m, sc.batteryLife);
    const c = cost(m, sc.batteryLife, sc.cost);
    expect(life.average.onboard).toBeGreaterThan(0);
    expect(c.energyPerKm * life.totalKm * (a.chargingEfficiencyPct / 100)).toBeCloseTo(life.energyKwh, 6);
    expect(c.energyCost).toBeCloseTo(sc.cost.energyPrice * c.energyPerKm * life.totalKm, 6);
  });
});

describe('5 + 6: horsepower and currencies', () => {
  it('Aion Y Plus horsepower comes from kW (273.6 HP, not 301.7)', () => {
    expect(derived['aion-y-plus'].powerHp).toBeCloseTo(204 * 1.341, 6);
  });
  it('Hyundai Inster price is converted from EUR with your exchange rate', () => {
    expect(derived['hyundai-inster'].priceDisplay.value).toBeCloseTo(24400 * a.fx.EUR, 6);
  });
});

describe('average consumption of the stress tests (energy from the battery per 100 km)', () => {
  const jamKm = sc.trafficJam.distBeforeKm + sc.trafficJam.distJamKm + sc.trafficJam.distAfterKm;
  for (const d of Object.values(derived)) {
    if (d.consumption.value === null || d.batteryKwh === null) continue;
    it(`${d.car.id}: the parts add up and match the energy of each test`, () => {
      const m = model(d.car.id);
      const tj = trafficJam(m, sc.trafficJam);
      const nc = noCharger(m, sc.noCharger);
      const sp = sprint(m, sc.sprint);
      const lt = longTrip(m, sc.longTrip);
      const bl = batteryLife(m, sc.batteryLife);
      for (const avg of [tj.average, nc.average, sp.average, lt.average, bl.average]) {
        expect(avg.driving + avg.onboard + avg.battery).toBeCloseTo(avg.total, 9);
        expect(avg.driving).toBeGreaterThan(0);
        expect(avg.onboard).toBeGreaterThan(0);
        expect(avg.battery).toBeGreaterThanOrEqual(0);
      }
      expect((tj.average.total * jamKm) / 100).toBeCloseTo(tj.energyKwh, 6);
      expect((nc.average.total * sc.noCharger.distanceKm) / 100).toBeCloseTo(nc.energyKwh, 6);
      expect((sp.average.total * sc.sprint.distanceKm) / 100).toBeCloseTo(sp.energyKwh, 6);
      expect((lt.average.total * sc.longTrip.distanceKm) / 100).toBeCloseTo(lt.energyKwh, 6);
      // The battery-life energy also counts the cells' own losses; the consumption at the terminals does not.
      expect((bl.average.total * bl.totalKm) / 100).toBeLessThanOrEqual(bl.energyKwh + 1e-6);
    });
  }
  it('a traffic jam costs more per km than the open road, because of the onboard systems', () => {
    const m = model('byd-atto-3');
    const tj = trafficJam(m, sc.trafficJam);
    const nc = noCharger(m, sc.noCharger);
    expect(tj.average.total).toBeGreaterThan(nc.average.total);
    expect(tj.average.onboard).toBeGreaterThan(3 * nc.average.onboard);
  });
  it('a cold day adds battery heating; an ideal battery has none', () => {
    const cold = { ...sc.conditions, airTemperatureC: -10 };
    const chem = new CarModel(derived['byd-atto-3'], { ds, a, conditions: cold, settings: { battery: 'chemistry' } });
    const ideal = new CarModel(derived['byd-atto-3'], { ds, a, conditions: cold, settings: { battery: 'ideal' } });
    expect(trafficJam(chem, sc.trafficJam).average.battery).toBeGreaterThan(0);
    expect(trafficJam(ideal, sc.trafficJam).average.battery).toBe(0);
  });
  it('heating / AC off outside the jam: the parked-cabin cool-down moves into the jam', () => {
    const hot = new CarModel(derived['byd-atto-3'], { ds, a, conditions: { ...sc.conditions, airTemperatureC: 35, solarWm2: 800 }, settings: { battery: 'chemistry' } });
    const onboardStep = (r: { steps: { label: string; formula: string }[] }, seg: string) => r.steps.find((s) => s.label === `${seg}: onboard systems`)?.formula ?? '';
    const both = trafficJam(hot, sc.trafficJam);
    expect(onboardStep(both, 'Outside the jam')).toContain('parked cabin');
    expect(onboardStep(both, 'In the jam')).not.toContain('parked cabin');
    const jamOnly = trafficJam(hot, { ...sc.trafficJam, cabinOutsideC: null });
    expect(onboardStep(jamOnly, 'Outside the jam')).toContain('heating/AC off');
    expect(onboardStep(jamOnly, 'In the jam')).toContain('parked cabin');
    expect(jamOnly.average.onboard).toBeLessThan(both.average.onboard);
  });
  it('long trip: heating / AC off while charging shortens the charging stops', () => {
    const m = model('byd-atto-3');
    const on = longTrip(m, sc.longTrip);
    const off = longTrip(m, { ...sc.longTrip, climateWhileCharging: false });
    expect(off.timePerChargeH).toBeLessThan(on.timePerChargeH);
    expect(off.energyKwh).toBeCloseTo(on.energyKwh, 9);
  });
  it('no distance: no average (NaN), and no explanation value', () => {
    const r = trafficJam(model('byd-atto-3'), { ...sc.trafficJam, distBeforeKm: 0, distJamKm: 0, distAfterKm: 0 });
    expect(r.average.total).toBeNaN();
    expect(r.steps.find((s) => s.label === 'Average consumption')?.value).toBeNull();
  });
});
