import Papa from 'papaparse';
import type {
  AssumptionDef,
  Basis,
  Bloc,
  BodyType,
  Car,
  Chemistry,
  CostItemDef,
  Cycle,
  Dataset,
  DegradationMeasurement,
  FactsTabRow,
  FieldDef,
  Market,
  OnboardClass,
  OnboardMeasurement,
  ProfileDef,
  ProfileSpeedKind,
  RealWorldFuelRow,
  RoadTaxRow,
  RunningCostRow,
  TerrainPreset,
  Source,
  StandardRow,
} from './types';
import { BASES } from './types';
import { CONDITION_INPUTS, TEST_KEYS, TRIP_INPUTS, parseInputValue, spreadsheetValue, type InputKind, type TestKey } from '../engine/inputs';
import { COST_ITEMS } from '../engine/costItems';

/** The files of one folder data/markets/<id>/. */
export interface MarketFolderFiles {
  costs?: string;
  roadTax?: string;
  /** The cars the market sells (offers.csv). */
  offers?: string;
}

/** The raw text of every data file. Used for the bundled /data files and for CSV files loaded in the browser. */
export interface RawFiles {
  /** data/cars.csv: one numbered row per car (joined with the offers), or a file with one row per car and market. */
  cars: string;
  fields: string;
  assumptions: string;
  bodyTypes: string;
  onboardClasses: string;
  factsTab: string;
  onboardMeasurements: string;
  degradationMeasurements: string;
  sources: string;
  /** data/markets.csv; optional so a cars file loaded on its own still works. */
  markets?: string;
  /** data/blocs.csv: groups of markets that pass cost values on (optional like markets). */
  blocs?: string;
  /** data/costs/items.csv: the cost items every market folder follows (optional like markets). */
  costItems?: string;
  /** The files of each folder data/markets/<id>/ (a market or bloc id): costs.csv, road_tax.csv and offers.csv. */
  marketFiles?: Record<string, MarketFolderFiles>;
  /** data/terrain.csv (optional like markets). */
  terrain?: string;
  /** data/profiles.csv: the driving profiles. */
  profiles?: string;
  /** data/real_world_fuel.csv: measured drives of petrol cars (optional like markets). */
  realWorldFuel?: string;
  chemistries: string;
  ocv: string;
  temperature: string;
  calendarSoc: string;
  cyclesIndex: string;
  /** Cycle trace files by file name (e.g. "wltc3b.csv"). */
  cycles: Record<string, string>;
  /** data/standard.csv: the standard inputs of every test. */
  standard: string;
}

export type Row = Record<string, string>;

export function parseCsv(text: string): { rows: Row[]; columns: string[] } {
  const result = Papa.parse<Row>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });
  return { rows: result.data, columns: result.meta.fields ?? [] };
}

/** Parses a number written with "." or "," as decimal separator. Blank → null. */
export function parseNumber(value: string | undefined, warnings?: string[], where?: string): number | null {
  if (value === undefined) return null;
  const s = value.replace(/\s/g, '');
  if (s === '') return null;
  const normalised = /^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s;
  const n = Number(normalised);
  if (!Number.isFinite(n)) {
    warnings?.push(`${where ?? 'value'}: "${value}" is not a number and was ignored`);
    return null;
  }
  return n;
}

function num(row: Row, key: string, warnings: string[], where: string): number | null {
  return parseNumber(row[key], warnings, `${where}, column ${key}`);
}

/** yes/no (also true/false, 1/0, ja/nein) → boolean; blank → null. */
export function parseYesNo(value: string | undefined, warnings?: string[], where?: string): boolean | null {
  const s = (value ?? '').trim().toLowerCase();
  if (s === '') return null;
  if (['yes', 'y', 'true', '1', 'ja', 'x'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'nein'].includes(s)) return false;
  warnings?.push(`${where ?? 'value'}: "${value}" is not yes or no and was ignored`);
  return null;
}

function req(row: Row, key: string, warnings: string[], where: string, fallback = 0): number {
  const v = num(row, key, warnings, where);
  if (v === null) {
    warnings.push(`${where}: column ${key} is empty`);
    return fallback;
  }
  return v;
}

