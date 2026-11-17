const cache = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(key, f);
  }
  return f;
}

/** 1,234.5 style number; "–" for missing values, "∞" for infinite ones. */
export function num(v: number | null | undefined, digits = 1, minDigits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (!Number.isFinite(v)) return '∞';
  return nf(minDigits, digits).format(v);
}

export function fixed(v: number | null | undefined, digits = 1): string {
  return num(v, digits, digits);
}

export function signedPct(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return '–';
  if (!Number.isFinite(fraction)) return fraction > 0 ? '+∞ %' : '−∞ %';
  const v = fraction * 100;
  const d = Math.abs(v) < 1 && v !== 0 ? Math.max(digits, 1) : digits;
  const s = nf(d, d).format(Math.abs(v));
  return `${v >= 0 ? '+' : '−'}${s} %`;
}

export function money(v: number | null | undefined, currency: string, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  return `${nf(digits, digits).format(v)} ${currency}`;
}

/** Compact: 1.8 M, 860 k. */
export function compact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1e6) return `${nf(0, 2).format(v / 1e6)} M`;
  if (a >= 1e4) return `${nf(0, 0).format(v / 1e3)} k`;
  return nf(0, 0).format(v);
}

/** "1 stop", "3 stops". */
export function plural(n: number | null | undefined, one: string, many: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return `– ${many}`;
  return `${num(n, 0)} ${Math.round(n) === 1 ? one : many}`;
}

export function hours(h: number | null | undefined): string {
  if (h === null || h === undefined || !Number.isFinite(h)) return '–';
  return `${fixed(h, 1)} h`;
}
