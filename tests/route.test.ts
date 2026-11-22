// The landing page's route lookup: pure helpers and the three services with a mocked fetch.
import { describe, expect, it } from 'vitest';
import { fetchElevations, fetchRoute, geocode, lookupRoute, resample, RouteError, shortLabel, terrainFromProfile } from '../src/route/route';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('resample', () => {
  // 1° of latitude ≈ 111.2 km
  const line: [number, number][] = [[10, 50], [10, 51]];
  it('keeps both ends and spaces the points evenly', () => {
    const { points, spacingM } = resample(line, 10000, 400);
    expect(points[0]).toEqual([10, 50]);
    expect(points[points.length - 1][1]).toBeCloseTo(51, 6);
    expect(points.length).toBe(12);
    expect(spacingM).toBeGreaterThan(9000);
    expect(spacingM).toBeLessThan(11000);
  });
  it('widens the spacing on long routes so the point cap holds', () => {
    const { points } = resample(line, 100, 50);
    expect(points.length).toBeLessThanOrEqual(51);
  });
  it('handles a line of zero length', () => {
    expect(resample([[1, 1], [1, 1]]).points).toHaveLength(2);
  });
});

describe('terrainFromProfile', () => {
  it('gives the net change and the total climb', () => {
    const t = terrainFromProfile([100, 200, 150, 300, 250], 1000, 10);
    expect(t.climbM).toBe(150);
    expect(t.ascentM).toBe(250); // 100 up, 50 down, 150 up
  });
  it('is negative downhill and counts no climb', () => {
    const t = terrainFromProfile([300, 200, 100], 1000, 10);
    expect(t.climbM).toBe(-200);
    expect(t.ascentM).toBe(0);
  });
  it('ignores jitter below the noise threshold', () => {
    const t = terrainFromProfile([100, 104, 99, 105, 98, 103], 500, 10);
    expect(t.ascentM).toBe(3); // only the net change of the end over the start
  });
  it('averages the height and keeps the slope in range', () => {
    const t = terrainFromProfile([0, 1000, 2000], 100, 10);
    expect(t.meanAltitudeM).toBe(1000);
    expect(t.slopePct).toBe(20);
  });
});

describe('services (mocked)', () => {
  it('geocodes the first hit', async () => {
    const f = (async () => json([{ lat: '47.49', lon: '11.09', display_name: 'Garmisch, Landkreis, Bayern, Deutschland' }])) as typeof fetch;
    const p = await geocode('Garmisch test', f);
    expect(p).toMatchObject({ lat: 47.49, lon: 11.09, label: 'Garmisch, Deutschland' });
  });
  it('reports an unknown place', async () => {
    const f = (async () => json([])) as typeof fetch;
    await expect(geocode('Nowhere at all', f)).rejects.toMatchObject({ code: 'place-not-found' });
  });
  it('reports an unreachable service', async () => {
    const f = (async () => {
      throw new TypeError('network');
    }) as typeof fetch;
    await expect(geocode('Somewhere else', f)).rejects.toMatchObject({ code: 'unreachable' });
    await expect(fetchRoute({ lat: 0, lon: 0, label: 'a' }, { lat: 1, lon: 1, label: 'b' }, (async () => json({}, 500)) as typeof fetch)).rejects.toBeInstanceOf(RouteError);
  });
  it('reads the route', async () => {
    const f = (async () => json({ code: 'Ok', routes: [{ distance: 92000, geometry: { coordinates: [[11, 48], [11.1, 47.5]] } }] })) as typeof fetch;
    const r = await fetchRoute({ lat: 48, lon: 11, label: 'a' }, { lat: 47.5, lon: 11.1, label: 'b' }, f);
    expect(r.distanceKm).toBe(92);
    expect(r.coords).toHaveLength(2);
  });
  it('reports a missing route', async () => {
    const f = (async () => json({ code: 'NoRoute', routes: [] })) as typeof fetch;
    await expect(fetchRoute({ lat: 0, lon: 0, label: 'a' }, { lat: 1, lon: 1, label: 'b' }, f)).rejects.toMatchObject({ code: 'no-route' });
  });
  it('asks for the heights in chunks of 100 points', async () => {
    const sizes: number[] = [];
    const f = (async (url: string) => {
      const n = new URL(url).searchParams.get('latitude')!.split(',').length;
      sizes.push(n);
      return json({ elevation: Array.from({ length: n }, (_, i) => i) });
    }) as unknown as typeof fetch;
    const heights = await fetchElevations(Array.from({ length: 230 }, (_, i) => [i / 100, 50] as [number, number]), f);
    expect(sizes).toEqual([100, 100, 30]);
    expect(heights).toHaveLength(230);
  });
  it('chains the whole lookup', async () => {
    const f = (async (url: string) => {
      if (url.includes('nominatim')) return json([{ lat: url.includes('Alpha') ? '48' : '47.5', lon: '11', display_name: 'X, Y' }]);
      if (url.includes('routing')) return json({ code: 'Ok', routes: [{ distance: 50000, geometry: { coordinates: [[11, 48], [11, 47.5]] } }] });
      const n = new URL(url).searchParams.get('latitude')!.split(',').length;
      return json({ elevation: Array.from({ length: n }, (_, i) => 500 + i * 10) });
    }) as unknown as typeof fetch;
    const r = await lookupRoute('Alpha lookup', 'Beta lookup', undefined, f, 0);
    expect(r.distanceKm).toBe(50);
    expect(r.climbM).toBeGreaterThan(0);
    expect(r.ascentM).toBeGreaterThanOrEqual(r.climbM);
  });
  it('shortens a long display name', () => {
    expect(shortLabel('A, B, C, D')).toBe('A, D');
    expect(shortLabel('A, B')).toBe('A, B');
  });
});
