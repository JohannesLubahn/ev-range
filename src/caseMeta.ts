import type { CaseKey } from './state/store';

export interface CaseMeta {
  key: CaseKey;
  label: string;
  question: string;
}

export const CASES: CaseMeta[] = [
  { key: 'trafficJam', label: 'Traffic jam', question: 'Can the battery keep the car running through a long traffic jam?' },
  { key: 'noCharger', label: 'No charger', question: 'Can I reach the next charger?' },
  { key: 'sprint', label: 'Sprint', question: 'Can I drive fast to the next charger?' },
  { key: 'batteryLife', label: 'Battery life', question: 'Does the battery last for the years I plan to keep the car?' },
  { key: 'longTrip', label: 'Long trip', question: 'How long does a long trip take, charging included?' },
  { key: 'cost', label: 'Cost of ownership', question: 'What does the car cost over its life?' },
];

export const caseLabel = (k: CaseKey) => CASES.find((c) => c.key === k)?.label ?? k;
