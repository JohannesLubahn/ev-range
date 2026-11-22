# EV Range

A website that compares electric cars in the stress tests of `EV Calculations.ods` (traffic jam, no charger,
sprint, long trip, battery life) and in their cost of ownership. Consumption is calculated from first principles (air
drag, rolling resistance, hills with their regeneration losses, acceleration and braking, heating and AC from a heat
balance of the cabin, battery chemistry, temperature and wear) and calibrated per car to its rated consumption.

Pages: **Compare** (all results in one table), **Stress tests** (one tab per test: traffic jam, no charger, sprint,
long trip; battery needed vs. available and the average consumption in kWh/100 km), **Battery life** (capacity left
after the years of use), **Cost of ownership**, **Cars** (specs and data check), **Physics** (how
the model behaves, checked against measurements) and **Assumptions** (every constant, with sources).

## What it is made of and where it runs

- **Languages:** TypeScript (the calculations and the pages, with React for the user interface), CSS (the look),
  HTML (one page shell), CSV (all data), Python (the scripts that import the spreadsheet and rebuild the reference
  tables) and Markdown (these docs).
- **Libraries:** React (pages), Zustand (app state), Recharts (charts), Papa Parse (reading CSV), Fontsource (the fonts). Tools for
  building and testing: Vite, TypeScript, Vitest. Installed by `npm install` into `node_modules/` (not part of the
  project's own code).
- **No server and no account:** everything is calculated in the browser. Your inputs and saved scenarios are kept
  in the browser's local storage on your computer.
- **Where the code is:** in this folder (a local git repository) and, since 21 Nov 2026, in the public GitHub
  repository https://github.com/JohannesLubahn/ev-range. Only `main` is pushed, and only for major revisions.
- **Where the site is:** https://johanneslubahn.github.io/ev-range/ (GitHub Pages). Every push to `main` runs
  `.github/workflows/pages.yml`: `npm ci`, `npm test`, `npm run build`, then it publishes `dist/`. If a test fails,
  nothing is published and the last good version stays online. The page has a `noindex` tag (`index.html`), so search
  engines don't list it; remove that line to let them.
- **Not on GitHub:** `CLAUDE.md` (the AI assistant's working notes), `scripts/ods_to_csv.py` (the import from the
  author's spreadsheet) and `scripts/inline_build.mjs` (the single-file build). They stay on the author's computer
  (`.gitignore`), so `npm run import-ods` and `npm run build:single` only work there.
- **Outside requests:** none when the page opens. Only the start page's "Get route" button contacts three free
  services: Nominatim (finds the places), the FOSSGIS OSRM server (road distance) and Open-Meteo (heights); both are
  named in the legal notice (`content/legal.md`). The fonts (IBM Plex Sans / Mono, Space Grotesk, SIL Open Font License) come with the
  app (`src/fonts.css`, from the `@fontsource` packages; Latin characters, others use the system font). Links in the
  source list open only when you click them.

## Run it

```bash
npm install        # once
npm run dev        # then open http://localhost:5173
```

Without a server (author's computer only): `npm run build:single` writes `dist-single/ev-range.html`, a single
file you can open directly in a browser (and `dist-single/artifact.html`, the same app for the hosted preview).

## Edit the data

Everything the app knows lives in `data/` as CSV files (UTF-8, comma-separated, `.` as decimal point). They open
in LibreOffice; in dev mode the app reloads as soon as you save a file.

| File | What it holds |
|---|---|
| `data/cars.csv` | **One row per car**, numbered (`id` 1, 2, …; never reused): its specs, shared by every market that sells it, under whatever name. No prices or markets. Blank cell = unknown (the app estimates it and marks it, or flags it as missing). |
| `data/markets/<id>/offers.csv` | **The cars one market sells:** `car` (the number in `cars.csv`), the local `name`, the `price` in the market's currency, the car's own costs there (`energy_price` for petrol, servicing, insurance, tyres), and any `cars.csv` column whose value differs in that market (marked with the market code on the Cars page). `id` = the car's id in that market (share links); blank = name + market code. The name must contain the brand (catches a wrong number). |
| `data/markets.csv` | One row per market: ISO 3166 code (`DE`, or `US-CA` for a state), name, **parent** (the bloc it inherits cost values from) and currency. |
| `data/blocs.csv` | Blocs that pass cost values on to their markets: `WORLD` (top) and `EU`. Only for inherited cost values, not for which cars a market sells. |
| `data/costs/items.csv` | The **template** of a market's costs: every cost item with label, unit, money (yes/no), **inherit** (may come from the bloc / World) and required. |
| `data/markets/<id>/costs.csv` | **Running costs of one market or bloc** (in the market's currency): electricity price, insurance, servicing, tyres, repairs, 12 V battery, loss of value; per powertrain where they differ; each with why and source ids (blank = judgement). `WORLD/` holds the values every market shares (tyre life, tyre reference mass, repairs). |
| `data/markets/<id>/road_tax.csv` | Road tax of one market: electric cars by curb weight or motor power (bands), petrol cars by engine size (per cc) and CO₂, discount for older cars. |
| `data/terrain.csv` | Terrain presets (Flat / Rolling / Hilly / Mountain): climb per 100 km and typical slope, with why and source. |
| `data/profiles.csv` | Driving profiles (Steady, City, Rural, Highway, Motorway, Mixed, the traffic jam): speed trace (cycle and phases), what the speed set means, the speeds each allows, with why and sources. |
| `data/real_world_fuel.csv` | Measured drives of petrol cars (route or profile, speed, air, AC, load, l/100 km, sources): petrol cars with rows are calibrated on them instead of their official (lab) value. |
| `data/fields.csv` | One row per column of `cars.csv` and `offers.csv`: label, unit, group, "higher/lower is better", description. |
| `data/standard.csv` | The **standard inputs** of every test (what ↺ goes back to): test rows = its trip inputs and its own conditions, each with the reason; `all` rows = the conditions of the Spreadsheet preset (and of any test without its own row). The `spreadsheet` column keeps the Spreadsheet preset's trip input where it differs (`default` = from an assumption). Blank = from an assumption or the market. |
| `data/assumptions.csv` | Every constant the model uses, with description and source. |
| `data/body_types.csv` | Default drag coefficient and frontal area per body type (only used when a car lacks them). |
| `data/onboard/classes.csv` | Electronics and cabin properties per car class (walls, fresh air, sun area, heat capacity), with sources. |
| `data/onboard/measurements.csv` | Published onboard-power measurements (Argonne, ADAC, …) the model is checked against. |
| `data/onboard/facts_tab.csv` | Your Facts-tab onboard curves, kept for comparison only. |
| `data/battery/*.csv` | Voltage curves, resistance and capacity vs. temperature per chemistry (LFP, NMC); ageing parameters and the default rated cycles per chemistry (`chemistries.csv`). |
| `data/cycles/*.csv` | Official test-cycle speed traces (WLTP, NEDC, EPA) used for the calibration. |
| `data/sources.csv` | Every source the data and the model rest on, with links (shown on the Assumptions page). |

- **Add a car:** add a line to `cars.csv` with the next free number, then a line in the `offers.csv` of each market
  that sells it (its number, local name, price). Fill `brand`, and `model` / `variant` when a model comes in several
  versions (e.g. BYD · Seal · low): variants then sit together under their model in the car list. The same car under
  another name in another market (e.g. ORA 03 / Good Cat) is one row in `cars.csv` and one offer per market; a market
  where it differs (another battery, another rated range) gives that column in its offer.
- **Add a market:** add a line to `markets.csv` (ISO code, parent bloc, currency), a folder `data/markets/<id>/` with
  `costs.csv` (the items of `data/costs/items.csv`; tyre life, repairs, warranty and 12 V battery life may be left to
  the bloc or World) and `road_tax.csv`. What it lacks is shown as missing: its costs have a gap until the values are
  typed on the Cost page; it never borrows another market's. The Assumptions page lists each market's gaps. Then its
  `offers.csv`: one line per car sold there (see Add a car).
- **Add a spec:** add a column to `cars.csv` and a line to `fields.csv`; it appears on the Cars page.
- **One file instead:** Download CSV on the Cars page gives all cars with one row per car and market (the layout
  before 21 Nov 2026, also written by `npm run import-ods`). Load CSV takes that layout as it is (the offers are then
  not used), or a file in the layout of `cars.csv`, joined with the built-in offers.
- **Consumption standard:** a car's consumption comes from the same source as its rated range, so the filled
  range column (`range_nedc_km`, `range_wltp_km`, `range_epa_km`, `range_cltc_km`) tells the model which test
  cycle to calibrate on. Only when a car has several ranges, set `consumption_basis`.
- **Heat pump:** set `heat_pump` to `yes` or `no` per car (blank = resistive heater, the conservative case). It only
  matters below about 15 °C.
- The **Cars → Data check** list shows missing, estimated or suspicious values per car.

## The car list

On Compare the car list is the left column; on the other pages the **Cars** button opens it.

- **Market:** lists only the cars sold there. Prices and costs are shown in its currency, with its running costs.
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
| `npm test` | Engine tests (Vitest): physics, onboard measurements, spreadsheet fixes, average consumption, cost of ownership, hills, driving style, standard inputs, car list, sources |
| `npm run build` | Type check + production build into `dist/` |
| `npm run build:single` | One self-contained HTML file in `dist-single/` (author's computer only) |
| `npm run import-ods` | Re-import from the author's `EV Calculations.ods` (author's computer only; never overwrites existing data files without `--force`) |
| `python3 -I scripts/build_reference_data.py` | Rebuild the test-cycle and battery tables from their published sources |

## How the model works

See [docs/model.md](docs/model.md): the physics, the calibration, the battery model, the sources, and how the
results compare with the spreadsheet.

## Cost of ownership

Total = purchase − value at the end + running costs, over the years of use (user request 2026-11-20). The chart
splits it into **depreciation** (purchase − value at the end), **energy**, **insurance** (voluntary + compulsory),
**road tax**, **servicing & repairs** (servicing, repairs after the warranty, 12 V battery) and **tyres**. The inputs
sit in groups on the Cost page; their standard is the market's row in `data/markets/<id>/costs.csv` (or its bloc's /
World's for inheritable items); a missing value leaves the field empty and the lines that need it show a gap. The Assumptions page
lists each value in its **Costs** group with its source (linked to the numbered source list), and the road-tax bands
below. What depends on the car:

- **Road tax:** electric cars by curb weight, petrol cars by engine size (`engine_cc`), less for older petrol cars.
  Germany: electric cars pay no Kfz-Steuer for 10 years, then half the weight tax; petrol cars 2 EUR per 100 cc plus
  CO₂ above 95 g/km (`co2_g_km`).
- **Voluntary insurance:** % of the car's value at the start of each year (electric 3.0 %, petrol 2.5 % in
  Thailand; Vollkasko 1.5 % in Germany), at least the lowest premium.
- **Loss of value:** % per year by powertrain (Thailand: electric 6.5 %, petrol 3.4 %, from 3 years of Krungsri data;
  Germany: electric 20 %, petrol 16 %, from DAT's three-year residual values).
- **Servicing:** by powertrain (Thailand: 5,346 / 17,500 THB per year; Germany: 250 / 400 EUR, judgement from ADAC).
- **Tyres:** a set per tyre life; the life shrinks with the mass on the tyres (curb weight + the cost's load), premium
  cars use the dearer set.
- **Repairs:** % of the purchase price per year after the warranty.

Cars can override servicing (`maintenance_per_year`), insurance (`insurance_per_year`), the tyre set
(`tyre_set_price`) and the energy price in their market's `offers.csv`. The electricity standard is the public DC price (7.5 THB/kWh in
Thailand, 0.65 EUR/kWh in Germany); set it lower when you charge at home. A battery replacement is not included (user's choice).

**Extra costs & credits** (user request 2026-11-21): three amounts of your own, added on top of everything else:
once at purchase, every year of use, once at the end. + is a cost (a fee), − is money back (a rebate, credit or
bonus); standard 0. With a petrol car ticked, electric and petrol cars get their own amounts. They do not change the
price that insurance, repairs and the loss of value are worked out from. They are in the market's currency and go
back to 0 when the market changes. The chart shows them as "Your extras"; net money back is hatched over the end of
the bar.

## Inputs

Every test keeps its own inputs: Traffic jam, No charger, Sprint, Long trip, Battery life and Cost of ownership
each have their own trip inputs **and their own Conditions** (air, sun, load, driving style, km driven, …). The
standard is in `data/standard.csv`: since 2026-11-21 your own setup for every test (trip inputs, conditions, hills,
battery care); the market-specific running costs of Cost of ownership (electricity price to loss of value) stay the
market's (`data/markets/<id>/costs.csv`). The spreadsheet's trip inputs live on as the Spreadsheet preset.

- **↺** next to an input puts it back to its standard (shown while it differs; the standard is shown under it).
- **⇉** uses the value in the other tests too (shown while another test differs): a condition goes to all six
  tests, a cabin temperature to every cabin setting, the slope of the hills to every test, and years / km per year /
  speed / profile / climb per 100 km between Battery life and Cost.
- **Reset this test** puts every input and condition of the test back to its standard.
- **Compare → Edit conditions** sets a condition in all tests at once; where the tests differ it says so.
- **Scenario:** Standard (your setup), Spreadsheet values (the spreadsheet's trips, flat, 25 °C everywhere), Hot or Cold day (in every
  test), or your saved scenarios. Scenarios saved before have their one set of conditions copied to every test.
- The battery's wear after the km driven uses the Battery life page's driving, battery care and climate (the
  battery's past), not the weather of the test.
- The Physics page and the Cars page's calculated rows show one test's conditions ("Conditions of", default No
  charger).

**Driving** (every test): first the **driving profile**, then its speed, and under them a chart of the speed trace
the test drives (one stretch, with its average speed, top speed and stops; hover for the speed at each moment).
Steady holds the speed set. City, Rural, Highway and Motorway take a **cruising speed**, the fastest you drive: the
recorded trace is stretched in time to it, so the accelerations stay as recorded and the profile adds the slowing
down and the stops; the average speed, and with it the time, comes out of the trace. Mixed drives the whole WLTP at
its own speeds and has no speed to set. Each profile allows its own range of speeds (`data/profiles.csv`, with the
EU real-driving test and the speed limits as sources); the car's top speed caps the trace. Standard: No charger and
Long trip on the Highway at 90 km/h, the roads around the traffic jam in town at 50 km/h, Battery life and Cost on
Mixed, the sprint at a steady 120 km/h. Scenarios saved before 20 Nov 2026 (speed = average incl. stops) are
converted: the old standard driving becomes the new one.

**Battery wear** (Conditions: km driven, default 100,000 km) sets the capacity the stress tests start from:
cycle wear up to the car's rated cycles plus calendar ageing, per chemistry. **Rated cycles:** a maker's figure
for the car's own battery where one was found (`battery_cycles` in `cars.csv`, with its source id in
`battery_cycles_source` and, if the maker gives one, the capacity at those cycles in `end_of_life_capacity_pct`);
otherwise the chemistry default in `data/battery/chemistries.csv` (LFP 2,000, NMC 1,100). The Assumptions page lists
them with sources. **Battery care** (Battery life page:
Gentle / Typical / Hard, or % of charging at DC fast chargers and % of the time parked above 80 %) speeds the wear
up or slows it down. Battery life shows the capacity left after the years, without a pass or fail: green from 80 %, orange from 60 %,
red below (`capacity_good_pct`, `capacity_poor_pct` in `data/assumptions.csv`).

**Hills** (every test): a **Terrain** choice (Flat / Rolling / Hilly / Mountain, `data/terrain.csv`) fills in the
hills, which you can then change. The trip tests take the **altitude change start → finish**, the **total climb**
(all uphill metres; the descent is the total climb minus the altitude change) and the **typical slope**. The traffic
jam's hills are on the roads before and after the jam. Battery life and Cost take a **climb per 100 km**, with as
much down again. The climbs, descents and flat parts are each simulated. Gentle descents replace the motor; steeper
ones go through regeneration (70 %), and the friction brakes take what is beyond its limits. A petrol car keeps none
of it. The calculation shows what the climbs cost and how much of the descent came back. Every test's standard is
flat.

The driving style (Conditions: Gentle / Normal / Sporty, or accelerations and braking in % of the WLTP's) reshapes
every speed trace except Steady; braking beyond the regeneration limits (`regen_max_decel_ms2`, `regen_min_kmh`
in `data/assumptions.csv`) is lost to the friction brakes. The Physics page compares the styles per car.

## Project layout

```
data/                  the CSV files above
content/               text for the Notes tab (known issues, personal notes) and the legal notice (see content/README.md)
src/engine/            calculations only (no UI)
  physics/             air, rolling, road load, speed profiles, driving style, hills (terrain.ts), simulation
  battery/, onboard/   battery pack and ageing; electronics, cabin climate and battery temperature
  model.ts, cases.ts   one car's model; the six tests and their calculation steps
  costs.ts, inputs.ts  cost of ownership; the inputs of every test, their standards and links
  run.ts, derive.ts    runs the ticked cars (with a cache); specs and estimates per car
src/data/              CSV parsing and checks
src/content/           reads content/ (a small, safe Markdown subset)
src/state/             app state (Zustand), saved settings, car list, the engine provider
src/components, pages/ the UI (React)
tests/                 Vitest tests (see Scripts)
scripts/               build_reference_data.py (ods_to_csv.py, inline_build.mjs: author's computer only)
docs/model.md          the model in detail, with sources
docs/logo/logo.svg     the logo (bolt in front of a tyre); same drawing as src/components/Logo.tsx and the favicon
```

## Licence

Code: MIT (`LICENSE`). Texts (`content/`, `docs/`) and the data compiled for the site (`data/`): CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/); credit "EV Range". Material from the sources in `data/sources.csv` stays
with its owners and under their terms. The fonts are under the SIL Open Font License. The legal notice on the site
(`content/legal.md`) says the same.
