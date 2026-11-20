// Typed views of the CSV files in /data. Everything here is plain data: no calculations.

export type Basis = 'CLTC' | 'NEDC' | 'WLTP' | 'EPA';
export const BASES: Basis[] = ['CLTC', 'NEDC', 'WLTP', 'EPA'];

/** One car = one row of data/cars.csv. Blank cells become null. */
export interface Car {
  id: string;
  name: string;
  brand: string;
  /** Model without brand and variant; null = the name is the model. */
  model: string | null;
  /** Version of the model (e.g. "low"); null = the base version. */
  variant: string | null;
  /** Code of the market the price applies to (data/markets.csv); blank = none. */
  market: string;
  currency: string;
  price: number | null;
  powertrain: 'BEV' | 'ICE';
  bodyType: string;
  carClass: string;
  batteryKwh: number | null;
  /** Capacity at the end of the rated cycles (% of nominal); null = assumption. */
  endOfLifeCapacityPct: number | null;
  batteryType: string | null;
  batteryCycles: number | null;
  consumptionKwhPerKm: number | null;
  ranges: Partial<Record<Basis, number>>;
  consumptionBasis: Basis | null;
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
  /** Cabin heated by a heat pump (true), a resistive heater only (false), or unknown (null). */
  heatPump: boolean | null;
  powerKw: number | null;
  energyPrice: number | null;
  /** Scheduled servicing per year (column maintenance_per_year), in the car's currency; null = the market's. */
  maintenancePerYear: number | null;
  /** Voluntary insurance per year, in the car's currency; null = % of the car's value. */
  insurancePerYear: number | null;
  /** Four tyres fitted, in the car's currency; null = the market's price for the car class. */
  tyreSetPrice: number | null;
  /** Petrol cars: engine displacement (cc), for the road tax. */
  engineCc: number | null;
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

/** A market (data/markets.csv): its currency. Its running costs are in data/running_costs.csv and data/road_tax.csv. */
export interface Market {
  id: string;
  name: string;
  currency: string;
  description: string;
  source: string;
}

/** One row of data/running_costs.csv: one running-cost value of a market, for all cars or one powertrain. */
export interface RunningCostRow {
  market: string;
  item: string;
  powertrain: 'all' | 'BEV' | 'ICE';
  value: number;
  unit: string;
  /** Why this value; "Judgement" when no source backs it. */
  why: string;
  /** Ids in data/sources.csv; empty for judgement values. */
  sources: string[];
}

/** One row of data/road_tax.csv: a band or rate of the yearly road tax of a market. */
export interface RoadTaxRow {
  market: string;
  powertrain: 'BEV' | 'ICE';
  /** What the tax depends on: curb weight, engine size, or (discount rows) the car's age in years. */
  basis: 'weight_kg' | 'engine_cc' | 'age_years';
  /** The row applies above this value, up to and including `upTo` (null = no limit). */
  above: number;
  upTo: number | null;
  /** band: the tax for the whole band; per_unit: per kg or cc within the band; discount_pct: % off the tax. */
  amount: number;
  kind: 'band' | 'per_unit' | 'discount_pct';
  sources: string[];
  why: string;
}

export interface BodyType {
  bodyType: string;
  dragCoefficient: number;
  frontalAreaM2: number;
  description: string;
  source: string;
}

/** Per car class (data/onboard/classes.csv): electronics and the cabin's thermal properties. */
export interface OnboardClass {
  carClass: string;
  label: string;
  /** Control units, pumps, lights, steering, brakes (kW). */
  generalKw: number;
  /** Screens and audio (kW). Their heat stays in the cabin. */
  infotainmentKw: number;
  /** Driver-assistance computer and sensors (kW). */
  autonomousDrivingKw: number;
  /** Heat flow through walls and windows per °C between cabin and outside air (W/K). */
  cabinUaWPerK: number;
  /** Outside air blown into the cabin when heating / when cooling (m³/h). */
  freshAirHeatingM3h: number;
  freshAirCoolingM3h: number;
  /** Effective area that lets sunshine into the cabin (m²): glass area × transmittance × angle. */
  solarAreaM2: number;
  /** Heat capacity of cabin air and interior that is heated or cooled at the start of a trip (kJ/K). */
  cabinHeatCapacityKjPerK: number;
  /** Blower fan while the climate control runs (kW). */
  blowerKw: number;
  description: string;
  source: string;
}

/** One entry of the source list (data/sources.csv), shown on the Assumptions page. */
export interface Source {
  id: string;
  topic: string;
  title: string;
  authors: string;
  publisher: string;
  year: string;
  /** Link to the source; blank for local files. */
  url: string;
  /** Which values of the model rest on this source. */
  usedFor: string;
}

/** The spreadsheet's Facts-tab onboard curves (data/onboard/facts_tab.csv), kept for comparison only. */
export interface FactsTabRow {
  temperatureC: number;
  baseRegularKw: number;
  basePremiumKw: number;
  cabinRegularKw: number;
  cabinPremiumKw: number;
  batteryKw: number;
  note: string;
}

/** A published real-world battery state of health (data/battery/degradation_measurements.csv), used to check the ageing model. */
export interface DegradationMeasurement {
  id: string;
  chemistry: string;
  vehicle: string;
  nominalKwh: number;
  ratedCycles: number;
  kwhPerKm: number;
  km: number;
  years: number;
  temperatureC: number;
  /** Share of charging at DC fast chargers (%); null = typical habits. */
  dcSharePct: number | null;
  /** Share of the time parked above 80 % charge (%); null = typical habits. */
  highSocTimePct: number | null;
  /** Fast-charging rate (C); null = the typical rate. */
  fastChargeCRate: number | null;
  measuredSohPct: number;
  sourceId: string;
  notes: string;
}

/** A published measurement of onboard power (data/onboard/measurements.csv), used to check the model. */
export interface OnboardMeasurement {
  id: string;
  source: string;
  vehicle: string;
  carClass: string;
  heatPump: boolean;
  airC: number;
  cabinC: number;
  solarWm2: number;
  humidityPct: number;
  speedKmh: number;
  occupants: number;
  /** A single value, or a range (min/max) when several cars were measured. */
  measuredKw: number | null;
  measuredMinKw: number | null;
  measuredMaxKw: number | null;
  /** What the value contains: climate control only, electronics only, or both. */
  compare: 'climate' | 'electronics' | 'total';
  note: string;
  url: string;
}

export interface Chemistry {
  chemistry: string;
  label: string;
  nominalCellV: number;
  cutoffCellV: number;
  maxCellV: number;
  dv1c25cPct: number;
  resistanceEaKjPerMol: number;
  /** Pack-level specific energy (Wh per kg of pack), for the pack's heat capacity. */
  packWhPerKg: number;
  /** Specific heat of the cells (J per kg and K). */
  specificHeatJPerKgK: number;
  ocvSource: string;
  resistanceSource: string;
  capacitySource: string;
  thermalSource: string;
  /** Battery ageing (src/engine/battery/ageing.ts): calendar loss after 1 year at 25 °C (%). */
  calendarLossPct1y25c: number;
  calendarTimeExponent: number;
  calendarEaKjPerMol: number;
  cycleFadeExponent: number;
  ageingSource: string;
  /** Open-circuit voltage per cell at 0..100 % SoC (index = SoC %). */
  ocv: number[];
  /** Calendar-ageing rate vs. state of charge (index = %), 1 at 50 % (battery/calendar_soc.csv). */
  calendarSocFactor: number[];
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

/** One row of data/standard.csv: the standard value of one input of one test ('all' = every test's conditions). */
export interface StandardRow {
  test: string;
  input: string;
  /** As written in the file; blank = from an assumption or the market. */
  value: string;
  unit: string;
  why: string;
}

export interface Dataset {
  cars: Car[];
  carColumns: string[];
  fields: FieldDef[];
  assumptions: Record<string, AssumptionDef>;
  markets: Market[];
  bodyTypes: Record<string, BodyType>;
  onboardClasses: Record<string, OnboardClass>;
  factsTab: FactsTabRow[];
  onboardMeasurements: OnboardMeasurement[];
  degradationMeasurements: DegradationMeasurement[];
  sources: Source[];
  chemistries: Record<string, Chemistry>;
  capacityTemps: number[];
  capacityNotes: string[];
  cycles: Record<string, Cycle>;
  /** The standard inputs of every test (data/standard.csv). */
  standard: StandardRow[];
  /** Running costs per market (data/running_costs.csv) and road tax (data/road_tax.csv). */
  runningCosts: RunningCostRow[];
  roadTax: RoadTaxRow[];
  /** Problems found while reading the files (e.g. a non-numeric value in a number column). */
  loadWarnings: string[];
}
