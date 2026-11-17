import { create } from 'zustand';
import { spreadsheetDefaults } from '../engine/scenario';
import type { Assumptions, Conditions, ModelSettings, Scenario } from '../engine/types';
import { load, save } from './storage';

export type View = 'compare' | 'stress-tests' | 'cars' | 'physics' | 'assumptions';
export const VIEWS: { id: View; label: string }[] = [
  { id: 'compare', label: 'Compare' },
  { id: 'stress-tests', label: 'Stress tests' },
  { id: 'cars', label: 'Cars' },
  { id: 'physics', label: 'Physics' },
  { id: 'assumptions', label: 'Assumptions' },
];

export type CaseKey = 'trafficJam' | 'noCharger' | 'sprint' | 'batteryLife' | 'longTrip' | 'cost';
export type SortKey = 'overall' | 'name' | CaseKey;
export type Theme = 'system' | 'light' | 'dark';

export interface Filters {
  search: string;
  maxPriceM: number | null;
  chemistries: string[];
}

export type AssumptionOverrides = Partial<Record<Exclude<keyof Assumptions, 'fx'>, number | string>>;

export interface BuiltInPreset {
  id: string;
  label: string;
  description: string;
  conditions: Partial<Conditions>;
}

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  { id: 'spreadsheet', label: 'Spreadsheet defaults', description: 'The inputs of your Battery Sizing tab, at 25 °C', conditions: {} },
  { id: 'thai-hot', label: 'Hot day (35 °C)', description: 'Spreadsheet inputs on a hot day: more AC and battery cooling', conditions: { airTemperatureC: 35 } },
  { id: 'cold', label: 'Cold day (−10 °C)', description: 'Spreadsheet inputs in winter: heating, cold battery, denser air', conditions: { airTemperatureC: -10 } },
];

interface SharedState {
  scenario: Scenario | null;
  settings: ModelSettings;
  selectedIds: string[] | null;
  assumptionOverrides: AssumptionOverrides;
  fxOverrides: Record<string, number>;
}

export interface AppState extends SharedState {
  carsCsv: string | null;
  carsCsvName: string | null;
  presetId: string;
  savedPresets: Record<string, Scenario>;
  filters: Filters;
  layout: 'table' | 'cards';
  sort: { key: SortKey; dir: 1 | -1 };
  theme: Theme;
  drawer: { carId: string; caseKey: CaseKey } | null;
  stressTab: CaseKey;
  physicsCars: string[];

  setScenario: (s: Scenario) => void;
  resetScenario: () => void;
  applyPreset: (id: string, a: Assumptions) => void;
  savePreset: (name: string, s: Scenario) => void;
  deletePreset: (name: string) => void;
  setSettings: (p: Partial<ModelSettings>) => void;
  setSelected: (ids: string[] | null) => void;
  toggleCar: (id: string, allIds: string[]) => void;
  setFilters: (p: Partial<Filters>) => void;
  setSort: (key: SortKey) => void;
  setLayout: (l: 'table' | 'cards') => void;
  setTheme: (t: Theme) => void;
  openDrawer: (carId: string, caseKey: CaseKey) => void;
  closeDrawer: () => void;
  setStressTab: (t: CaseKey) => void;
  setPhysicsCars: (ids: string[]) => void;
  setAssumption: (key: Exclude<keyof Assumptions, 'fx'>, value: number | string | undefined) => void;
  setFx: (cur: string, value: number | undefined) => void;
  resetAssumptions: () => void;
  loadCarsCsv: (text: string, name: string) => void;
  resetCarsCsv: () => void;
  applyShared: (s: Partial<SharedState>) => void;
}

const DEFAULT_SETTINGS: ModelSettings = { consumption: 'physics', battery: 'chemistry' };

