// Typed views of the CSV files in /data. Everything here is plain data: no calculations.

export type Basis = 'CLTC' | 'NEDC' | 'WLTP' | 'EPA';
export const BASES: Basis[] = ['CLTC', 'NEDC', 'WLTP', 'EPA'];

/** One car = one row of data/cars.csv. Blank cells become null. */
export interface Car {
  id: string;
  name: string;
  brand: string;
  market: string;
  currency: string;
  price: number | null;
  powertrain: 'BEV' | 'ICE';
  bodyType: string;
  carClass: string;
  batteryKwh: number | null;
  longTermCapacityPct: number | null;
  batteryType: string | null;
  batteryCycles: number | null;
  consumptionKwhPerKm: number | null;
  ranges: Partial<Record<Basis, number>>;
  consumptionBasis: Basis | null;
  onboardKw: number | null;
  chargeFromPct: number | null;
  chargeToPct: number | null;
  chargeTimeMin: number | null;
  fastWindowFromPct: number | null;
  fastWindowToPct: number | null;
  dragCoefficient: number | null;
  frontalAreaM2: number | null;
  widthMm: number | null;
  heightMm: number | null;
  weightKg: number | null;
  tyreRr: number | null;
  powerKw: number | null;
  energyPrice: number | null;
  maintenancePerYear: number | null;
  notes: string;
  /** Every column of the CSV row as text, including columns the app does not know (shown on the Cars page). */
  raw: Record<string, string>;
}

export interface FieldDef {
  key: string;
  label: string;
  unit: string;
  group: string;
  type: string;
  better: 'higher' | 'lower' | '';
  description: string;
}

export interface AssumptionDef {
  key: string;
  value: string;
  unit: string;
  label: string;
  group: string;
  description: string;
  source: string;
}

export interface BodyType {
  bodyType: string;
  dragCoefficient: number;
  frontalAreaM2: number;
  description: string;
  source: string;
}

export interface OnboardClass {
  carClass: string;
  label: string;
  generalKw: number;
  infotainmentKw: number;
  autonomousDrivingKw: number;
  description: string;
  source: string;
}

export interface HvacRow {
  temperatureC: number;
  cabinRegularKw: number;
  cabinPremiumKw: number;
  batteryKw: number;
  note: string;
}

export interface Chemistry {
  chemistry: string;
  label: string;
  nominalCellV: number;
  cutoffCellV: number;
  maxCellV: number;
  dv1c25cPct: number;
  resistanceEaKjPerMol: number;
  ocvSource: string;
  resistanceSource: string;
  capacitySource: string;
  /** Open-circuit voltage per cell at 0..100 % SoC (index = SoC %). */
  ocv: number[];
  /** Deliverable capacity (% of rated) at the temperatures in Dataset.capacityTemps. */
  capacityPct: number[];
}

export interface Cycle {
  id: string;
  file: string;
  description: string;
  source: string;
  /** Speed in km/h, one value per second. */
  speedsKmh: number[];
  phases: string[];
}

export interface Dataset {
  cars: Car[];
  carColumns: string[];
  fields: FieldDef[];
  assumptions: Record<string, AssumptionDef>;
  bodyTypes: Record<string, BodyType>;
  onboardClasses: Record<string, OnboardClass>;
  hvac: HvacRow[];
  chemistries: Record<string, Chemistry>;
  capacityTemps: number[];
  capacityNotes: string[];
  cycles: Record<string, Cycle>;
  /** Problems found while reading the files (e.g. a non-numeric value in a number column). */
  loadWarnings: string[];
}
