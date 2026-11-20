import { useEffect, useId, useState, type ReactNode } from 'react';
import { num } from '../format';
import { IconApplyAll, IconReset } from './Icons';

/**
 * The buttons of an input (user request 2026-11-20): ↺ back to the standard value (shown while the value differs
 * from it) and ⇉ use this value in the other tests too (shown while another test has a different value). `spread`
 * lists the values when one field stands for several tests that differ (the Conditions panel on Compare).
 */
export interface InputActions<V> {
  reset?: {
    value?: V;
    /** Text in place of the standard value (e.g. "each test's standard"). */
    text?: string;
    /** Whether ↺ is shown; default: value ≠ the standard value. */
    differs?: boolean;
    onReset: () => void;
  };
  applyAll?: { scope: string; differs: boolean; onApply: () => void };
  spread?: V[];
}

function FieldHead({ id, label, current, standardText, actions }: { id: string; label: string; current: string; standardText: string; actions: InputActions<unknown> & { resetShown: boolean } }) {
  const { reset, applyAll, resetShown } = actions;
  return (
    <div className="field-head">
      <label htmlFor={id}>{label}</label>
      <span className="field-actions">
        {applyAll?.differs && (
          <button type="button" className="icon-btn" title={`Use ${current} in ${applyAll.scope}`} aria-label={`${label}: use ${current} in ${applyAll.scope}`} onClick={applyAll.onApply}>
            <IconApplyAll />
          </button>
        )}
        {reset && resetShown && (
          <button type="button" className="icon-btn" title={`Back to standard: ${standardText}`} aria-label={`${label}: back to standard, ${standardText}`} onClick={reset.onReset}>
            <IconReset />
          </button>
        )}
      </span>
    </div>
  );
}

function FieldNote({ resetShown, standardText, spreadText }: { resetShown: boolean; standardText: string; spreadText: string | null }) {
  if (!spreadText && !resetShown) return null;
  return <span className="field-note faint">{spreadText ? `Differs per test: ${spreadText}` : `Standard: ${standardText}`}</span>;
}

function decimals(step: number): number {
  const s = String(step);
  return s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
}

interface NumberFieldProps extends InputActions<number> {
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

/** Label + slider + number input + unit, with ↺ / ⇉. The number input accepts any value in [min, max]. */
export function NumberField({ label, value, onChange, unit, min, max, step = 1, sliderMax, reset, applyAll, spread }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const v = Number(raw.replace(',', '.'));
    if (raw.trim() !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    else setText(String(value));
  };
  const fmt = (v: number | undefined) => `${num(v, decimals(step))}${unit.startsWith('/') || unit === '' ? '' : ' '}${unit}`.trim();
  const resetShown = !!reset && (reset.differs ?? reset.value !== value);
  const standardText = reset?.text ?? fmt(reset?.value);
  const spreadText = spread && spread.length > 1 ? `${fmt(Math.min(...spread)).replace(` ${unit}`, '')}–${fmt(Math.max(...spread))}` : null;
  return (
    <div className="field">
      <FieldHead id={id} label={label} current={fmt(value)} standardText={standardText} actions={{ reset, applyAll, resetShown }} />
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
      <FieldNote resetShown={resetShown} standardText={standardText} spreadText={spreadText} />
    </div>
  );
}

const CABIN_MIN_C = 16;
const CABIN_MAX_C = 28;

/**
 * Cabin heating / AC: off, or the cabin temperature it holds. The power it needs follows from the cabin heat
 * balance under the Conditions (air temperature, sun, humidity), not from a fixed share.
 */
export function CabinField({ label, value, onChange, ...actions }: { label: string; value: number | null; onChange: (v: number | null) => void } & InputActions<number | null>) {
  const temps = Array.from({ length: CABIN_MAX_C - CABIN_MIN_C + 1 }, (_, k) => CABIN_MIN_C + k);
  if (value !== null && !temps.includes(value)) temps.push(value);
  temps.sort((x, y) => x - y);
  const options = [
    { id: 'off', label: 'Off', description: 'Fan and windows only; the electronics stay on' },
    ...temps.map((t) => ({ id: String(t), label: `${t} °C`, description: 'Held by heating or AC, as much as the conditions need' })),
  ];
  const toId = (v: number | null | undefined) => (v === null ? 'off' : v === undefined ? undefined : String(v));
  const { reset, applyAll, spread } = actions;
  return (
    <SelectField
      label={label}
      value={toId(value) as string}
      options={options}
      onChange={(v) => onChange(v === 'off' ? null : Number(v))}
      reset={reset && { ...reset, value: toId(reset.value) }}
      applyAll={applyAll}
      spread={spread?.map((v) => toId(v) as string)}
    />
  );
}

interface SelectFieldProps<T extends string> extends InputActions<T> {
  label: string;
  value: T;
  options: { id: T; label: string; description?: string }[];
  onChange: (v: T) => void;
  /** Shown under the select in place of the option's description. */
  children?: ReactNode;
}

export function SelectField<T extends string>({ label, value, options, onChange, reset, applyAll, spread }: SelectFieldProps<T>) {
  const id = useId();
  const current = options.find((o) => o.id === value);
  const labelOf = (v: T | undefined) => options.find((o) => o.id === v)?.label ?? String(v ?? '');
  const resetShown = !!reset && (reset.differs ?? reset.value !== value);
  const standardText = reset?.text ?? labelOf(reset?.value);
  const spreadText = spread && spread.length > 1 ? spread.map(labelOf).join(', ') : null;
  return (
    <div className="field select">
      <FieldHead id={id} label={label} current={labelOf(value)} standardText={standardText} actions={{ reset, applyAll, resetShown }} />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {current?.description && <span className="faint" style={{ fontSize: 12.5 }}>{current.description}</span>}
      <FieldNote resetShown={resetShown} standardText={standardText} spreadText={spreadText} />
    </div>
  );
}
