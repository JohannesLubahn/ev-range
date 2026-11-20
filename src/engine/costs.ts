// Running costs and resale value of the cost of ownership (user request 2026-11-20): the market's rates
// (data/running_costs.csv, data/road_tax.csv) applied to one car over its years of use. Pure code, no UI.
import type { RoadTaxRow, RunningCostRow } from '../data/types';
import { toDisplayCurrency } from './assumptions';
import { MONEY_ITEMS, type CostItem } from './costItems';
import type { Assumptions, CostInputs, CostPart, CostPartKey } from './types';

export type Powertrain = 'BEV' | 'ICE';

/** The running costs of the market that applies (a.costMarket), money converted to the display currency. */
export interface MarketCosts {
  market: string;
  /** Currency of the market's rows. */
  currency: string;
  /** The value of an item for a powertrain (its own row, else the 'all' row; 0 if the market lacks it). */
  value: (item: CostItem, pt: Powertrain) => number;
  /** The row behind a value (for the Assumptions page). */
  row: (item: CostItem, pt: Powertrain) => RunningCostRow | undefined;
  /** Road-tax rows of the market; band and per-unit amounts converted to the display currency. */
  roadTax: RoadTaxRow[];
}

const cache = new WeakMap<Assumptions, MarketCosts>();

export function marketCosts(a: Assumptions): MarketCosts {
  const hit = cache.get(a);
  if (hit) return hit;
  const market = a.costMarket;
  const currency = a.marketCurrencies[market] ?? a.displayCurrency;
  const convert = (v: number) => toDisplayCurrency(v, currency, a) ?? v;
  const rows = a.runningCosts.filter((r) => r.market === market);
  const row = (item: CostItem, pt: Powertrain) => rows.find((r) => r.item === item && r.powertrain === pt) ?? rows.find((r) => r.item === item && r.powertrain === 'all');
  const value = (item: CostItem, pt: Powertrain) => {
    const r = row(item, pt);
    if (!r) return 0;
    return MONEY_ITEMS.has(item) ? convert(r.value) : r.value;
  };
  const roadTax = a.roadTax.filter((r) => r.market === market).map((r) => (r.kind === 'discount_pct' ? r : { ...r, amount: convert(r.amount) }));
  const out = { market, currency, value, row, roadTax };
  cache.set(a, out);
  return out;
}

/** The yearly road tax of a new car, from its weight (electric) or engine size (petrol). */
export interface RoadTaxBase {
  amount: number;
  basis: 'weight_kg' | 'engine_cc' | null;
  /** The car's weight or engine size the tax was taken from. */
  x: number | null;
  /** E.g. "band 1,750–2,000 kg". */
  note: string;
  warning?: string;
}

const thousands = (v: number, digits = 0) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function roadTaxBase(rules: RoadTaxRow[], pt: Powertrain, weightKg: number, engineCc: number | null): RoadTaxBase {
  const own = rules.filter((r) => r.powertrain === pt && r.basis !== 'age_years').sort((x, y) => x.above - y.above);
  if (own.length === 0) return { amount: 0, basis: null, x: null, note: 'no road tax rows for this market', warning: `No road tax in data/road_tax.csv for ${pt} cars` };
  const basis = own[0].basis as 'weight_kg' | 'engine_cc';
  const unit = basis === 'weight_kg' ? 'kg' : 'cc';
  const x = basis === 'weight_kg' ? weightKg : engineCc;
  if (x === null) return { amount: 0, basis, x: null, note: 'engine size missing', warning: 'Engine size (engine_cc) missing: no road tax counted' };
  if (own.some((r) => r.kind === 'per_unit')) {
    let amount = 0;
    for (const r of own) amount += Math.max(0, Math.min(x, r.upTo ?? Infinity) - r.above) * r.amount;
    return { amount, basis, x, note: `${thousands(x)} ${unit}, progressive rate per ${unit}` };
  }
  const band = own.find((r) => x > r.above && (r.upTo === null || x <= r.upTo));
  if (band) return { amount: band.amount, basis, x, note: `${thousands(x)} ${unit}: band ${thousands(band.above)}–${band.upTo === null ? '' : thousands(band.upTo)} ${unit}` };
  const last = own[own.length - 1];
  return {
    amount: last.amount,
    basis,
    x,
    note: `${thousands(x)} ${unit}: above the table, highest band`,
    warning: `Road tax table ends at ${thousands(last.upTo ?? last.above)} ${unit}; the highest band is used`,
  };
}

