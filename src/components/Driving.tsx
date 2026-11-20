// Driving of a test (user's choice 2026-11-20): the driving profile first, then its speed (held by Steady, the
// cruising speed of a road profile, none for Mixed) and under them a preview of the speed trace the test drives.
// Also the Assumptions page's table of the profiles (data/profiles.csv) with their sources.
import { useState, type PointerEvent } from 'react';
import type { Dataset } from '../data/types';
import type { TestKey } from '../engine/inputs';
import { profileDef, profileSpeed, profileTrace, recordedTrace, stopsText, traceName, traceStats, type ProfileTrace } from '../engine/physics/profiles';
import type { Profile, Scenario } from '../engine/types';
import { num } from '../format';
import { useEngine } from '../state/engine';
import { useInputs } from '../state/inputs';
import { NumberField, SelectField } from './Fields';
import { SourceText } from './RunningCosts';

/** The profiles a test can choose (the traffic jam's own stop-and-go is not one of them). */
export function profileOptions(ds: Dataset): { id: Profile; label: string; description: string }[] {
  return ds.profiles.filter((p) => p.id !== 'jam').map((p) => ({ id: p.id as Profile, label: p.label, description: p.description }));
}

/** "Highway at 90 km/h", "Steady 120 km/h", "Mixed (WLTP speeds)". */
export function drivingText(ds: Dataset, id: string, speedKmh: number): string {
  const def = ds.profiles.find((p) => p.id === id);
  if (!def) return id;
  const v = profileSpeed(def, speedKmh);
  if (def.speed === 'own' || v === null) return `${def.label} (${def.cycle} speeds)`;
  return def.speed === 'constant' ? `${def.label} ${num(v, 0)} km/h` : `${def.label} at ${num(v, 0)} km/h`;
}

/** The profile and speed fields of a test, with the preview of the speed trace. */
export function DrivingFields({
  test,
  speedKey = 'speedKmh',
  profileKey = 'profile',
  distanceKm,
  where = '',
}: {
  test: TestKey;
  speedKey?: string;
  profileKey?: string;
  /** Distance driven on this profile (km): says how often the stretch repeats. Omitted for the years of use. */
  distanceKm?: number;
  /** Where the profile is driven, e.g. " outside the jam". */
  where?: string;
}) {
  const { ds, a, scenario } = useEngine();
  const { trip, setTrip } = useInputs(test);
  const speed = trip<number>(speedKey);
  const profile = trip<Profile>(profileKey);
  const def = profileDef(ds, profile.value);
  const used = profileSpeed(def, speed.value);
  const style = (scenario.conditions[test].drivingStylePct ?? 100) / 100;
  const trace = profileTrace(ds, profile.value, used ?? 0, style, a.drivingStyleWindowS);
  const stdUsed = speed.reset?.value !== undefined ? (profileSpeed(def, speed.reset.value) ?? speed.reset.value) : undefined;
  return (
    <>
      <SelectField
        label={`Driving profile${where}`}
        options={profileOptions(ds)}
        {...profile}
        onChange={(p: Profile) => {
          // A new profile keeps the speed when it allows it, else takes the nearest speed it allows.
          const v = profileSpeed(profileDef(ds, p), speed.value);
          setTrip(v !== null && v !== speed.value ? { [profileKey]: p, [speedKey]: v } : { [profileKey]: p });
        }}
      />
      {used !== null && (def.speed === 'constant' || def.speed === 'cruising') && (
        <NumberField
          label={`${def.speed === 'constant' ? 'Speed' : 'Cruising speed'}${where}`}
          unit="km/h"
          min={def.speedMinKmh ?? 10}
          max={def.speedMaxKmh ?? 200}
          step={5}
          hint={def.speed === 'cruising' ? 'The fastest you drive; the profile adds the slowing down and the stops' : undefined}
          {...speed}
          value={used}
          reset={speed.reset ? { ...speed.reset, value: stdUsed } : undefined}
        />
      )}
      <ProfilePreview trace={trace} distanceKm={distanceKm} />
    </>
  );
}

