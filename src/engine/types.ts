// Shared types of the calculation engine. The engine is pure TypeScript: no UI, no browser APIs.
import type { RoadTaxRow, RunningCostRow } from '../data/types';

export type BatteryModel = 'chemistry' | 'ideal';
export type ThermalMode = 'managed' | 'ambient' | 'preconditioned';
/**
 * Driving profiles. Their speed traces, labels, speed ranges and sources are in data/profiles.csv; the speed set for a
 * profile means what its `speed` column says (constant, cruising = top speed, own speeds, average).
 */
export type Profile = 'steady' | 'city' | 'rural' | 'highway' | 'motorway' | 'mixed' | 'jam';
export const PROFILE_IDS: Profile[] = ['steady', 'city', 'rural', 'highway', 'motorway', 'mixed', 'jam'];

/** Global assumptions (data/assumptions.csv), possibly changed by the user. */
export interface Assumptions {
  /** Capacity at the end of the rated cycles (% of nominal), unless the car says otherwise. */
  ratedCyclesEndCapacityPct: number;
  /** Battery life: capacity left from which it is shown green (colour only, no pass/fail; user's choice 2026-11-21). */
  capacityGoodPct: number;
  /** Battery life: capacity left below which it is shown red; orange in between. */
  capacityPoorPct: number;
  /** Extra cycle wear of a fast-charged cycle per C of charging rate (battery care). */
  fastChargeWearPerC: number;
  /** Charging rate of the typical fleet car the ageing is fitted to (C). */
  fastChargeReferenceCRate: number;
  /** State of charge while parked full / otherwise (%), for the calendar ageing. */
  careHighSocPct: number;
  careNormalSocPct: number;
  /** Battery-care presets (% of charging at DC fast chargers, % of the time parked above 80 %). Typical = fleet average. */
  careTypicalDcSharePct: number;
  careTypicalHighSocTimePct: number;
  careGentleDcSharePct: number;
  careGentleHighSocTimePct: number;
  careHardDcSharePct: number;
  careHardHighSocTimePct: number;
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
  /** Deceleration up to which regeneration alone brakes (m/s²); harder braking adds the friction brakes. */
  regenMaxDecelMs2: number;
  /** Below this speed (km/h) the friction brakes do the braking. */
  regenMinKmh: number;
  /** Typical slope of the hills when a test does not set one (%). */
  hillSlopeDefaultPct: number;
  /** Window of the local mean speed the driving style scales the deviations from (s). */
  drivingStyleWindowS: number;
  /** Driving-style presets (% of the WLTP's accelerations and braking; Normal = 100). */
  drivingStyleGentlePct: number;
  drivingStyleSportyPct: number;
  rotatingMassFactor: number;
  frontalAreaFactor: number;
  drivetrainEfficiencyDefaultPct: number;
  /** Petrol engine: fuel of the warm engine at idle per litre of engine size (l/h per l). */
  engineIdleFuelLPerHPerL: number;
  /** Petrol engine: alternator efficiency for the electric loads (%). */
  alternatorEfficiencyPct: number;
  /** Energy in a litre of petrol, lower heating value (kWh/l). */
  petrolEnergyKwhPerL: number;
  /** Petrol engine: share of the fuel energy that heats the coolant, the cabin heater's source (%). */
  engineCoolantHeatPct: number;
  testPayloadKg: number;
  testTemperatureC: number;
  defaultBasis: string;
  displayCurrency: string;
  /** Market whose running costs apply (data/running_costs.csv): the chosen market, else cost_default_market. */
  costMarket: string;
  /** All markets' running costs and road tax, and each market's currency (from the dataset). */
  runningCosts: RunningCostRow[];
  roadTax: RoadTaxRow[];
  marketCurrencies: Record<string, string>;
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
  /** Tyre pressure as % of the car's recommended pressure (100 = as recommended). */
  tyrePressurePct: number;
  thermalMode: ThermalMode;
  preconditionedC: number;
  /**
   * Distance the car has driven (km): sets the battery's wear (capacity lost to charge cycles and age) in the stress
   * tests. The years and the energy per km come from the battery-life inputs. Battery life and cost start from new.
   */
  batteryKm: number;
  /**
   * Driving style: how hard the car accelerates and brakes, in % of the WLTP's dynamics (100 = as in the WLTP).
   * Applies to every speed profile except Steady (constant speed).
   */
  drivingStylePct: number;
}

