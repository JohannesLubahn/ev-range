import { num } from '../format';
import { useEngine } from '../state/engine';
import { useInputs, type InputProps } from '../state/inputs';
import { BUILT_IN_PRESETS, useStore } from '../state/store';
import { TEST_KEYS, TEST_LABELS, type TestKey } from '../engine/inputs';
import type { Assumptions, Conditions, ThermalMode } from '../engine/types';
import { NumberField, SelectField } from './Fields';

function thermalOptions(a: Assumptions): { id: ThermalMode; label: string; description: string }[] {
  return [
    {
      id: 'managed',
      label: 'Managed (heated / cooled)',
      description: `Starts at air temperature; heated below ${a.batteryManagedMinC} °C and cooled above ${a.batteryManagedMaxC} °C while driving`,
    },
    { id: 'ambient', label: 'Not heated or cooled', description: 'Starts at air temperature and only warms from its own losses' },
    { id: 'preconditioned', label: 'Preconditioned', description: 'Battery and cabin brought to temperature while plugged in, then managed' },
  ];
}

type StylePreset = 'gentle' | 'normal' | 'sporty';

function stylePresets(a: Assumptions): Record<StylePreset, number> {
  return { gentle: a.drivingStyleGentlePct, normal: 100, sporty: a.drivingStyleSportyPct };
}

/** Name of the driving style: a preset, or null for a value set by hand. */
export function drivingStyleName(a: Assumptions, pct: number): StylePreset | null {
  const p = stylePresets(a);
  return (Object.keys(p) as StylePreset[]).find((k) => p[k] === pct) ?? null;
}

/** Driving style: a preset (Gentle / Normal / Sporty) or the accelerations and braking in % of the WLTP's. */
function DrivingStyleFields(props: InputProps<number>) {
  const { value, onChange } = props;
  const { a } = useEngine();
  const presets = stylePresets(a);
  const options: { id: StylePreset | 'custom'; label: string; description: string }[] = [
    {
      id: 'gentle',
      label: 'Gentle',
      description: `Soft launches, slowing early instead of braking late (${presets.gentle} % of the WLTP's accelerations): the smoothest driving the EU real-driving test (RDE) accepts`,
    },
    { id: 'normal', label: 'Normal', description: "The accelerations and braking of the WLTP test cycle (100 %)" },
    {
      id: 'sporty',
      label: 'Sporty',
      description: `Hard launches, higher peaks, late hard braking (${presets.sporty} %): the most dynamic driving the EU real-driving test (RDE) accepts`,
    },
    { id: 'custom', label: 'Custom', description: 'Set the accelerations and braking below' },
  ];
  return (
    <>
      <SelectField
        label="Driving style (not on Steady: cruise control)"
        value={drivingStyleName(a, value) ?? 'custom'}
        options={options}
        onChange={(v: StylePreset | 'custom') => {
          if (v !== 'custom') onChange(presets[v]);
        }}
      />
      <NumberField label="Accelerations and braking, % of the WLTP's" unit="%" min={40} max={200} step={5} {...props} />
    </>
  );
}

