import Papa from 'papaparse';
import type {
  AssumptionDef,
  Basis,
  BodyType,
  Car,
  Chemistry,
  Cycle,
  Dataset,
  DegradationMeasurement,
  FactsTabRow,
  FieldDef,
  Market,
  OnboardClass,
  OnboardMeasurement,
  Source,
  StandardRow,
} from './types';
import { BASES } from './types';
import { CONDITION_INPUTS, TEST_KEYS, TRIP_INPUTS, parseInputValue, type InputKind, type TestKey } from '../engine/inputs';

/** The raw text of every data file. Used for the bundled /data files and for CSV files loaded in the browser. */
export interface RawFiles {
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

export function parseCars(text: string, warnings: string[]): { cars: Car[]; columns: string[] } {
  const { rows, columns } = parseCsv(text);
  const seen = new Set<string>();
  const cars: Car[] = [];
  rows.forEach((row, i) => {
    const name = row.name ?? '';
    let id = (row.id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `car-${i + 1}`;
    if (seen.has(id)) {
      warnings.push(`cars.csv row ${i + 2}: id "${id}" is used twice; renamed to "${id}-${i + 2}"`);
      id = `${id}-${i + 2}`;
    }
    seen.add(id);
    const where = `cars.csv, ${name || id}`;
    const ranges: Partial<Record<Basis, number>> = {};
    for (const b of BASES) {
      const v = num(row, `range_${b.toLowerCase()}_km`, warnings, where);
      if (v !== null) ranges[b] = v;
    }
    const basisRaw = (row.consumption_basis ?? '').toUpperCase();
    const basis = (BASES as string[]).includes(basisRaw) ? (basisRaw as Basis) : null;
    if (basisRaw && !basis) warnings.push(`${where}: consumption_basis "${row.consumption_basis}" is not one of ${BASES.join(', ')}`);
    cars.push({
      id,
      name: name || id,
      brand: row.brand ?? '',
      model: row.model || null,
      variant: row.variant || null,
      market: (row.market ?? '').toUpperCase(),
      currency: (row.currency || 'THB').toUpperCase(),
      price: num(row, 'price', warnings, where),
      powertrain: (row.powertrain ?? '').toUpperCase() === 'ICE' ? 'ICE' : 'BEV',
      bodyType: row.body_type ?? '',
      carClass: (row.car_class || 'regular').toLowerCase(),
      batteryKwh: num(row, 'battery_kwh', warnings, where),
      endOfLifeCapacityPct: num(row, 'end_of_life_capacity_pct', warnings, where),
      batteryType: row.battery_type ? row.battery_type.toUpperCase() : null,
      batteryCycles: num(row, 'battery_cycles', warnings, where),
      consumptionKwhPerKm: num(row, 'consumption_kwh_per_km', warnings, where),
      ranges,
      consumptionBasis: basis,
      chargeFromPct: num(row, 'charge_from_pct', warnings, where),
      chargeToPct: num(row, 'charge_to_pct', warnings, where),
      chargeTimeMin: num(row, 'charge_time_min', warnings, where),
      fastWindowFromPct: num(row, 'fast_window_from_pct', warnings, where),
      fastWindowToPct: num(row, 'fast_window_to_pct', warnings, where),
      dragCoefficient: num(row, 'drag_coefficient', warnings, where),
      frontalAreaM2: num(row, 'frontal_area_m2', warnings, where),
      widthMm: num(row, 'width_mm', warnings, where),
      heightMm: num(row, 'height_mm', warnings, where),
      weightKg: num(row, 'weight_kg', warnings, where),
      tyreRr: num(row, 'tyre_rr', warnings, where),
      heatPump: parseYesNo(row.heat_pump, warnings, `${where}, column heat_pump`),
      powerKw: num(row, 'power_kw', warnings, where),
      energyPrice: num(row, 'energy_price', warnings, where),
      maintenancePerYear: num(row, 'maintenance_per_year', warnings, where),
      notes: row.notes ?? '',
      raw: { ...row },
    });
  });
  return { cars, columns };
}

/** data/markets.csv: one row per market (currency, electricity price, maintenance). */
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
    const where = `markets.csv, ${id}`;
    out.push({
      id,
      name: r.name || id,
      currency: (r.currency || 'THB').toUpperCase(),
      electricityPrice: num(r, 'electricity_price', warnings, where),
      maintenancePerYear: num(r, 'maintenance_per_year', warnings, where),
      description: r.description ?? '',
      source: r.source ?? '',
    });
  }
  return out;
}

export function parseDataset(files: RawFiles): Dataset {
  const warnings: string[] = [];
  const { cars, columns } = parseCars(files.cars, warnings);

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

  const markets = parseMarkets(files.markets ?? '', warnings);
  const marketIds = new Set(markets.map((m) => m.id));
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
    loadWarnings: warnings,
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
    const id = `${test}|${input}`;
    if (seen.has(id)) warnings.push(`${where}: listed twice; the last row counts`);
    seen.add(id);
    rows.push({ test, input, value: r.value ?? '', unit: r.unit ?? '', why: r.why ?? '' });
  }
  for (const key of Object.keys(CONDITION_INPUTS)) if (!seen.has(`all|${key}`)) warnings.push(`standard.csv: no "all" row for the condition ${key}`);
  for (const t of TEST_KEYS) {
    for (const key of Object.keys(TRIP_INPUTS[t])) if (!seen.has(`${t}|${key}`)) warnings.push(`standard.csv: no row for ${t} ${key}`);
  }
  return rows;
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
