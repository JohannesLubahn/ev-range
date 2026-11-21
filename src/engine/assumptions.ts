import type { Dataset, Market } from '../data/types';
import { parseNumber } from '../data/parse';
import type { Assumptions } from './types';

export const NUMERIC_KEYS: Record<string, Exclude<keyof Assumptions, "fx">> = {
  rated_cycles_end_capacity_pct: 'ratedCyclesEndCapacityPct',
  capacity_good_pct: 'capacityGoodPct',
  capacity_poor_pct: 'capacityPoorPct',
  fast_charge_wear_per_c: 'fastChargeWearPerC',
  fast_charge_reference_c_rate: 'fastChargeReferenceCRate',
  care_high_soc_pct: 'careHighSocPct',
  care_normal_soc_pct: 'careNormalSocPct',
  care_typical_dc_share_pct: 'careTypicalDcSharePct',
  care_typical_high_soc_time_pct: 'careTypicalHighSocTimePct',
  care_gentle_dc_share_pct: 'careGentleDcSharePct',
  care_gentle_high_soc_time_pct: 'careGentleHighSocTimePct',
  care_hard_dc_share_pct: 'careHardDcSharePct',
  care_hard_high_soc_time_pct: 'careHardHighSocTimePct',
  battery_managed_min_c: 'batteryManagedMinC',
  battery_managed_max_c: 'batteryManagedMaxC',
  battery_hvac_max_kw: 'batteryHvacMaxKw',
  battery_heat_exchange_w_per_k: 'batteryHeatExchangeWPerK',
  battery_pack_voltage_v: 'batteryPackVoltageV',
  cabin_setpoint_c: 'cabinSetpointC',
  cabin_occupants: 'cabinOccupants',
  occupant_sensible_w: 'occupantSensibleW',
  occupant_latent_w: 'occupantLatentW',
  cabin_soak_k: 'cabinSoakK',
  ac_evaporator_c: 'acEvaporatorC',
  ac_condenser_approach_k: 'acCondenserApproachK',
  ac_carnot_efficiency_pct: 'acCarnotEfficiencyPct',
  hp_condenser_c: 'hpCondenserC',
  hp_evaporator_approach_k: 'hpEvaporatorApproachK',
  hp_carnot_efficiency_pct: 'hpCarnotEfficiencyPct',
  hp_full_c: 'hpFullC',
  hp_off_c: 'hpOffC',
  taper_speed_factor_pct: 'taperSpeedFactorPct',
  charging_efficiency_pct: 'chargingEfficiencyPct',
  rolling_resistance_n_per_kn: 'rollingResistanceNPerKn',
  tyre_pressure_ref_bar: 'tyrePressureRefBar',
  regen_efficiency_pct: 'regenEfficiencyPct',
  regen_max_decel_ms2: 'regenMaxDecelMs2',
  regen_min_kmh: 'regenMinKmh',
  hill_slope_default_pct: 'hillSlopeDefaultPct',
  driving_style_window_s: 'drivingStyleWindowS',
  driving_style_gentle_pct: 'drivingStyleGentlePct',
  driving_style_sporty_pct: 'drivingStyleSportyPct',
  rotating_mass_factor: 'rotatingMassFactor',
  frontal_area_factor: 'frontalAreaFactor',
  drivetrain_efficiency_default_pct: 'drivetrainEfficiencyDefaultPct',
  test_payload_kg: 'testPayloadKg',
  test_temperature_c: 'testTemperatureC',
};