/** % off the road tax in year `year` of use (1 = the first year), e.g. for older petrol cars. */
export function roadTaxDiscountPct(rules: RoadTaxRow[], pt: Powertrain, year: number): number {
  const r = rules.find((x) => x.powertrain === pt && x.basis === 'age_years' && year > x.above && (x.upTo === null || year <= x.upTo));
  return r ? r.amount : 0;
}

/** The car's value after `t` years when it loses `ratePct` % of its value each year. */
export function carValue(price: number, ratePct: number, t: number): number {
  return price * Math.pow(1 - ratePct / 100, t);
}

export interface OwnershipCar {
  /** Purchase price in the display currency (null = unknown). */
  price: number | null;
  powertrain: Powertrain;
  carClass: string;
  curbKg: number;
  /** Curb weight + load of the cost's conditions (for the tyres). */
  massKg: number;
  engineCc: number | null;
  /** Overrides from cars.csv, in the display currency (null = the rule). */
  servicingPerYear: number | null;
  insurancePerYear: number | null;
  tyreSetPrice: number | null;
}

/** One line of the cost: a part of the chart is one or more lines. */
export interface OwnershipLine {
  part: CostPartKey;
  label: string;
  value: number | null;
  /** How it is calculated (numbers in the display currency). */
  formula: string;
}

export interface Ownership {
  resale: number | null;
  lines: OwnershipLine[];
  warnings: string[];
}

export const PART_LABELS: Record<CostPartKey, string> = {
  depreciation: 'Depreciation',
  energy: 'Energy',
  insurance: 'Insurance',
  tax: 'Road tax',
  servicing: 'Servicing & repairs',
  tyres: 'Tyres',
};
export const PART_ORDER: CostPartKey[] = ['depreciation', 'energy', 'insurance', 'tax', 'servicing', 'tyres'];

/**
 * Everything except the energy over `years` of use and `totalKm`: depreciation (purchase − value at the end),
 * insurance (voluntary on the value at the start of each year, at least the minimum; compulsory), road tax (by weight
 * or engine size, with the age discount), servicing, repairs after the warranty, 12 V batteries and tyres (worn in
 * proportion to the mass). A fraction of a year counts in proportion.
 */
