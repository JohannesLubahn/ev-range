import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StackedRows, TipLines, type StackedRow } from '../components/Bars';
import { niceTicks } from '../components/ticks';
import { useThemeColors, type ThemeColors } from '../components/useThemeColors';
import { checkDegradation } from '../engine/battery/ageing';
import { Pack } from '../engine/battery/pack';
import { coolingCop } from '../engine/onboard/climate';
import { factsTabPower, onboardPower } from '../engine/onboard/loads';
import { packHeatCapacity, packThermal } from '../engine/onboard/thermal';
import { checkMeasurement } from '../engine/onboard/validation';
import { fixed, num } from '../format';
import { useEngine } from '../state/engine';
import { useStore } from '../state/store';

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: unknown; value?: unknown; color?: string; dataKey?: unknown }>;
  label?: string | number;
}

function makeTooltip(title: (l: string | number | undefined) => string, unit: string, digits = 1) {
  return function ChartTip({ active, payload, label }: TipProps) {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip">
        <div className="title">{title(label)}</div>
        {payload.map((p) => (
          <div className="line" key={String(p.dataKey)}>
            <i style={{ background: p.color }} />
            <b>
              {typeof p.value === 'number' ? fixed(p.value, digits) : String(p.value ?? '')} {unit}
            </b>
            <span>{String(p.name ?? '')}</span>
          </div>
        ))}
      </div>
    );
  };
}

function axisProps(c: ThemeColors) {
  return { stroke: c['--line-strong'], tick: { fill: c['--axis'], fontSize: 12 }, tickLine: false } as const;
}

function LegendText({ value }: { value: string }) {
  return <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{value}</span>;
}

/** Legend items in the order of the series (Recharts sorts them alphabetically by default). */
function seriesOrder(keys: string[]) {
  return (item: { dataKey?: unknown }) => keys.indexOf(String(item.dataKey));
}

const SPEEDS = Array.from({ length: 15 }, (_, i) => 20 + i * 10);
const TEMPS = Array.from({ length: 13 }, (_, i) => -20 + i * 5);
const KMS = Array.from({ length: 31 }, (_, i) => i * 10000);

