import type { FocusEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useTooltip } from './Tooltip';

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

/** One cell of a side column: stacked parts on the column's own scale, the label at the bar end. */
export interface SideCell {
  /** Parts of the bar; empty = no bar (e.g. a value in another unit): `note` shows in its place. */
  parts: number[];
  note?: ReactNode;
  end: ReactNode;
  tip: ReactNode;
  /** Accessible description of the cell. */
  aria: string;
}

/**
 * A second, narrower bar column on the same rows, with its own scale and legend: e.g. the average consumption
 * next to the battery needed. Two measures never share an axis.
 */
export interface SideColumn {
  /** Legend title, e.g. "Average consumption, kWh/100 km". */
  title: string;
  series: StackSeries[];
  cells: Record<string, SideCell | undefined>;
}

type Tooltip = ReturnType<typeof useTooltip>;

function hoverProps(tt: Tooltip, tip: ReactNode, onClick?: () => void) {
  return {
    tabIndex: 0,
    role: onClick ? 'button' : undefined,
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => tt.show(e, tip),
    onPointerLeave: tt.hide,
    onFocus: (e: FocusEvent<HTMLDivElement>) => tt.show(e, tip),
    onBlur: tt.hide,
    onClick,
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => (e.key === 'Enter' || e.key === ' ') && onClick?.(),
    style: { cursor: onClick ? 'pointer' : undefined },
  };
}

const partsTotal = (parts: number[]) => parts.reduce((s, v) => s + (Number.isFinite(v) ? Math.max(0, v) : 0), 0);

/** Stacked segments with a 2px surface gap; the last one gets the rounded data end. */
function Segments({ parts, series, widthPct }: { parts: number[]; series: StackSeries[]; widthPct: number }) {
  return (
    <div className="segs" style={{ width: `${widthPct}%` }}>
      {parts.map((v, k) =>
        v > 0 && Number.isFinite(v) ? <span key={series[k].key} style={{ flex: `${v} 0 0`, background: series[k].color, minWidth: 1 }} /> : null,
      )}
    </div>
  );
}

