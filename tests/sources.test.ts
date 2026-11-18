// The source list (data/sources.csv) shown on the Assumptions page.
import { describe, expect, it } from 'vitest';
import { loadBundledDataset } from '../src/data/bundled';

const ds = loadBundledDataset();

describe('data/sources.csv', () => {
  it('has a unique id and a title for every source', () => {
    const ids = ds.sources.map((s) => s.id);
    expect(ids.every((id) => id !== '')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ds.sources.every((s) => s.title.length > 0)).toBe(true);
  });
  it('links every source except your own files', () => {
    for (const s of ds.sources) {
      if (s.topic === 'Your files') continue;
      expect(s.url, s.id).toMatch(/^https:\/\//);
    }
    expect(ds.loadWarnings.filter((w) => w.startsWith('sources.csv'))).toEqual([]);
  });
  it('lists every measurement used to check the onboard model', () => {
    const urls = new Set(ds.sources.map((s) => s.url));
    for (const m of ds.onboardMeasurements) expect(urls.has(m.url), m.id).toBe(true);
  });
});
