// Assumptions page: the petrol engine model (idle fuel, alternator, waste heat, fuel cut-off; data/assumptions.csv)
// and each petrol car's calibration on measured drives (data/real_world_fuel.csv), with their sources.
import { Fragment } from 'react';
import type { RealWorldFuelRow } from '../data/types';
import { fixed, num } from '../format';
import { CarModel } from '../engine/model';
import { useEngine } from '../state/engine';
import { SourceText } from './RunningCosts';

/** The engine values with the sources they rest on (ids in data/sources.csv; none = judgement). */
const ENGINE_VALUES: { key: string; sources: string[] }[] = [
  { key: 'engine_idle_fuel_l_per_h_per_l', sources: ['argonne-idle-2013', 'doe-idling-2021'] },
  { key: 'fuel_cut_min_kmh', sources: [] },
  { key: 'alternator_efficiency_pct', sources: ['remy-alternator-2008'] },
  { key: 'petrol_energy_kwh_per_l', sources: ['afdc-fuel-properties'] },
  { key: 'engine_coolant_heat_pct', sources: [] },
];

function driveText(r: RealWorldFuelRow, profileLabel: (id: string) => string): string {
  const drive = r.cycle ? `${r.cycle} ${r.phases.length ? r.phases.join(' + ').replace(/_/g, '-') : 'whole cycle'} at its recorded speeds` : `${profileLabel(r.profile)} at ${num(r.speedKmh ?? 0, 0)} km/h`;
  return `${drive}; ${num(r.airC, 0)} °C, ${r.cabinC === null ? 'AC off' : `AC holding ${num(r.cabinC, 0)} °C`}, ${num(r.payloadKg, 0)} kg load`;
}

export function PetrolEngineTable() {
  const { ds, a, standard, derivedById } = useEngine();
  const petrolIds = [...new Set(ds.realWorldFuel.map((r) => r.carId))].filter((id) => derivedById[id]);
  const profileLabel = (id: string) => ds.profiles.find((p) => p.id === id)?.label ?? id;
  const cars = petrolIds.map((id) => {
    const m = new CarModel(derivedById[id], { ds, a, conditions: standard.conditions.noCharger, settings: { battery: 'ideal' } });
    return { d: derivedById[id], cal: m.calibration() };
  });
  return (
    <section className="panel stack" id="petrol-engine">
      <div>
        <h2>Petrol cars: engine and real-world calibration</h2>
        <p className="muted">
          A petrol engine burns its idle fuel all the time it runs, also standing in a jam; the work at the wheels, the belt-driven AC compressor and
          the electrics (through the alternator) come on top at one efficiency η, the kWh at the wheels per litre beyond idling. While the car slows
          down, the fuel is cut off. Heating uses the engine&rsquo;s waste heat; only when that is not enough does the engine burn extra fuel.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Official (lab) consumption values of petrol cars are well below what they use on the road, so a petrol car with measured drives in{' '}
          <span className="mono">data/real_world_fuel.csv</span> is calibrated on them: the model replays each drive (route, speed, load, air and AC)
          and fits η by least squares. A petrol car without measured drives uses its official value.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table cycles-table">
          <thead>
            <tr>
              <th>Engine value</th>
              <th className="r">Value</th>
            </tr>
          </thead>
          <tbody>
            {ENGINE_VALUES.filter((v) => ds.assumptions[v.key]).map((v) => {
              const def = ds.assumptions[v.key];
              return (
                <Fragment key={v.key}>
                  <tr className="main">
                    <td>{def.label}</td>
                    <td className="r num">
                      {def.value} {def.unit}
                    </td>
                  </tr>
                  <tr className="note">
                    <td colSpan={2}>
                      {def.source} · <SourceText ids={v.sources} sources={ds.sources} />
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {cars.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table cycles-table">
            <thead>
              <tr>
                <th>Measured drive</th>
                <th className="r">Measured, l/100 km</th>
                <th className="r">Model</th>
              </tr>
            </thead>
            <tbody>
              {cars.map(({ d, cal }) => (
                <Fragment key={d.car.id}>
                  <tr className="main">
                    <td colSpan={3}>
                      <strong>{d.car.name}</strong>
                      <div className="faint">
                        η = {num(cal.etaDrive, 2)} kWh at the wheels per litre beyond idling ({num((cal.etaDrive / a.petrolEnergyKwhPerL) * 100, 0)} % of the
                        fuel energy){cal.clamped ? ' - limited, see the data check' : ''}
                      </div>
                    </td>
                  </tr>
                  {cal.realWorld?.drives.map(({ row, modelL100 }, i) => (
                    <Fragment key={`${d.car.id}-${i}`}>
                      <tr className="main">
                        <td>
                          {row.label}
                          <div className="faint">{driveText(row, profileLabel)}</div>
                        </td>
                        <td className="r num">{fixed(row.lPer100Km, 2)}</td>
                        <td className="r num">{fixed(modelL100, 2)}</td>
                      </tr>
                      <tr className="note">
                        <td colSpan={3}>
                          {row.notes} · <SourceText ids={row.sources} sources={ds.sources} />
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                  {cal.realWorld && (
                    <tr className="main">
                      <td>
                        Official {d.calibrationCycle} value (not used)
                        <div className="faint">the model on the official test cycle, calibrated on the drives above</div>
                      </td>
                      <td className="r num">{fixed(cal.realWorld.ratedL100, 2)}</td>
                      <td className="r num">{fixed(cal.realWorld.ratedModelL100, 2)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