/** Text of one condition over all tests: the value, or its range with "(per test)" when the tests differ. */
function spanText(values: number[], fmt: (v: number) => string): string {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)} (per test)`;
}

const STRESS: TestKey[] = ['trafficJam', 'noCharger', 'sprint', 'longTrip'];

/** One-line summary of the conditions under which the results hold (Compare: over all tests). */
export function ConditionsSummary() {
  const { scenario, out, selectedIds, a } = useEngine();
  const all = TEST_KEYS.map((t) => scenario.conditions[t]);
  const span = (k: keyof Conditions, fmt: (v: number) => string) => spanText(all.map((c) => c[k] as number), fmt);
  const soh = selectedIds
    .flatMap((id) => STRESS.map((t) => out.models[id]?.[t].ageing()?.sohPct))
    .filter((v): v is number => v !== undefined);
  const sohText =
    soh.length === 0 ? '' : Math.round(Math.min(...soh)) === Math.round(Math.max(...soh)) ? ` (${num(soh[0], 0)} % left)` : ` (${num(Math.min(...soh), 0)}–${num(Math.max(...soh), 0)} % left)`;
  const styles = [...new Set(all.map((c) => c.drivingStylePct))];
  const thermal = [...new Set(all.map((c) => (c.thermalMode === 'managed' ? 'managed' : c.thermalMode === 'ambient' ? 'unmanaged' : `at ${c.preconditionedC} °C`)))];
  return (
    <span className="conditions">
      <span>
        Air <b>{span('airTemperatureC', (v) => `${num(v, 1)} °C`)}</b>
      </span>
      <span>
        Sun <b>{span('solarWm2', (v) => `${num(v, 0)} W/m²`)}</b>
      </span>
      <span>
        Humidity <b>{span('humidityPct', (v) => `${num(v, 0)} %`)}</b>
      </span>
      <span>
        <b>{span('altitudeM', (v) => (v > 0 ? `${num(v, 0)} m` : 'sea level'))}</b>
      </span>
      <span>
        Load <b>{span('payloadKg', (v) => `+${num(v, 0)} kg`)}</b>
      </span>
      <span>
        Tyres <b>{span('tyrePressurePct', (v) => (v === 100 ? 'as recommended' : `${num(v, 0)} % of recommended`))}</b>
      </span>
      {(styles.length > 1 || styles[0] !== 100) && (
        <span>
          Driving <b>{span('drivingStylePct', (v) => `${drivingStyleName(a, v) ?? 'custom'} (${num(v, 0)} %)`)}</b>
        </span>
      )}
      <span>
        Driven <b>{spanText(STRESS.map((t) => scenario.conditions[t].batteryKm), (v) => `${num(v, 0)} km`)}</b>
        {sohText}
      </span>
      <span>
        Battery <b>{thermal.length === 1 ? thermal[0] : `${thermal.join(' / ')} (per test)`}</b>
      </span>
    </span>
  );
}

export function PresetPicker() {
  const { ds, a, scenario } = useEngine();
  const presetId = useStore((s) => s.presetId);
  const saved = useStore((s) => s.savedPresets);
  const applyPreset = useStore((s) => s.applyPreset);
  const savePreset = useStore((s) => s.savePreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const isSaved = presetId in saved;
  return (
    <div className="row">
      <label htmlFor="preset" className="muted">
        Scenario
      </label>
      <select id="preset" value={presetId} onChange={(e) => applyPreset(e.target.value, ds, a)}>
        {BUILT_IN_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        {Object.keys(saved).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {presetId === 'custom' && <option value="custom">Changed inputs (not saved)</option>}
      </select>
      <SaveButton onSave={(name) => savePreset(name, scenario)} />
      {isSaved && (
        <button type="button" className="btn small ghost" onClick={() => deletePreset(presetId)}>
          Delete
        </button>
      )}
    </div>
  );
}

function SaveButton({ onSave }: { onSave: (name: string) => void }) {
  return (
    <form
      className="row"
      style={{ gap: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem('preset-name') as HTMLInputElement;
        const name = input.value.trim();
        if (name) {
          onSave(name);
          input.value = '';
        }
      }}
    >
      <input id="preset-name" name="preset-name" type="text" placeholder="Save as…" aria-label="Name for this scenario" style={{ width: 120 }} />
      <button type="submit" className="btn small">
        Save
      </button>
    </form>
  );
}

/**
 * Editable conditions of one test (user request 2026-11-20: each test has its own), or of all tests at once
 * (`test` = null, the Compare page): a change there sets every test. The km driven is left out where it has no
 * effect (battery life and cost of ownership start from a new battery).
 */
export function ConditionsPanel({ test }: { test: TestKey | null }) {
  const { a } = useEngine();
  const { cond } = useInputs(test);
  const showBatteryKm = test !== 'batteryLife' && test !== 'cost';
  const thermal = cond<ThermalMode>('thermalMode');
  const scope = test === 'cost' ? 'the cost of ownership' : test === 'batteryLife' ? 'the battery life' : test ? `the ${TEST_LABELS[test].toLowerCase()} test` : '';
  return (
    <div className="panel stack">
      <div>
        <h3>Conditions{test ? `: ${TEST_LABELS[test]}` : ' of all tests'}</h3>
        <p className="muted">
          {test
            ? `These apply to ${scope} only. ↺ goes back to its standard, ⇉ uses a value in all tests. `
            : 'A change here sets every test; each test page can then change its own. ↺ puts each test back to its own standard. '}
          They act on air drag, rolling resistance, heating / AC (temperature, sun, humidity) and the battery. The driving style sets how hard
          the car accelerates and brakes on every speed profile except Steady: more kinetic energy is braked away, and braking harder than{' '}
          {num(a.regenMaxDecelMs2, 1)} m/s² or below {num(a.regenMinKmh, 0)} km/h goes to the friction brakes instead of the regeneration.
          {test === 'batteryLife' && " The air temperature and driving style here are also the battery's past for its wear after the km driven in the stress tests."}
          {showBatteryKm && test !== null && " The km driven sets the battery's wear, with the driving, battery care and climate of the Battery life page."}
        </p>
      </div>
      <div className="fields">
        <NumberField label="Air temperature" unit="°C" min={-30} max={50} step={1} {...cond<number>('airTemperatureC')} />
        <NumberField label="Sunshine (0 night · 500 hazy · 1000 clear noon)" unit="W/m²" min={0} max={1100} step={50} {...cond<number>('solarWm2')} />
        <NumberField label="Air humidity" unit="%" min={0} max={100} step={5} {...cond<number>('humidityPct')} />
        <NumberField label="Altitude" unit="m" min={0} max={4500} step={50} {...cond<number>('altitudeM')} />
        <NumberField label="Load (people + luggage)" unit="kg" min={0} max={800} step={10} {...cond<number>('payloadKg')} />
        <NumberField label="Tyre pressure, % of the car's recommended (80 = warning light)" unit="%" min={60} max={110} step={5} {...cond<number>('tyrePressurePct')} />
        <DrivingStyleFields {...cond<number>('drivingStylePct')} />
        {showBatteryKm ? (
          <NumberField
            label={`Km driven (battery wear from charge cycles and age${test === null ? ', stress tests' : ''})`}
            unit="km"
            min={0}
            max={1000000}
            step={10000}
            sliderMax={300000}
            {...cond<number>('batteryKm')}
          />
        ) : (
          <p className="faint battery-km-note">Battery life and cost start from a new battery; the km driven (battery wear) is set per stress test.</p>
        )}
        <SelectField label="Battery temperature" options={thermalOptions(a)} {...thermal} />
        {(thermal.value === 'preconditioned' || thermal.spread?.includes('preconditioned')) && (
          <NumberField label="Preconditioned to" unit="°C" min={-10} max={40} step={1} {...cond<number>('preconditionedC')} />
        )}
      </div>
    </div>
  );
}
