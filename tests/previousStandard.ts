// The standard as it was until 2026-11-20 (before the user's own setup became the standard on 2026-11-21): the
// Spreadsheet preset's trip inputs with the conditions fitted to each test. Tests that check the physics on a fixed
// set of inputs use this, so they do not move when the standard changes again.
import type { Dataset } from '../src/data/types';
import { spreadsheetScenario } from '../src/engine/scenario';
import type { Assumptions, Scenario } from '../src/engine/types';

export function previousStandard(ds: Dataset, a: Assumptions): Scenario {
  const s = spreadsheetScenario(ds, a);
  s.conditions.trafficJam = { ...s.conditions.trafficJam, airTemperatureC: 35, solarWm2: 800 };
  s.conditions.longTrip = { ...s.conditions.longTrip, payloadKg: 350 };
  s.conditions.sprint = { ...s.conditions.sprint, airTemperatureC: 30 };
  return s;
}
