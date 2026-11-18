import { num } from '../format';
import { useEngine } from '../state/engine';
import { BUILT_IN_PRESETS, useStore } from '../state/store';
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

/** One-line summary of the conditions under which the results hold. */
export function ConditionsSummary() {
  const { scenario } = useEngine();
  const settings = useStore((s) => s.settings);
  const c = scenario.conditions;
  if (settings.consumption === 'simple')
    return <span className="conditions">Simple model: your spreadsheet’s constant consumption, no weather or speed effects</span>;
  return (
    <span className="conditions">
      <span>
        Air <b>{num(c.airTemperatureC, 1)} °C</b>
      </span>
      <span>
        Sun <b>{num(c.solarWm2, 0)} W/m²</b>
      </span>
      <span>
        Humidity <b>{num(c.humidityPct, 0)} %</b>
      </span>
      <span>
        <b>{c.altitudeM > 0 ? `${num(c.altitudeM, 0)} m` : 'sea level'}</b>
      </span>
      <span>
        Load <b>+{num(c.payloadKg, 0)} kg</b>
      </span>
      <span>
        Tyres <b>{num(c.tyrePressureBar, 1)} bar</b>
      </span>
      <span>
        Battery <b>{c.thermalMode === 'managed' ? 'managed' : c.thermalMode === 'ambient' ? 'unmanaged' : `at ${c.preconditionedC} °C`}</b>
      </span>
    </span>
  );
}

export function PresetPicker() {
  const { a, scenario } = useEngine();
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
      <select id="preset" value={presetId} onChange={(e) => applyPreset(e.target.value, a)}>
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

/** Editable conditions shared by all stress tests. */
export function ConditionsPanel() {
  const { scenario, a } = useEngine();
  const setScenario = useStore((s) => s.setScenario);
  const settings = useStore((s) => s.settings);
  const c = scenario.conditions;
  const set = (p: Partial<Conditions>) => setScenario({ ...scenario, conditions: { ...c, ...p } });
  return (
    <div className="panel stack">
      <div>
        <h3>Conditions</h3>
        <p className="muted">
          {settings.consumption === 'physics'
            ? 'Shared by all stress tests. They act on air drag, rolling resistance, heating / AC (temperature, sun, humidity) and the battery.'
            : 'These only take effect with the Physics model.'}
        </p>
      </div>
      <div className="fields">
        <NumberField label="Air temperature" unit="°C" min={-30} max={50} step={1} value={c.airTemperatureC} onChange={(v) => set({ airTemperatureC: v })} />
        <NumberField
          label="Sunshine (0 night · 500 hazy · 1000 clear noon)"
          unit="W/m²"
          min={0}
          max={1100}
          step={50}
          value={c.solarWm2}
          onChange={(v) => set({ solarWm2: v })}
        />
        <NumberField label="Air humidity" unit="%" min={0} max={100} step={5} value={c.humidityPct} onChange={(v) => set({ humidityPct: v })} />
        <NumberField label="Altitude" unit="m" min={0} max={4500} step={50} value={c.altitudeM} onChange={(v) => set({ altitudeM: v })} />
        <NumberField label="Load (people + luggage)" unit="kg" min={0} max={800} step={10} value={c.payloadKg} onChange={(v) => set({ payloadKg: v })} />
        <NumberField label="Tyre pressure" unit="bar" min={1.5} max={3.5} step={0.1} value={c.tyrePressureBar} onChange={(v) => set({ tyrePressureBar: v })} />
        <SelectField label="Battery temperature" value={c.thermalMode} options={thermalOptions(a)} onChange={(v) => set({ thermalMode: v })} />
        {c.thermalMode === 'preconditioned' && (
          <NumberField label="Preconditioned to" unit="°C" min={-10} max={40} step={1} value={c.preconditionedC} onChange={(v) => set({ preconditionedC: v })} />
        )}
      </div>
    </div>
  );
}
