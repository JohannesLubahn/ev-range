import { createContext, useContext, useDeferredValue, useMemo, useRef, type ReactNode } from 'react';
import { bundledFiles } from '../data/bundled';
import { parseDataset } from '../data/parse';
import type { Dataset, Market } from '../data/types';
import { applyMarket, assumptionsFromDataset } from '../engine/assumptions';
import { deriveAll, type DataFlag, type DerivedCar } from '../engine/derive';
import { runEngine, type EngineCache, type EngineOutput } from '../engine/run';
import { standardScenario, withDefaults } from '../engine/scenario';
import type { Assumptions, Scenario } from '../engine/types';
import { DEFAULT_MARKET, inMarket, shownIds as computeShownIds } from './carList';
import { useStore, type AssumptionOverrides } from './store';

export interface EngineState {
  ds: Dataset;
  /** Assumptions from data/assumptions.csv, before the user's changes. */
  baseAssumptions: Assumptions;
  /** Assumptions with the user's changes and the market's currency and prices. */
  a: Assumptions;
  /** The market's id and its row of data/markets.csv. */
  marketId: string;
  market: Market | null;
  /** Assumptions as they would be in another market (for its cost defaults when switching). */
  assumptionsFor: (marketId: string) => Assumptions;
  scenario: Scenario;
  /** The standard inputs (data/standard.csv) that ↺ goes back to. */
  standard: Scenario;
  /** Results and models of the selected cars only (every car is in `out.derived`). */
  out: EngineOutput;
  derivedById: Record<string, DerivedCar>;
  flagsById: Record<string, DataFlag[]>;
  /** Every car of every market, in data order. */
  allIds: string[];
  /** Cars in the market that pass the car-list filters, in data order. */
  shownIds: string[];
  /** Ticked cars the market and filters show, in data order (the car list's checkboxes). */
  tickedIds: string[];
  /** Cars in the comparison: ticked, shown and calculated, in data order. Every page uses these. */
  selectedIds: string[];
  /** Ticked cars of the market that the filters hide. */
  hiddenSelectedCount: number;
  /** Inputs changed and results are being recalculated. */
  stale: boolean;
}

const EngineContext = createContext<EngineState | null>(null);

function applyOverrides(base: Assumptions, o: AssumptionOverrides, fx: Record<string, number>): Assumptions {
  const a: Assumptions = { ...base, fx: { ...base.fx, ...fx } };
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    (a as unknown as Record<string, number | string>)[k] = v;
  }
  return a;
}

export function EngineProvider({ children }: { children: ReactNode }) {
  const carsCsv = useStore((s) => s.carsCsv);
  const overrides = useStore((s) => s.assumptionOverrides);
  const fx = useStore((s) => s.fxOverrides);
  const scenarioState = useStore((s) => s.scenario);
  const settings = useStore((s) => s.settings);
  const selected = useStore((s) => s.selectedIds);
  const marketState = useStore((s) => s.market);
  const filters = useStore((s) => s.filters);

  const ds = useMemo(() => parseDataset(carsCsv ? { ...bundledFiles, cars: carsCsv } : bundledFiles), [carsCsv]);
  const baseAssumptions = useMemo(() => assumptionsFromDataset(ds), [ds]);
  const userA = useMemo(() => applyOverrides(baseAssumptions, overrides, fx), [baseAssumptions, overrides, fx]);
  // A saved 'all' (the removed All markets option) or an unknown market opens the default market.
  const marketId =
    marketState && ds.markets.some((m) => m.id === marketState)
      ? marketState
      : ds.markets.some((m) => m.id === DEFAULT_MARKET)
        ? DEFAULT_MARKET
        : (ds.markets[0]?.id ?? DEFAULT_MARKET);
  const market = ds.markets.find((m) => m.id === marketId) ?? null;
  const a = useMemo(() => applyMarket(userA, market), [userA, market]);
  // Without a saved scenario: the standard. Scenarios saved by an older version may lack newer fields (e.g. sunshine)
  // or have one set of conditions for all tests: withDefaults fills and converts them.
  const standard = useMemo(() => standardScenario(ds, a), [ds, a]);
  const scenario = useMemo(() => (scenarioState ? withDefaults(scenarioState, ds, a) : standard), [scenarioState, ds, a, standard]);

  const dScenario = useDeferredValue(scenario);
  const dSettings = useDeferredValue(settings);
  const dA = useDeferredValue(a);

  // The car list needs every car's specs and price (cheap); the calculation runs only for the cars selected.
  const derived = useMemo(() => deriveAll(ds, a), [ds, a]);
  const list = useMemo(() => {
    const shownIds = computeShownIds(derived, marketId, filters);
    const ticked = (id: string) => selected === null || selected.includes(id);
    const selectedIds = shownIds.filter(ticked);
    const hiddenSelectedCount = derived.filter((d) => inMarket(d, marketId) && ticked(d.car.id)).length - selectedIds.length;
    return { shownIds, selectedIds, hiddenSelectedCount };
  }, [derived, marketId, filters, selected]);
  const dSelectedIds = useDeferredValue(list.selectedIds);

  const cache = useRef<EngineCache | null>(null);
  const out = useMemo(() => {
    const r = runEngine(ds, dA, dScenario, dSettings, dSelectedIds, cache.current);
    cache.current = r.cache;
    return { derived: r.derived, models: r.models, results: r.results };
  }, [ds, dA, dScenario, dSettings, dSelectedIds]);

  const value = useMemo<EngineState>(() => {
    const derivedById = Object.fromEntries(out.derived.map((d) => [d.car.id, d]));
    const flagsById: Record<string, DataFlag[]> = {};
    for (const d of out.derived) {
      const m = out.models[d.car.id];
      flagsById[d.car.id] = [...d.flags, ...(m ? m.noCharger.calibrationFlags() : [])];
    }
    const allIds = out.derived.map((d) => d.car.id);
    const { shownIds, hiddenSelectedCount } = list;
    const tickedIds = list.selectedIds;
    // A car ticked a moment ago joins once its calculation is done (deferred), so pages never see a car without results.
    const selectedIds = tickedIds.filter((id) => out.models[id]);
    return {
      ds,
      baseAssumptions,
      a,
      marketId,
      market,
      assumptionsFor: (id: string) => applyMarket(userA, ds.markets.find((m) => m.id === id) ?? null),
      scenario,
      standard,
      out,
      derivedById,
      flagsById,
      allIds,
      shownIds,
      tickedIds,
      selectedIds,
      hiddenSelectedCount,
      stale: dScenario !== scenario || dSettings !== settings || dA !== a || dSelectedIds !== list.selectedIds,
    };
  }, [ds, baseAssumptions, a, userA, marketId, market, list, scenario, standard, out, dScenario, dSettings, dA, dSelectedIds, settings]);

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineState {
  const v = useContext(EngineContext);
  if (!v) throw new Error('useEngine outside EngineProvider');
  return v;
}
