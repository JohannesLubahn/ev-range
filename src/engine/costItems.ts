// The items of data/running_costs.csv (kept apart from costs.ts so the CSV parser can check them without the engine).

export const COST_ITEMS = [
  'electricity_price',
  'compulsory_insurance',
  'insurance_rate_pct',
  'insurance_min',
  'servicing_per_year',
  'tyre_set_regular',
  'tyre_set_premium',
  'tyre_life_km',
  'tyre_reference_kg',
  'repairs_pct',
  'warranty_years',
  'battery_12v_price',
  'battery_12v_years',
  'depreciation_pct',
] as const;

export type CostItem = (typeof COST_ITEMS)[number];

export const COST_ITEM_LABELS: Record<CostItem, string> = {
  electricity_price: 'Electricity price',
  compulsory_insurance: 'Compulsory insurance',
  insurance_rate_pct: 'Voluntary insurance',
  insurance_min: 'Lowest voluntary premium',
  servicing_per_year: 'Servicing',
  tyre_set_regular: 'Tyre set, regular car',
  tyre_set_premium: 'Tyre set, premium car',
  tyre_life_km: 'Tyre life',
  tyre_reference_kg: 'Tyre life applies at',
  repairs_pct: 'Repairs after the warranty',
  warranty_years: 'Warranty',
  battery_12v_price: '12 V battery',
  battery_12v_years: '12 V battery lasts',
  depreciation_pct: 'Loss of value',
};

/** Items that are amounts of money (converted to the display currency); the others are %, km, kg or years. */
export const MONEY_ITEMS: ReadonlySet<CostItem> = new Set<CostItem>([
  'electricity_price',
  'compulsory_insurance',
  'insurance_min',
  'servicing_per_year',
  'tyre_set_regular',
  'tyre_set_premium',
  'battery_12v_price',
]);