export const useStore = create<AppState>((set, get) => ({
  scenario: load<Scenario | null>('scenario', null),
  settings: { ...DEFAULT_SETTINGS, ...load<Partial<ModelSettings>>('settings', {}), exactSpreadsheet: false },
  selectedIds: load<string[] | null>('selected', null),
  assumptionOverrides: load<AssumptionOverrides>('assumptions', {}),
  fxOverrides: load<Record<string, number>>('fx', {}),
  carsCsv: load<string | null>('carsCsv', null),
  carsCsvName: load<string | null>('carsCsvName', null),
  presetId: load<string>('preset', 'spreadsheet'),
  savedPresets: load<Record<string, Scenario>>('presets', {}),
  filters: { search: '', maxPriceM: null, chemistries: [], ...load<Partial<Filters>>('filters', {}) },
  layout: load<'table' | 'cards'>('layout', 'table'),
  sort: load<{ key: SortKey; dir: 1 | -1 }>('sort', { key: 'overall', dir: 1 }),
  theme: load<Theme>('theme', 'system'),
  drawer: null,
  stressTab: load<CaseKey>('stressTab', 'noCharger'),
  physicsCars: load<string[]>('physicsCars', []),

  setScenario: (s) => set({ scenario: s, presetId: 'custom' }),
  resetScenario: () => set({ scenario: null, presetId: 'spreadsheet' }),
  applyPreset: (id, a) => {
    const builtIn = BUILT_IN_PRESETS.find((p) => p.id === id);
    if (builtIn) {
      const base = spreadsheetDefaults(a);
      set({
        scenario: id === 'spreadsheet' ? null : { ...base, conditions: { ...base.conditions, ...builtIn.conditions } },
        presetId: id,
      });
      return;
    }
    const saved = get().savedPresets[id];
    if (saved) set({ scenario: structuredClone(saved), presetId: id });
  },
  savePreset: (name, s) => set({ savedPresets: { ...get().savedPresets, [name]: structuredClone(s) }, presetId: name, scenario: s }),
  deletePreset: (name) => {
    const next = { ...get().savedPresets };
    delete next[name];
    set({ savedPresets: next, presetId: get().presetId === name ? 'custom' : get().presetId });
  },
  setSettings: (p) => set({ settings: { ...get().settings, ...p } }),
  setSelected: (ids) => set({ selectedIds: ids }),
  toggleCar: (id, allIds) => {
    const cur = get().selectedIds ?? allIds;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ selectedIds: next.length === allIds.length && allIds.every((x) => next.includes(x)) ? null : next });
  },
  setFilters: (p) => set({ filters: { ...get().filters, ...p } }),
  setSort: (key) => {
    const cur = get().sort;
    set({ sort: cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 } });
  },
  setLayout: (l) => set({ layout: l }),
  setTheme: (t) => set({ theme: t }),
  openDrawer: (carId, caseKey) => set({ drawer: { carId, caseKey } }),
  closeDrawer: () => set({ drawer: null }),
  setStressTab: (t) => set({ stressTab: t }),
  setPhysicsCars: (ids) => set({ physicsCars: ids }),
  setAssumption: (key, value) => {
    const next = { ...get().assumptionOverrides };
    if (value === undefined || value === '') delete next[key];
    else next[key] = value;
    set({ assumptionOverrides: next });
  },
  setFx: (cur, value) => {
    const next = { ...get().fxOverrides };
    if (value === undefined) delete next[cur];
    else next[cur] = value;
    set({ fxOverrides: next });
  },
  resetAssumptions: () => set({ assumptionOverrides: {}, fxOverrides: {} }),
  loadCarsCsv: (text, name) => set({ carsCsv: text, carsCsvName: name, selectedIds: null }),
  resetCarsCsv: () => set({ carsCsv: null, carsCsvName: null, selectedIds: null }),
  applyShared: (s) => set({ ...s, presetId: s.scenario ? 'custom' : get().presetId }),
}));

// Remember the viewer's settings in this browser.
useStore.subscribe((s, prev) => {
  const pairs: [keyof AppState, string][] = [
    ['scenario', 'scenario'], ['settings', 'settings'], ['selectedIds', 'selected'], ['assumptionOverrides', 'assumptions'],
    ['fxOverrides', 'fx'], ['carsCsv', 'carsCsv'], ['carsCsvName', 'carsCsvName'], ['presetId', 'preset'],
    ['savedPresets', 'presets'], ['filters', 'filters'], ['layout', 'layout'], ['sort', 'sort'], ['theme', 'theme'],
    ['stressTab', 'stressTab'], ['physicsCars', 'physicsCars'],
  ];
  for (const [k, storageKey] of pairs) if (s[k] !== prev[k]) save(storageKey, s[k]);
});

// ------------------------------------------------------------------------------------------ share link
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function shareLink(): string {
  const s = useStore.getState();
  const shared: SharedState = {
    scenario: s.scenario,
    settings: s.settings,
    selectedIds: s.selectedIds,
    assumptionOverrides: s.assumptionOverrides,
    fxOverrides: s.fxOverrides,
  };
  const url = new URL(window.location.href);
  url.search = `?s=${toBase64Url(JSON.stringify(shared))}`;
  return url.toString();
}

/** Applies a shared state from ?s=… once at start-up, then removes it from the address bar. */
export function applySharedFromUrl(): boolean {
  try {
    const url = new URL(window.location.href);
    const s = url.searchParams.get('s');
    if (!s) return false;
    const shared = JSON.parse(fromBase64Url(s)) as Partial<SharedState>;
    useStore.getState().applyShared(shared);
    url.searchParams.delete('s');
    window.history.replaceState(null, '', url.toString());
    return true;
  } catch {
    return false;
  }
}
