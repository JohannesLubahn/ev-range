// Running costs and resale value of the cost of ownership (user request 2026-11-20): the market's rates
// (data/markets/<id>/costs.csv and road_tax.csv, with what its blocs pass on) applied to one car over its years of use.
// Pure code, no UI.
import type { RoadTaxRow, RunningCostRow } from '../data/types';
import { toDisplayCurrency } from './assumptions';
import type { CostItem } from './costItems';
import type { Assumptions, CostInputs, CostPart, CostPartKey } from './types';

export type Powertrain = 'BEV' | 'ICE';

/** A cost value and where it comes from. */
export interface CostSource {
  row: RunningCostRow;
  /** The market or bloc whose folder holds the row (e.g. WORLD for a value the market inherits). */
  from: string;
  inherited: boolean;
}

/** The running costs of the market that applies (a.costMarket), money converted to the display currency. */
export interface MarketCosts {
  market: string;
  /** Currency of the market's rows. */
  currency: string;
  /**
   * The value of an item for a powertrain: the market's own row (its powertrain's, else 'all'), else, for inheritable
   * items (data/costs/items.csv), its bloc's, then the bloc's parent's, up to World. Null = a gap: the market has no
   * value and does not borrow another market's.
   */
  value: (item: CostItem, pt: Powertrain) => number | null;
  /** The row behind a value and the folder it comes from (null = missing). */
  source: (item: CostItem, pt: Powertrain) => CostSource | null;
  /** Required items (data/costs/items.csv) without a value, per powertrain. */
  missing: { item: CostItem; pt: Powertrain }[];
  /** Road-tax rows of the market; band and per-unit amounts converted to the display currency. */
  roadTax: RoadTaxRow[];
}

/** The market followed by its bloc, the bloc's parent … up to the top (World). */
export function costChain(id: string, parents: Record<string, string | null>): string[] {
  const chain = [id];
  for (let p = parents[id] ?? null; p !== null && !chain.includes(p); p = parents[p] ?? null) chain.push(p);
  return chain;
}

const cache = new WeakMap<Assumptions, MarketCosts>();

export function marketCosts(a: Assumptions): MarketCosts {
  const hit = cache.get(a);
  if (hit) return hit;
  const market = a.costMarket;
  const currency = a.marketCurrencies[market] ?? a.displayCurrency;
  const convert = (v: number) => toDisplayCurrency(v, currency, a) ?? v;
  const chain = costChain(market, a.marketParents);
  const defs = new Map(a.costItems.map((d) => [d.item, d]));
  const source = (item: CostItem, pt: Powertrain): CostSource | null => {
    for (const [i, from] of chain.entries()) {
      if (i > 0 && !defs.get(item)?.inherit) break;
      const rows = a.runningCosts.filter((r) => r.market === from && r.item === item);
      const row = rows.find((r) => r.powertrain === pt) ?? rows.find((r) => r.powertrain === 'all');
      if (row) return { row, from, inherited: i > 0 };
    }
    return null;
  };
  // Money is never inherited (data/costs/items.csv), so a money value is always in the market's own currency.
  const value = (item: CostItem, pt: Powertrain) => {
    const s = source(item, pt);
    if (!s) return null;
    return defs.get(item)?.money ? convert(s.row.value) : s.row.value;
  };
  const missing = a.costItems
    .filter((d) => d.required)
    .flatMap((d) => (['BEV', 'ICE'] as const).filter((pt) => !source(d.item as CostItem, pt)).map((pt) => ({ item: d.item as CostItem, pt })));
  const roadTax = a.roadTax.filter((r) => r.market === market).map((r) => (r.kind === 'discount_pct' ? r : { ...r, amount: convert(r.amount) }));
  const out = { market, currency, value, source, missing, roadTax };
  cache.set(a, out);
  return out;
}

/** The yearly road tax of a new car, from its weight (electric), engine size and, where taxed, CO₂ (petrol). */
export interface RoadTaxBase {
  /** Null = the market has no road-tax rows for the powertrain (a gap; a tax-free market says so with a 0 row). */
  amount: number | null;
  /** E.g. "band 1,750–2,000 kg", or the parts when several bases add up. */
  note: string;
  warning?: string;
}

type TaxBasis = Exclude<RoadTaxRow['basis'], 'age_years'>;
const TAX_UNIT: Record<TaxBasis, string> = { weight_kg: 'kg', engine_cc: 'cc', co2_g_km: 'g/km' };
const TAX_MISSING: Record<TaxBasis, string> = { weight_kg: 'Curb weight', engine_cc: 'Engine size (engine_cc)', co2_g_km: 'CO₂ emissions (co2_g_km)' };

