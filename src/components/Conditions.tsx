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
function DrivingStyleFields({ value, onChange }: { value: number; onChange: (pct: number) => void }) {
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
      <NumberField
        label="Accelerations and braking, % of the WLTP's"
        unit="%"
        min={40}
        max={200}
        step={5}
        value={value}
        onChange={onChange}
      />
    </>
  );
}

/** One-line summary of the conditions under which the results hold. */
export function ConditionsSummary() {
  const { scenario, out, selectedIds, a } = useEngine();
  const c = scenario.conditions;
  const soh = selectedIds.map((id) => out.models[id]?.ageing()?.sohPct).filter((v): v is number => v !== undefined);
  const sohText =
    soh.length === 0 ? '' : Math.round(Math.min(...soh)) === Math.round(Math.max(...soh)) ? ` (${num(soh[0], 0)} % left)` : ` (${num(Math.min(...soh), 0)}–${num(Math.max(...soh), 0)} % left)`;
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
        Tyres <b>{c.tyrePressurePct === 100 ? 'as recommended' : `${num(c.tyrePressurePct, 0)} % of recommended`}</b>
      </span>
      {c.drivingStylePct !== 100 && (
        <span>
          Driving{' '}
          <b>
            {drivingStyleName(a, c.drivingStylePct) ?? 'custom'} ({num(c.drivingStylePct, 0)} %)
          </b>
        </span>
      )}
      <span>
        Driven <b>{num(c.batteryKm, 0)} km</b>
        {sohText}
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

/**
 * Editable conditions shared by all stress tests. `showBatteryKm = false` leaves out the km driven where it has no
 * effect (battery life and cost of ownership start from a new battery).
 */
export function ConditionsPanel({ showBatteryKm = true }: { showBatteryKm?: boolean }) {
  const { scenario, a } = useEngine();
  const setScenario = useStore((s) => s.setScenario);
  const c = scenario.conditions;
  const set = (p: Partial<Conditions>) => setScenario({ ...scenario, conditions: { ...c, ...p } });
  return (
    <div className="panel stack">
      <div>
        <h3>Conditions</h3>
        <p className="muted">
          Shared by all stress tests and the cost of ownership. They act on air drag, rolling resistance, heating / AC (temperature, sun,
          humidity) and the battery. The driving style sets how hard the car accelerates and brakes on every speed profile except Steady:
          more kinetic energy is braked away, and braking harder than {num(a.regenMaxDecelMs2, 1)} m/s² or below {num(a.regenMinKmh, 0)} km/h
          goes to the friction brakes instead of the regeneration.
          {showBatteryKm &&
            " The km driven sets the battery's wear in the stress tests, with the driving and battery care of the battery-life test (battery life and cost start from a new battery)."}
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
        <NumberField
          label="Tyre pressure, % of the car's recommended (80 = warning light)"
          unit="%"
          min={60}
          max={110}
          step={5}
          value={c.tyrePressurePct}
          onChange={(v) => set({ tyrePressurePct: v })}
        />
        <DrivingStyleFields value={c.drivingStylePct} onChange={(v) => set({ drivingStylePct: v })} />
        {showBatteryKm ? (
          <NumberField
            label="Km driven (battery wear from charge cycles and age)"
            unit="km"
            min={0}
            max={1000000}
            step={10000}
            sliderMax={300000}
            value={c.batteryKm}
            onChange={(v) => set({ batteryKm: v })}
          />
        ) : (
          <p className="faint battery-km-note">
            Battery life and cost start from a new battery; the km driven (battery wear) applies to the other stress tests.
          </p>
        )}
        <SelectField label="Battery temperature" value={c.thermalMode} options={thermalOptions(a)} onChange={(v) => set({ thermalMode: v })} />
        {c.thermalMode === 'preconditioned' && (
          <NumberField label="Preconditioned to" unit="°C" min={-10} max={40} step={1} value={c.preconditionedC} onChange={(v) => set({ preconditionedC: v })} />
        )}
      </div>
    </div>
  );
}
