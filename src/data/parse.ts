import Papa from 'papaparse';
import type {
  AssumptionDef,
  Basis,
  BodyType,
  Car,
  Chemistry,
  Cycle,
  Dataset,
  FieldDef,
  HvacRow,
  OnboardClass,
} from './types';
import { BASES } from './types';

/** The raw text of every data file. Used for the bundled /data files and for CSV files loaded in the browser. */
export interface RawFiles {
  cars: string;
  fields: string;
  assumptions: string;
  bodyTypes: string;
  onboardClasses: string;
  hvac: string;
  chemistries: string;
  ocv: string;
  temperature: string;
  cyclesIndex: string;
  /** Cycle trace files by file name (e.g. "wltc3b.csv"). */
  cycles: Record<string, string>;
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
      market: row.market ?? '',
      currency: (row.currency || 'THB').toUpperCase(),
      price: num(row, 'price', warnings, where),
      powertrain: (row.powertrain ?? '').toUpperCase() === 'ICE' ? 'ICE' : 'BEV',
      bodyType: row.body_type ?? '',
      carClass: (row.car_class || 'regular').toLowerCase(),
      batteryKwh: num(row, 'battery_kwh', warnings, where),
      longTermCapacityPct: num(row, 'long_term_capacity_pct', warnings, where),
      batteryType: row.battery_type ? row.battery_type.toUpperCase() : null,
      batteryCycles: num(row, 'battery_cycles', warnings, where),
      consumptionKwhPerKm: num(row, 'consumption_kwh_per_km', warnings, where),
      ranges,
      consumptionBasis: basis,
      onboardKw: num(row, 'onboard_kw', warnings, where),
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
      powerKw: num(row, 'power_kw', warnings, where),
      energyPrice: num(row, 'energy_price', warnings, where),
      maintenancePerYear: num(row, 'maintenance_per_year', warnings, where),
      notes: row.notes ?? '',
      raw: { ...row },
    });
  });
  return { cars, columns };
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
      description: r.description ?? '',
      source: r.source ?? '',
    };
  }

  const hvac: HvacRow[] = parseCsv(files.hvac)
    .rows.map((r) => {
      const where = `onboard/hvac.csv, ${r.temperature_c} °C`;
      return {
        temperatureC: req(r, 'temperature_c', warnings, where),
        cabinRegularKw: req(r, 'cabin_regular_kw', warnings, where),
        cabinPremiumKw: req(r, 'cabin_premium_kw', warnings, where),
        batteryKw: req(r, 'battery_kw', warnings, where),
        note: r.note ?? '',
      };
    })
    .sort((a, b) => a.temperatureC - b.temperatureC);

  // Battery chemistry tables: one column per chemistry in ocv.csv and temperature.csv.
  const ocvTable = parseCsv(files.ocv);
  const tempTable = parseCsv(files.temperature);
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
    if (ocv.some((v) => !Number.isFinite(v))) warnings.push(`battery/ocv.csv has no column for ${code}`);
    chemistries[code] = {
      chemistry: code,
      label: r.label || code,
      nominalCellV: req(r, 'nominal_cell_v', warnings, where, 3.5),
      cutoffCellV: req(r, 'cutoff_cell_v', warnings, where, 2.5),
      maxCellV: req(r, 'max_cell_v', warnings, where, 4.2),
      dv1c25cPct: req(r, 'dv_1c_25c_pct', warnings, where, 3),
      resistanceEaKjPerMol: req(r, 'resistance_ea_kj_per_mol', warnings, where, 28),
      ocvSource: r.ocv_source ?? '',
      resistanceSource: r.resistance_source ?? '',
      capacitySource: r.capacity_source ?? '',
      ocv,
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

  return {
    cars,
    carColumns: columns,
    fields,
    assumptions,
    bodyTypes,
    onboardClasses,
    hvac,
    chemistries,
    capacityTemps,
    capacityNotes,
    cycles,
    loadWarnings: warnings,
  };
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
