import { useDeferredValue, useMemo, useRef, useState, type FormEvent } from 'react';
import { StackedRows, TipLines } from '../components/Bars';
import { consumptionColumn } from '../components/Consumption';
import { Scene } from '../components/Scene';
import { applyMarket } from '../engine/assumptions';
import { deriveAll } from '../engine/derive';
import type { Calibration } from '../engine/model';
import type { LongTripResult } from '../engine/types';
import { hours, num, plural } from '../format';
import { landingTrip } from '../landing/calc';
import { lookupRoute, RouteError } from '../route/route';
import { useEngine } from '../state/engine';
import { useStore, type LandingState } from '../state/store';

/** The links of a car's `source_url` (several, separated by ";"), each with the site's name as its text. */
function sourceHosts(text: string | undefined): { url: string; host: string }[] {
  return (text ?? '')
    .split(/\s*;\s*|\s+/)
    .filter((u) => /^https?:\/\//.test(u))
    .map((url) => ({ url, host: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] }));
}
function SourceLinks({ urls }: { urls: { url: string; host: string }[] }) {
  return (
    <>
      {urls.map((u, i) => (
        <span key={u.url}>
          {i > 0 && ' · '}
          <a href={u.url} target="_blank" rel="noreferrer">
            {u.host}
          </a>
        </span>
      ))}
    </>
  );
}

