// Terrain inputs (user request 2026-11-20): a preset (data/terrain.csv) that fills in the hills, and the fields
// themselves. Trip tests: altitude change start → finish, total climb and slope. Battery life and Cost: climb per
// 100 km and slope (the life ends where it starts, so the descent equals the climb).
import type { TerrainPreset } from '../data/types';
import { num } from '../format';
import { useEngine } from '../state/engine';
import type { InputProps } from '../state/inputs';
import { NumberField, SelectField } from './Fields';
import { SourceText } from './RunningCosts';

type Setter = (values: Record<string, number>) => void;

const near = (x: number, y: number, tol: number) => Math.abs(x - y) <= tol;

/** Total climb a preset gives a trip: its climb per 100 km, at least the altitude change. */
const tripClimb = (p: TerrainPreset, distanceKm: number, netM: number) => Math.max(Math.round((p.climbPer100KmM * distanceKm) / 100), netM, 0);

function PresetSelect({ current, presets, onPick, describe }: { current: string; presets: TerrainPreset[]; onPick: (p: TerrainPreset) => void; describe: (p: TerrainPreset) => string }) {
  const options = [
    ...presets.map((p) => ({ id: p.id, label: p.label, description: describe(p) })),
    { id: 'custom', label: 'Custom', description: 'Set the hills below' },
  ];
  return (
    <SelectField
      label="Terrain"
      value={current}
      options={options}
      onChange={(id: string) => {
        const p = presets.find((x) => x.id === id);
        if (p) onPick(p);
      }}
    />
  );
}

/** Hills of a trip test (No charger, Sprint, Long trip, the roads around the traffic jam). */
export function TripTerrainFields({
  distanceKm,
  net,
  ascent,
  slope,
  set,
  where = '',
}: {
  distanceKm: number;
  net: InputProps<number>;
  ascent: InputProps<number>;
  slope: InputProps<number>;
  set: Setter;
  /** Which roads the hills are on, e.g. " (before and after the jam)". */
  where?: string;
}) {
  const { ds } = useEngine();
  const presets = ds.terrain;
  const total = Math.max(ascent.value, net.value, 0);
  const descent = total - net.value;
  const current =
    presets.find((p) =>
      p.climbPer100KmM === 0 ? total <= Math.max(net.value, 0) : near(total, tripClimb(p, distanceKm, net.value), 1) && near(slope.value, p.slopePct, 1e-9),
    )?.id ?? 'custom';
  return (
    <>
      <PresetSelect
        current={current}
        presets={presets}
        describe={(p) =>
          p.climbPer100KmM === 0
            ? `No hills (only the altitude change, at ${num(p.slopePct, 0)} %)`
            : `${num(p.climbPer100KmM, 0)} m up per 100 km (${num(tripClimb(p, distanceKm, net.value), 0)} m over ${num(distanceKm, 0)} km), slopes of ${num(p.slopePct, 0)} %`
        }
        onPick={(p) => set({ ascentM: tripClimb(p, distanceKm, net.value), slopePct: p.slopePct })}
      />
      <NumberField label={`Altitude change, start → finish${where}`} unit="m" min={-3000} max={3000} step={50} hint="Negative when the finish is lower" {...net} />
      <NumberField
        label={`Total climb${where}`}
        unit="m"
        min={0}
        max={30000}
        sliderMax={6000}
        step={50}
        hint={`All uphill metres; at least the altitude change. Descent: ${num(descent, 0)} m${ascent.value < net.value ? ` (counted as ${num(total, 0)} m up)` : ''}`}
        {...ascent}
      />
      <NumberField label="Typical slope of the hills" unit="%" min={0.5} max={20} sliderMax={12} step={0.5} hint="Gentle descents are used against air drag and rolling; steeper ones go through regeneration" {...slope} />
    </>
  );
}

/** Hills over the years of use (Battery life, Cost): climb per 100 km, as much down again, and the slope. */
export function LifeTerrainFields({ ascent, slope, set }: { ascent: InputProps<number>; slope: InputProps<number>; set: Setter }) {
  const { ds } = useEngine();
  const presets = ds.terrain;
  const current =
    presets.find((p) => (p.climbPer100KmM === 0 ? ascent.value === 0 : near(ascent.value, p.climbPer100KmM, 0.5) && near(slope.value, p.slopePct, 1e-9)))?.id ?? 'custom';
  return (
    <>
      <PresetSelect
        current={current}
        presets={presets}
        describe={(p) => (p.climbPer100KmM === 0 ? 'No hills' : `${num(p.climbPer100KmM, 0)} m up and down per 100 km, slopes of ${num(p.slopePct, 0)} %`)}
        onPick={(p) => set({ ascentPer100Km: p.climbPer100KmM, slopePct: p.slopePct })}
      />
      <NumberField label="Climb per 100 km" unit="m" min={0} max={5000} sliderMax={3000} step={50} hint="As much down again: the car comes back to where it started" {...ascent} />
      <NumberField label="Typical slope of the hills" unit="%" min={0.5} max={20} sliderMax={12} step={0.5} {...slope} />
    </>
  );
}

/** Assumptions page: the terrain presets (data/terrain.csv) with their reasons and sources. */
export function TerrainTable() {
  const { ds, a } = useEngine();
  if (ds.terrain.length === 0) return null;
  return (
    <section className="panel stack" id="terrain">
      <div>
        <h2>Terrain presets</h2>
        <p className="muted">
          What the Terrain choice of each test fills in (<span className="mono">data/terrain.csv</span>). The climb and its descent are driven at the
          slope, the rest of the trip is flat; a slope left blank in data/standard.csv is the typical slope ({num(a.hillSlopeDefaultPct, 1)} %).
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Terrain</th>
              <th className="r">Climb per 100 km</th>
              <th className="r">Slope</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {ds.terrain.map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td className="r num">{num(t.climbPer100KmM, 0)} m</td>
                <td className="r num">{num(t.slopePct, 1)} %</td>
                <td>
                  {t.why} · <SourceText ids={t.sources} sources={ds.sources} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
