import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { num } from '../format';
import { editNumberText, formatNumberText, groupsThousands, parseNumberText } from '../numberText';
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

interface NumberInputProps {
  id?: string;
  'aria-label'?: string;
  placeholder?: string;
  value: number | null;
  min?: number;
  max?: number;
  /** Arrow up / down add or take this much. */
  step?: number;
  /** Each complete number typed within [min, max]; on leaving the field (or Enter) the typed value held to [min, max]. */
  onChange: (v: number | null) => void;
  /** An emptied field means "no value" (null); otherwise it gets the current value back. */
  allowEmpty?: boolean;
}

/**
 * Number box with thousands grouped while typing (1,600,000; user request 2026-11-21). A text input, since a number
 * input cannot show separators; arrow up / down step like a number input's.
 */
export function NumberInput({ value, min, max, step = 1, onChange, allowEmpty = false, ...attrs }: NumberInputProps) {
  const grouped = groupsThousands(min, max);
  const negative = (min ?? 0) < 0;
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [text, setText] = useState(() => formatNumberText(value, grouped));
  const [, rerender] = useReducer((k: number) => k + 1, 0);
  useEffect(() => {
    // A value from elsewhere (slider, ↺, another test) replaces the text; the same value keeps what is being typed ("7.").
    const typing = ref.current !== null && ref.current === document.activeElement;
    setText((t) => (typing && parseNumberText(t) === value ? t : formatNumberText(value, grouped)));
  }, [value, grouped]);
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current === document.activeElement) ref.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });
  const commit = () => {
    const v = parseNumberText(text);
    if (v === null) {
      if (allowEmpty && text.trim() === '') onChange(null);
      else setText(formatNumberText(value, grouped));
      return;
    }
    const held = Math.min(hi, Math.max(lo, v));
    if (held !== value) onChange(held);
    setText(formatNumberText(held, grouped));
  };
  return (
    <input
      ref={ref}
      type="text"
      className="num-input"
      // Phones: the digit pad has no minus sign, so fields that take negative values get the full keyboard.
      inputMode={negative ? 'text' : 'decimal'}
      autoComplete="off"
      spellCheck={false}
      value={text}
      {...attrs}
      onChange={(e) => {
        let raw = e.target.value;
        let at = e.target.selectionStart ?? raw.length;
        // Deleting a separator deletes the digit next to it (else the caret would only hop over the comma).
        if (grouped && raw.length === text.length - 1 && text[at] === ',' && raw === text.slice(0, at) + text.slice(at + 1)) {
          if ((e.nativeEvent as InputEvent).inputType === 'deleteContentForward') raw = raw.slice(0, at) + raw.slice(at + 1);
          else if (at > 0) {
            raw = raw.slice(0, at - 1) + raw.slice(at);
            at -= 1;
          }
        }
        const next = editNumberText(raw, at, { grouped, negative });
        caret.current = next.caret;
        setText(next.text);
        rerender();
        const v = parseNumberText(next.text);
        if (v !== null && v >= lo && v <= hi) onChange(v);
        else if (allowEmpty && next.text === '') onChange(null);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const from = parseNumberText(text) ?? value ?? (min ?? 0);
        const v = Math.min(hi, Math.max(lo, Number((from + (e.key === 'ArrowUp' ? step : -step)).toPrecision(12))));
        onChange(v);
        setText(formatNumberText(v, grouped));
      }}
    />
  );
}

interface NumberFieldProps extends InputActions<number | null> {
  label: string;
  /** Null = no value yet (a cost value the market's data lacks): the field asks for one. */
  value: number | null;
  onChange: (v: number) => void;
  unit: string;
  min: number;
  max: number;
  step?: number;
  /** Slider range can be narrower than the allowed number range. */
  sliderMin?: number;
  sliderMax?: number;
  /** A short help line under the field (e.g. typical values). */
  hint?: string;
}

/** Label + slider + number input + unit, with ↺ / ⇉. The number input accepts any value in [min, max]. */
export function NumberField({ label, value, onChange, unit, min, max, step = 1, sliderMin, sliderMax, hint, reset, applyAll, spread }: NumberFieldProps) {
  const id = useId();
  const fmt = (v: number | null | undefined) => (v === null ? 'missing' : `${num(v, decimals(step))}${unit.startsWith('/') || unit === '' ? '' : ' '}${unit}`.trim());
  const resetShown = !!reset && (reset.differs ?? reset.value !== value);
  const standardText = reset?.text ?? (reset?.value === null ? "missing in the market's data" : fmt(reset?.value));
  const nums = (spread ?? []).filter((v): v is number => v !== null);
  const spreadText = nums.length > 1 ? `${fmt(Math.min(...nums)).replace(` ${unit}`, '')}–${fmt(Math.max(...nums))}` : null;
  return (
    <div className={`field${value === null ? ' missing' : ''}`}>
      <FieldHead id={id} label={label} current={fmt(value)} standardText={standardText} actions={{ reset, applyAll, resetShown }} />
      <input
        type="range"
        aria-label={label}
        min={sliderMin ?? min}
        max={sliderMax ?? max}
        step={step}
        value={Math.max(sliderMin ?? min, Math.min(value ?? min, sliderMax ?? max))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <NumberInput
        id={id}
        min={min}
        max={max}
        step={step}
        placeholder={value === null ? 'missing' : undefined}
        value={value}
        onChange={(v) => v !== null && onChange(v)}
      />
      <span className="unit">{unit}</span>
      {value === null && <span className="field-note missing-note">Not in this market&rsquo;s data yet: type a value to include it in the costs.</span>}
      {hint && <span className="field-note faint">{hint}</span>}
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
