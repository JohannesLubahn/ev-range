// The car list: market, filters, sorting and grouping. Pure functions (no React), tested in tests/carList.test.ts.
import { parseNumber } from '../data/parse';
import type { DerivedCar } from '../engine/derive';
import { compact } from '../format';

/** Market id that lists every car, whatever its market. */
export const ALL_MARKETS = 'all';

export interface Filters {
  search: string;
  /** Price range in the display currency; null = open. */
  priceMin: number | null;
  priceMax: number | null;
  /** Body types to show; empty = all. */
  bodyTypes: string[];
  /** Battery chemistries (or "ICE") to show; empty = all. */
  chemistries: string[];
  /** At least this many seats; null = any. Cars without a seat count stay visible. */
  minSeats: number | null;
}

export const EMPTY_FILTERS: Filters = { search: '', priceMin: null, priceMax: null, bodyTypes: [], chemistries: [], minSeats: null };

/** Filters saved by older versions had `maxPriceM` (millions of the display currency) and no other new fields. */
export function migrateFilters(raw: unknown): Filters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const oldMax = numOrNull(r.maxPriceM);
  return {
    search: typeof r.search === 'string' ? r.search : '',
    priceMin: numOrNull(r.priceMin),
    priceMax: numOrNull(r.priceMax) ?? (oldMax === null ? null : oldMax * 1e6),
    bodyTypes: strings(r.bodyTypes),
    chemistries: strings(r.chemistries),
    minSeats: numOrNull(r.minSeats),
  };
}

export function hasFilters(f: Filters): boolean {
  return f.search.trim() !== '' || f.priceMin !== null || f.priceMax !== null || f.bodyTypes.length > 0 || f.chemistries.length > 0 || f.minSeats !== null;
}

export type ListSortKey = 'model' | 'price' | 'range' | 'battery' | 'accel' | 'seats' | 'consumption';
export interface ListSort {
  key: ListSortKey;
  dir: 1 | -1;
}
/** Sort options with the direction a click on them starts with. */
export const LIST_SORTS: { id: ListSortKey; label: string; dir: 1 | -1 }[] = [
  { id: 'model', label: 'Model (A–Z)', dir: 1 },
  { id: 'price', label: 'Price', dir: 1 },
  { id: 'range', label: 'Rated range', dir: -1 },
  { id: 'battery', label: 'Battery size', dir: -1 },
  { id: 'consumption', label: 'Rated consumption', dir: 1 },
  { id: 'accel', label: '0–100 km/h', dir: 1 },
  { id: 'seats', label: 'Seats', dir: -1 },
];

export type ListGroupKey = 'none' | 'brand' | 'bodyType' | 'priceBand';
export const LIST_GROUPS: { id: ListGroupKey; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'brand', label: 'Brand' },
  { id: 'bodyType', label: 'Body type' },
  { id: 'priceBand', label: 'Price band' },
];

export function inMarket(d: DerivedCar, market: string): boolean {
  return market === ALL_MARKETS || d.car.market === market;
}

export function chemistryOf(d: DerivedCar): string {
  return d.isIce ? 'ICE' : (d.chemistry ?? '');
}

export function seatsOf(d: DerivedCar): number | null {
  return parseNumber(d.car.raw.seats);
}

/** Model key: brand + model, so that variants of one model sit together. A blank model means the name is the model. */
export function modelKey(d: DerivedCar): string {
  return `${d.car.brand}|${d.car.model ?? d.car.name}`.toLowerCase();
}

export function modelLabel(d: DerivedCar): string {
  return d.car.model ? `${d.car.brand} ${d.car.model}`.trim() : d.car.name;
}

/** Label of a variant row under its model. */
export function variantLabel(d: DerivedCar): string {
  return d.car.variant ?? 'base';
}

export function matchesFilters(d: DerivedCar, f: Filters): boolean {
  const q = f.search.trim().toLowerCase();
  if (q) {
    const text = [d.car.name, d.car.brand, d.car.model, d.car.variant, d.bodyType].filter(Boolean).join(' ').toLowerCase();
    if (!q.split(/\s+/).every((w) => text.includes(w))) return false;
  }
  const price = d.priceDisplay.value;
  if (f.priceMin !== null && (price === null || price < f.priceMin)) return false;
  if (f.priceMax !== null && price !== null && price > f.priceMax) return false;
  if (f.bodyTypes.length && !f.bodyTypes.includes(d.bodyType)) return false;
  if (f.chemistries.length && !f.chemistries.includes(chemistryOf(d))) return false;
  const seats = seatsOf(d);
  if (f.minSeats !== null && seats !== null && seats < f.minSeats) return false;
  return true;
}

/** Ids of the cars shown: in the market and passing the filters, in data order. */
export function shownIds(derived: DerivedCar[], market: string, f: Filters): string[] {
  return derived.filter((d) => inMarket(d, market) && matchesFilters(d, f)).map((d) => d.car.id);
}

/** Options for the filter chips, from the cars of the market. */
export function filterOptions(derived: DerivedCar[], market: string) {
  const cars = derived.filter((d) => inMarket(d, market));
  const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));
  const prices = cars.map((d) => d.priceDisplay.value).filter((v): v is number => v !== null);
  return {
    bodyTypes: uniq(cars.map((d) => d.bodyType).filter(Boolean)).sort(),
    chemistries: uniq(cars.map(chemistryOf).filter(Boolean)).sort(),
    seats: uniq(cars.map(seatsOf).filter((v): v is number => v !== null)).sort((x, y) => x - y),
    priceMax: prices.length ? Math.max(...prices) : null,
  };
}

