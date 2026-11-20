import { useEffect, useState } from 'react';

/** True while the window is at most `px` wide (follows resizes). */
export function useNarrow(px = 720): boolean {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return narrow;
}