/** Fallbacks used only if a key is missing from assumptions.csv. */
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  ratedCyclesEndCapacityPct: 80,
  capacityGoodPct: 80,
  capacityPoorPct: 60,
  fastChargeWearPerC: 0.07,
  fastChargeReferenceCRate: 1,
  careHighSocPct: 90,
  careNormalSocPct: 55,
  careTypicalDcSharePct: 25,
  careTypicalHighSocTimePct: 50,
  careGentleDcSharePct: 5,
  careGentleHighSocTimePct: 20,
  careHardDcSharePct: 60,
  careHardHighSocTimePct: 90,
  batteryManagedMinC: 10,
  batteryManagedMaxC: 35,
  batteryHvacMaxKw: 2,
  batteryHeatExchangeWPerK: 15,
  batteryPackVoltageV: 400,
  cabinSetpointC: 22,
  cabinOccupants: 1,
  occupantSensibleW: 73,
  occupantLatentW: 59,
  cabinSoakK: 22,
  acEvaporatorC: 5,
  acCondenserApproachK: 15,
  acCarnotEfficiencyPct: 40,
  hpCondenserC: 45,
  hpEvaporatorApproachK: 10,
  hpCarnotEfficiencyPct: 35,
  hpFullC: -5,
  hpOffC: -22,
  taperSpeedFactorPct: 50,
  chargingEfficiencyPct: 90,
  rollingResistanceNPerKn: 8,
  tyrePressureRefBar: 2.5,
  regenEfficiencyPct: 70,
  regenMaxDecelMs2: 1.96,
  regenMinKmh: 10,
  hillSlopeDefaultPct: 5,
  drivingStyleWindowS: 30,
  drivingStyleGentlePct: 65,
  drivingStyleSportyPct: 170,
  rotatingMassFactor: 1.05,
  frontalAreaFactor: 0.85,
  drivetrainEfficiencyDefaultPct: 88,
  testPayloadKg: 100,
  testTemperatureC: 23,
  defaultBasis: 'WLTP',
  displayCurrency: 'THB',
  costMarket: 'TH',
  runningCosts: [],
  roadTax: [],
  marketCurrencies: {},
  fx: { THB: 1 },
};

/** Reads data/assumptions.csv into typed assumptions. */
export function assumptionsFromDataset(ds: Dataset): Assumptions {
  const a: Assumptions = { ...DEFAULT_ASSUMPTIONS, fx: { ...DEFAULT_ASSUMPTIONS.fx } };
  for (const [csvKey, field] of Object.entries(NUMERIC_KEYS)) {
    const v = parseNumber(ds.assumptions[csvKey]?.value);
    if (v !== null) (a[field] as number) = v;
  }
  if (ds.assumptions.default_basis?.value) a.defaultBasis = ds.assumptions.default_basis.value.toUpperCase();
  if (ds.assumptions.display_currency?.value) a.displayCurrency = ds.assumptions.display_currency.value.toUpperCase();
  if (ds.assumptions.cost_default_market?.value) a.costMarket = ds.assumptions.cost_default_market.value.toUpperCase();
  a.runningCosts = ds.runningCosts;
  a.roadTax = ds.roadTax;
  a.marketCurrencies = Object.fromEntries(ds.markets.map((m) => [m.id, m.currency]));
  for (const def of Object.values(ds.assumptions)) {
    const m = /^fx_([A-Za-z]{3})$/.exec(def.key);
    const v = parseNumber(def.value);
    if (m && v !== null && v > 0) a.fx[m[1].toUpperCase()] = v;
  }
  return a;
}

/** Converts an amount from `currency` to the display currency. Returns null if no exchange rate is known. */
export function toDisplayCurrency(amount: number, currency: string, a: Assumptions): number | null {
  const from = currency.toUpperCase();
  const to = a.displayCurrency.toUpperCase();
  if (from === to) return amount;
  const fxFrom = from === 'THB' ? 1 : a.fx[from];
  const fxTo = to === 'THB' ? 1 : a.fx[to];
  if (!fxFrom || !fxTo) return null;
  return (amount * fxFrom) / fxTo;
}

/**
 * The assumptions for one market (data/markets.csv): its currency becomes the display currency, and its running costs
 * (data/running_costs.csv) apply. A market without rows of its own keeps cost_default_market's, converted. No market
 * (All markets) leaves the assumptions as they are.
 */
export function applyMarket(a: Assumptions, market: Market | null | undefined): Assumptions {
  if (!market) return a;
  const hasCosts = a.runningCosts.some((r) => r.market === market.id);
  return { ...a, displayCurrency: market.currency, costMarket: hasCosts ? market.id : a.costMarket };
}
