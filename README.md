# EV Compare

A website that compares electric cars in the stress tests of `EV Calculations.ods` (traffic jam, no charger,
sprint, long trip, battery life) and in their cost of ownership. Consumption is calculated from first principles (air
drag, rolling resistance, slope, acceleration, heating and AC from a heat balance of the cabin, battery chemistry and
temperature) and calibrated per car to its rated consumption.

Pages: **Compare** (all results in one table), **Stress tests** (one tab per test: battery needed vs. available
and the average consumption in kWh/100 km), **Cost of ownership**, **Cars** (specs and data check), **Physics** (how
the model behaves, checked against measurements) and **Assumptions** (every constant, with sources).

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
| `data/cars.csv` | **One row per car and market.** Blank cell = unknown (the app estimates it and marks it, or flags it as missing). |
| `data/markets.csv` | One row per market: name, currency, electricity price and maintenance per year (in that currency), with source. |
| `data/fields.csv` | One row per column of `cars.csv`: label, unit, group, "higher/lower is better", description. |
| `data/assumptions.csv` | Every constant the model uses, with description and source. |
| `data/body_types.csv` | Default drag coefficient and frontal area per body type (only used when a car lacks them). |
| `data/onboard/classes.csv` | Electronics and cabin properties per car class (walls, fresh air, sun area, heat capacity), with sources. |
| `data/onboard/measurements.csv` | Published onboard-power measurements (Argonne, ADAC, …) the model is checked against. |
| `data/onboard/facts_tab.csv` | Your Facts-tab onboard curves, kept for comparison only. |
| `data/battery/*.csv` | Voltage curves, resistance and capacity vs. temperature per chemistry (LFP, NMC). |
| `data/cycles/*.csv` | Official test-cycle speed traces (WLTP, NEDC, EPA) used for the calibration. |
| `data/sources.csv` | Every source the data and the model rest on, with links (shown on the Assumptions page). |

- **Add a car:** add a line to `cars.csv`. Fill `brand`, and `model` / `variant` when a model comes in several
  versions (e.g. BYD · Seal · low): variants then sit together under their model in the car list.
- **Add a market:** add a line to `markets.csv` (blank prices = the assumption, converted), then a line per car sold
  there in `cars.csv` with that `market` code, its `currency` and `price`, and a unique `id` (e.g. `byd-atto-3-de`).
  A car sold in two markets has two rows.
- **Add a spec:** add a column to `cars.csv` and a line to `fields.csv`; it appears on the Cars page.
- **Consumption standard:** a car's consumption comes from the same source as its rated range, so the filled
  range column (`range_nedc_km`, `range_wltp_km`, `range_epa_km`, `range_cltc_km`) tells the model which test
  cycle to calibrate on. Only when a car has several ranges, set `consumption_basis`.
- **Heat pump:** set `heat_pump` to `yes` or `no` per car (blank = resistive heater, the conservative case). It only
  matters below about 15 °C.
- The **Cars → Data check** list shows missing, estimated or suspicious values per car.

## The car list

On Compare the car list is the left column; on the other pages the **Cars** button opens it.

- **Market:** lists only the cars sold there. Prices and costs are shown in its currency, with its electricity
  price and maintenance. **All markets** lists every car, converted to `display_currency`.
- **Sort:** model (A–Z), price, rated range, battery size, rated consumption, 0–100 km/h or seats; the arrow
  reverses the order. Cars without the value go last.
- **Group:** none, brand, body type or price band (round steps). Sort and group combine, e.g. body type sorted by
  price.
- **Variants** of one model always stay together, with one checkbox for all of them.
- **Filters:** body type, battery (LFP / NMC / ICE), seats, price from–to, and search. Every page compares the
  ticked cars the market and filters show. Only the ticked cars are calculated, so a long list stays fast.
- CLTC: the CLTC-P speed trace (GB/T 38146.1-2019) is not openly available. Save it as `data/cycles/cltc_p.csv`
  (`time_s,speed_kmh`) and add a `CLTC` row to `data/cycles/index.csv` to enable it; until then CLTC cars are
  calibrated on NEDC.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Engine tests: physics, onboard measurements, spreadsheet fixes, average consumption, sources (Vitest) |
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
tests/                 physics, fixes and source tests
scripts/               ods_to_csv.py, build_reference_data.py, inline_build.mjs
```