export interface ModelSettings {
  /** Chemistry curves (default) or an ideal battery without temperature and load effects. */
  battery: BatteryModel;
}

export interface TrafficJamInputs {
  startPct: number;
  endPct: number;
  distBeforeKm: number;
  distJamKm: number;
  timeJamH: number;
  distAfterKm: number;
  /** Speed of the driving profile outside the jam (km/h): held by Steady, the cruising (top) speed of the others; unused by Mixed. */
  speedOutsideKmh: number;
  /** Cabin temperature the heating / AC holds outside the jam (°C); null = off. */
  cabinOutsideC: number | null;
  /** Cabin temperature in the jam (°C); null = off. */
  cabinJamC: number | null;
  profileOutside: Profile;
  /** Hills of the roads before and after the jam (the jam is flat). */
  climbM: number;
  ascentM: number;
  slopePct: number;
}

/**
 * The hills of a trip: altitude change from start to finish (`climbM`, negative = the finish is lower), total climb
 * (`ascentM`, all uphill metres, at least the altitude change) and the typical slope of the climbs and descents (%).
 */
export interface TripTerrain {
  climbM: number;
  ascentM: number;
  slopePct: number;
}

export interface NoChargerInputs extends TripTerrain {
  distanceKm: number;
  startPct: number;
  endPct: number;
  /** Speed of the driving profile (km/h): held by Steady, the cruising (top) speed of the others; unused by Mixed. */
  speedKmh: number;
  /** Cabin temperature the heating / AC holds (°C); null = off. */
  cabinC: number | null;
  profile: Profile;
}

export interface LongTripInputs extends TripTerrain {
  distanceKm: number;
  /** Speed of the driving profile (km/h): held by Steady, the cruising (top) speed of the others; unused by Mixed. */
  speedKmh: number;
  /** Cabin temperature the heating / AC holds while driving (°C); null = off. */
  cabinC: number | null;
  /** Heating / AC also on while charging (people wait in the car), at the same cabin temperature. */
  climateWhileCharging: boolean;
  chargeFromPct: number;
  chargeToPct: number;
  profile: Profile;
}

/** The driving over the years of use: Battery life and Cost of ownership each have their own. */
export interface LifeDriving {
  years: number;
  kmPerYear: number;
  /** Speed of the driving profile (km/h): held by Steady, the cruising (top) speed of the others; unused by Mixed. */
  speedKmh: number;
  /** Cabin temperature the heating / AC holds (°C); null = off. */
  cabinC: number | null;
  profile: Profile;
  /** Hills: climb per 100 km (m) and their typical slope (%); the life ends where it starts (descent = climb). */
  ascentPer100Km: number;
  slopePct: number;
}

export interface BatteryLifeInputs extends LifeDriving {
  /** Battery care: share of the charging done at DC fast chargers (%). */
  dcSharePct: number;
  /** Battery care: share of the time parked above 80 % charge (%). */
  highSocTimePct: number;
}

export interface SprintInputs extends TripTerrain {
  distanceKm: number;
  startPct: number;
  endPct: number;
  /** Speed of the driving profile (km/h): held by Steady, the cruising (top) speed of the others; unused by Mixed. */
  speedKmh: number;
  /** Cabin temperature the heating / AC holds (°C); null = off. */
  cabinC: number | null;
  profile: Profile;
}

/**
 * The cost of ownership's inputs. Amounts are in the display currency; the standard of each comes from the market
 * (data/running_costs.csv). Cars can override energy price, servicing, insurance and tyre price in cars.csv.
 */
