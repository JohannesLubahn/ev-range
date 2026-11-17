import { useEffect, useState } from 'react';

const NAMES = ['--series-1', '--series-2', '--series-3', '--series-4', '--ink', '--ink-2', '--axis', '--line', '--line-strong', '--surface', '--ord-1', '--ord-2', '--ord-3', '--ord-4', '--ord-5'] as const;
export type ThemeColors = Record<(typeof NAMES)[number], string>;

function read(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(NAMES.map((n) => [n, cs.getPropertyValue(n).trim() || '#888'])) as ThemeColors;
}

/** Resolved colour tokens for SVG chart attributes; re-read when the theme changes. */
export function useThemeColors(): ThemeColors {
  const [c, setC] = useState<ThemeColors>(() => read());
  useEffect(() => {
    const update = () => setC(read());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);
  return c;
}
