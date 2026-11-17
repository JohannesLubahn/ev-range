// The data files in /data, bundled at build time. In dev mode, saving any of these files reloads the app.
import cars from '../../data/cars.csv?raw';
import fields from '../../data/fields.csv?raw';
import assumptions from '../../data/assumptions.csv?raw';
import bodyTypes from '../../data/body_types.csv?raw';
import onboardClasses from '../../data/onboard/classes.csv?raw';
import hvac from '../../data/onboard/hvac.csv?raw';
import chemistries from '../../data/battery/chemistries.csv?raw';
import ocv from '../../data/battery/ocv.csv?raw';
import temperature from '../../data/battery/temperature.csv?raw';
import cyclesIndex from '../../data/cycles/index.csv?raw';
import { parseDataset, type RawFiles } from './parse';
import type { Dataset } from './types';

// Every trace file in data/cycles is picked up automatically (add e.g. cltc_p.csv + a row in index.csv).
const cycleFiles = import.meta.glob('../../data/cycles/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export const bundledFiles: RawFiles = {
  cars,
  fields,
  assumptions,
  bodyTypes,
  onboardClasses,
  hvac,
  chemistries,
  ocv,
  temperature,
  cyclesIndex,
  cycles: Object.fromEntries(Object.entries(cycleFiles).map(([path, text]) => [path.split('/').pop() as string, text])),
};

export function loadBundledDataset(): Dataset {
  return parseDataset(bundledFiles);
}
