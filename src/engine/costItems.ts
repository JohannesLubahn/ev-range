// The items the cost of ownership uses (kept apart from costs.ts so the CSV parser can check them without the engine).
// Their labels, units and rules (money, inherited from a bloc, required) are data: data/costs/items.csv.

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
