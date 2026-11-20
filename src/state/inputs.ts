// Wiring of the input fields to the scenario: value, change, ↺ back to standard and ⇉ use in all tests.
import { TEST_KEYS, TEST_LABELS, copyInputs, getInput, linkedInputs, setInputs, testInputs, type InputRef, type InputValue, type TestKey } from '../engine/inputs';
import type { Conditions, Scenario } from '../engine/types';
import { useEngine } from './engine';
import { useStore } from './store';
import type { InputActions } from '../components/Fields';

export interface InputProps<V> extends InputActions<V> {
  value: V;
  onChange: (v: V) => void;
}

/** Where ⇉ copies to: "all tests", or the one other page (e.g. "Cost of ownership too"). */
function scopeOf(linked: InputRef[]): string {
  return linked.length === 1 ? `${TEST_LABELS[linked[0].test]} too` : 'all tests';
}

/** Props for the field of one input of one test. */
export function inputProps<V extends InputValue>(scenario: Scenario, standard: Scenario, set: (s: Scenario) => void, ref: InputRef): InputProps<V> {
  const value = getInput(scenario, ref) as V;
  const linked = linkedInputs(ref);
  const std = getInput(standard, ref) as V;
  return {
    value,
    onChange: (v) => set(setInputs(scenario, [ref], v)),
    reset: { value: std, onReset: () => set(setInputs(scenario, [ref], std)) },
    applyAll:
      linked.length > 0
        ? { scope: scopeOf(linked), differs: linked.some((l) => getInput(scenario, l) !== value), onApply: () => set(setInputs(scenario, linked, value)) }
        : undefined,
  };
}

/**
 * Props for a condition that stands for all tests at once (the Conditions panel on Compare): shows the No charger
 * value when the tests differ, with their values listed; a change sets every test; ↺ puts each test back to its
 * own standard.
 */
export function allTestsProps<V extends InputValue>(scenario: Scenario, standard: Scenario, set: (s: Scenario) => void, key: keyof Conditions): InputProps<V> {
  const refs: InputRef[] = TEST_KEYS.map((test) => ({ test, group: 'conditions', key }));
  const values = refs.map((r) => getInput(scenario, r) as V);
  const distinct = [...new Set(values)];
  return {
    value: getInput(scenario, { test: 'noCharger', group: 'conditions', key }) as V,
    onChange: (v) => set(setInputs(scenario, refs, v)),
    reset: { text: "each test's own", differs: refs.some((r) => getInput(scenario, r) !== getInput(standard, r)), onReset: () => set(copyInputs(scenario, refs, standard)) },
    spread: distinct.length > 1 ? distinct : undefined,
  };
}

/** Field props for the inputs of one test (null = the conditions of all tests at once). */
export function useInputs(test: TestKey | null) {
  const { scenario, standard } = useEngine();
  const setScenario = useStore((s) => s.setScenario);
  const trip = <V extends InputValue>(key: string) => inputProps<V>(scenario, standard, setScenario, { test: test ?? 'noCharger', group: 'trip', key });
  const cond = <V extends InputValue>(key: keyof Conditions) =>
    test ? inputProps<V>(scenario, standard, setScenario, { test, group: 'conditions', key }) : allTestsProps<V>(scenario, standard, setScenario, key);
  /** Several trip inputs in one change (e.g. a battery-care preset sets both habits). */
  const setTrip = (values: Record<string, InputValue>) => {
    let next = scenario;
    for (const [key, v] of Object.entries(values)) next = setInputs(next, [{ test: test ?? 'noCharger', group: 'trip', key }], v);
    setScenario(next);
  };
  const refs = test ? testInputs(test) : [];
  const changed = refs.some((r) => getInput(scenario, r) !== getInput(standard, r));
  return { trip, cond, setTrip, changed, resetTest: () => setScenario(copyInputs(scenario, refs, standard)) };
}