/** Where a row of the car table came from: a row of a market's offers.csv joined with its car in cars.csv. */
interface CarOrigin {
  /** e.g. "markets/TH/offers.csv". */
  file: string;
  line: number;
  /** The car's number in cars.csv. */
  car: string;
  /** Columns the offer filled; the others come from cars.csv. */
  fromOffer: string[];
  /** Columns of cars.csv for which the offer gives another value: the car differs in this market. */
  marketColumns: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * A cars file with one row per car and market (a market column): the layout before Nov 2026 and of the Cars page's
 * download. data/cars.csv itself has one numbered row per car, shared by every market.
 */
export function isPerMarketCarsFile(columns: string[]): boolean {
  return columns.includes('market');
}

/** A cars file with one row per car and market, read as it is. */
export function parseCars(text: string, warnings: string[]): { cars: Car[]; columns: string[] } {
  const { rows, columns } = parseCsv(text);
  return { cars: carsFromRows(rows, warnings), columns };
}

/** The car table as one file with one row per car and market (the Cars page's download); it loads back as it is. */
export function perMarketCarsCsv(ds: { cars: Car[]; carColumns: string[] }): string {
  const data = ds.cars.map((c) => ds.carColumns.map((k) => (k === 'id' ? c.id : (c.raw[k] ?? ''))));
  return `${Papa.unparse({ fields: ds.carColumns, data }, { newline: '\n' })}\n`;
}

/** Columns only a market's offers.csv has: prices are in the market's currency, and the market is the folder. */
export const OFFER_COLUMNS = ['car', 'market', 'currency', 'price', 'energy_price', 'maintenance_per_year', 'insurance_per_year', 'tyre_set_price'];
/** Local names: an offer may name the car differently; that is not a different car. */
const NAME_COLUMNS = ['name', 'brand', 'model', 'variant'];
/** Columns where the offer's text is added to the car's (the price has its own sources and notes). */
const ADDED_COLUMNS = ['source_url', 'notes', 'updated'];

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function joinNotes(a: string, b: string): string {
  if (!a || !b) return a || b;
  return /[.!?]$/.test(a) ? `${a} ${b}` : `${a}. ${b}`;
}

/**
 * The car table: each row of a market's offers.csv (data/markets/<id>/) joined with its car in cars.csv (one numbered
 * row per car, shared by every market that sells it). The offer gives the local name, the price in the market's
 * currency and any value that differs in that market; everything else comes from cars.csv.
 */
export function joinCars(
  specs: { rows: Row[]; columns: string[] },
  offerFiles: Record<string, string>,
  markets: Market[],
  blocs: Bloc[],
  warnings: string[],
): { cars: Car[]; columns: string[] } {
  const byNo = new Map<string, Row>();
  const misplaced = new Set<string>();
  specs.rows.forEach((r, i) => {
    const no = (r.id ?? '').trim();
    if (!/^\d+$/.test(no)) {
      warnings.push(`cars.csv row ${i + 2}: id "${no}" is not a number; row ignored (offers.csv refers to cars by number)`);
      return;
    }
    if (byNo.has(no)) {
      warnings.push(`cars.csv row ${i + 2}: number ${no} is used twice; the second row is ignored`);
      return;
    }
    for (const c of OFFER_COLUMNS) if (r[c]) misplaced.add(c);
    byNo.set(no, r);
  });
  for (const c of misplaced) warnings.push(`cars.csv: column ${c} belongs in the markets' offers.csv (data/markets/<id>/); ignored`);
  const specColumns = specs.columns.filter((c) => c !== 'id' && !OFFER_COLUMNS.includes(c));
  const columns = ['id', 'car', 'market', 'currency', ...specColumns];
  const rows: Row[] = [];
  const origins: CarOrigin[] = [];
  const offered = new Set<string>();
  // A folder that is neither a market nor a bloc is reported with its cost files.
  for (const folder of Object.keys(offerFiles))
    if (blocs.some((b) => b.id === folder.toUpperCase()))
      warnings.push(`markets/${folder}/offers.csv: a bloc sells no cars itself; list them in each market's offers.csv (ignored)`);
  // Markets in the order of markets.csv, cars in the order of their offers.csv.
  for (const market of markets) {
    const folder = Object.keys(offerFiles).find((f) => f.toUpperCase() === market.id);
    if (folder === undefined) continue;
    const marketId = market.id;
    const file = `markets/${folder}/offers.csv`;
    const offers = parseCsv(offerFiles[folder]);
    for (const c of offers.columns) {
      if (c === 'market' || c === 'currency') warnings.push(`${file}: column ${c} is set by the folder and markets.csv; ignored`);
      else if (!columns.includes(c)) columns.push(c);
    }
    offers.rows.forEach((o, i) => {
      const line = i + 2;
      const no = (o.car ?? '').trim();
      const spec = byNo.get(no);
      if (!spec) {
        warnings.push(`${file} row ${line}: car "${no}" is not a number in cars.csv; row ignored`);
        return;
      }
      offered.add(no);
      const row: Row = {};
      for (const c of specColumns) row[c] = spec[c] ?? '';
      const fromOffer: string[] = [];
      const marketColumns: string[] = [];
      for (const [k, v] of Object.entries(o)) {
        if (v === '' || ADDED_COLUMNS.includes(k) || k === 'car' || k === 'market' || k === 'currency') continue;
        if (specColumns.includes(k) && !NAME_COLUMNS.includes(k) && (spec[k] ?? '') !== v) marketColumns.push(k);
        row[k] = v;
        fromOffer.push(k);
      }
      row.id = o.id || `${slug(row.name ?? '')}-${folder.toLowerCase()}`;
      row.car = no;
      row.market = marketId;
      row.currency = market.currency;
      const urls = [o.source_url, spec.source_url].flatMap((u) => (u ?? '').split(';').map((x) => x.trim()));
      row.source_url = [...new Set(urls.filter(Boolean))].join(' ; ');
      row.notes = joinNotes(o.notes ?? '', spec.notes ?? '');
      row.updated = [o.updated ?? '', spec.updated ?? ''].sort().pop() ?? '';
      // A wrong number would give the car another maker's specs: the local name must contain the brand.
      const brand = plain(row.brand ?? '').split(/[\s-]+/).filter(Boolean);
      if (o.name && brand.length && !brand.some((b) => plain(o.name).includes(b)))
        warnings.push(`${file} row ${line}: "${o.name}" does not contain the brand of car ${no} in cars.csv (${row.brand}); check the number`);
      rows.push(row);
      origins.push({ file, line, car: no, fromOffer, marketColumns });
    });
  }
  const idle = [...byNo.keys()].filter((no) => !offered.has(no));
  if (idle.length) {
    const list = idle.slice(0, 5).map((no) => `${no} ${byNo.get(no)!.name ?? ''}`.trim());
    warnings.push(`cars.csv: ${idle.length === 1 ? 'car' : `${idle.length} cars`} in no market's offers.csv: ${list.join(', ')}${idle.length > 5 ? ', …' : ''}`);
  }
  return { cars: carsFromRows(rows, warnings, origins), columns };
}

function carsFromRows(rows: Row[], warnings: string[], origins?: CarOrigin[]): Car[] {
  const seen = new Set<string>();
  const cars: Car[] = [];
  rows.forEach((row, i) => {
    const o = origins?.[i];
    const name = row.name ?? '';
    let id = slug(row.id ?? '');
    if (!id) id = slug(name) || `car-${i + 1}`;
    if (seen.has(id)) {
      warnings.push(`${o ? `${o.file} row ${o.line}` : `cars.csv row ${i + 2}`}: id "${id}" is used twice; renamed to "${id}-${i + 2}"`);
      id = `${id}-${i + 2}`;
    }
    seen.add(id);
    const where = `${o ? o.file : 'cars.csv'}, ${name || id}`;
    // A value from cars.csv is reported once for the car, not once per market that sells it.
    const at = (key: string) => (o && !o.fromOffer.includes(key) ? `cars.csv, car ${o.car}` : where);
    const ranges: Partial<Record<Basis, number>> = {};
    for (const b of BASES) {
      const key = `range_${b.toLowerCase()}_km`;
      const v = num(row, key, warnings, at(key));
      if (v !== null) ranges[b] = v;
    }
    const basisRaw = (row.consumption_basis ?? '').toUpperCase();
    const basis = (BASES as string[]).includes(basisRaw) ? (basisRaw as Basis) : null;
    if (basisRaw && !basis) warnings.push(`${at('consumption_basis')}: consumption_basis "${row.consumption_basis}" is not one of ${BASES.join(', ')}`);
    cars.push({
      id,
      name: name || id,
      brand: row.brand ?? '',
      model: row.model || null,
      variant: row.variant || null,
      market: (row.market ?? '').toUpperCase(),
      currency: (row.currency || 'THB').toUpperCase(),
      price: num(row, 'price', warnings, at('price')),
      powertrain: (row.powertrain ?? '').toUpperCase() === 'ICE' ? 'ICE' : 'BEV',
      bodyType: row.body_type ?? '',
      carClass: (row.car_class || 'regular').toLowerCase(),
      batteryKwh: num(row, 'battery_kwh', warnings, at('battery_kwh')),
      endOfLifeCapacityPct: num(row, 'end_of_life_capacity_pct', warnings, at('end_of_life_capacity_pct')),
      batteryType: row.battery_type ? row.battery_type.toUpperCase() : null,
      batteryCycles: num(row, 'battery_cycles', warnings, at('battery_cycles')),
      batteryCyclesSources: ids(row.battery_cycles_source),
      consumptionKwhPerKm: num(row, 'consumption_kwh_per_km', warnings, at('consumption_kwh_per_km')),
      ranges,
      consumptionBasis: basis,
      chargeFromPct: num(row, 'charge_from_pct', warnings, at('charge_from_pct')),
      chargeToPct: num(row, 'charge_to_pct', warnings, at('charge_to_pct')),
      chargeTimeMin: num(row, 'charge_time_min', warnings, at('charge_time_min')),
      fastWindowFromPct: num(row, 'fast_window_from_pct', warnings, at('fast_window_from_pct')),
      fastWindowToPct: num(row, 'fast_window_to_pct', warnings, at('fast_window_to_pct')),
      dragCoefficient: num(row, 'drag_coefficient', warnings, at('drag_coefficient')),
      frontalAreaM2: num(row, 'frontal_area_m2', warnings, at('frontal_area_m2')),
      widthMm: num(row, 'width_mm', warnings, at('width_mm')),
      heightMm: num(row, 'height_mm', warnings, at('height_mm')),
      weightKg: num(row, 'weight_kg', warnings, at('weight_kg')),
      tyreRr: num(row, 'tyre_rr', warnings, at('tyre_rr')),
      heatPump: parseYesNo(row.heat_pump, warnings, `${at('heat_pump')}, column heat_pump`),
      powerKw: num(row, 'power_kw', warnings, at('power_kw')),
      energyPrice: num(row, 'energy_price', warnings, at('energy_price')),
      maintenancePerYear: num(row, 'maintenance_per_year', warnings, at('maintenance_per_year')),
      insurancePerYear: num(row, 'insurance_per_year', warnings, at('insurance_per_year')),
      tyreSetPrice: num(row, 'tyre_set_price', warnings, at('tyre_set_price')),
      engineCc: num(row, 'engine_cc', warnings, at('engine_cc')),
      co2GPerKm: num(row, 'co2_g_km', warnings, at('co2_g_km')),
      topSpeedKmh: num(row, 'top_speed_kmh', warnings, at('top_speed_kmh')),
      specId: o?.car ?? (row.car || null),
      marketColumns: o?.marketColumns ?? [],
      notes: row.notes ?? '',
      raw: { ...row },
    });
  });
  return cars;
}

/** data/markets.csv: one row per market (its currency). */
export function parseMarkets(text: string, warnings: string[]): Market[] {
  const seen = new Set<string>();
  const out: Market[] = [];
  for (const r of parseCsv(text).rows) {
    const id = (r.id ?? '').trim().toUpperCase();
    if (!id) continue;
    if (seen.has(id)) {
      warnings.push(`markets.csv: market "${id}" is listed twice; the second row is ignored`);
      continue;
    }
    seen.add(id);
    if (!MARKET_ID.test(id)) warnings.push(`markets.csv: "${id}" is not an ISO 3166 code (e.g. DE, or US-CA for a state)`);
    out.push({
      id,
      name: r.name || id,
      parent: (r.parent ?? '').trim().toUpperCase() || null,
      currency: (r.currency || 'THB').toUpperCase(),
      description: r.description ?? '',
      source: r.source ?? '',
    });
  }
  return out;
}

/** Market ids: ISO 3166-1 alpha-2, or ISO 3166-2 for a state or province (US-CA). */
const MARKET_ID = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

/** data/blocs.csv: groups of markets that pass cost values on (World, EU). */
export function parseBlocs(text: string, warnings: string[]): Bloc[] {
  const out: Bloc[] = [];
  for (const r of parseCsv(text).rows) {
    const id = (r.id ?? '').trim().toUpperCase();
    if (!id) continue;
    if (out.some((b) => b.id === id)) {
      warnings.push(`blocs.csv: bloc "${id}" is listed twice; the second row is ignored`);
      continue;
    }
    out.push({ id, name: r.name || id, parent: (r.parent ?? '').trim().toUpperCase() || null, description: r.description ?? '', source: r.source ?? '' });
  }
  return out;
}

const yes = (v: string | undefined) => /^(yes|true|1)$/i.test((v ?? '').trim());

/**
 * data/costs/items.csv: the cost items. Every item the cost of ownership uses (COST_ITEMS) must be listed; money is
 * never inherited (a bloc has no currency).
 */
export function parseCostItems(text: string, warnings: string[]): CostItemDef[] {
  const out: CostItemDef[] = [];
  for (const r of parseCsv(text).rows) {
    const item = (r.item ?? '').trim();
    if (!item) continue;
    if (!(COST_ITEMS as readonly string[]).includes(item)) {
      warnings.push(`costs/items.csv: "${item}" is not used by the cost of ownership (known: ${COST_ITEMS.join(', ')})`);
      continue;
    }
    const money = yes(r.money);
    let inherit = yes(r.inherit);
    if (money && inherit) {
      warnings.push(`costs/items.csv: ${item} is money and cannot be inherited (blocs have no currency)`);
      inherit = false;
    }
    out.push({ item, label: r.label || item, unit: r.unit ?? '', money, inherit, required: yes(r.required), description: r.description ?? '' });
  }
  for (const item of COST_ITEMS) if (!out.some((d) => d.item === item)) warnings.push(`costs/items.csv: ${item} is missing`);
  return out;
}

/** Parents of markets and blocs must exist, without loops; bloc ids must differ from market ids. */
function checkHierarchy(markets: Market[], blocs: Bloc[], warnings: string[]): void {
  const parent = new Map<string, string | null>([...blocs.map((b) => [b.id, b.parent] as const), ...markets.map((m) => [m.id, m.parent] as const)]);
  for (const b of blocs) if (markets.some((m) => m.id === b.id)) warnings.push(`blocs.csv: "${b.id}" is also a market id`);
  for (const [id, p] of parent) {
    if (p !== null && !parent.has(p)) warnings.push(`${markets.some((m) => m.id === id) ? 'markets' : 'blocs'}.csv: parent "${p}" of ${id} is neither a bloc nor a market`);
    const seen = new Set([id]);
    for (let q = p; q !== null && q !== undefined; q = parent.get(q) ?? null) {
      if (seen.has(q)) {
        warnings.push(`markets.csv / blocs.csv: the parents of ${id} go round in a loop`);
        break;
      }
      seen.add(q);
    }
  }
}

export function parseDataset(files: RawFiles): Dataset {
  const warnings: string[] = [];
  const markets = parseMarkets(files.markets ?? '', warnings);
  const marketIds = new Set(markets.map((m) => m.id));
  const blocs = parseBlocs(files.blocs ?? '', warnings);
  const carsFile = parseCsv(files.cars);
  const offerFiles: Record<string, string> = {};
  for (const [folder, f] of Object.entries(files.marketFiles ?? {})) if (f.offers) offerFiles[folder] = f.offers;
  const { cars, columns } = isPerMarketCarsFile(carsFile.columns)
    ? { cars: carsFromRows(carsFile.rows, warnings), columns: carsFile.columns }
    : joinCars(carsFile, offerFiles, markets, blocs, warnings);

  const fields: FieldDef[] = parseCsv(files.fields).rows.map((r) => ({
    key: r.key,
    label: r.label || r.key,
    unit: r.unit ?? '',
    group: r.group || 'Other',
    type: r.type || 'text',
    better: r.better === 'higher' || r.better === 'lower' ? r.better : '',
    description: r.description ?? '',
  }));

  const assumptions: Record<string, AssumptionDef> = {};
  for (const r of parseCsv(files.assumptions).rows) {
    assumptions[r.key] = {
      key: r.key,
      value: r.value ?? '',
      unit: r.unit ?? '',
      label: r.label || r.key,
      group: r.group || 'Other',
      description: r.description ?? '',
      source: r.source ?? '',
    };
  }

  for (const c of cars) {
    if (c.market && !marketIds.has(c.market)) warnings.push(`cars.csv, ${c.name}: market "${c.market}" is not in markets.csv (listed only under All markets)`);
  }

  const bodyTypes: Record<string, BodyType> = {};
  for (const r of parseCsv(files.bodyTypes).rows) {
    const where = `body_types.csv, ${r.body_type}`;
    bodyTypes[r.body_type.toLowerCase()] = {
      bodyType: r.body_type,
      dragCoefficient: req(r, 'drag_coefficient', warnings, where, 0.3),
      frontalAreaM2: req(r, 'frontal_area_m2', warnings, where, 2.4),
      description: r.description ?? '',
      source: r.source ?? '',
    };
  }

  const onboardClasses: Record<string, OnboardClass> = {};
  for (const r of parseCsv(files.onboardClasses).rows) {
    const where = `onboard/classes.csv, ${r.class}`;
    onboardClasses[r.class.toLowerCase()] = {
      carClass: r.class.toLowerCase(),
      label: r.label || r.class,
      generalKw: req(r, 'general_kw', warnings, where),
      infotainmentKw: req(r, 'infotainment_kw', warnings, where),
      autonomousDrivingKw: req(r, 'autonomous_driving_kw', warnings, where),
      cabinUaWPerK: req(r, 'cabin_ua_w_per_k', warnings, where, 45),
      freshAirHeatingM3h: req(r, 'fresh_air_heating_m3_h', warnings, where, 100),
      freshAirCoolingM3h: req(r, 'fresh_air_cooling_m3_h', warnings, where, 45),
      solarAreaM2: req(r, 'solar_area_m2', warnings, where, 1),
      cabinHeatCapacityKjPerK: req(r, 'cabin_heat_capacity_kj_per_k', warnings, where, 200),
      blowerKw: req(r, 'blower_kw', warnings, where, 0.1),
      description: r.description ?? '',
      source: r.source ?? '',
    };
  }

  const factsTab: FactsTabRow[] = parseCsv(files.factsTab)
    .rows.map((r) => {
      const where = `onboard/facts_tab.csv, ${r.temperature_c} °C`;
      return {
        temperatureC: req(r, 'temperature_c', warnings, where),
        baseRegularKw: req(r, 'base_regular_kw', warnings, where),
        basePremiumKw: req(r, 'base_premium_kw', warnings, where),
        cabinRegularKw: req(r, 'cabin_regular_kw', warnings, where),
        cabinPremiumKw: req(r, 'cabin_premium_kw', warnings, where),
        batteryKw: req(r, 'battery_kw', warnings, where),
        note: r.note ?? '',
      };
    })
    .sort((a, b) => a.temperatureC - b.temperatureC);

  const degradationMeasurements: DegradationMeasurement[] = parseCsv(files.degradationMeasurements).rows.map((r) => {
    const where = `battery/degradation_measurements.csv, ${r.id}`;
    return {
      id: r.id,
      chemistry: (r.chemistry ?? '').toUpperCase(),
      vehicle: r.vehicle ?? '',
      nominalKwh: req(r, 'nominal_kwh', warnings, where, 60),
      ratedCycles: req(r, 'rated_cycles', warnings, where, 1000),
      kwhPerKm: req(r, 'kwh_per_km', warnings, where, 0.16),
      km: req(r, 'km', warnings, where),
      years: req(r, 'years', warnings, where, 1),
      temperatureC: req(r, 'temperature_c', warnings, where, 20),
      dcSharePct: num(r, 'dc_share_pct', warnings, where),
      highSocTimePct: num(r, 'high_soc_time_pct', warnings, where),
      fastChargeCRate: num(r, 'fast_charge_c_rate', warnings, where),
      measuredSohPct: req(r, 'measured_soh_pct', warnings, where, 100),
      sourceId: r.source_id ?? '',
      notes: r.notes ?? '',
    };
  });

  const onboardMeasurements: OnboardMeasurement[] = parseCsv(files.onboardMeasurements).rows.map((r) => {
    const where = `onboard/measurements.csv, ${r.id}`;
    const compare = r.compare === 'electronics' || r.compare === 'total' ? r.compare : 'climate';
    return {
      id: r.id,
      source: r.source ?? '',
      vehicle: r.vehicle ?? '',
      carClass: (r.car_class || 'regular').toLowerCase(),
      heatPump: parseYesNo(r.heat_pump, warnings, where) ?? false,
      airC: req(r, 'air_c', warnings, where),
      cabinC: req(r, 'cabin_c', warnings, where, 22),
      solarWm2: num(r, 'solar_w_m2', warnings, where) ?? 0,
      humidityPct: num(r, 'humidity_pct', warnings, where) ?? 50,
      speedKmh: num(r, 'speed_kmh', warnings, where) ?? 0,
      occupants: num(r, 'occupants', warnings, where) ?? 0,
      measuredKw: num(r, 'measured_kw', warnings, where),
      measuredMinKw: num(r, 'measured_min_kw', warnings, where),
      measuredMaxKw: num(r, 'measured_max_kw', warnings, where),
      compare,
      note: r.note ?? '',
      url: r.url ?? '',
    };
  });

  const sources: Source[] = parseCsv(files.sources)
    .rows.filter((r) => (r.title ?? '') !== '')
    .map((r) => {
      const url = r.url ?? '';
      if (url && !/^https?:\/\//i.test(url)) warnings.push(`sources.csv, ${r.id}: url "${url}" does not start with http(s)://`);
      return {
        id: r.id ?? '',
        topic: r.topic || 'Other',
        title: r.title,
        authors: r.authors ?? '',
        publisher: r.publisher ?? '',
        year: r.year ?? '',
        url: /^https?:\/\//i.test(url) ? url : '',
        usedFor: r.used_for ?? '',
      };
    });

  // Battery chemistry tables: one column per chemistry in ocv.csv and temperature.csv.
  const ocvTable = parseCsv(files.ocv);
  const tempTable = parseCsv(files.temperature);
  const calSocTable = parseCsv(files.calendarSoc ?? '');
  const capacityTemps = tempTable.rows.map((r) => req(r, 'temperature_c', warnings, 'battery/temperature.csv'));
  const capacityNotes = tempTable.rows.map((r) => r.note ?? '');
  const chemistries: Record<string, Chemistry> = {};
  for (const r of parseCsv(files.chemistries).rows) {
    const code = r.chemistry.toUpperCase();
    const where = `battery/chemistries.csv, ${code}`;
    const ocv: number[] = new Array(101).fill(NaN);
    for (const o of ocvTable.rows) {
      const soc = parseNumber(o.soc_pct);
      const v = parseNumber(o[code]);
      if (soc !== null && v !== null && soc >= 0 && soc <= 100) ocv[Math.round(soc)] = v;
    }
    fillGaps(ocv);
    const calendarSocFactor: number[] = new Array(101).fill(NaN);
    for (const o of calSocTable.rows) {
      const soc = parseNumber(o.soc_pct);
      const v = parseNumber(o[code]);
      if (soc !== null && v !== null && soc >= 0 && soc <= 100) calendarSocFactor[Math.round(soc)] = v;
    }
    fillGaps(calendarSocFactor);
    if (calendarSocFactor.some((v) => !Number.isFinite(v))) {
      warnings.push(`battery/calendar_soc.csv has no column for ${code}: charge level does not change the calendar ageing`);
      calendarSocFactor.fill(1);
    }
    if (ocv.some((v) => !Number.isFinite(v))) warnings.push(`battery/ocv.csv has no column for ${code}`);
    chemistries[code] = {
      chemistry: code,
      label: r.label || code,
      nominalCellV: req(r, 'nominal_cell_v', warnings, where, 3.5),
      cutoffCellV: req(r, 'cutoff_cell_v', warnings, where, 2.5),
      maxCellV: req(r, 'max_cell_v', warnings, where, 4.2),
      dv1c25cPct: req(r, 'dv_1c_25c_pct', warnings, where, 3),
      resistanceEaKjPerMol: req(r, 'resistance_ea_kj_per_mol', warnings, where, 28),
      packWhPerKg: req(r, 'pack_wh_per_kg', warnings, where, 150),
      specificHeatJPerKgK: req(r, 'specific_heat_j_per_kgk', warnings, where, 1000),
      ocvSource: r.ocv_source ?? '',
      resistanceSource: r.resistance_source ?? '',
      capacitySource: r.capacity_source ?? '',
      thermalSource: r.thermal_source ?? '',
      calendarLossPct1y25c: req(r, 'calendar_loss_pct_1y_25c', warnings, where, 2.5),
      calendarTimeExponent: req(r, 'calendar_time_exponent', warnings, where, 0.5),
      calendarEaKjPerMol: req(r, 'calendar_ea_kj_per_mol', warnings, where, 30),
      cycleFadeExponent: req(r, 'cycle_fade_exponent', warnings, where, 1),
      ageingSource: r.ageing_source ?? '',
      ratedCycles: parseNumber(r.rated_cycles ?? ''),
      ratedCyclesSources: (r.rated_cycles_source ?? '').split(';').map((x) => x.trim()).filter(Boolean),
      ratedCyclesNote: r.rated_cycles_note ?? '',
      ocv,
      calendarSocFactor,
      capacityPct: tempTable.rows.map((t) => parseNumber(t[code]) ?? 100),
    };
  }

  const cycles: Record<string, Cycle> = {};
  for (const r of parseCsv(files.cyclesIndex).rows) {
    const text = files.cycles[r.file];
    if (!text) {
      warnings.push(`cycles/index.csv: file ${r.file} not found`);
      continue;
    }
    const trace = parseCsv(text).rows;
    cycles[r.cycle.toUpperCase()] = {
      id: r.cycle.toUpperCase(),
      file: r.file,
      description: r.description ?? '',
      source: r.source ?? '',
      speedsKmh: trace.map((t) => parseNumber(t.speed_kmh) ?? 0),
      phases: trace.map((t) => t.phase ?? ''),
    };
  }

  const standard = parseStandard(files.standard, warnings);
  checkHierarchy(markets, blocs, warnings);
  const costItems = parseCostItems(files.costItems ?? '', warnings);
  // Each folder data/markets/<id>/ belongs to a market or a bloc; a bloc passes on only inheritable items and has no road tax.
  const runningCosts: RunningCostRow[] = [];
  const roadTax: RoadTaxRow[] = [];
  for (const [folder, f] of Object.entries(files.marketFiles ?? {}).sort(([x], [y]) => x.localeCompare(y))) {
    const id = folder.toUpperCase();
    const isBloc = blocs.some((b) => b.id === id);
    if (!isBloc && !marketIds.has(id)) {
      warnings.push(`markets/${folder}/: "${id}" is neither in markets.csv nor in blocs.csv; its files are ignored`);
      continue;
    }
    for (const r of parseRunningCosts(f.costs ?? '', id, costItems, warnings)) {
      if (isBloc && !costItems.find((d) => d.item === r.item)?.inherit) {
        warnings.push(`markets/${id}/costs.csv: ${r.item} is market data (costs/items.csv: inherit no); put it in each market's folder`);
        continue;
      }
      runningCosts.push(r);
    }
    const tax = parseRoadTax(f.roadTax ?? '', id, warnings);
    if (isBloc && tax.length) warnings.push(`markets/${id}/road_tax.csv: road tax is set per market, not per bloc; ignored`);
    else roadTax.push(...tax);
  }
  const terrain = parseTerrain(files.terrain ?? '', warnings);
  const profiles = parseProfiles(files.profiles ?? '', cycles, warnings);
  const realWorldFuel = parseRealWorldFuel(files.realWorldFuel ?? '', cars, cycles, profiles, warnings);
  const sourceIds = new Set(sources.map((s) => s.id));
  for (const r of [...runningCosts, ...roadTax]) {
    for (const id of r.sources) if (!sourceIds.has(id)) warnings.push(`markets/${r.market}/${'item' in r ? 'costs' : 'road_tax'}.csv: source "${id}" is not in sources.csv`);
  }
  for (const t of terrain) {
    for (const id of t.sources) if (!sourceIds.has(id)) warnings.push(`terrain.csv, ${t.id}: source "${id}" is not in sources.csv`);
  }
  for (const p of profiles) {
    for (const id of p.sources) if (!sourceIds.has(id)) warnings.push(`profiles.csv, ${p.id}: source "${id}" is not in sources.csv`);
  }
  for (const c of Object.values(chemistries))
    for (const id of c.ratedCyclesSources) if (!sourceIds.has(id)) warnings.push(`battery/chemistries.csv, ${c.chemistry}: source "${id}" is not in sources.csv`);
  // Car-specific rated cycles need their source (cars.csv battery_cycles_source).
  for (const c of cars) {
    const car = c.specId ? `car ${c.specId}` : c.id;
    for (const id of c.batteryCyclesSources)
      if (!sourceIds.has(id)) warnings.push(`cars.csv, ${car}: battery_cycles_source "${id}" is not in sources.csv`);
    if (c.batteryCycles !== null && c.batteryCyclesSources.length === 0) warnings.push(`cars.csv, ${car}: battery_cycles without battery_cycles_source`);
  }

  return {
    cars,
    carColumns: columns,
    fields,
    assumptions,
    markets,
    bodyTypes,
    onboardClasses,
    factsTab,
    onboardMeasurements,
    degradationMeasurements,
    sources,
    chemistries,
    capacityTemps,
    capacityNotes,
    cycles,
    standard,
    blocs,
    costItems,
    runningCosts,
    roadTax,
    terrain,
    profiles,
    realWorldFuel,
    // A car sold in several markets reports a problem of its cars.csv row once.
    loadWarnings: [...new Set(warnings)],
  };
}

/**
 * data/standard.csv: one row per input and test. Rows of an unknown test or input, or with a value the input does
 * not accept, are reported and left out; inputs without a row are reported too (the scenario then lacks them).
 */
export function parseStandard(text: string, warnings: string[]): StandardRow[] {
  const rows: StandardRow[] = [];
  const seen = new Set<string>();
  for (const r of parseCsv(text).rows) {
    const test = (r.test ?? '').trim();
    const input = (r.input ?? '').trim();
    const where = `standard.csv, ${test} ${input}`;
    const isTest = TEST_KEYS.includes(test as TestKey);
    if (test !== 'all' && !isTest) {
      warnings.push(`${where}: unknown test "${test}" (use all, ${TEST_KEYS.join(', ')})`);
      continue;
    }
    const conditions = CONDITION_INPUTS as Record<string, InputKind>;
    const kind = conditions[input] ?? (isTest ? (TRIP_INPUTS[test as TestKey] as Record<string, InputKind>)[input] : undefined);
    if (!kind) {
      warnings.push(`${where}: unknown input "${input}"${test === 'all' ? ' (the all rows hold conditions only)' : ''}`);
      continue;
    }
    const { error } = parseInputValue(kind, r.value ?? '');
    if (error) {
      warnings.push(`${where}: ${error}`);
      continue;
    }
    const spreadsheet = (r.spreadsheet ?? '').trim();
    if (spreadsheet) {
      const bad = parseInputValue(kind, spreadsheetValue(spreadsheet)).error;
      if (bad) warnings.push(`${where}, spreadsheet column: ${bad}`);
    }
    const id = `${test}|${input}`;
    if (seen.has(id)) warnings.push(`${where}: listed twice; the last row counts`);
    seen.add(id);
    rows.push({ test, input, value: r.value ?? '', spreadsheet, unit: r.unit ?? '', why: r.why ?? '' });
  }
  for (const key of Object.keys(CONDITION_INPUTS)) if (!seen.has(`all|${key}`)) warnings.push(`standard.csv: no "all" row for the condition ${key}`);
  for (const t of TEST_KEYS) {
    for (const key of Object.keys(TRIP_INPUTS[t])) if (!seen.has(`${t}|${key}`)) warnings.push(`standard.csv: no row for ${t} ${key}`);
  }
  return rows;
}

const ids = (v: string | undefined) => (v ?? '').split(/[;,\s]+/).filter(Boolean);

/**
 * data/markets/<market>/costs.csv: one value per item and powertrain ('all' = both) of a market or bloc. Items not in
 * data/costs/items.csv, bad numbers and duplicates are reported. Missing items are not an error here: the market
 * inherits them or shows a gap (see marketCosts).
 */
export function parseRunningCosts(text: string, market: string, items: CostItemDef[], warnings: string[]): RunningCostRow[] {
  const rows: RunningCostRow[] = [];
  const seen = new Set<string>();
  const known = items.map((d) => d.item);
  for (const r of parseCsv(text).rows) {
    const item = (r.item ?? '').trim();
    const pt = (r.powertrain ?? '').trim();
    const where = `markets/${market}/costs.csv, ${item} ${pt}`;
    if (!item) continue;
    if (!known.includes(item)) {
      warnings.push(`${where}: unknown item "${item}" (costs/items.csv: ${known.join(', ')})`);
      continue;
    }
    const powertrain = pt === 'BEV' || pt === 'ICE' ? pt : pt.toLowerCase() === 'all' || pt === '' ? 'all' : null;
    if (!powertrain) {
      warnings.push(`${where}: powertrain must be all, BEV or ICE`);
      continue;
    }
    const value = parseNumber(r.value);
    if (value === null || value < 0) {
      warnings.push(`${where}: "${r.value}" is not a number ≥ 0`);
      continue;
    }
    const key = `${market}|${item}|${powertrain}`;
    if (seen.has(key)) warnings.push(`${where}: listed twice; the last row counts`);
    seen.add(key);
    rows.push({ market, item, powertrain, value, unit: r.unit ?? '', why: r.why ?? '', sources: ids(r.source) });
  }
  return rows;
}

/** data/markets/<market>/road_tax.csv: bands and rates of the market's yearly road tax per powertrain. */
export function parseRoadTax(text: string, market: string, warnings: string[]): RoadTaxRow[] {
  const rows: RoadTaxRow[] = [];
  for (const r of parseCsv(text).rows) {
    if (!(r.powertrain ?? '').trim() && !(r.basis ?? '').trim()) continue;
    const where = `markets/${market}/road_tax.csv, ${r.powertrain} ${r.basis} ${r.above}–${r.up_to}`;
    const powertrain = r.powertrain === 'BEV' || r.powertrain === 'ICE' ? r.powertrain : null;
    const basis = r.basis === 'weight_kg' || r.basis === 'engine_cc' || r.basis === 'co2_g_km' || r.basis === 'age_years' ? r.basis : null;
    const kind = r.kind === 'band' || r.kind === 'per_unit' || r.kind === 'discount_pct' ? r.kind : null;
    const above = parseNumber(r.above);
    const upTo = parseNumber(r.up_to);
    const amount = parseNumber(r.amount);
    if (!powertrain || !basis || !kind || above === null || amount === null || (upTo !== null && upTo <= above)) {
      warnings.push(`${where}: needs powertrain BEV/ICE, basis weight_kg/engine_cc/co2_g_km/age_years, kind band/per_unit/discount_pct, numbers with up_to > above`);
      continue;
    }
    if ((basis === 'age_years') !== (kind === 'discount_pct')) {
      warnings.push(`${where}: age_years rows are discount_pct rows, and only they are`);
      continue;
    }
    rows.push({ market, powertrain, basis, above, upTo, amount, kind, sources: ids(r.source), why: r.why ?? '' });
  }
  // Rows of one market, powertrain and basis must not overlap.
  const groups = new Map<string, RoadTaxRow[]>();
  for (const r of rows) {
    const k = `${r.market} ${r.powertrain} ${r.basis}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [k, g] of groups) {
    const s = [...g].sort((x, y) => x.above - y.above);
    for (let i = 1; i < s.length; i++) {
      const prev = s[i - 1].upTo;
      if (prev === null || prev > s[i].above) warnings.push(`markets/${market}/road_tax.csv, ${k}: rows overlap above ${s[i].above}`);
      else if (prev < s[i].above) warnings.push(`markets/${market}/road_tax.csv, ${k}: gap between ${prev} and ${s[i].above}`);
    }
  }
  return rows;
}

/** data/terrain.csv: terrain presets. Rows without a number ≥ 0 or with a slope outside 0.5–20 % are reported and left out. */
export function parseTerrain(text: string, warnings: string[]): TerrainPreset[] {
  const out: TerrainPreset[] = [];
  for (const r of parseCsv(text).rows) {
    const id = (r.id ?? '').trim();
    if (!id) continue;
    const climb = parseNumber(r.climb_per_100km_m);
    const slope = parseNumber(r.slope_pct);
    if (climb === null || climb < 0) {
      warnings.push(`terrain.csv, ${id}: climb_per_100km_m "${r.climb_per_100km_m}" is not a number ≥ 0`);
      continue;
    }
    if (slope === null || slope < 0.5 || slope > 20) {
      warnings.push(`terrain.csv, ${id}: slope_pct "${r.slope_pct}" is not between 0.5 and 20`);
      continue;
    }
    if (out.some((t) => t.id === id)) warnings.push(`terrain.csv: ${id} is listed twice; the last row counts`);
    const row = { id, label: (r.label ?? '').trim() || id, climbPer100KmM: climb, slopePct: slope, why: r.why ?? '', sources: ids(r.source) };
    const i = out.findIndex((t) => t.id === id);
    if (i >= 0) out[i] = row;
    else out.push(row);
  }
  return out;
}

const SPEED_KINDS: ProfileSpeedKind[] = ['constant', 'cruising', 'own', 'average'];

/**
 * data/profiles.csv: the driving profiles. A row is left out (and reported) when its speed kind is unknown, its cycle
 * or phases are not in data/cycles, or a profile with a speed setting has no valid speed range.
 */
export function parseProfiles(text: string, cycles: Record<string, Cycle>, warnings: string[]): ProfileDef[] {
  const out: ProfileDef[] = [];
  for (const r of parseCsv(text).rows) {
    const id = (r.id ?? '').trim();
    if (!id) continue;
    const where = `profiles.csv, ${id}`;
    const speed = (r.speed ?? '').trim() as ProfileSpeedKind;
    if (!SPEED_KINDS.includes(speed)) {
      warnings.push(`${where}: speed "${r.speed}" is not one of ${SPEED_KINDS.join(', ')}`);
      continue;
    }
    const cycle = (r.cycle ?? '').trim().toUpperCase();
    const phases = ids(r.phases);
    if (speed !== 'constant') {
      const c = cycles[cycle];
      if (!c) {
        warnings.push(`${where}: cycle "${r.cycle}" is not in data/cycles/index.csv`);
        continue;
      }
      const missing = phases.filter((ph) => !c.phases.includes(ph));
      if (missing.length) {
        warnings.push(`${where}: ${cycle} has no phase ${missing.join(', ')}`);
        continue;
      }
    }
    const min = parseNumber(r.speed_min_kmh);
    const max = parseNumber(r.speed_max_kmh);
    const ranged = speed === 'constant' || speed === 'cruising';
    if (ranged && (min === null || max === null || min <= 0 || max < min)) {
      warnings.push(`${where}: speed_min_kmh / speed_max_kmh "${r.speed_min_kmh}" / "${r.speed_max_kmh}" are not a range of speeds`);
      continue;
    }
    const join = parseNumber(r.join_kmh);
    const row: ProfileDef = {
      id,
      label: (r.label ?? '').trim() || id,
      description: r.description ?? '',
      speed,
      cycle,
      phases,
      joinKmh: join !== null && join > 0 ? join : null,
      speedMinKmh: ranged ? min : null,
      speedMaxKmh: ranged ? max : null,
      why: r.why ?? '',
      sources: ids(r.source),
    };
    const i = out.findIndex((p) => p.id === id);
    if (i >= 0) {
      warnings.push(`profiles.csv: ${id} is listed twice; the last row counts`);
      out[i] = row;
    } else out.push(row);
  }
  return out;
}

/**
 * data/real_world_fuel.csv: measured drives of petrol cars. A row is left out (and reported) when its car is not a
 * petrol car in cars.csv, its drive is neither a known cycle (with phases) nor a known profile with a speed, or its
 * numbers are missing.
 */
export function parseRealWorldFuel(text: string, cars: Car[], cycles: Record<string, Cycle>, profiles: ProfileDef[], warnings: string[]): RealWorldFuelRow[] {
  const out: RealWorldFuelRow[] = [];
  for (const r of parseCsv(text).rows) {
    const carId = (r.car_id ?? '').trim();
    if (!carId) continue;
    const where = `real_world_fuel.csv, ${carId} "${r.label ?? ''}"`;
    const car = cars.find((c) => c.id === carId);
    if (!car || car.powertrain !== 'ICE') {
      warnings.push(`${where}: not a petrol car in cars.csv`);
      continue;
    }
    const cycle = (r.cycle ?? '').trim().toUpperCase();
    const phases = ids(r.phases);
    const profile = (r.profile ?? '').trim();
    const speedKmh = parseNumber(r.speed_kmh);
    if (cycle) {
      const c = cycles[cycle];
      const missing = c ? phases.filter((ph) => !c.phases.includes(ph)) : [];
      if (!c || missing.length) {
        warnings.push(`${where}: cycle "${r.cycle}" ${c ? `has no phase ${missing.join(', ')}` : 'is not in data/cycles/index.csv'}`);
        continue;
      }
    } else if (!profiles.some((p) => p.id === profile) || speedKmh === null || speedKmh <= 0) {
      warnings.push(`${where}: needs a cycle, or a profile of profiles.csv with speed_kmh`);
      continue;
    }
    const airC = parseNumber(r.air_c);
    const lPer100Km = parseNumber(r.l_per_100km);
    const payloadKg = parseNumber(r.payload_kg);
    if (airC === null || lPer100Km === null || lPer100Km <= 0) {
      warnings.push(`${where}: needs air_c and l_per_100km`);
      continue;
    }
    out.push({
      carId,
      label: (r.label ?? '').trim() || carId,
      cycle,
      phases,
      profile: cycle ? '' : profile,
      speedKmh: cycle ? null : speedKmh,
      airC,
      cabinC: parseNumber(r.cabin_c),
      payloadKg: payloadKg ?? 0,
      lPer100Km,
      sources: ids(r.source),
      notes: r.notes ?? '',
    });
  }
  return out;
}

/** Linear interpolation over NaN gaps in an index-addressed table. */
function fillGaps(values: number[]): void {
  let last = -1;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    if (last >= 0 && i - last > 1) {
      for (let j = last + 1; j < i; j++) values[j] = values[last] + ((values[i] - values[last]) * (j - last)) / (i - last);
    }
    last = i;
  }
}