const thousands = (v: number, digits = 0) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** The tax of one basis: its bands, or progressive rates per unit (each unit at the rate of its band). */
function taxPart(own: RoadTaxRow[], x: number, unit: string): RoadTaxBase & { amount: number } {
  if (own.some((r) => r.kind === 'per_unit')) {
    let amount = 0;
    for (const r of own) amount += Math.max(0, Math.min(x, r.upTo ?? Infinity) - r.above) * r.amount;
    return { amount, note: `${thousands(x)} ${unit}, progressive rate per ${unit}` };
  }
  const band = own.find((r) => x > r.above && (r.upTo === null || x <= r.upTo));
  if (band) return { amount: band.amount, note: `${thousands(x)} ${unit}: band ${thousands(band.above)}–${band.upTo === null ? '' : thousands(band.upTo)} ${unit}` };
  const last = own[own.length - 1];
  return {
    amount: last.amount,
    note: `${thousands(x)} ${unit}: above the table, highest band`,
    warning: `Road tax table ends at ${thousands(last.upTo ?? last.above)} ${unit}; the highest band is used`,
  };
}

export function roadTaxBase(rules: RoadTaxRow[], pt: Powertrain, weightKg: number, engineCc: number | null, co2GPerKm: number | null = null): RoadTaxBase {
  const own = rules.filter((r) => r.powertrain === pt && r.basis !== 'age_years').sort((x, y) => x.above - y.above);
  if (own.length === 0) return { amount: null, note: `missing in the market's data (road_tax.csv has no ${pt} rows)` };
  const values: Record<TaxBasis, number | null> = { weight_kg: weightKg, engine_cc: engineCc, co2_g_km: co2GPerKm };
  const bases = [...new Set(own.map((r) => r.basis as TaxBasis))];
  let amount = 0;
  const notes: string[] = [];
  const warnings: string[] = [];
  for (const b of bases) {
    const x = values[b];
    if (x === null) {
      notes.push(`${TAX_MISSING[b].split(' (')[0].toLowerCase()} missing`);
      warnings.push(`${TAX_MISSING[b]} missing: ${bases.length > 1 ? 'that part of the' : 'no'} road tax counted${bases.length > 1 ? ' is 0' : ''}`);
      continue;
    }
    const p = taxPart(own.filter((r) => r.basis === b), x, TAX_UNIT[b]);
    amount += p.amount;
    notes.push(bases.length > 1 ? `${thousands(x)} ${TAX_UNIT[b]} → ${thousands(p.amount, 2)}` : p.note);
    if (p.warning) warnings.push(p.warning);
  }
  return { amount, note: notes.join(' + '), warning: warnings.length ? warnings.join('; ') : undefined };
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
  /** Official CO₂ emissions (g/km), for road taxes that depend on CO₂. */
  co2GPerKm: number | null;
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
  /** Values the market's data lacks for this line (then value is null). */
  missing?: string[];
}

export interface Ownership {
  resale: number | null;
  lines: OwnershipLine[];
  warnings: string[];
  /** Values the market's data lacks for this car (each named once). */
  missing: string[];
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

  /** A line that cannot be calculated: the market's data lacks these values (and the user has not typed them). */
  const gap = (part: CostPartKey, label: string, what: (string | false)[]): OwnershipLine => {
    const missing = what.filter((w): w is string => !!w);
    return { part, label, value: null, missing, formula: `missing in the market's data: ${missing.join(', ')} (type a value on this page)` };
  };

  // Depreciation: the value falls by the same % each year.
  const dep = bev ? ci.depreciationBev : ci.depreciationIce;
  const resale = price === null || dep === null ? null : carValue(price, dep, years);
  if (price !== null && dep === null) lines.push(gap('depreciation', 'Depreciation', ['loss of value']));
  else
    lines.push({
      part: 'depreciation',
      label: 'Depreciation',
      value: price === null || resale === null ? null : price - resale,
      formula: price === null || resale === null || dep === null ? 'price missing' : `${money(price)} − value after ${thousands(years)} years at −${thousands(dep, 1)} %/year (${money(resale)})`,
    });

  // Insurance.
  const rate = bev ? ci.insuranceRateBev : ci.insuranceRateIce;
  const insMin = ci.insuranceMin;
  if (car.insurancePerYear !== null) {
    lines.push({ part: 'insurance', label: 'Voluntary insurance', value: car.insurancePerYear * years, formula: `${money(car.insurancePerYear)} (cars.csv) × ${thousands(years)} years` });
  } else if (price !== null) {
    if (rate === null || insMin === null || dep === null)
      lines.push(gap('insurance', 'Voluntary insurance', [rate === null && 'voluntary insurance', insMin === null && 'lowest premium', dep === null && 'loss of value']));
    else {
      let sum = 0;
      let first = 0;
      let last = 0;
      for (let y = 1; y <= nYears; y++) {
        const premium = Math.max((rate / 100) * carValue(price, dep, y - 1), insMin);
        if (y === 1) first = premium;
        last = premium;
        sum += premium * share(y);
      }
      lines.push({
        part: 'insurance',
        label: 'Voluntary insurance',
        value: sum,
        formula: `${thousands(rate, 1)} % of the value each year, at least ${money(insMin)}: ${money(first)} in year 1 … ${money(last)} in year ${nYears}`,
      });
    }
  } else if (insMin === null) lines.push(gap('insurance', 'Voluntary insurance', ['lowest premium']));
  else lines.push({ part: 'insurance', label: 'Voluntary insurance', value: insMin * years, formula: `price missing: the minimum ${money(insMin)} × ${thousands(years)} years` });
  const compulsory = ci.compulsoryInsurance;
  if (compulsory === null) lines.push(gap('insurance', 'Compulsory insurance', ['compulsory insurance']));
  else lines.push({ part: 'insurance', label: 'Compulsory insurance', value: compulsory * years, formula: `${money(compulsory)} × ${thousands(years)} years` });

