// Road distance and hills between two places, for the landing page. Only called when the visitor presses "Get route".
//   places  → Nominatim (OpenStreetMap)            https://nominatim.openstreetmap.org
//   route   → OSRM, FOSSGIS server (OpenStreetMap)  https://routing.openstreetmap.de
//   heights → Open-Meteo Elevation (Copernicus DEM, 90 m)  https://api.open-meteo.com
// Everything that is not a request is a pure function, so it can be tested without a network.

export interface Place {
  lat: number;
  lon: number;
  label: string;
}

export interface Terrain {
  /** Altitude change start → finish (m); negative = the finish is lower. */
  climbM: number;
  /** All uphill metres (m), without small ups and downs below the noise threshold. */
  ascentM: number;
  /** Typical slope of the climbs (%), 0.5–20. */
  slopePct: number;
  /** Mean height along the route (m). */
  meanAltitudeM: number;
}

export interface RouteResult extends Terrain {
  from: string;
  to: string;
  distanceKm: number;
}

/** Judgement values (not measurements): a point every 500 m, at most 400 points, 10 m rise ignored as DEM noise. */
export const ROUTE_SETTINGS = { spacingM: 500, maxPoints: 400, noiseM: 10 };

export type RouteErrorCode = 'place-not-found' | 'no-route' | 'unreachable';
export class RouteError extends Error {
  constructor(
    public code: RouteErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
const ELEVATION = 'https://api.open-meteo.com/v1/elevation';

type Fetch = typeof fetch;

async function getJson(url: string, f: Fetch, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await f(url, { signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new RouteError('unreachable', 'The map service could not be reached');
  }
  if (!res.ok) throw new RouteError('unreachable', `The map service answered with an error (${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new RouteError('unreachable', 'The map service sent an unreadable answer');
  }
}

const geocodeCache = new Map<string, Place>();

export async function geocode(text: string, f: Fetch = fetch, signal?: AbortSignal): Promise<Place> {
  const q = text.trim();
  const hit = geocodeCache.get(q.toLowerCase());
  if (hit) return hit;
  if (!q) throw new RouteError('place-not-found', 'Please type a place');
  const data = await getJson(`${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, f, signal);
  const r = Array.isArray(data) ? (data[0] as { lat?: string; lon?: string; display_name?: string } | undefined) : undefined;
  const lat = Number(r?.lat);
  const lon = Number(r?.lon);
  if (!r || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new RouteError('place-not-found', `No place found for "${q}"`);
  const place = { lat, lon, label: shortLabel(r.display_name ?? q) };
  geocodeCache.set(q.toLowerCase(), place);
  return place;
}

/** "Garmisch-Partenkirchen, Landkreis Garmisch-Partenkirchen, Bayern, Deutschland" → first and last part. */
export function shortLabel(displayName: string): string {
  const parts = displayName.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 2 ? `${parts[0]}, ${parts[parts.length - 1]}` : parts.join(', ');
}

export interface RouteLine {
  distanceKm: number;
  /** [lon, lat] pairs. */
  coords: [number, number][];
}

export async function fetchRoute(a: Place, b: Place, f: Fetch = fetch, signal?: AbortSignal): Promise<RouteLine> {
  const url = `${OSRM}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
  const data = (await getJson(url, f, signal)) as { code?: string; routes?: { distance?: number; geometry?: { coordinates?: [number, number][] } }[] };
  const r = data.routes?.[0];
  const coords = r?.geometry?.coordinates;
  if (data.code !== 'Ok' || !r || !coords || coords.length < 2 || !Number.isFinite(r.distance)) {
    throw new RouteError('no-route', 'No road route was found between these places');
  }
  return { distanceKm: (r.distance as number) / 1000, coords };
}

const EARTH_R = 6371008.8;
function haversineM(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Points along the line at equal distances (first and last point always included). The spacing grows so that no
 * more than `maxPoints` come out on long routes.
 */
export function resample(coords: [number, number][], spacingM = ROUTE_SETTINGS.spacingM, maxPoints = ROUTE_SETTINGS.maxPoints): { points: [number, number][]; spacingM: number } {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineM(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  if (total <= 0) return { points: [coords[0], coords[coords.length - 1]], spacingM: 0 };
  const step = Math.max(spacingM, total / (maxPoints - 1));
  const n = Math.max(1, Math.round(total / step));
  const points: [number, number][] = [];
  let seg = 1;
  for (let k = 0; k <= n; k++) {
    const target = (total * k) / n;
    while (seg < cum.length - 1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1];
    const t = span > 0 ? (target - cum[seg - 1]) / span : 0;
    points.push([coords[seg - 1][0] + (coords[seg][0] - coords[seg - 1][0]) * t, coords[seg - 1][1] + (coords[seg][1] - coords[seg - 1][1]) * t]);
  }
  return { points, spacingM: total / n };
}

export async function fetchElevations(points: [number, number][], f: Fetch = fetch, signal?: AbortSignal): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const lat = chunk.map((p) => p[1].toFixed(5)).join(',');
    const lon = chunk.map((p) => p[0].toFixed(5)).join(',');
    const data = (await getJson(`${ELEVATION}?latitude=${lat}&longitude=${lon}`, f, signal)) as { elevation?: number[] };
    if (!Array.isArray(data.elevation) || data.elevation.length !== chunk.length) throw new RouteError('unreachable', 'The elevation service sent an unexpected answer');
    out.push(...data.elevation);
  }
  return out;
}

/**
 * Altitude change, total climb and typical slope from heights `spacingM` apart. The climb counts a rise only once it
 * exceeds `noiseM` (heights of a 90 m grid jitter); the slope is the climb over the distance driven uphill.
 */
export function terrainFromProfile(heights: number[], spacingM: number, noiseM = ROUTE_SETTINGS.noiseM): Terrain {
  const first = heights[0] ?? 0;
  const last = heights[heights.length - 1] ?? 0;
  // Zigzag filter: a turning point counts only after the height has moved `noiseM` the other way.
  let ascent = 0;
  let pivot = first;
  let ext = first;
  let dir = 0;
  for (const h of heights) {
    if (dir === 0) {
      if (h - pivot >= noiseM) {
        dir = 1;
        ext = h;
      } else if (pivot - h >= noiseM) {
        dir = -1;
        ext = h;
      }
    } else if (dir === 1) {
      if (h > ext) ext = h;
      else if (ext - h >= noiseM) {
        ascent += ext - pivot;
        pivot = ext;
        dir = -1;
        ext = h;
      }
    } else if (h < ext) ext = h;
    else if (h - ext >= noiseM) {
      pivot = ext;
      dir = 1;
      ext = h;
    }
  }
  if (dir === 1) ascent += ext - pivot;
  // Slope: the climb over the distance of the steps that went up.
  let upDist = 0;
  for (let i = 1; i < heights.length; i++) if (heights[i] > heights[i - 1] + 0.5) upDist += spacingM;
  const slope = upDist > 0 ? (ascent / upDist) * 100 : 0;
  const mean = heights.length ? heights.reduce((s, h) => s + h, 0) / heights.length : 0;
  return {
    climbM: Math.round(last - first),
    ascentM: Math.round(Math.max(ascent, last - first, 0)),
    slopePct: Math.min(20, Math.max(0.5, Math.round(slope * 10) / 10)),
    meanAltitudeM: Math.round(Math.min(4500, Math.max(0, mean))),
  };
}

/** The whole lookup. From and To are looked up one second apart (Nominatim allows one request per second). */
export async function lookupRoute(from: string, to: string, signal?: AbortSignal, f: Fetch = fetch, pauseMs = 1100): Promise<RouteResult> {
  const a = await geocode(from, f, signal);
  if (!geocodeCache.has(to.trim().toLowerCase())) await new Promise((r) => setTimeout(r, pauseMs));
  const b = await geocode(to, f, signal);
  const line = await fetchRoute(a, b, f, signal);
  const { points, spacingM } = resample(line.coords);
  const heights = await fetchElevations(points, f, signal);
  return { from: a.label, to: b.label, distanceKm: line.distanceKm, ...terrainFromProfile(heights, spacingM) };
}
