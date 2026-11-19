import type { CaseKey, StressTab } from './state/store';

export interface CaseMeta {
  key: CaseKey;
  label: string;
  question: string;
}

/** The stress tests, in the order of their tabs. */
export const STRESS_TESTS: (CaseMeta & { key: StressTab })[] = [
  { key: 'trafficJam', label: 'Traffic jam', question: 'Can the battery keep the car running through a long traffic jam?' },
  { key: 'noCharger', label: 'No charger', question: 'Can I reach the next charger?' },
  { key: 'sprint', label: 'Sprint', question: 'Can I drive fast to the next charger?' },
  { key: 'longTrip', label: 'Long trip', question: 'How long does a long trip take, charging included?' },
];

/** Battery life has its own page, between the stress tests and the cost of ownership. */
export const BATTERY_LIFE_CASE: CaseMeta & { key: 'batteryLife' } = {
  key: 'batteryLife',
  label: 'Battery life',
  question: 'Does the battery last for the years I plan to keep the car?',
};

export const COST_CASE: CaseMeta = { key: 'cost', label: 'Cost of ownership', question: 'What does the car cost over its life?' };

/** Every calculation that has an explanation in the drawer. */
export const CASES: CaseMeta[] = [...STRESS_TESTS, BATTERY_LIFE_CASE, COST_CASE];

export const caseLabel = (k: CaseKey) => CASES.find((c) => c.key === k)?.label ?? k;