export function ownership(car: OwnershipCar, ci: CostInputs, years: number, totalKm: number, mc: MarketCosts, cur: string): Ownership {
  const pt = car.powertrain;
  const bev = pt === 'BEV';
  const warnings: string[] = [];
  const lines: OwnershipLine[] = [];
  const money = (v: number) => `${thousands(v)} ${cur}`;
  const nYears = Math.ceil(years - 1e-9);
  const share = (y: number) => Math.min(1, Math.max(0, years - (y - 1)));
  const price = car.price;

  // Depreciation: the value falls by the same % each year.
  const dep = bev ? ci.depreciationBev : ci.depreciationIce;
  const resale = price === null ? null : carValue(price, dep, years);
  lines.push({
    part: 'depreciation',
    label: 'Depreciation',
    value: price === null || resale === null ? null : price - resale,
    formula: price === null || resale === null ? 'price missing' : `${money(price)} − value after ${thousands(years)} years at −${thousands(dep, 1)} %/year (${money(resale)})`,
  });

  // Insurance.
  if (car.insurancePerYear !== null) {
    lines.push({ part: 'insurance', label: 'Voluntary insurance', value: car.insurancePerYear * years, formula: `${money(car.insurancePerYear)} (cars.csv) × ${thousands(years)} years` });
  } else if (price !== null) {
    const rate = bev ? ci.insuranceRateBev : ci.insuranceRateIce;
    let sum = 0;
    let first = 0;
    let last = 0;
    for (let y = 1; y <= nYears; y++) {
      const premium = Math.max((rate / 100) * carValue(price, dep, y - 1), ci.insuranceMin);
      if (y === 1) first = premium;
      last = premium;
      sum += premium * share(y);
    }
    lines.push({
      part: 'insurance',
      label: 'Voluntary insurance',
      value: sum,
      formula: `${thousands(rate, 1)} % of the value each year, at least ${money(ci.insuranceMin)}: ${money(first)} in year 1 … ${money(last)} in year ${nYears}`,
    });
  } else lines.push({ part: 'insurance', label: 'Voluntary insurance', value: ci.insuranceMin * years, formula: `price missing: the minimum ${money(ci.insuranceMin)} × ${thousands(years)} years` });
  lines.push({ part: 'insurance', label: 'Compulsory insurance', value: ci.compulsoryInsurance * years, formula: `${money(ci.compulsoryInsurance)} × ${thousands(years)} years` });

  // Road tax.
  const tax = roadTaxBase(mc.roadTax, pt, car.curbKg, car.engineCc);
  if (tax.warning) warnings.push(tax.warning);
  let taxSum = 0;
  let discounted = false;
  for (let y = 1; y <= nYears; y++) {
    const off = roadTaxDiscountPct(mc.roadTax, pt, y);
    if (off > 0) discounted = true;
    taxSum += tax.amount * (1 - off / 100) * share(y);
  }
  lines.push({
    part: 'tax',
    label: 'Road tax',
    value: taxSum,
    formula: `${money(tax.amount)}/year (${tax.note}) × ${thousands(years)} years${discounted ? ', less for an older car' : ''}`,
  });

  // Servicing, repairs after the warranty, 12 V battery.
  const servicing = car.servicingPerYear ?? (bev ? ci.servicingBev : ci.servicingIce);
  lines.push({
    part: 'servicing',
    label: 'Servicing',
    value: servicing * years,
    formula: `${money(servicing)}${car.servicingPerYear !== null ? ' (cars.csv)' : ''} × ${thousands(years)} years`,
  });
  const repairYears = Math.max(0, years - ci.warrantyYears);
  lines.push({
    part: 'servicing',
    label: 'Repairs after the warranty',
    value: price === null ? null : (ci.repairsPct / 100) * price * repairYears,
    formula: price === null ? 'price missing' : `${thousands(ci.repairsPct, 1)} % of ${money(price)} × ${thousands(repairYears, 1)} years after ${thousands(ci.warrantyYears)} years of warranty`,
  });
  const n12v = ci.battery12vYears > 0 ? Math.max(0, Math.ceil(years / ci.battery12vYears - 1e-9) - 1) : 0;
  lines.push({ part: 'servicing', label: '12 V battery', value: n12v * ci.battery12vPrice, formula: `${n12v} × ${money(ci.battery12vPrice)} (every ${thousands(ci.battery12vYears)} years)` });

  // Tyres: the tread worn, in proportion to the mass on the tyres.
  const refKg = mc.value('tyre_reference_kg', pt) || car.massKg;
  const life = (ci.tyreLifeKm * refKg) / car.massKg;
  const set = car.tyreSetPrice ?? (car.carClass === 'premium' ? ci.tyreSetPremium : ci.tyreSetRegular);
  lines.push({
    part: 'tyres',
    label: 'Tyres',
    value: life > 0 ? (totalKm / life) * set : 0,
    formula: `${thousands(totalKm)} km ÷ ${thousands(life)} km per set (${thousands(ci.tyreLifeKm)} km × ${thousands(refKg)} kg ÷ ${thousands(car.massKg)} kg) × ${money(set)}${car.tyreSetPrice !== null ? ' (cars.csv)' : ''}`,
  });
  return { resale, lines, warnings };
}

/** Sums the lines into the parts of the chart (in PART_ORDER). */
export function sumParts(lines: OwnershipLine[]): CostPart[] {
  return PART_ORDER.map((key) => {
    const own = lines.filter((l) => l.part === key);
    const value = own.some((l) => l.value === null && key === 'depreciation') ? null : own.reduce((s, l) => s + (l.value ?? 0), 0);
    return { key, label: PART_LABELS[key], value };
  });
}