/** Fun-sized mode: market, one car, a route, five sliders and the long-trip result. Its own state (`landing`). */
export function LandingPage() {
  const { ds, baseAssumptions } = useEngine();
  const landing = useStore((s) => s.landing);
  const setLanding = useStore((s) => s.setLanding);

  const marketId = ds.markets.some((m) => m.id === landing.market) ? (landing.market as string) : (ds.markets[0]?.id ?? '');
  const market = ds.markets.find((m) => m.id === marketId) ?? null;
  const a = useMemo(() => applyMarket(baseAssumptions, market), [baseAssumptions, market]);
  const derived = useMemo(() => deriveAll(ds, a), [ds, a]);
  // Only electric cars: the result is about charging.
  const cars = useMemo(
    () => derived.filter((d) => d.car.market === marketId && !d.isIce).sort((x, y) => x.car.name.localeCompare(y.car.name)),
    [derived, marketId],
  );
  const car = cars.find((d) => d.car.id === landing.carId) ?? cars[0] ?? null;
  const brands = useMemo(() => [...new Set(cars.map((d) => d.car.brand))], [cars]);

  const sliders = useDeferredValue(landing.sliders);
  // The calibration of a car does not depend on the conditions: share it between slider moves.
  const shared = useMemo<{ calibration?: Calibration }>(() => ({}), [car, a, ds]);
  const trip = useMemo<LongTripResult | null>(() => {
    if (!car || !landing.route) return null;
    try {
      return landingTrip(car, { ds, a }, sliders, landing.route, shared);
    } catch {
      return null;
    }
  }, [car, ds, a, sliders, landing.route, shared]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function getRoute(e?: FormEvent) {
    e?.preventDefault();
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy(true);
    setError(null);
    try {
      const route = await lookupRoute(landing.from, landing.to, ctl.signal);
      setLanding({ route });
    } catch (err) {
      if (ctl.signal.aborted) return;
      setError(err instanceof RouteError ? err.message : 'Something went wrong while looking up the route');
    } finally {
      if (abort.current === ctl) setBusy(false);
    }
  }

  const setSlider: React.ComponentProps<typeof Scene>['onSlider'] = (key, i) => setLanding({ sliders: { ...landing.sliders, [key]: i } } as Partial<LandingState>);
  // Left-hand traffic (Thailand) means the driver sits on the right of the car, so on the viewer's left.
  const driverRight = marketId !== 'TH';

  let result = null;
  if (trip && car && landing.route) {
    const ids = [car.car.id];
    const side = consumptionColumn<LongTripResult>(ids, (t) => t.average, { [car.car.id]: trip }, { [car.car.id]: car });
    result = (
      <StackedRows
        rows={[
          {
            id: car.car.id,
            label: car.car.name,
            parts: [trip.timeDrivingH, trip.timeChargingH],
            end: (
              <span>
                {hours(trip.tripTimeH)} <span className="faint">· {plural(trip.stops, 'stop', 'stops')}</span>
              </span>
            ),
            tip: (
              <TipLines
                title={car.car.name}
                lines={[
                  { color: 'var(--series-1)', value: hours(trip.timeDrivingH), label: 'driving' },
                  { color: 'var(--series-2)', value: hours(trip.timeChargingH), label: `charging (${plural(trip.stops, 'stop', 'stops')})` },
                  { value: hours(trip.tripTimeH), label: 'total' },
                ]}
              />
            ),
          },
        ]}
        series={[
          { key: 'drive', label: 'Driving time', color: 'var(--series-1)' },
          { key: 'charge', label: 'Charging time', color: 'var(--series-2)' },
        ]}
        side={side}
      />
    );
  }

  return (
    <div className="landing-page">
      <form className="landing-form" onSubmit={getRoute}>
        <label>
          <span>Market</span>
          <select value={marketId} onChange={(e) => setLanding({ market: e.target.value, carId: null })}>
            {ds.markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Car</span>
          <select value={car?.car.id ?? ''} onChange={(e) => setLanding({ carId: e.target.value })}>
            {brands.map((b) => (
              <optgroup key={b} label={b}>
                {cars
                  .filter((d) => d.car.brand === b)
                  .map((d) => (
                    <option key={d.car.id} value={d.car.id}>
                      {d.car.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="text" value={landing.from} onChange={(e) => setLanding({ from: e.target.value })} placeholder="e.g. Bangkok" autoComplete="off" />
        </label>
        <label>
          <span>To</span>
          <input type="text" value={landing.to} onChange={(e) => setLanding({ to: e.target.value })} placeholder="e.g. Chiang Mai" autoComplete="off" />
        </label>
        <button type="submit" className="btn primary landing-go" disabled={busy || !landing.from.trim() || !landing.to.trim()}>
          {busy ? 'Looking up…' : 'Get route'}
        </button>
      </form>
      {error && (
        <p className="landing-error" role="alert">
          {error}
        </p>
      )}
      {landing.route && (
        <p className="landing-route">
          <b>
            {landing.route.from} → {landing.route.to}
          </b>
          <span>
            {num(landing.route.distanceKm, 0)} km · {landing.route.climbM >= 0 ? '+' : '−'}
            {num(Math.abs(landing.route.climbM), 0)} m altitude change · {num(landing.route.ascentM, 0)} m total climb · {num(landing.route.meanAltitudeM, 0)} m average altitude
          </span>
        </p>
      )}

      <Scene sliders={landing.sliders} onSlider={setSlider} driverRight={driverRight} />

      <div className="landing-result">
        {result ?? <p className="muted landing-hint">Type a start and a destination and press “Get route” to see the driving and charging time.</p>}
        <p className="landing-credit faint">
          <b>Calculation based on real physics:</b> air drag, rolling resistance, hills, battery chemistry and cabin heating, calibrated to each car’s rated range. Starts at 95 %, new battery, charging 20 → 90 %, mixed
          roads, 22 °C inside.
        </p>
        <p className="landing-credit faint">
          <b>Car data:</b> published specifications (rated range, battery size, weight, charging) from the makers, dealers and EV Database
          {car && sourceHosts(car.car.raw.source_url).length > 0 && (
            <>
              {' '}
              — for the {car.car.name}: <SourceLinks urls={sourceHosts(car.car.raw.source_url)} />
            </>
          )}
          . <b>Route:</b> map data © OpenStreetMap contributors · routing: OSRM (FOSSGIS) · elevation: Copernicus DEM via Open-Meteo.
        </p>
      </div>
    </div>
  );
}
