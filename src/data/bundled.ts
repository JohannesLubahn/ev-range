// The data files in /data, bundled at build time. In dev mode, saving any of these files reloads the app.
import cars from '../../data/cars.csv?raw';
import fields from '../../data/fields.csv?raw';
import assumptions from '../../data/assumptions.csv?raw';
import bodyTypes from '../../data/body_types.csv?raw';
import onboardClasses from '../../data/onboard/classes.csv?raw';
import factsTab from '../../data/onboard/facts_tab.csv?raw';
import onboardMeasurements from '../../data/onboard/measurements.csv?raw';
import degradationMeasurements from '../../data/battery/degradation_measurements.csv?raw';
import sources from '../../data/sources.csv?raw';
import markets from '../../data/markets.csv?raw';
import chemistries from '../../data/battery/chemistries.csv?raw';
import ocv from '../../data/battery/ocv.csv?raw';
import temperature from '../../data/battery/temperature.csv?raw';
import calendarSoc from '../../data/battery/calendar_soc.csv?raw';
import cyclesIndex from '../../data/cycles/index.csv?raw';
import standard from '../../data/standard.csv?raw';
import blocs from '../../data/blocs.csv?raw';
import costItems from '../../data/costs/items.csv?raw';
import terrain from '../../data/terrain.csv?raw';
import profiles from '../../data/profiles.csv?raw';
import realWorldFuel from '../../data/real_world_fuel.csv?raw';
import { parseDataset, type MarketFolderFiles, type RawFiles } from './parse';
import type { Dataset } from './types';

// Every trace file in data/cycles is picked up automatically (add e.g. cltc_p.csv + a row in index.csv).
const cycleFiles = import.meta.glob('../../data/cycles/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

// Every market and bloc folder data/markets/<id>/ is picked up automatically (add a folder + a row in markets.csv).
const costFiles = import.meta.glob('../../data/markets/*/costs.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const roadTaxFiles = import.meta.glob('../../data/markets/*/road_tax.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const offerFiles = import.meta.glob('../../data/markets/*/offers.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const folderOf = (path: string) => path.split('/').slice(-2)[0];
const marketFiles: Record<string, MarketFolderFiles> = {};
for (const [path, text] of Object.entries(costFiles)) (marketFiles[folderOf(path)] ??= {}).costs = text;
for (const [path, text] of Object.entries(roadTaxFiles)) (marketFiles[folderOf(path)] ??= {}).roadTax = text;
for (const [path, text] of Object.entries(offerFiles)) (marketFiles[folderOf(path)] ??= {}).offers = text;

export const bundledFiles: RawFiles = {
  cars,
  fields,
  assumptions,
  bodyTypes,
  onboardClasses,
  factsTab,
  onboardMeasurements,
  degradationMeasurements,
  sources,
  markets,
  chemistries,
  ocv,
  temperature,
  calendarSoc,
  cyclesIndex,
  standard,
  blocs,
  costItems,
  marketFiles,
  terrain,
  profiles,
  realWorldFuel,
  cycles: Object.fromEntries(Object.entries(cycleFiles).map(([path, text]) => [path.split('/').pop() as string, text])),
};

export function loadBundledDataset(): Dataset {
  return parseDataset(bundledFiles);
}