const minutesText = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s - m * 60)).padStart(2, '0')}`;
};

/** The speed trace a test drives: one stretch of it, its average and top speed and how often it stops. */
export function ProfilePreview({ trace, distanceKm }: { trace: ProfileTrace; distanceKm?: number }) {
  const def = trace.profile;
  if (def.speed === 'constant') {
    return (
      <figure className="profile-preview">
        <figcaption>Constant {num(trace.topKmh, 0)} km/h: no slowing down, no stops.</figcaption>
      </figure>
    );
  }
  const minutes = (trace.speedsKmh.length - 1) / 60;
  const km = trace.lengthKm;
  const times = distanceKm && km > 0 ? distanceKm / km : null;
  return (
    <figure className="profile-preview">
      <SpeedChart trace={trace} />
      <figcaption>
        <span>
          Average {num(trace.avgKmh, 0)} km/h · top {num(trace.topKmh, 0)} km/h · {stopsText(km, trace.stops)}
        </span>
        <span className="faint">
          One stretch: {num(km, km < 10 ? 1 : 0)} km in {num(minutes, 0)} min, repeated
          {times !== null ? ` about ${num(Math.max(1, times), times < 10 ? 1 : 0)}× over the ${num(distanceKm ?? 0, 0)} km` : ' over the distance driven'}
        </span>
      </figcaption>
    </figure>
  );
}

/** Speed over time of one stretch, with the cruising speed dashed and a crosshair on hover. */
function SpeedChart({ trace }: { trace: ProfileTrace }) {
  const [hover, setHover] = useState<number | null>(null);
  const speeds = trace.speedsKmh;
  const n = speeds.length;
  const W = 320;
  const H = 96;
  const PL = 4;
  const PR = 4;
  const PT = 16;
  const PB = 16;
  const cruise = trace.profile.speed === 'cruising' ? trace.speedKmh : null;
  const top = Math.max(...speeds, cruise ?? 0);
  const step = top > 100 ? 40 : 20;
  const yMax = Math.max(step, Math.ceil(top / step) * step);
  const x = (i: number) => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / yMax) * (H - PT - PB);
  const line = speeds.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const grid = [yMax / 2, yMax];
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PL) / (W - PL - PR)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const h = hover !== null ? { x: x(hover), y: y(speeds[hover]), text: `${minutesText(hover)} min · ${num(speeds[hover], 0)} km/h` } : null;
  const boxW = h ? h.text.length * 6.1 + 10 : 0;
  const boxX = h ? Math.min(W - PR - boxW, Math.max(PL, h.x - boxW / 2)) : 0;
  // The readout sits above the point, or below it near the top of the chart.
  const boxY = h ? (h.y - 22 >= 0 ? h.y - 22 : h.y + 8) : 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Speed over ${num((n - 1) / 60, 0)} minutes: average ${num(trace.avgKmh, 0)} km/h, top ${num(trace.topKmh, 0)} km/h, ${stopsText(trace.lengthKm, trace.stops)}`}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
    >
      {grid.map((g) => (
        <g key={g}>
          <line className="grid" x1={PL} x2={W - PR} y1={y(g)} y2={y(g)} />
          <text x={PL} y={y(g) - 3}>
            {num(g, 0)}
            {g === yMax ? ' km/h' : ''}
          </text>
        </g>
      ))}
      <path className="area" d={area} />
      <path className="trace" d={line} />
      <line className="base" x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} />
      {cruise !== null && (
        <g>
          <line className="cruise" x1={PL} x2={W - PR} y1={y(cruise)} y2={y(cruise)} />
          <text x={W - PR} y={y(cruise) - 3} textAnchor="end">
            cruising {num(cruise, 0)}
          </text>
        </g>
      )}
      <text x={PL} y={H - 3}>
        0
      </text>
      <text x={W - PR} y={H - 3} textAnchor="end">
        {num((n - 1) / 60, 0)} min
      </text>
      {h && (
        <g className="hover" pointerEvents="none">
          <line className="hover-line" x1={h.x} x2={h.x} y1={PT} y2={y(0)} />
          <circle className="hover-dot" cx={h.x} cy={h.y} r={3} />
          <rect className="hover-box" x={boxX} y={boxY} width={boxW} height={14} rx={3} />
          <text className="hover-text" x={boxX + boxW / 2} y={boxY + 11} textAnchor="middle">
            {h.text}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Where a profile is the standard: "No charger, Long trip at 90 km/h". */
function standardUses(ds: Dataset, standard: Scenario, id: string): string[] {
  const uses: [string, string, number][] = [
    ['traffic jam', standard.trafficJam.profileOutside, standard.trafficJam.speedOutsideKmh],
    ['No charger', standard.noCharger.profile, standard.noCharger.speedKmh],
    ['Sprint', standard.sprint.profile, standard.sprint.speedKmh],
    ['Long trip', standard.longTrip.profile, standard.longTrip.speedKmh],
    ['Battery life', standard.batteryLife.profile, standard.batteryLife.speedKmh],
    ['Cost', standard.cost.profile, standard.cost.speedKmh],
  ];
  const def = ds.profiles.find((p) => p.id === id);
  if (!def) return [];
  const bySpeed = new Map<string, string[]>();
  for (const [test, p, v] of uses) {
    if (p !== id) continue;
    const s = profileSpeed(def, v);
    const key = s === null ? '' : ` at ${num(s, 0)} km/h`;
    bySpeed.set(key, [...(bySpeed.get(key) ?? []), test === 'traffic jam' ? 'Traffic jam (outside the jam)' : test]);
  }
  return [...bySpeed.entries()].map(([speed, tests]) => `${tests.join(', ')}${speed}`);
}

/** Assumptions page: the driving profiles (data/profiles.csv) with their traces, speeds and sources. */
export function ProfileTable() {
  const { ds, standard } = useEngine();
  if (ds.profiles.length === 0) return null;
  return (
    <section className="panel stack" id="profiles">
      <div>
        <h2>Driving profiles</h2>
        <p className="muted">
          The speed traces the tests drive (<span className="mono">data/profiles.csv</span>, traces in <span className="mono">data/cycles</span>). The speed
          you set is the constant speed of Steady and the cruising speed of a road profile: the fastest the trace goes. The trace is stretched in time to
          it, so its speeds and durations change and its accelerations stay as recorded; the stops are those of the recording. Mixed drives the WLTP at its
          own speeds. The average speed, the time and the onboard energy come from the trace.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Profile</th>
              <th>Speed trace</th>
              <th className="r">Speeds you can set</th>
              <th>As recorded</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {ds.profiles.map((p) => {
              const rec = p.speed === 'constant' ? null : traceStats(recordedTrace(ds, p));
              const uses = standardUses(ds, standard, p.id);
              return (
                <tr key={p.id}>
                  <td>
                    {p.label}
                    {uses.length > 0 && <div className="faint">Standard: {uses.join('; ')}</div>}
                  </td>
                  <td>
                    {p.speed === 'constant' ? 'Constant speed' : traceName(ds, p)}
                    <div className="faint">
                      {p.speed === 'constant'
                        ? 'held as set'
                        : p.speed === 'cruising'
                          ? 'stretched to the cruising speed'
                          : p.speed === 'own'
                            ? 'at its own speeds'
                            : "slowed down to the jam's average speed"}
                    </div>
                  </td>
                  <td className="r num">
                    {p.speedMinKmh !== null && p.speedMaxKmh !== null ? `${num(p.speedMinKmh, 0)}–${num(p.speedMaxKmh, 0)} km/h` : p.speed === 'average' ? 'distance ÷ time' : 'none'}
                  </td>
                  <td>
                    {rec
                      ? `average ${num(rec.avgKmh, rec.avgKmh < 10 ? 1 : 0)} km/h, top ${num(rec.topKmh, 0)} km/h, ${stopsText(rec.lengthKm, rec.stops)}`
                      : '–'}
                  </td>
                  <td>
                    {p.why} · <SourceText ids={p.sources} sources={ds.sources} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