function LegendItems({ series }: { series: StackSeries[] }) {
  return (
    <>
      {series.map((s) => (
        <span key={s.key}>
          <i style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </>
  );
}

/** Max of a side column's bars (finite totals only). */
function sideMax(side: SideColumn | undefined): number {
  if (!side) return 1;
  const totals = Object.values(side.cells).map((c) => (c ? partsTotal(c.parts) : 0));
  return Math.max(1e-9, ...totals) * 1.04;
}

/** The side column's cells of one row (inside a `display: contents` row). */
function SideCells({ side, id, max, tt, onClick }: { side: SideColumn; id: string; max: number; tt: Tooltip; onClick?: () => void }) {
  const cell = side.cells[id];
  if (!cell)
    return (
      <>
        <span className="track side" />
        <span className="value side" />
      </>
    );
  return (
    <>
      <div className="track side" aria-label={cell.aria} {...hoverProps(tt, cell.tip, onClick)}>
        {cell.parts.length > 0 ? (
          <Segments parts={cell.parts} series={side.series} widthPct={(partsTotal(cell.parts) / max) * 100} />
        ) : (
          cell.note && <span className="note">{cell.note}</span>
        )}
      </div>
      <span className="value side">{cell.end}</span>
    </>
  );
}

/** Legend row inside the grid when a side column is present: each legend sits above its own bars. */
function HeadRow({ main, side }: { main: ReactNode; side: SideColumn }) {
  return (
    <div className="row-head" aria-hidden="true">
      <span className="head-label" />
      <div className="legend head-main">{main}</div>
      <div className="legend head-side">
        <b>{side.title}</b>
        <LegendItems series={side.series} />
      </div>
    </div>
  );
}

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

/**
 * A zoomed axis for values that all sit near a limit (e.g. 70–82 % capacity left against 80 %): each bar runs from
 * its row's target tick to the value (right = above, left = below), so the axis need not start at zero. Labelled
 * ticks below the rows carry the scale.
 */
export interface BulletScale {
  min: number;
  max: number;
  ticks: number[];
  format: (v: number) => string;
}

/** Horizontal bars with a target tick: needed vs. available. One baseline, thin marks, value at the bar end. */
export function BulletRows({
  rows,
  valueName,
  targetName,
  side,
  scale,
}: {
  rows: BulletRow[];
  valueName: string;
  targetName: string;
  side?: SideColumn;
  scale?: BulletScale;
}) {
  const tt = useTooltip();
  const finite = rows.flatMap((r) => [r.value, r.target ?? 0]).filter((v) => Number.isFinite(v));
  const lo = scale ? scale.min : 0;
  const hi = scale ? scale.max : Math.max(1e-9, ...finite) * 1.04;
  const pos = (v: number) => Math.min(100, Math.max(0, (((Number.isFinite(v) ? v : hi) - lo) / Math.max(1e-9, hi - lo)) * 100));
  const pct = (v: number) => `${pos(v)}%`;
  const barStyle = (r: BulletRow) => {
    if (!scale || r.target === null) return { width: pct(r.value) };
    const from = pos(r.target);
    const to = pos(r.value);
    return to >= from ? { left: `${from}%`, width: `${to - from}%` } : { left: `${to}%`, width: `${from - to}%`, borderRadius: '4px 0 0 4px' };
  };
  const smax = sideMax(side);
  const legend = (
    <>
      <span>
        <i style={{ background: 'var(--series-1)' }} />
        {valueName}
      </span>
      <span>
        <i className="tick" />
        {targetName}
      </span>
    </>
  );
  return (
    <div className="stack" style={{ gap: 10 }}>
      {!side && <div className="legend">{legend}</div>}
      <div className={`bars ${side ? 'paired' : ''}`} role="list">
        {side && <HeadRow main={legend} side={side} />}
        {rows.map((r) => (
          <div key={r.id} className="row-hit" role="listitem">
            <span className="label">{r.label}</span>
            <div
              className="track"
              aria-label={`${r.label}: ${valueName} ${r.value.toFixed(1)}${r.target !== null ? `, ${targetName} ${r.target.toFixed(1)}` : ''}`}
              {...hoverProps(tt, r.tip, r.onClick)}
            >
              <span className="bar" style={barStyle(r)} />
              {r.target !== null && <span className="avail" style={{ left: pct(r.target) }} />}
            </div>
            <span className="value">{r.end}</span>
            {side && <SideCells side={side} id={r.id} max={smax} tt={tt} onClick={r.onClick} />}
          </div>
        ))}
        {scale && (
          <div className="row-axis" aria-hidden="true">
            <span className="axis-label" />
            <div className="axis">
              {scale.ticks.map((t) => {
                const p = pos(t);
                return (
                  <span key={t} style={{ left: `${p}%`, transform: `translateX(${p < 3 ? 0 : p > 97 ? -100 : -50}%)` }}>
                    {scale.format(t)}
                  </span>
                );
              })}
            </div>
            <span />
            {side && (
              <>
                <span />
                <span />
              </>
            )}
          </div>
        )}
      </div>
      {tt.node}
    </div>
  );
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
export function StackedRows({ rows, series, side }: { rows: StackedRow[]; series: StackSeries[]; side?: SideColumn }) {
  const tt = useTooltip();
  const totals = rows.map((r) => partsTotal(r.parts));
  const max = Math.max(1e-9, ...totals) * 1.02;
  const smax = sideMax(side);
  return (
    <div className="stack" style={{ gap: 10 }}>
      {!side && (
        <div className="legend">
          <LegendItems series={series} />
        </div>
      )}
      <div className={`bars ${side ? 'paired' : ''}`} role="list">
        {side && <HeadRow main={<LegendItems series={series} />} side={side} />}
        {rows.map((r, i) => (
          <div key={r.id} className="row-hit" role="listitem">
            <span className="label">{r.label}</span>
            <div
              className="track"
              aria-label={`${r.label}: ${series.map((s, k) => `${s.label} ${r.parts[k].toFixed(1)}`).join(', ')}`}
              {...hoverProps(tt, r.tip, r.onClick)}
            >
              <Segments parts={r.parts} series={series} widthPct={(totals[i] / max) * 100} />
            </div>
            <span className="value">{r.end}</span>
            {side && <SideCells side={side} id={r.id} max={smax} tt={tt} onClick={r.onClick} />}
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
