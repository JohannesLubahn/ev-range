import { create } from 'zustand';
import { NUMERIC_KEYS } from '../engine/assumptions';
import type { Dataset } from '../data/types';
import { TEST_KEYS, type TestKey } from '../engine/inputs';
import { spreadsheetScenario, standardScenario } from '../engine/scenario';
import type { Assumptions, Conditions, CostInputs, ModelSettings, Scenario } from '../engine/types';
import { type Filters, type ListGroupKey, type ListSort, migrateFilters } from './carList';
import { load, save } from './storage';

export type View = 'compare' | 'stress-tests' | 'battery-life' | 'cost' | 'cars' | 'physics' | 'assumptions';
export const VIEWS: { id: View; label: string }[] = [
  { id: 'compare', label: 'Compare' },
  { id: 'stress-tests', label: 'Stress tests' },
  { id: 'battery-life', label: 'Battery life' },
  { id: 'cost', label: 'Cost of ownership' },
  { id: 'cars', label: 'Cars' },
  { id: 'physics', label: 'Physics' },
  { id: 'assumptions', label: 'Assumptions' },
];

export type CaseKey = TestKey;
/** The tests with a battery-needed result and an average consumption; cost of ownership has its own page. */
export type StressKey = Exclude<CaseKey, 'cost'>;
/** The tabs of the Stress tests page; battery life has its own page. */
export type StressTab = Exclude<StressKey, 'batteryLife'>;
const STRESS_TABS: StressTab[] = ['trafficJam', 'noCharger', 'sprint', 'longTrip'];
export type SortKey = 'overall' | 'name' | CaseKey;
export type Theme = 'system' | 'light' | 'dark';

export type { Filters } from './carList';

export type AssumptionOverrides = Partial<Record<Exclude<keyof Assumptions, 'fx'>, number | string>>;

export interface BuiltInPreset {
  id: string;
  label: string;
  description: string;
  /** Weather set in every test, on top of the standard (none = the standard or the spreadsheet as they are). */
  conditions: Partial<Conditions>;
}

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  {
    id: 'standard',
    label: 'Standard (fitted to each test)',
    description: 'Your spreadsheet inputs, with conditions fitted to each test (data/standard.csv): traffic jam on a hot afternoon, long trip fully loaded, …',
    conditions: {},
  },
  { id: 'spreadsheet', label: 'Spreadsheet values (25 °C everywhere)', description: 'The inputs of your Battery Sizing tab, with the same conditions in every test', conditions: {} },
  {
    id: 'thai-hot',
    label: 'Hot sunny day (35 °C)',
    description: 'Standard inputs on a hot, sunny, humid day in every test: more AC and battery cooling',
    conditions: { airTemperatureC: 35, solarWm2: 800, humidityPct: 60 },
  },
  {
    id: 'cold',
    label: 'Cold day (−10 °C)',
    description: 'Standard inputs in winter in every test: heating, cold battery, denser air',
    conditions: { airTemperatureC: -10, solarWm2: 100, humidityPct: 80 },
  },
];

/** The scenario of a built-in preset (null = the standard itself). */
export function builtInScenario(id: string, ds: Dataset, a: Assumptions): Scenario | null | undefined {
  const p = BUILT_IN_PRESETS.find((x) => x.id === id);
  if (!p) return undefined;
  if (id === 'standard') return null;
  if (id === 'spreadsheet') return structuredClone(spreadsheetScenario(ds, a));
  const base = standardScenario(ds, a);
  const conditions = Object.fromEntries(TEST_KEYS.map((t) => [t, { ...base.conditions[t], ...p.conditions }])) as Scenario['conditions'];
  return { ...structuredClone(base), conditions };
}

interface SharedState {
  scenario: Scenario | null;
  settings: ModelSettings;
  selectedIds: string[] | null;
  assumptionOverrides: AssumptionOverrides;
  fxOverrides: Record<string, number>;
  /** Market id from data/markets.csv, 'all' for every car; null = the first market of markets.csv. */
  market?: string | null;
}

export interface AppState extends SharedState {
  carsCsv: string | null;
  carsCsvName: string | null;
  presetId: string;
  savedPresets: Record<string, Scenario>;
  filters: Filters;
  listSort: ListSort;
  listGroup: ListGroupKey;
  /** The car list opened as a drawer (pages other than Compare). */
  pickerOpen: boolean;
  layout: 'table' | 'cards';
  sort: { key: SortKey; dir: 1 | -1 };
  theme: Theme;
  drawer: { carId: string; caseKey: CaseKey } | null;
  stressTab: StressTab;
  physicsCars: string[];
  /** The test whose conditions the Physics page and the Cars page's calculated rows use. */
  refTest: TestKey;

  setScenario: (s: Scenario) => void;
  resetScenario: () => void;
  applyPreset: (id: string, ds: Dataset, a: Assumptions) => void;
  savePreset: (name: string, s: Scenario) => void;
  deletePreset: (name: string) => void;
  setSettings: (p: Partial<ModelSettings>) => void;
  setSelected: (ids: string[] | null) => void;
  toggleCar: (id: string, allIds: string[]) => void;
  setFilters: (p: Partial<Filters>) => void;
  /** Switches the market. The cost inputs are in the market's currency, so they go back to its defaults. */
  setMarket: (id: string, costDefaults: Pick<CostInputs, 'energyPrice' | 'maintenancePerYear'>) => void;
  setListSort: (s: ListSort) => void;
  setListGroup: (g: ListGroupKey) => void;
  setPickerOpen: (open: boolean) => void;
  setSort: (key: SortKey) => void;
  setLayout: (l: 'table' | 'cards') => void;
  setTheme: (t: Theme) => void;
  openDrawer: (carId: string, caseKey: CaseKey) => void;
  closeDrawer: () => void;
  setStressTab: (t: StressTab) => void;
  setPhysicsCars: (ids: string[]) => void;
  setRefTest: (t: TestKey) => void;
  setAssumption: (key: Exclude<keyof Assumptions, 'fx'>, value: number | string | undefined) => void;
  setFx: (cur: string, value: number | undefined) => void;
  resetAssumptions: () => void;
  loadCarsCsv: (text: string, name: string) => void;
  resetCarsCsv: () => void;
  applyShared: (s: Partial<SharedState>) => void;
}

