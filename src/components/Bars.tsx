import type { ReactNode } from 'react';
import { useTooltip } from './Tooltip';

export interface BulletRow {
  id: string;
  label: string;
  /** Bar length (e.g. battery needed). */
  value: number;
  /** Tick position (e.g. battery available); null = no tick. */
  target: number | null;
  end: ReactNode;
  tip: ReactNode;
  onClick?: () => void;
}

/** Horizontal bars with a target tick: needed vs. available. One baseline, thin marks, value at the bar end. */
export function BulletRows({ rows, valueName, targetName }: { rows: BulletRow[]; valueName: string; targetName: string }) {
  const tt = useTooltip();
  const finite = rows.flatMap((r) => [r.value, r.target ?? 0]).filter((v) => Number.isFinite(v));
  const max = Math.max(1e-9, ...finite) * 1.04;
  const pct = (v: number) => `${Math.min(100, (Math.max(0, Number.isFinite(v) ? v : max) / max) * 100)}%`;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--series-1)' }} />
          {valueName}
        </span>
        <span>
          <i className="tick" />
          {targetName}
        </span>
      </div>
      <div className="bars" role="list">
        {rows.map((r) => (
          <div
            key={r.id}
            className="row-hit"
            role="listitem"
          >
            <span className="label">{r.label}</span>
            <div
              className="track"
              tabIndex={0}
              role={r.onClick ? 'button' : undefined}
              aria-label={`${r.label}: ${valueName} ${r.value.toFixed(1)}${r.target !== null ? `, ${targetName} ${r.target.toFixed(1)}` : ''}`}
              onPointerMove={(e) => tt.show(e, r.tip)}
              onPointerLeave={tt.hide}
              onFocus={(e) => tt.show(e, r.tip)}
              onBlur={tt.hide}
              onClick={r.onClick}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && r.onClick?.()}
              style={{ cursor: r.onClick ? 'pointer' : undefined }}
            >
              <span className="bar" style={{ width: pct(r.value) }} />
              {r.target !== null && <span className="avail" style={{ left: pct(r.target) }} />}
            </div>
            <span className="value">{r.end}</span>
          </div>
        ))}
      </div>
      {tt.node}
    </div>
  );
}

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackedRow {
  id: string;
  label: string;
  parts: number[];
  end: ReactNode;
  tip: ReactNode;
  onClick?: () => void;
}

/** Horizontal stacked bars: 2px surface gap between parts, legend above, total at the bar end. */
export function StackedRows({ rows, series }: { rows: StackedRow[]; series: StackSeries[] }) {
  const tt = useTooltip();
  const totals = rows.map((r) => r.parts.reduce((s, v) => s + (Number.isFinite(v) ? Math.max(0, v) : 0), 0));
  const max = Math.max(1e-9, ...totals) * 1.02;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="bars" role="list">
        {rows.map((r, i) => (
          <div key={r.id} className="row-hit" role="listitem">
            <span className="label">{r.label}</span>
            <div
              className="track"
              tabIndex={0}
              role={r.onClick ? 'button' : undefined}
              aria-label={`${r.label}: ${series.map((s, k) => `${s.label} ${r.parts[k].toFixed(1)}`).join(', ')}`}
              onPointerMove={(e) => tt.show(e, r.tip)}
              onPointerLeave={tt.hide}
              onFocus={(e) => tt.show(e, r.tip)}
              onBlur={tt.hide}
              onClick={r.onClick}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && r.onClick?.()}
              style={{ cursor: r.onClick ? 'pointer' : undefined }}
            >
              <div className="segs" style={{ width: `${(totals[i] / max) * 100}%` }}>
                {r.parts.map((v, k) =>
                  v > 0 && Number.isFinite(v) ? (
                    <span key={series[k].key} style={{ flex: `${v} 0 0`, background: series[k].color, minWidth: 1 }} />
                  ) : null,
                )}
              </div>
            </div>
            <span className="value">{r.end}</span>
          </div>
        ))}
      </div>
      {tt.node}
    </div>
  );
}

export function TipLines({ title, lines }: { title: string; lines: { color?: string; value: string; label: string }[] }) {
  return (
    <>
      <div className="title">{title}</div>
      {lines.map((l) => (
        <div className="line" key={l.label}>
          {l.color ? <i style={{ background: l.color }} /> : <i />}
          <b>{l.value}</b>
          <span>{l.label}</span>
        </div>
      ))}
    </>
  );
}