export function PhysicsPage() {
  const { out, selectedIds, derivedById, ds, a, scenario } = useEngine();
  const physicsCars = useStore((s) => s.physicsCars);
  const setPhysicsCars = useStore((s) => s.setPhysicsCars);
  const c = useThemeColors();
  const series = [c['--series-1'], c['--series-2'], c['--series-3']];
  const candidates = selectedIds.filter((id) => out.results[id] && !derivedById[id].isIce);
  const chosen = (physicsCars.filter((id) => candidates.includes(id)).length ? physicsCars.filter((id) => candidates.includes(id)) : candidates).slice(0, 3);
  const [chem, setChem] = useState<string>(Object.keys(ds.chemistries)[0] ?? 'LFP');
  const cabin = scenario.noCharger.cabinC;
  const cabinText = cabin === null ? 'heating/AC off' : `cabin ${num(cabin, 0)} °C`;

  const speedData = useMemo(
    () =>
      SPEEDS.map((v) => {
        const row: Record<string, number> = { speed: v };
        for (const id of chosen) {
          const m = out.models[id];
          row[id] = m.segment({ label: 'x', distanceKm: 100, avgSpeedKmh: v, profile: 'steady', cabinC: null }).driveKwh;
        }
        return row;
      }),
    [chosen, out],
  );

  const chosenKey = chosen.join(',');
  const wearData = useMemo(
    () =>
      KMS.map((k) => {
        const row: Record<string, number> = { km: k };
        for (const id of chosenKey.split(',').filter(Boolean)) {
          const g = out.models[id]?.ageing(k);
          if (g) row[id] = g.sohPct;
        }
        return row;
      }),
    [chosenKey, out],
  );
  const wearNow = chosen.map((id) => ({ id, g: out.models[id]?.ageing() ?? null }));
  const fleetChecks = useMemo(() => ds.degradationMeasurements.map((m) => checkDegradation(ds, a, m)), [ds, a]);
  const sourceById = Object.fromEntries(ds.sources.map((s) => [s.id, s]));

  const first = chosen[0];
  const breakdown: StackedRow[] = useMemo(() => {
    if (!first) return [];
    const m = out.models[first];
    return [30, 60, 90, 120, 150].map((v) => {
      const seg = m.segment({ label: 'x', distanceKm: 100, avgSpeedKmh: v, profile: 'steady', cabinC: cabin });
      const p = seg.physics;
      const eta = m.calibration().etaDrive;
      const rolling = (p.rollingPerKm / eta) * 100;
      const air = (p.aeroPerKm / eta) * 100;
      const onboard = seg.onboardKwh;
      return {
        id: String(v),
        label: `${v} km/h`,
        parts: [rolling, air, onboard],
        end: <span>{fixed(rolling + air + onboard, 1)} <span className="faint">kWh/100 km</span></span>,
        tip: (
          <TipLines
            title={`${derivedById[first].car.name} at ${v} km/h`}
            lines={[
              { color: c['--series-1'], value: `${fixed(rolling, 1)} kWh`, label: 'rolling resistance' },
              { color: c['--series-2'], value: `${fixed(air, 1)} kWh`, label: 'air drag' },
              { color: c['--series-3'], value: `${fixed(onboard, 1)} kWh`, label: `onboard (${cabinText})` },
            ]}
          />
        ),
      };
    });
  }, [first, out, cabin, cabinText, derivedById, c]);

  const cond = scenario.conditions;
  const thermal = cond.thermalMode;
  const tempData = useMemo(() => {
    const loadKw = 20;
    return TEMPS.map((t) => {
      const row: Record<string, number> = { air: t };
      for (const code of Object.keys(ds.chemistries)) {
        const chemistry = ds.chemistries[code];
        const pack = new Pack({ chemistry, capacityTemps: ds.capacityTemps, nominalKwh: 60, sohFrac: 1, packVoltageV: a.batteryPackVoltageV });
        const ref = pack.discharge(95, 5, loadKw, 1.1, 25);
        // Pack temperature over the trip that empties it (95 → 5 % at 20 kW), from its heat capacity and losses.
        const th = packThermal({
          airC: t,
          durationH: ref.terminalKwh / loadKw,
          lossKw: ref.terminalKwh > 0 ? (loadKw * ref.lossKwh) / ref.terminalKwh : 0,
          heatCapacityJPerK: packHeatCapacity(60, chemistry),
          mode: thermal,
          preconditionedC: cond.preconditionedC,
          coolingCop: coolingCop(t, a),
          a,
        });
        row[code] = (pack.discharge(95, 5, loadKw, 1.1, th.meanC).terminalKwh / ref.terminalKwh) * 100;
        row[`bt_${code}`] = th.meanC;
        row[`th_${code}`] = th.heatingKwh + th.coolingKwh;
      }
      const at = { ...cond, airTemperatureC: t };
      row.regular = onboardPower(ds, a, at, 'regular', false, a.cabinSetpointC).totalKw;
      row.regularHp = onboardPower(ds, a, at, 'regular', true, a.cabinSetpointC).totalKw;
      row.premium = onboardPower(ds, a, at, 'premium', true, a.cabinSetpointC).totalKw;
      row.facts = factsTabPower(ds, 'regular', t, true)?.totalKw ?? NaN;
      return row;
    });
  }, [ds, a, cond, thermal]);
  const checks = useMemo(() => ds.onboardMeasurements.map((m) => checkMeasurement(ds, a, m)), [ds, a]);

  const curveTemps = [-20, -10, 0, 25, 40];
  const ord = [c['--ord-1'], c['--ord-2'], c['--ord-3'], c['--ord-4'], c['--ord-5']];
  const curves = useMemo(() => {
    const ch = ds.chemistries[chem];
    if (!ch) return [];
    const pack = new Pack({ chemistry: ch, capacityTemps: ds.capacityTemps, nominalKwh: 60, sohFrac: 1, packVoltageV: a.batteryPackVoltageV });
    const byT = curveTemps.map((t) => pack.dischargeCurve(30, t)); // 0.5C on a 60 kWh pack
    const xs = Array.from({ length: 51 }, (_, i) => i * 2);
    return xs.map((x) => {
      const row: Record<string, number | null> = { x };
      curveTemps.forEach((t, k) => {
        const pts = byT[k];
        const last = pts[pts.length - 1];
        if (!last || x > last.deliveredPct) {
          row[`t${t}`] = null;
          return;
        }
        const j = pts.findIndex((p) => p.deliveredPct >= x);
        if (j <= 0) row[`t${t}`] = pts[0]?.cellV ?? null;
        else {
          const p0 = pts[j - 1];
          const p1 = pts[j];
          const f = (x - p0.deliveredPct) / Math.max(1e-9, p1.deliveredPct - p0.deliveredPct);
          row[`t${t}`] = p0.cellV + f * (p1.cellV - p0.cellV);
        }
      });
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chem, ds, a.batteryPackVoltageV]);

  const speedTicks = niceTicks(0, Math.max(1, ...speedData.flatMap((r) => chosen.map((id) => r[id] ?? 0))));
  const chemCodes = Object.keys(ds.chemistries);
  const tempTicks = niceTicks(Math.min(100, ...tempData.flatMap((r) => chemCodes.map((k) => r[k]))), 100, 4);
  const powerTicks = niceTicks(0, Math.max(1, ...tempData.map((r) => Math.max(r.regular, r.regularHp, r.premium, Number.isFinite(r.facts) ? r.facts : 0))));
  const curveValues = curves.flatMap((r) => Object.entries(r).filter(([k, v]) => k !== 'x' && v !== null).map(([, v]) => v as number));
  const curveTicks = niceTicks(curveValues.length ? Math.min(...curveValues) : 2, curveValues.length ? Math.max(...curveValues) : 4);
  const SpeedTip = useMemo(() => makeTooltip((l) => `${l} km/h, steady`, 'kWh/100 km'), []);
  const TempTip = useMemo(() => makeTooltip((l) => `Air ${l} °C`, '%', 0), []);
  const PowerTip = useMemo(() => makeTooltip((l) => `Air ${l} °C`, 'kW', 2), []);
  const wearTicks = niceTicks(Math.min(100, ...wearData.flatMap((r) => chosen.map((id) => r[id] ?? 100))), 100, 4);
  const WearTip = useMemo(() => makeTooltip((l) => `${num(Number(l), 0)} km driven`, '% capacity left'), []);
  const CurveTip = useMemo(() => makeTooltip((l) => `${l} % of rated capacity delivered`, 'V', 3), []);

  return (
    <div className="stack">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Physics</h1>
          <p className="muted">
            How speed, weather and battery chemistry change consumption, at the current conditions ({num(scenario.conditions.airTemperatureC, 1)} °C,
            +{scenario.conditions.payloadKg} kg). Each car is calibrated so that its own test cycle reproduces its rated consumption.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel stack">
          <div>
            <h2>Consumption vs. speed</h2>
            <p className="muted">Driving energy at steady speed on a flat road, without onboard systems.</p>
          </div>
          <div className="row">
            {candidates.map((id) => (
              <label className="check" key={id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(id)}
                  disabled={!chosen.includes(id) && chosen.length >= 3}
                  onChange={(e) => setPhysicsCars(e.target.checked ? [...chosen, id] : chosen.filter((x) => x !== id))}
                />
                {derivedById[id].car.name}
              </label>
            ))}
          </div>
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={speedData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={c['--line']} vertical={false} />
                <XAxis dataKey="speed" {...axisProps(c)} unit=" km/h" />
                <YAxis {...axisProps(c)} width={44} ticks={speedTicks} domain={[speedTicks[0], speedTicks[speedTicks.length - 1]]} />
                <Tooltip content={SpeedTip} cursor={{ stroke: c['--line-strong'] }} />
                <Legend formatter={(v) => <LegendText value={String(v)} />} iconType="plainline" itemSorter={seriesOrder(chosen)} />
                {chosen.map((id, k) => (
                  <Line key={id} dataKey={id} name={derivedById[id].car.name} stroke={series[k]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c['--surface'], strokeWidth: 2 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>kWh/100 km</th>
                  {[50, 90, 120, 150].map((v) => (
                    <th key={v} className="r">
                      {v} km/h
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chosen.map((id) => (
                  <tr key={id}>
                    <td>{derivedById[id].car.name}</td>
                    {[50, 90, 120, 150].map((v) => (
                      <td key={v} className="r">
                        {fixed(speedData.find((r) => r.speed === v)?.[id], 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel stack">
          <div>
            <h2>Where the energy goes</h2>
            <p className="muted">
              {first ? derivedById[first].car.name : 'First selected car'} per 100 km at steady speed, at the battery, with onboard systems as in the
              No-charger test ({cabinText}).
            </p>
          </div>
          {breakdown.length ? (
            <StackedRows
              rows={breakdown}
              series={[
                { key: 'roll', label: 'Rolling resistance', color: c['--series-1'] },
                { key: 'air', label: 'Air drag', color: c['--series-2'] },
                { key: 'onboard', label: 'Onboard systems', color: c['--series-3'] },
              ]}
            />
          ) : (
            <p className="muted">Available with the Physics model.</p>
          )}
          <p className="faint" style={{ fontSize: 12.5 }}>
            Air drag grows with the square of the speed per km, rolling resistance only slightly; onboard energy per km falls with speed because
            the trip takes less time.
          </p>
        </section>

        <section className="panel stack">
          <div>
            <h2>Battery energy vs. air temperature</h2>
            <p className="muted">
              Usable energy from 95 to 5 % (20 kW load, 60 kWh pack, about 2.7 h) relative to 25 °C. The pack starts{' '}
              {thermal === 'preconditioned' ? `preconditioned to ${cond.preconditionedC} °C` : 'at the air temperature'} and{' '}
              {thermal === 'ambient'
                ? 'is not heated or cooled'
                : `is heated below ${a.batteryManagedMinC} °C and cooled above ${a.batteryManagedMaxC} °C`}
              ; its own losses warm it slowly (heat capacity ≈ 7 kJ/K per kWh).
            </p>
          </div>
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={tempData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={c['--line']} vertical={false} />
                <XAxis dataKey="air" {...axisProps(c)} unit=" °C" />
                <YAxis {...axisProps(c)} width={48} ticks={tempTicks} domain={[tempTicks[0], tempTicks[tempTicks.length - 1]]} unit=" %" />
                <Tooltip content={TempTip} cursor={{ stroke: c['--line-strong'] }} />
                <Legend formatter={(v) => <LegendText value={String(v)} />} iconType="plainline" itemSorter={seriesOrder(chemCodes)} />
                {Object.keys(ds.chemistries).map((code, k) => (
                  <Line key={code} dataKey={code} name={code} stroke={series[k]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Air</th>
                  <th className="r">Battery (mean)</th>
                  {Object.keys(ds.chemistries).map((code) => (
                    <th key={code} className="r">
                      {code} usable
                    </th>
                  ))}
                  <th className="r">Heating / cooling</th>
                </tr>
              </thead>
              <tbody>
                {tempData
                  .filter((r) => [-20, -10, 0, 10, 20, 30, 40].includes(r.air))
                  .map((r) => (
                    <tr key={r.air}>
                      <td className="nowrap">{r.air} °C</td>
                      <td className="r">{fixed(r[`bt_${Object.keys(ds.chemistries)[0]}`], 0)} °C</td>
                      {Object.keys(ds.chemistries).map((code) => (
                        <td key={code} className="r">
                          {fixed(r[code], 0)} %
                        </td>
                      ))}
                      <td className="r">{fixed(r[`th_${Object.keys(ds.chemistries)[0]}`], 1)} kWh</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>
            Battery temperature and heating/cooling energy for {Object.keys(ds.chemistries)[0]}. The heating/cooling energy is added to the energy
            needed in each stress test.
          </p>
        </section>

        <section className="panel stack">
          <div className="row">
            <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <h2>Discharge curves</h2>
              <p className="muted">Cell voltage while discharging at 0.5C, by battery temperature.</p>
            </div>
            <div className="segmented" role="group" aria-label="Chemistry">
              {Object.keys(ds.chemistries).map((code) => (
                <button key={code} type="button" aria-pressed={chem === code} onClick={() => setChem(code)}>
                  {code}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={curves} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={c['--line']} vertical={false} />
                <XAxis dataKey="x" {...axisProps(c)} unit=" %" type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} />
                <YAxis {...axisProps(c)} width={48} ticks={curveTicks} domain={[curveTicks[0], curveTicks[curveTicks.length - 1]]} unit=" V" />
                <Tooltip content={CurveTip} cursor={{ stroke: c['--line-strong'] }} />
                <Legend formatter={(v) => <LegendText value={String(v)} />} iconType="plainline" itemSorter={seriesOrder(curveTemps.map((t) => `t${t}`))} />
                {curveTemps.map((t, k) => (
                  <Line key={t} dataKey={`t${t}`} name={`${t} °C`} stroke={ord[k]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>
            {ds.chemistries[chem]?.ocvSource} Resistance: {ds.chemistries[chem]?.resistanceSource}
          </p>
        </section>

        <section className="panel stack">
          <div>
            <h2>Battery wear vs. km driven</h2>
            <p className="muted">
              Capacity left from charge cycles and age, at {num(cond.airTemperatureC, 0)} °C and the battery-life driving ({num(scenario.batteryLife.kmPerYear, 0)}{' '}
              km a year, {num(scenario.batteryLife.speedKmh, 0)} km/h) and battery care ({num(scenario.batteryLife.dcSharePct, 0)} % fast charging,{' '}
              {num(scenario.batteryLife.highSocTimePct, 0)} % of the time parked above 80 %). The stress tests use the value at {num(cond.batteryKm, 0)} km
              (Conditions).
            </p>
          </div>
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={wearData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={c['--line']} vertical={false} />
                <XAxis
                  dataKey="km"
                  {...axisProps(c)}
                  type="number"
                  domain={[0, KMS[KMS.length - 1]]}
                  ticks={[0, 50000, 100000, 150000, 200000, 250000, 300000]}
                  tickFormatter={(v: number) => `${v / 1000}k`}
                  unit=" km"
                />
                <YAxis {...axisProps(c)} width={48} ticks={wearTicks} domain={[wearTicks[0], 100]} unit=" %" />
                <Tooltip content={WearTip} cursor={{ stroke: c['--line-strong'] }} />
                <Legend formatter={(v) => <LegendText value={String(v)} />} iconType="plainline" itemSorter={seriesOrder(chosen)} />
                {chosen.map((id, k) => (
                  <Line key={id} dataKey={id} name={derivedById[id].car.name} stroke={series[k]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Car</th>
                  <th className="r">Age</th>
                  <th className="r">Full cycles</th>
                  <th className="r">Cycle wear</th>
                  <th className="r">Calendar</th>
                  <th className="r">Left</th>
                </tr>
              </thead>
              <tbody>
                {wearNow.map(({ id, g }) => (
                  <tr key={id}>
                    <td>
                      {derivedById[id].car.name} <span className="faint">{derivedById[id].chemistry}</span>
                    </td>
                    <td className="r">{g ? `${fixed(g.years, 1)} y` : ''}</td>
                    <td className="r">{g ? `${num(g.efc, 0)} of ${num(derivedById[id].car.batteryCycles, 0)}` : ''}</td>
                    <td className="r">
                      {g ? `${fixed(g.cycleFadePct, 1)} %` : ''} {g && <span className="faint">×{fixed(g.cycleWearFactor, 2)}</span>}
                    </td>
                    <td className="r">
                      {g ? `${fixed(g.calendarFadePct, 1)} %` : ''} {g && <span className="faint">×{fixed(g.calendarFactor, 2)}</span>}
                    </td>
                    <td className="r">
                      <b>{g ? `${fixed(g.sohPct, 1)} %` : ''}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>
            At {num(cond.batteryKm, 0)} km. Cycle wear reaches {num(a.ratedCyclesEndCapacityPct, 0)} % capacity at the car's rated cycles, shaped
            per chemistry; calendar ageing grows with the square root of time (roughly) and doubles about every 17 °C warmer. Shapes from NREL's
            BLAST-Lite models of automotive cells, size fitted to fleet data (below) with typical habits. Battery care (×, vs. typical habits): fast
            charging adds wear per cycle in proportion to the share of fast charging and the car's charging rate (fitted to INL's DC vs. AC Nissan
            Leaf test); a battery parked full ages faster with time, much more for NMC than LFP (BLAST-Lite's charge-level term). Cold-weather
            lithium plating and the rise in internal resistance are not modelled.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fleet data</th>
                  <th>Cars</th>
                  <th>Charging habits</th>
                  <th className="r">Km</th>
                  <th className="r">Measured</th>
                  <th className="r">Model</th>
                </tr>
              </thead>
              <tbody>
                {fleetChecks.map((k) => {
                  const s = sourceById[k.m.sourceId];
                  return (
                    <tr key={k.m.id} title={k.m.notes}>
                      <td>
                        {s?.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.publisher || s.title}
                          </a>
                        ) : (
                          k.m.sourceId
                        )}
                      </td>
                      <td>
                        {k.m.vehicle} <span className="faint">{k.m.chemistry}</span>
                      </td>
                      <td className="faint">
                        {k.m.dcSharePct === null && k.m.highSocTimePct === null
                          ? 'typical'
                          : [
                              k.m.dcSharePct !== null ? `${num(k.m.dcSharePct, 0)} % DC${k.m.fastChargeCRate !== null ? ` at ${fixed(k.m.fastChargeCRate, 1)} C` : ''}` : null,
                              k.m.highSocTimePct !== null ? `${num(k.m.highSocTimePct, 0)} % of the time full` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </td>
                      <td className="r">{num(k.m.km, 0)}</td>
                      <td className="r">{fixed(k.m.measuredSohPct, 1)} %</td>
                      <td className="r">
                        {k.model ? `${fixed(k.model.sohPct, 1)} %` : ''}{' '}
                        <span className="faint">({k.deviationPct >= 0 ? '+' : '−'}{fixed(Math.abs(k.deviationPct), 1)})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>
            Hover a row for the assumed age, km and temperature. Sources and values: data/battery/degradation_measurements.csv.
          </p>
        </section>

        <section className="panel stack">
          <div>
            <h2>Onboard power vs. air temperature</h2>
            <p className="muted">
              Electronics + cabin heating/AC holding {num(a.cabinSetpointC, 0)} °C (the default cabin temperature), at the current sunshine ({num(cond.solarWm2, 0)} W/m²) and humidity (
              {num(cond.humidityPct, 0)} %). Battery heating/cooling depends on the trip and is added in each stress test.
            </p>
          </div>
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={tempData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={c['--line']} vertical={false} />
                <XAxis dataKey="air" {...axisProps(c)} unit=" °C" />
                <YAxis {...axisProps(c)} width={48} ticks={powerTicks} domain={[0, powerTicks[powerTicks.length - 1]]} unit=" kW" />
                <Tooltip content={PowerTip} cursor={{ stroke: c['--line-strong'] }} />
                <Legend formatter={(v) => <LegendText value={String(v)} />} iconType="plainline" itemSorter={seriesOrder(['regular', 'regularHp', 'premium', 'facts'])} />
                <Line dataKey="regular" name="Regular car, resistive heater" stroke={series[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line dataKey="regularHp" name="Regular car, heat pump" stroke={series[1]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line dataKey="premium" name="Large / premium car, heat pump" stroke={series[2]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line
                  dataKey="facts"
                  name="Your Facts tab (old model, regular car)"
                  stroke={c['--ink-2']}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Air</th>
                  <th className="r">Regular, resistive</th>
                  <th className="r">Regular, heat pump</th>
                  <th className="r">Premium, heat pump</th>
                  <th className="r">Facts tab</th>
                </tr>
              </thead>
              <tbody>
                {tempData
                  .filter((r) => [-20, -10, 0, 10, 20, 25, 30, 35, 40].includes(r.air))
                  .map((r) => (
                    <tr key={r.air}>
                      <td className="nowrap">{r.air} °C</td>
                      <td className="r">{fixed(r.regular, 2)} kW</td>
                      <td className="r">{fixed(r.regularHp, 2)} kW</td>
                      <td className="r">{fixed(r.premium, 2)} kW</td>
                      <td className="r">{fixed(r.facts, 2)} kW</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>
            Heat balance of the cabin: walls and windows, fresh air, sunshine, body heat and moisture, divided by the COP of the AC or heat pump
            (a share of the ideal Carnot COP). Parameters: data/onboard/classes.csv and the “Cabin climate” assumptions.
          </p>
        </section>

        <section className="panel stack span-all">
          <div>
            <h2>Onboard model vs. measurements</h2>
            <p className="muted">
              Published measurements of parked or driving EVs, and what the model and your Facts tab give for the same car class, air temperature,
              cabin temperature and sunshine. “Climate” = heating/AC only, “total” = incl. electronics.
            </p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Measurement</th>
                  <th>Car</th>
                  <th className="r">Air</th>
                  <th>What</th>
                  <th className="r">Measured</th>
                  <th className="r">Model</th>
                  <th className="r">Facts tab</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((k) => (
                  <tr key={k.m.id} title={k.m.note}>
                    <td>
                      {k.m.url ? (
                        <a href={k.m.url} target="_blank" rel="noreferrer">
                          {k.m.source}
                        </a>
                      ) : (
                        k.m.source
                      )}
                    </td>
                    <td>{k.m.vehicle}</td>
                    <td className="r">
                      {num(k.m.airC, 1)} °C{k.m.solarWm2 > 0 ? ', sun' : ''}
                    </td>
                    <td>{k.m.compare}</td>
                    <td className="r">
                      {k.m.measuredMinKw !== null && k.m.measuredMaxKw !== null
                        ? `${fixed(k.m.measuredMinKw, 2)}–${fixed(k.m.measuredMaxKw, 2)}`
                        : fixed(k.m.measuredKw, 2)}{' '}
                      kW
                    </td>
                    <td className="r">
                      {fixed(k.modelKw, 2)} kW{' '}
                      <span className="faint">{k.deviation === 0 ? '(in range)' : `(${k.deviation > 0 ? '+' : '−'}${fixed(Math.abs(k.deviation) * 100, 0)} %)`}</span>
                    </td>
                    <td className="r">{fixed(k.factsKw, 2)} kW</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>
            Hover a row for the test conditions. Cars differ by about ±30 % (insulation, fresh-air setting, heater). The Car and Driver Model 3 most
            likely recirculated its cabin air; the model keeps fresh air on against fogged windows. Sources and values: data/onboard/measurements.csv.
          </p>
        </section>

        <section className="panel stack">
          <div>
            <h2>Calibration</h2>
            <p className="muted">
              Each car’s drivetrain efficiency is solved so that its test cycle (the standard of its rated range) gives its rated consumption.
            </p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Standard</th>
                  <th className="r">Consumption</th>
                  <th className="r">Battery ÷ range</th>
                  <th className="r">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {out.derived.map((d) => {
                  const m = out.models[d.car.id];
                  const cal = d.consumption.value !== null ? m.calibration() : null;
                  return (
                    <tr key={d.car.id}>
                      <td>{d.car.name}</td>
                      <td>
                        {d.basis.value}
                        {d.basis.provenance === 'estimated' && <span className="chip est" style={{ marginLeft: 4 }}>est.</span>}
                      </td>
                      <td className="r">{fixed(d.consumption.value, 3)}</td>
                      <td className="r">{fixed(d.impliedConsumption, 3)}</td>
                      <td className="r">
                        {cal ? (d.isIce ? `${fixed(cal.etaDrive, 2)} kWh/l` : `${fixed(cal.etaDrive * 100, 0)} %`) : '–'}
                        {cal?.clamped && <span className="chip warn" style={{ marginLeft: 4 }}>limited</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>
            “limited” = the rated consumption is too low for the car’s weight, drag and test cycle (efficiency would exceed 100 %); see the data check
            on the Cars page.
          </p>
        </section>
      </div>
    </div>
  );
}
