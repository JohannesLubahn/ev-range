// Shared types of the calculation engine. The engine is pure TypeScript: no UI, no browser APIs.

export type ConsumptionModel = 'physics' | 'simple';
export type BatteryModel = 'chemistry' | 'ideal';
export type ThermalMode = 'managed' | 'ambient' | 'preconditioned';
export type Profile = 'steady' | 'motorway' | 'rural' | 'city' | 'mixed' | 'jam';

export const PROFILES: { id: Profile; label: string; description: string }[] = [
  { id: 'steady', label: 'Steady', description: 'Constant speed, e.g. cruise control' },
  { id: 'motorway', label: 'Motorway', description: 'Speed shape of the WLTP extra-high phase' },
  { id: 'rural', label: 'Rural', description: 'Speed shape of the WLTP high phase' },
  { id: 'city', label: 'City', description: 'Speed shape of the WLTP low + medium phases' },
  { id: 'mixed', label: 'Mixed', description: 'Speed shape of the whole WLTP cycle' },
  { id: 'jam', label: 'Traffic jam', description: 'Stop-and-go: the WLTP low phase slowed down to crawl speed' },
];

/** Global assumptions (data/assumptions.csv), possibly changed by the user. */
export interface Assumptions {
  longTermCapacityPct: number;
  batteryManagedMinC: number;
  batteryManagedMaxC: number;
  batteryHvacMaxKw: number;
  batteryHeatExchangeWPerK: number;
  batteryPackVoltageV: number;
  cabinSetpointC: number;
  cabinOccupants: number;
  occupantSensibleW: number;
  occupantLatentW: number;
  cabinSoakK: number;
  acEvaporatorC: number;
  acCondenserApproachK: number;
  acCarnotEfficiencyPct: number;
  hpCondenserC: number;
  hpEvaporatorApproachK: number;
  hpCarnotEfficiencyPct: number;
  hpFullC: number;
  hpOffC: number;
  taperSpeedFactorPct: number;
  chargingEfficiencyPct: number;
  rollingResistanceNPerKn: number;
  tyrePressureRefBar: number;
  regenEfficiencyPct: number;
  rotatingMassFactor: number;
  frontalAreaFactor: number;
  drivetrainEfficiencyDefaultPct: number;
  testPayloadKg: number;
  testTemperatureC: number;
  defaultBasis: string;
  electricityPrice: number;
  maintenancePerYear: number;
  displayCurrency: string;
  highSpeedFactor: number;
  /** Exchange rates: units of display currency (THB) per unit of the given currency. */
  fx: Record<string, number>;
}

export interface Conditions {
  airTemperatureC: number;
  /** Sunshine on the car (W/m²): 0 = night or overcast, ~500 = hazy day, ~1000 = clear sky at noon. */
  solarWm2: number;
  /** Relative humidity of the outside air (%): moisture the AC has to condense. */
  humidityPct: number;
  altitudeM: number;
  payloadKg: number;
  tyrePressureBar: number;
  thermalMode: ThermalMode;
  preconditionedC: number;
}

export interface ModelSettings {
  consumption: ConsumptionModel;
  battery: BatteryModel;
  /** Reproduce the spreadsheet's formulas including its known issues (used by the parity test only). */
  exactSpreadsheet?: boolean;
}

export interface TrafficJamInputs {
  startPct: number;
  endPct: number;
  distBeforeKm: number;
  distJamKm: number;
  timeJamH: number;
  distAfterKm: number;
  speedOutsideKmh: number;
  usageOutsidePct: number;
  usageJamPct: number;
  profileOutside: Profile;
}

export interface NoChargerInputs {
  distanceKm: number;
  startPct: number;
  endPct: number;
  speedKmh: number;
  usagePct: number;
  profile: Profile;
  climbM: number;
}

export interface LongTripInputs {
  distanceKm: number;
  speedKmh: number;
  usageDrivingPct: number;
  usageChargingPct: number;
  chargeFromPct: number;
  chargeToPct: number;
  profile: Profile;
}

export interface BatteryLifeInputs {
  years: number;
  kmPerYear: number;
  speedKmh: number;
  usagePct: number;
  profile: Profile;
}

export interface SprintInputs {
  distanceKm: number;
  startPct: number;
  endPct: number;
  speedKmh: number;
  usagePct: number;
  profile: Profile;
  climbM: number;
}

export interface CostInputs {
  /** Price per kWh from the grid, in the display currency. Cars can override it (energy_price column). */
  energyPrice: number;
  /** Maintenance per year, in the display currency. Cars can override it (maintenance_per_year column). */
  maintenancePerYear: number;
}

export interface Scenario {
  trafficJam: TrafficJamInputs;
  noCharger: NoChargerInputs;
  longTrip: LongTripInputs;
  batteryLife: BatteryLifeInputs;
  sprint: SprintInputs;
  cost: CostInputs;
  conditions: Conditions;
}

/** One line of a calculation explanation shown in the drawer. */
export interface Step {
  label: string;
  formula: string;
  value: number | null;
  unit: string;
  /** Visual emphasis: a result line or a sub-total. */
  kind?: 'result' | 'subtotal' | 'note';
}

export interface CapacityCheck {
  /** Long-term battery capacity the trip would need (kWh), comparable with availableKwh. */
  requiredKwh: number;
  /** Long-term capacity of the car (nominal × long-term %). */
  availableKwh: number;
  /** (available − required) / available. Positive = spare capacity. */
  margin: number;
  pass: boolean;
  /** Energy taken from the battery for the trip (kWh, incl. onboard systems and battery losses). */
  energyKwh: number;
  /** Energy the battery can deliver in the given state-of-charge window under the conditions (kWh). */
  deliverableKwh: number;
  steps: Step[];
  warnings: string[];
}

export interface TrafficJamResult extends CapacityCheck {
  /** Longest traffic jam (hours) the battery can handle with the other inputs unchanged. */
  maxJamHours: number;
}

export interface DistanceCheckResult extends CapacityCheck {
  /** Longest distance at these conditions within the state-of-charge window (km). */
  maxDistanceKm: number;
}

export interface LongTripResult {
  energyKwh: number;
  capacityPerChargeKwh: number;
  chargings: number;
  stops: number;
  timePerChargeH: number;
  timeDrivingH: number;
  timeChargingH: number;
  tripTimeH: number;
  chargingSharePct: number;
  steps: Step[];
  warnings: string[];
}

export interface BatteryLifeResult {
  totalKm: number;
  energyKwh: number;
  cyclesRequired: number;
  cyclesAvailable: number | null;
  margin: number | null;
  pass: boolean | null;
  /** Years until the rated cycles are used up at this yearly distance. */
  yearsUntilRated: number | null;
  steps: Step[];
  warnings: string[];
}

export interface CostResult {
  currency: string;
  purchase: number | null;
  energyCost: number;
  maintenanceCost: number;
  tco: number | null;
  costPerKm: number | null;
  /** Energy per km paid for (grid kWh or litres per km). */
  energyPerKm: number;
  steps: Step[];
  warnings: string[];
}

export interface CarResults {
  carId: string;
  trafficJam: TrafficJamResult;
  noCharger: DistanceCheckResult;
  sprint: DistanceCheckResult;
  longTrip: LongTripResult;
  batteryLife: BatteryLifeResult;
  cost: CostResult;
  /** Number of passed checks among traffic jam, no charger, sprint and battery life. */
  passCount: number;
  checkCount: number;
}
