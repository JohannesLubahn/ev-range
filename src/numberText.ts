/**
 * Text of the number boxes (user request 2026-11-21): thousands grouped with the English comma (1,234,567.5) and a
 * true minus sign, regrouped while typing with the caret kept after the same digit.
 *
 * A field whose values stay below 1,000 never shows a separator, so a comma typed there is read as a decimal point
 * (the German habit, "7,5"); in the other fields a typed comma is a separator and is simply regrouped.
 */

export const MINUS = '−';

/** Whether a field with this range groups thousands (values of 1,000 or more possible). */
export function groupsThousands(min: number | undefined, max: number | undefined): boolean {
  return Math.max(Math.abs(min ?? 0), Math.abs(max ?? Infinity)) >= 1000;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The text shown for a value: "1,600,000", "−150,000", "7.5"; empty for no value. */
export function formatNumberText(v: number | null | undefined, grouped: boolean): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  // 12 significant digits drop floating-point noise (0.30000000000000004) without rounding real input.
  const s = String(Number(v.toPrecision(12)));
  if (s.includes('e')) return s.replace('-', MINUS);
  const neg = s.startsWith('-');
  const [int, frac] = (neg ? s.slice(1) : s).split('.');
  return `${neg ? MINUS : ''}${grouped ? group(int) : int}${frac !== undefined ? `.${frac}` : ''}`;
}

/** The number a text stands for; null when it is empty or not finished yet ("−", "."). */
export function parseNumberText(text: string): number | null {
  const t = text.replace(/[,\s]/g, '').replace(MINUS, '-');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

/**
 * What the user typed (`raw`, caret at `caret`), cleaned and regrouped: digits, one decimal point and a leading
 * minus (only when `negative`) are kept, leading zeros dropped. The caret stays after the same digit.
 */
export function editNumberText(raw: string, caret: number, opts: { grouped: boolean; negative: boolean }): { text: string; caret: number } {
  let clean = '';
  let before = 0;
  let dot = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    let keep = '';
    if (ch >= '0' && ch <= '9') keep = ch;
    else if ((ch === '-' || ch === MINUS || ch === '–') && opts.negative && clean === '') keep = '-';
    else if ((ch === '.' || (ch === ',' && !opts.grouped)) && !dot) {
      keep = '.';
      dot = true;
    }
    clean += keep;
    if (i < caret) before += keep.length;
  }
  const sign = clean.startsWith('-') ? 1 : 0;
  const dotAt = clean.indexOf('.');
  const intEnd = dotAt < 0 ? clean.length : dotAt;
  let zeros = 0;
  while (sign + zeros < intEnd - 1 && clean[sign + zeros] === '0') zeros++;
  if (zeros > 0) {
    clean = clean.slice(0, sign) + clean.slice(sign + zeros);
    before -= Math.min(Math.max(before - sign, 0), zeros);
  }
  const int = clean.slice(sign, intEnd - zeros);
  const text = `${sign ? MINUS : ''}${opts.grouped ? group(int) : int}${dot ? clean.slice(intEnd - zeros) : ''}`;
  let pos = 0;
  for (let seen = 0; seen < before && pos < text.length; pos++) if (text[pos] !== ',') seen++;
  return { text, caret: pos };
}
