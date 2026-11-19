import { createContext, useContext, useDeferredValue, useMemo, type ReactNode } from 'react';
import { bundledFiles } from '../data/bundled';
import { parseDataset } from '../data/parse';
import type { Dataset } from '../data/types';
import { assumptionsFromDataset } from '../engine/assumptions';
import type { DataFlag, DerivedCar } from '../engine/derive';
import { runEngine, type EngineOutput } from '../engine/run';
import { spreadsheetDefaults, withDefaults } from '../engine/scenario';
import type { Assumptions, Scenario } from '../engine/types';
import { useStore, type AssumptionOverrides } from './store';

export interface EngineState {
  ds: Dataset;
  /** Assumptions from data/assumptions.csv, before the user's changes. */
  baseAssumptions: Assumptions;
  a: Assumptions;
  scenario: Scenario;
  out: EngineOutput;
  derivedById: Record<string, DerivedCar>;
  flagsById: Record<string, DataFlag[]>;
  allIds: string[];
  /** Cars in the comparison (selection), in data order. */
  selectedIds: string[];
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

  const ds = useMemo(() => parseDataset(carsCsv ? { ...bundledFiles, cars: carsCsv } : bundledFiles), [carsCsv]);
  const baseAssumptions = useMemo(() => assumptionsFromDataset(ds), [ds]);
  const a = useMemo(() => applyOverrides(baseAssumptions, overrides, fx), [baseAssumptions, overrides, fx]);
  // Scenarios saved by an older version may lack newer fields (e.g. sunshine): fill them with defaults.
  const scenario = useMemo(() => (scenarioState ? withDefaults(scenarioState, a) : spreadsheetDefaults(a)), [scenarioState, a]);

  const dScenario = useDeferredValue(scenario);
  const dSettings = useDeferredValue(settings);
  const dA = useDeferredValue(a);

  const out = useMemo(() => runEngine(ds, dA, dScenario, dSettings), [ds, dA, dScenario, dSettings]);

  const value = useMemo<EngineState>(() => {
    const derivedById = Object.fromEntries(out.derived.map((d) => [d.car.id, d]));
    const flagsById: Record<string, DataFlag[]> = {};
    for (const d of out.derived) {
      const m = out.models[d.car.id];
      flagsById[d.car.id] = [...d.flags, ...(m ? m.calibrationFlags() : [])];
    }
    const allIds = out.derived.map((d) => d.car.id);
    const selectedIds = selected ? allIds.filter((id) => selected.includes(id)) : allIds;
    return {
      ds,
      baseAssumptions,
      a,
      scenario,
      out,
      derivedById,
      flagsById,
      allIds,
      selectedIds,
      stale: dScenario !== scenario || dSettings !== settings || dA !== a,
    };
  }, [ds, baseAssumptions, a, scenario, out, selected, dScenario, dSettings, dA, settings]);

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineState {
  const v = useContext(EngineContext);
  if (!v) throw new Error('useEngine outside EngineProvider');
  return v;
}
