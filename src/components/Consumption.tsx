import type { DerivedCar } from '../engine/derive';
import type { AverageConsumption, CarResults } from '../engine/types';
import { fixed, num } from '../format';
import { TipLines, type SideCell, type SideColumn, type StackSeries } from './Bars';

export const CONSUMPTION_SERIES: StackSeries[] = [
  { key: 'driving', label: 'Driving', color: 'var(--series-1)' },
  { key: 'onboard', label: 'Onboard systems', color: 'var(--series-2)' },
  { key: 'battery', label: 'Battery heating/cooling', color: 'var(--series-3)' },
];

/** The average consumption of each car in this test, as a second bar column next to the main chart. */
export function consumptionColumn<R = CarResults>(ids: string[], average: (r: R) => AverageConsumption, results: Record<string, R>, derivedById: Record<string, DerivedCar>): SideColumn {
  const cells: Record<string, SideCell> = {};
  for (const id of ids) {
    const d = derivedById[id];
    const avg = average(results[id]);
    const u = d.energyUnit;
    const ok = Number.isFinite(avg.total);
    const rated = d.consumption.value;
    const kwh = u === 'kWh';
    const ratedLabel =
      d.consumption.provenance === 'calculated' ? `battery ÷ ${d.basis.value} range` : `rated (${d.basis.value} test${kwh ? ', from the grid' : ''})`;
    cells[id] = {
      // Litres (petrol cars) do not share the kWh scale: no bar; the value with its unit in the number column.
      parts: ok && kwh ? [avg.driving, avg.onboard, avg.battery] : [],
      note: ok && !kwh ? 'petrol: litres, no bar' : undefined,
      end: !ok ? '–' : kwh ? fixed(avg.total, 1) : `${fixed(avg.total, 1)} l`,
      tip: (
        <TipLines
          title={`${d.car.name}: average consumption`}
          lines={[
            { color: 'var(--series-1)', value: `${fixed(avg.driving, 1)} ${u}`, label: 'driving' },
            { color: 'var(--series-2)', value: `${fixed(avg.onboard, 1)} ${u}`, label: 'onboard systems (heating/AC, electronics)' },
            ...(avg.battery > 0 ? [{ color: 'var(--series-3)', value: `${fixed(avg.battery, 1)} ${u}`, label: 'battery heating/cooling' }] : []),
            { value: `${fixed(avg.total, 1)} ${u}/100 km`, label: `over ${num(avg.distanceKm, 0)} km, from the ${kwh ? 'battery' : 'tank'}` },
            ...(rated !== null ? [{ value: `${fixed(rated * 100, 1)} ${u}/100 km`, label: ratedLabel }] : []),
          ]}
        />
      ),
      aria: `${d.car.name}: average consumption ${fixed(avg.total, 1)} ${u} per 100 km`,
    };
  }
  return { title: 'Average consumption, kWh/100 km', series: CONSUMPTION_SERIES, cells };
}
