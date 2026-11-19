import { useEffect, useId, useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  min: number;
  max: number;
  step?: number;
  /** Slider range can be narrower than the allowed number range. */
  sliderMax?: number;
}

/** Label + slider + number input + unit. The number input accepts any value in [min, max]. */
export function NumberField({ label, value, onChange, unit, min, max, step = 1, sliderMax }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const v = Number(raw.replace(',', '.'));
    if (raw.trim() !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    else setText(String(value));
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={sliderMax ?? max}
        step={step}
        value={Math.min(value, sliderMax ?? max)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        onBlur={(e) => commit(e.target.value)}
      />
      <span className="unit">{unit}</span>
    </div>
  );
}

const CABIN_MIN_C = 16;
const CABIN_MAX_C = 28;

/**
 * Cabin heating / AC: off, or the cabin temperature it holds. The power it needs follows from the cabin heat
 * balance under the Conditions (air temperature, sun, humidity), not from a fixed share.
 */
export function CabinField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const temps = Array.from({ length: CABIN_MAX_C - CABIN_MIN_C + 1 }, (_, k) => CABIN_MIN_C + k);
  if (value !== null && !temps.includes(value)) temps.push(value);
  temps.sort((x, y) => x - y);
  const options = [
    { id: 'off', label: 'Off', description: 'Fan and windows only; the electronics stay on' },
    ...temps.map((t) => ({ id: String(t), label: `${t} °C`, description: 'Held by heating or AC, as much as the conditions need' })),
  ];
  return (
    <SelectField label={label} value={value === null ? 'off' : String(value)} options={options} onChange={(v) => onChange(v === 'off' ? null : Number(v))} />
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { id: T; label: string; description?: string }[];
  onChange: (v: T) => void;
}

export function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  const id = useId();
  const current = options.find((o) => o.id === value);
  return (
    <div className="field select">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {current?.description && <span className="faint" style={{ fontSize: 12.5 }}>{current.description}</span>}
    </div>
  );
}
