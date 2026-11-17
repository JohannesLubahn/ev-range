import { useCallback, useState, type ReactNode } from 'react';

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** A light hover/focus tooltip for HTML marks (bars, cells). Values stay readable without it. */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback((e: { clientX?: number; clientY?: number; currentTarget: Element }, content: ReactNode) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX ?? r.left + r.width / 2;
    const y = e.clientY ?? r.top;
    setTip({ x, y, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const node = tip ? (
    <div
      className="chart-tooltip"
      role="tooltip"
      style={{
        position: 'fixed',
        left: Math.min(tip.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 240),
        top: tip.y + 14,
        zIndex: 50,
        pointerEvents: 'none',
        maxWidth: 260,
      }}
    >
      {tip.content}
    </div>
  ) : null;
  return { show, hide, node };
}