/**
 * Settings saved or shared by older versions may still hold the removed Simple model, which always came with the
 * ideal battery ({consumption: 'simple', battery: 'ideal'}): those go back to the chemistry curves.
 */
function normalizeSettings(raw: unknown): ModelSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { battery?: unknown; consumption?: unknown };
  return { battery: r.battery === 'ideal' && r.consumption !== 'simple' ? 'ideal' : 'chemistry' };
}

const ASSUMPTION_KEYS = new Set<string>([...Object.values(NUMERIC_KEYS), 'defaultBasis', 'displayCurrency']);

/** Overrides of assumptions that no longer exist (e.g. the Simple model's high-speed factor) are dropped. */
function knownOverrides(raw: unknown): AssumptionOverrides {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter(([k]) => ASSUMPTION_KEYS.has(k))) as AssumptionOverrides;
}

/**
 * Without a saved scenario the app shows the standard. Older versions called that 'spreadsheet' (the spreadsheet's
 * inputs were the default then).
 */
function initialPresetId(): string {
  const id = load<string>('preset', 'standard');
  return id === 'spreadsheet' && load<Scenario | null>('scenario', null) === null ? 'standard' : id;
}

/** A saved tab that no longer exists (battery life moved to its own page) falls back to No charger. */
function parseStressTab(v: unknown): StressTab {
  return STRESS_TABS.includes(v as StressTab) ? (v as StressTab) : 'noCharger';
}

export const useStore = create<AppState>((set, get) => ({
  scenario: load<Scenario | null>('scenario', null),
  settings: normalizeSettings(load<unknown>('settings', {})),
  selectedIds: load<string[] | null>('selected', null),
  assumptionOverrides: knownOverrides(load<unknown>('assumptions', {})),
  fxOverrides: load<Record<string, number>>('fx', {}),
  carsCsv: load<string | null>('carsCsv', null),
  carsCsvName: load<string | null>('carsCsvName', null),
  presetId: initialPresetId(),
  savedPresets: load<Record<string, Scenario>>('presets', {}),
  market: load<string | null>('market', null),
  filters: migrateFilters(load<unknown>('filters', {})),
  listSort: load<ListSort>('listSort', { key: 'model', dir: 1 }),
  listGroup: load<ListGroupKey>('listGroup', 'none'),
  pickerOpen: false,
  layout: load<'table' | 'cards'>('layout', 'table'),
  sort: load<{ key: SortKey; dir: 1 | -1 }>('sort', { key: 'overall', dir: 1 }),
  theme: load<Theme>('theme', 'system'),
  drawer: null,
  stressTab: parseStressTab(load<unknown>('stressTab', 'noCharger')),
  physicsCars: load<string[]>('physicsCars', []),
  refTest: ((t: unknown) => (TEST_KEYS.includes(t as TestKey) ? (t as TestKey) : 'noCharger'))(load<unknown>('refTest', 'noCharger')),

  setScenario: (s) => set({ scenario: s, presetId: 'custom' }),
  resetScenario: () => set({ scenario: null, presetId: 'standard' }),
  applyPreset: (id, ds, a) => {
    const builtIn = builtInScenario(id, ds, a);
    if (builtIn !== undefined) {
      set({ scenario: builtIn, presetId: id });
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
  setMarket: (id, costDefaults) => {
    const { scenario, filters } = get();
    set({
      market: id,
      // Price filters are in the old market's currency.
      filters: { ...filters, priceMin: null, priceMax: null },
      ...(scenario ? { scenario: { ...scenario, cost: { ...scenario.cost, ...costDefaults } } } : {}),
    });
  },
  setListSort: (s) => set({ listSort: s }),
  setListGroup: (g) => set({ listGroup: g }),
  setPickerOpen: (open) => set({ pickerOpen: open }),
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
  setRefTest: (t) => set({ refTest: t }),
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
  applyShared: (s) =>
    set({
      ...s,
      ...(s.settings ? { settings: normalizeSettings(s.settings) } : {}),
      ...(s.assumptionOverrides ? { assumptionOverrides: knownOverrides(s.assumptionOverrides) } : {}),
      presetId: s.scenario ? 'custom' : get().presetId,
    }),
}));

// Remember the viewer's settings in this browser.
useStore.subscribe((s, prev) => {
  const pairs: [keyof AppState, string][] = [
    ['scenario', 'scenario'], ['settings', 'settings'], ['selectedIds', 'selected'], ['assumptionOverrides', 'assumptions'],
    ['fxOverrides', 'fx'], ['carsCsv', 'carsCsv'], ['carsCsvName', 'carsCsvName'], ['presetId', 'preset'],
    ['savedPresets', 'presets'], ['filters', 'filters'], ['market', 'market'], ['listSort', 'listSort'], ['listGroup', 'listGroup'], ['layout', 'layout'], ['sort', 'sort'], ['theme', 'theme'],
    ['stressTab', 'stressTab'], ['physicsCars', 'physicsCars'], ['refTest', 'refTest'],
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
    market: s.market,
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