export function sortValue(d: DerivedCar, key: ListSortKey): number | null {
  switch (key) {
    case 'price':
      return d.priceDisplay.value;
    case 'range':
      return d.ratedRangeKm;
    case 'battery':
      return d.isIce ? null : d.batteryKwh;
    case 'consumption':
      return d.isIce ? null : d.consumption.value;
    case 'accel':
      return parseNumber(d.car.raw.accel_0_100_s);
    case 'seats':
      return seatsOf(d);
    default:
      return null;
  }
}

const byName = (x: DerivedCar, y: DerivedCar) =>
  modelLabel(x).localeCompare(modelLabel(y)) || (x.car.variant ?? '').localeCompare(y.car.variant ?? '') || x.car.name.localeCompare(y.car.name);

/** Compares two cars by the sort; blanks last in both directions, ties by name. */
export function compareCars(x: DerivedCar, y: DerivedCar, sort: ListSort): number {
  if (sort.key === 'model') return sort.dir * byName(x, y);
  const a = sortValue(x, sort.key);
  const b = sortValue(y, sort.key);
  if (a === null || b === null) return a === b ? byName(x, y) : a === null ? 1 : -1;
  return sort.dir * (a - b) || byName(x, y);
}

/**
 * Round band edges (1-2-2.5-5 steps) for grouping by price: at most 6 bands over the range of the prices. Empty if
 * the prices do not spread.
 */
export function priceBandEdges(prices: number[]): number[] {
  const ps = prices.filter((p) => Number.isFinite(p));
  if (ps.length < 2) return [];
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  if (hi <= lo) return [];
  const edgesFor = (step: number) => {
    const out: number[] = [];
    for (let e = Math.floor(lo / step + 1) * step; e < hi; e += step) out.push(Math.round(e / step) * step);
    return out;
  };
  for (let k = Math.floor(Math.log10(hi - lo)) - 2; k <= Math.ceil(Math.log10(hi)) + 1; k++) {
    for (const m of [1, 2, 2.5, 5]) {
      const edges = edgesFor(m * 10 ** k);
      if (edges.length <= 5) return edges;
    }
  }
  return [];
}

function priceBand(price: number | null, edges: number[], currency: string): { key: string; label: string; order: number } {
  if (price === null) return { key: 'none', label: 'No price', order: 1e9 };
  const i = edges.findIndex((e) => price < e);
  const band = i === -1 ? edges.length : i;
  const label =
    band === 0 ? `Under ${compact(edges[0])}` : band === edges.length ? `${compact(edges[band - 1])} and more` : `${compact(edges[band - 1])} – ${compact(edges[band])}`;
  return { key: `b${band}`, label: `${label} ${currency}`, order: band };
}

export interface ListModel {
  key: string;
  label: string;
  cars: DerivedCar[];
}

export interface ListGroup {
  key: string;
  /** Empty when the list is not grouped. */
  label: string;
  models: ListModel[];
  ids: string[];
}

/**
 * The cars sorted and grouped for the list. Variants of one model always stay together: a model ranks by its first
 * variant in the sort, and its variants follow in sort order.
 */
export function listCars(cars: DerivedCar[], sort: ListSort, group: ListGroupKey, currency: string): ListGroup[] {
  const edges = group === 'priceBand' ? priceBandEdges(cars.map((d) => d.priceDisplay.value).filter((v): v is number => v !== null)) : [];
  const groupOf = (d: DerivedCar): { key: string; label: string; order: number | string } => {
    switch (group) {
      case 'brand':
        return { key: d.car.brand.toLowerCase() || '-', label: d.car.brand || 'No brand', order: (d.car.brand || '~').toLowerCase() };
      case 'bodyType':
        return { key: d.bodyType || '-', label: d.bodyType ? d.bodyType.charAt(0).toUpperCase() + d.bodyType.slice(1) : 'No body type', order: (d.bodyType || '~').toLowerCase() };
      case 'priceBand':
        return edges.length ? priceBand(d.priceDisplay.value, edges, currency) : { key: 'all', label: '', order: 0 };
      default:
        return { key: 'all', label: '', order: 0 };
    }
  };
  const sorted = [...cars].sort((x, y) => compareCars(x, y, sort));
  const groups = new Map<string, { key: string; label: string; order: number | string; models: Map<string, ListModel> }>();
  for (const d of sorted) {
    const g = groupOf(d);
    if (!groups.has(g.key)) groups.set(g.key, { ...g, models: new Map() });
    const models = groups.get(g.key)!.models;
    const mk = modelKey(d);
    if (!models.has(mk)) models.set(mk, { key: mk, label: modelLabel(d), cars: [] });
    models.get(mk)!.cars.push(d);
  }
  return Array.from(groups.values())
    .sort((x, y) => (typeof x.order === 'number' && typeof y.order === 'number' ? x.order - y.order : String(x.order).localeCompare(String(y.order))))
    .map((g) => {
      const models = Array.from(g.models.values());
      return { key: g.key, label: g.label, models, ids: models.flatMap((m) => m.cars.map((d) => d.car.id)) };
    });
}
