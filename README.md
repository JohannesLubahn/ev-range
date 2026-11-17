# EV Compare

A website that compares electric cars in the stress tests of `EV Calculations.ods`: traffic jam, no charger,
sprint, battery life, long trip and cost of ownership. Consumption is calculated from first principles (air drag,
rolling resistance, slope, acceleration, onboard loads, battery chemistry vs. temperature) and calibrated per car
to its rated consumption. Your spreadsheet's own model is still available as the **Simple** model.

## Run it

```bash
npm install        # once
npm run dev        # then open http://localhost:5173
```

Without a server: `npm run build:single` writes `dist-single/ev-compare.html`, a single file you can open
directly in a browser.

## Edit the data

Everything the app knows lives in `data/` as CSV files (UTF-8, comma-separated, `.` as decimal point). They open
in LibreOffice; in dev mode the app reloads as soon as you save a file.

| File | What it holds |
|---|---|
| `data/cars.csv` | **One row per car.** Blank cell = unknown (the app estimates it and marks it, or flags it as missing). |
| `data/fields.csv` | One row per column of `cars.csv`: label, unit, group, "higher/lower is better", description. |
| `data/assumptions.csv` | Every constant the model uses, with description and source. |
| `data/body_types.csv` | Default drag coefficient and frontal area per body type (only used when a car lacks them). |
| `data/onboard/*.csv` | Onboard base loads per car class and heating/cooling power vs. temperature (your Facts tab). |
| `data/battery/*.csv` | Voltage curves, resistance and capacity vs. temperature per chemistry (LFP, NMC). |
| `data/cycles/*.csv` | Official test-cycle speed traces (WLTP, NEDC, EPA) used for the calibration. |

- **Add a car:** add a line to `cars.csv`.
- **Add a spec:** add a column to `cars.csv` and a line to `fields.csv`; it appears on the Cars page.
- **Consumption standard:** a car's consumption comes from the same source as its rated range, so the filled
  range column (`range_nedc_km`, `range_wltp_km`, `range_epa_km`, `range_cltc_km`) tells the model which test
  cycle to calibrate on. Only when a car has several ranges, set `consumption_basis`.
- The **Cars → Data check** list shows missing, estimated or suspicious values per car.
- CLTC: the CLTC-P speed trace (GB/T 38146.1-2019) is not openly available. Save it as `data/cycles/cltc_p.csv`
  (`time_s,speed_kmh`) and add a `CLTC` row to `data/cycles/index.csv` to enable it; until then CLTC cars are
  calibrated on NEDC.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Engine tests: spreadsheet parity, physics, fixes (Vitest) |
| `npm run build` | Type check + production build into `dist/` |
| `npm run build:single` | One self-contained HTML file in `dist-single/` |
| `npm run import-ods` | Re-import from `~/Documents/Tools/EV Calculations.ods` (never overwrites existing data files without `--force`) |
| `python3 -I scripts/build_reference_data.py` | Rebuild the test-cycle and battery tables from their published sources |

## How the model works

See [docs/model.md](docs/model.md): the physics, the calibration, the battery model, the sources, and how the
results compare with the spreadsheet.

## Project layout

```
data/                  the CSV files above
src/engine/            calculations only (no UI): physics/, battery/, onboard/, cases.ts, model.ts, derive.ts
src/data/              CSV parsing
src/state/             app state (Zustand) and the engine provider
src/components, pages/ the UI (React)
tests/                 parity, physics and fix tests; fixtures/spreadsheet.json comes from the .ods
scripts/               ods_to_csv.py, build_reference_data.py, inline_build.mjs
```
