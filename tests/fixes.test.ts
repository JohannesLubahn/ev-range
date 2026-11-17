// The spreadsheet issues fixed in the website (Simple model, normal mode), checked against hand calculations.
import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';
import { assumptionsFromDataset } from '../src/engine/assumptions';
import { cost, longTrip, sprint } from '../src/engine/cases';
import { deriveAll } from '../src/engine/derive';
import { CarModel } from '../src/engine/model';
import { spreadsheetDefaults } from '../src/engine/scenario';

const ds = loadBundledDataset();
const a = assumptionsFromDataset(ds);
const sc = spreadsheetDefaults(a);
const derived = Object.fromEntries(deriveAll(ds, a).map((d) => [d.car.id, d]));
const simple = (id: string, exact = false) =>
  new CarModel(derived[id], { ds, a, conditions: sc.conditions, settings: { consumption: 'simple', battery: 'ideal', exactSpreadsheet: exact } });

describe('1+2: charging time uses consistent units and the fast window correctly', () => {
  it('Neta V 20 → 80 %: 10 % below the window at half speed, 50 % inside, onboard drain in %/h', () => {
    const r = longTrip(simple('neta-v'), sc.longTrip);
    const drain = ((2 * 0.9) / 32.56) * 100; // 1.8 kW of a 32.56 kWh long-term battery
    expect(r.timePerChargeH).toBeCloseTo(10 / (50 - drain) + 50 / (100 - drain), 9);
  });
  it('charging above the fast window is slow (the sheet counted it as fast)', () => {
    const above = longTrip(simple('neta-v'), { ...sc.longTrip, chargeToPct: 90 });
    const drain = ((2 * 0.9) / 32.56) * 100;
    expect(above.timePerChargeH).toBeCloseTo(10 / (50 - drain) + 50 / (100 - drain) + 10 / (50 - drain), 9);
    const sheet = longTrip(simple('neta-v', true), { ...sc.longTrip, chargeToPct: 90 });
    expect(sheet.timePerChargeH).toBeLessThan(above.timePerChargeH);
  });
});

describe('3: high-speed consumption is derived for every car', () => {
  it('MG Windsor sprint needs a sensible battery (the sheet showed 0.8 kWh)', () => {
    const r = sprint(simple('mg-windsor'), sc.sprint);
    const cons = 38.9 / 333; // battery ÷ WLTP range
    expect(r.energyKwh).toBeCloseTo(140 * cons * 2.5 + 2 * 0.9 * (140 / 120), 9);
    expect(r.requiredKwh).toBeGreaterThan(30);
  });
});

describe('4: total cost includes the onboard systems', () => {
  it('Neta V energy cost = 7.5 × (0.112 + 2 kW × 60 % × 7500 h ÷ 300000 km) × 300000 km', () => {
    const r = cost(simple('neta-v'), sc.batteryLife, sc.cost);
    expect(r.energyCost).toBeCloseTo(7.5 * 0.142 * 300000, 6);
    expect(cost(simple('neta-v', true), sc.batteryLife, sc.cost, true).energyCost).toBeCloseTo(252000, 6);
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