  // Road tax.
  const tax = roadTaxBase(mc.roadTax, pt, car.curbKg, car.engineCc, car.co2GPerKm);
  if (tax.warning) warnings.push(tax.warning);
  if (tax.amount === null && ci.roadTaxPerYear !== null)
    lines.push({ part: 'tax', label: 'Road tax', value: ci.roadTaxPerYear * years, formula: `${money(ci.roadTaxPerYear)}/year (typed: the market has no road-tax table) × ${thousands(years)} years` });
  else if (tax.amount === null) lines.push(gap('tax', 'Road tax', ['road tax']));
  else {
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
  }

  // Servicing, repairs after the warranty, 12 V battery.
  const servicing = car.servicingPerYear ?? (bev ? ci.servicingBev : ci.servicingIce);
  if (servicing === null) lines.push(gap('servicing', 'Servicing', ['servicing']));
  else
    lines.push({
      part: 'servicing',
      label: 'Servicing',
      value: servicing * years,
      formula: `${money(servicing)}${car.servicingPerYear !== null ? ' (cars.csv)' : ''} × ${thousands(years)} years`,
    });
  const { repairsPct, warrantyYears } = ci;
  if (repairsPct === null || warrantyYears === null)
    lines.push(gap('servicing', 'Repairs after the warranty', [repairsPct === null && 'repairs after the warranty', warrantyYears === null && 'warranty']));
  else {
    const repairYears = Math.max(0, years - warrantyYears);
    lines.push({
      part: 'servicing',
      label: 'Repairs after the warranty',
      value: price === null ? null : (repairsPct / 100) * price * repairYears,
      formula: price === null ? 'price missing' : `${thousands(repairsPct, 1)} % of ${money(price)} × ${thousands(repairYears, 1)} years after ${thousands(warrantyYears)} years of warranty`,
    });
  }
  const { battery12vPrice, battery12vYears } = ci;
  if (battery12vPrice === null || battery12vYears === null)
    lines.push(gap('servicing', '12 V battery', [battery12vPrice === null && '12 V battery', battery12vYears === null && '12 V battery life']));
  else {
    const n12v = battery12vYears > 0 ? Math.max(0, Math.ceil(years / battery12vYears - 1e-9) - 1) : 0;
    lines.push({ part: 'servicing', label: '12 V battery', value: n12v * battery12vPrice, formula: `${n12v} × ${money(battery12vPrice)} (every ${thousands(battery12vYears)} years)` });
  }

  // Tyres: the tread worn, in proportion to the mass on the tyres.
  const refKg = mc.value('tyre_reference_kg', pt);
  const lifeKm = ci.tyreLifeKm;
  const set = car.tyreSetPrice ?? (car.carClass === 'premium' ? ci.tyreSetPremium : ci.tyreSetRegular);
  if (refKg === null || lifeKm === null || set === null) lines.push(gap('tyres', 'Tyres', [set === null && 'tyre set', lifeKm === null && 'tyre life', refKg === null && 'tyre reference mass']));
  else {
    const life = (lifeKm * refKg) / car.massKg;
    lines.push({
      part: 'tyres',
      label: 'Tyres',
      value: life > 0 ? (totalKm / life) * set : 0,
      formula: `${thousands(totalKm)} km ÷ ${thousands(life)} km per set (${thousands(lifeKm)} km × ${thousands(refKg)} kg ÷ ${thousands(car.massKg)} kg) × ${money(set)}${car.tyreSetPrice !== null ? ' (cars.csv)' : ''}`,
    });
  }
  return { resale, lines, warnings, missing: [...new Set(lines.flatMap((l) => l.missing ?? []))] };
}

/**
 * Sums the lines into the parts of the chart (in PART_ORDER). A part is null when the price is missing (depreciation)
 * or one of its lines lacks a value in the market's data.
 */
export function sumParts(lines: OwnershipLine[]): CostPart[] {
  return PART_ORDER.map((key) => {
    const own = lines.filter((l) => l.part === key);
    const unknown = own.some((l) => (l.value === null && key === 'depreciation') || (l.missing?.length ?? 0) > 0);
    return { key, label: PART_LABELS[key], value: unknown ? null : own.reduce((s, l) => s + (l.value ?? 0), 0) };
  });
}