export interface CostInputs extends LifeDriving {
  /** Price per kWh paid for charging. */
  energyPrice: number;
  /** Scheduled servicing per year, electric / petrol cars. */
  servicingBev: number;
  servicingIce: number;
  /** Voluntary (class-1) insurance per year, % of the car's value at the start of the year. */
  insuranceRateBev: number;
  insuranceRateIce: number;
  /** Lowest voluntary insurance premium per year (once the car's value is low). */
  insuranceMin: number;
  /** Compulsory insurance per year. */
  compulsoryInsurance: number;
  /** Four tyres fitted, regular / premium cars. */
  tyreSetRegular: number;
  tyreSetPremium: number;
  /** Life of a set of tyres at the reference mass (km). */
  tyreLifeKm: number;
  /** Repairs per year after the warranty (% of the purchase price), and the warranty (years). */
  repairsPct: number;
  warrantyYears: number;
  /** 12 V battery: price and years between replacements. */
  battery12vPrice: number;
  battery12vYears: number;
  /** Loss of value per year (% of the value at the start of the year), electric / petrol cars. */
  depreciationBev: number;
  depreciationIce: number;
}

export interface Scenario {
  /**
   * Version of the inputs' meaning. 2 (2026-11-20): the speed of a driving profile is the cruising speed (the top of
   * its trace), no longer the average speed incl. stops. Missing = older; withDefaults() converts it.
   */
  version?: number;
  trafficJam: TrafficJamInputs;
  noCharger: NoChargerInputs;
  longTrip: LongTripInputs;
  batteryLife: BatteryLifeInputs;
  sprint: SprintInputs;
  cost: CostInputs;
  /** Each test's own conditions (user's choice 2026-11-20: the inputs of the tests are no longer connected). */
  conditions: Record<'trafficJam' | 'noCharger' | 'sprint' | 'longTrip' | 'batteryLife' | 'cost', Conditions>;
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

/**
 * Average consumption over a stress test: energy taken from the battery per 100 km (litres per 100 km for petrol
 * cars), split into its parts. NaN when the test has no distance.
 */
export interface AverageConsumption {
  distanceKm: number;
  /** Driving: the motors, after regeneration. */
  driving: number;
  /** Onboard systems: electronics, heating / AC and bringing the parked cabin to temperature. */
  onboard: number;
  /** Battery heating and cooling. */
  battery: number;
  total: number;
}

export interface CapacityCheck {
  /** Battery capacity (same kind and age) the trip would need (kWh), comparable with availableKwh. */
  requiredKwh: number;
  /** Capacity of the car after the km driven (nominal × capacity left). */
  availableKwh: number;
  /** (available − required) / available. Positive = spare capacity. */
  margin: number;
  pass: boolean;
  /** Energy taken from the battery for the trip (kWh, incl. onboard systems and battery losses). */
  energyKwh: number;
  /** Energy the battery can deliver in the given state-of-charge window under the conditions (kWh). */
  deliverableKwh: number;
  average: AverageConsumption;
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
  average: AverageConsumption;
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
  /** Capacity at the end of life (% of nominal) the battery must keep to pass. */
  eolPct: number;
  /** Years until the capacity falls to the end-of-life capacity at this yearly distance (capped at YEARS_UNTIL_EOL_MAX). */
  yearsUntilEol: number | null;
  /** Capacity left at the end of the life (% of nominal: cycle wear + calendar ageing); null without ageing data. */
  capacityEndPct: number | null;
  average: AverageConsumption;
  steps: Step[];
  warnings: string[];
}

/** The parts of the cost of ownership, in the order of the chart. */
export type CostPartKey = 'depreciation' | 'energy' | 'insurance' | 'tax' | 'servicing' | 'tyres';

export interface CostPart {
  key: CostPartKey;
  label: string;
  /** Over the years of use, in the display currency (depreciation: null without a price). */
  value: number | null;
}

export interface CostResult {
  currency: string;
  purchase: number | null;
  /** Value of the car at the end of the years of use. */
  resale: number | null;
  /** Depreciation, energy, insurance, tax, servicing & repairs, tyres. */
  parts: CostPart[];
  energyCost: number;
  /** Everything except the purchase and resale. */
  runningCost: number;
  /** Purchase − resale + running costs (null without a price). */
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
