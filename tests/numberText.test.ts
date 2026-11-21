import { describe, expect, it } from 'vitest';
import { editNumberText, formatNumberText, groupsThousands, parseNumberText } from '../src/numberText';

describe('number boxes: thousands separators (user request 2026-11-21)', () => {
  it('groups thousands with the English comma and shows a true minus', () => {
    expect(formatNumberText(1_600_000, true)).toBe('1,600,000');
    expect(formatNumberText(-150_000, true)).toBe('−150,000');
    expect(formatNumberText(1234.5, true)).toBe('1,234.5');
    expect(formatNumberText(999, true)).toBe('999');
    expect(formatNumberText(7.5, false)).toBe('7.5');
    expect(formatNumberText(0.1 + 0.2, false)).toBe('0.3');
    expect(formatNumberText(null, true)).toBe('');
  });

  it('reads grouped, signed and unfinished texts', () => {
    expect(parseNumberText('1,600,000')).toBe(1_600_000);
    expect(parseNumberText('−150,000')).toBe(-150_000);
    expect(parseNumberText('7.')).toBe(7);
    expect(parseNumberText('.5')).toBe(0.5);
    expect(parseNumberText('−')).toBeNull();
    expect(parseNumberText('')).toBeNull();
  });

  it('groups only fields that can reach 1,000', () => {
    expect(groupsThousands(0, 40)).toBe(false);
    expect(groupsThousands(0, 800)).toBe(false);
    expect(groupsThousands(-3000, 3000)).toBe(true);
    expect(groupsThousands(0, undefined)).toBe(true);
  });

  it('regroups while typing and keeps the caret after the same digit', () => {
    const g = { grouped: true, negative: true };
    let t = { text: '', caret: 0 };
    for (const d of '1000000') t = editNumberText(t.text + d, t.text.length + 1, g);
    expect(t).toEqual({ text: '1,000,000', caret: 9 });
    // A digit typed after the first one in "1,000".
    expect(editNumberText('15,000', 2, g)).toEqual({ text: '15,000', caret: 2 });
    // A digit typed at the end of "1,000".
    expect(editNumberText('1,0005', 6, g)).toEqual({ text: '10,005', caret: 6 });
    expect(editNumberText('-150000', 7, g)).toEqual({ text: '−150,000', caret: 8 });
    // Letters and a second point are dropped; the caret does not move past them.
    expect(editNumberText('1a2', 2, g)).toEqual({ text: '12', caret: 1 });
    expect(editNumberText('1.2.3', 5, g)).toEqual({ text: '1.23', caret: 4 });
  });

  it('reads a comma as a separator in grouped fields and as a decimal point in the others', () => {
    expect(editNumberText('1,', 2, { grouped: true, negative: false })).toEqual({ text: '1', caret: 1 });
    expect(editNumberText('7,5', 3, { grouped: false, negative: false })).toEqual({ text: '7.5', caret: 3 });
  });

  it('drops a minus where negative values are not allowed, and leading zeros', () => {
    expect(editNumberText('-5', 2, { grouped: false, negative: false })).toEqual({ text: '5', caret: 1 });
    expect(editNumberText('05', 2, { grouped: true, negative: false })).toEqual({ text: '5', caret: 1 });
    expect(editNumberText('00', 2, { grouped: true, negative: false })).toEqual({ text: '0', caret: 1 });
    expect(editNumberText('0.5', 3, { grouped: false, negative: false })).toEqual({ text: '0.5', caret: 3 });
  });
});
