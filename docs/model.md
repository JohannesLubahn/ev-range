# The model

Consumption comes from the forces on the car, calibrated per car (sections 1–2); heating and AC from a heat
balance of the cabin (air temperature, sun, humidity, section 3); the battery is simulated per chemistry, with its
temperature over the trip from its heat capacity, losses and thermal management, and its capacity after the km
driven from charge cycles and age (section 4). On the Assumptions page
the battery can be switched to *ideal* (every kWh of the charge window is delivered, at any temperature and load).

The stress tests are traffic jam, no charger, sprint, long trip and battery life; battery life and the cost of
ownership have their own pages, the other four are tabs of the Stress tests page. Each stress test shows, per car:

- the battery needed vs. available (traffic jam, no charger, sprint), the trip time with charging (long trip) or the
  capacity left after the years of use vs. 80 % (battery life);
- the **average consumption**: the energy taken from the battery over the test ÷ its distance, in kWh/100 km, split
  into driving, onboard systems (electronics, heating/AC, bringing the parked cabin to temperature) and battery
  heating/cooling. In a traffic jam it is far above the rated value because the onboard systems run for hours
  over a short distance. Petrol cars: litres per 100 km. The cost of ownership uses the same energy from the grid,
  i.e. ÷ the charging efficiency and including the battery's own losses.

### Cost of ownership

Over `years` of use and `km = years × km per year`, in the display currency (`src/engine/costs.ts`, `cost()` in
`src/engine/cases.ts`). A fraction of a year counts in proportion.

- Value after t years: `V(t) = price × (1 − d)^t`, d = loss of value per year (electric / petrol). Depreciation =
  price − V(years) = what the owner does not get back.
- Energy: price per kWh × grid energy per km × km (unchanged; petrol: per litre).
- Voluntary insurance in year y: `max(r × V(y − 1), minimum)`, r = rate per powertrain; a car's
  `insurance_per_year` replaces it. Compulsory insurance: a fixed amount per year.
- Road tax: electric by curb weight (band containing it, above < kg ≤ up to), petrol by engine size (per cc, summed
  over the progressive bands) and, where the market taxes it, CO₂ (Germany: each g/km above 95 at the rate of its
  band, from the car's `co2_g_km`); the parts add up. Minus the age discount in year y (Thailand: petrol cars from
  the 6th year; Germany: electric cars free for the first 10 years).
- Servicing: per year by powertrain (or the car's `maintenance_per_year`). Repairs: % of the price × the years after
  the warranty. 12 V battery: replaced every N years before the end (`ceil(years / N) − 1` times).
- Tyres: `km ÷ life × set price` with `life = tyre life × reference mass ÷ (curb weight + load)`: tread wear grows
  about in proportion to the load (KIT review); the reference is 1,500 kg. Premium cars use the premium set; a car's
  `tyre_set_price` replaces it. Counting the tread worn (not whole sets) gives each car the cost of its own wear.
- Your extras (user request 2026-11-21): `upfront + per year × years + at the end`, the user's own amounts per
  powertrain (+ cost, − credit; standard 0), added as they are: they do not change the price that insurance, repairs
  and V(t) are worked out from.
- Total = price − V(years) + all running costs + your extras; per km = total ÷ km. A battery replacement is not included.

Each test has its own inputs and its own Conditions (user request 20 Nov 2026); the standard values are in
`data/standard.csv`. The engine builds one car model per test (tests with equal conditions share one) with one
shared calibration (`src/engine/run.ts`).

The spreadsheet's own model (constant consumption, 2.5× at high speed, onboard kW × usage %, ideal battery) was
available as the *Simple* model until 18 Nov 2026 and was then removed at your request; it is in the git history
(up to commit 8f0dd3d).

## 1. Driving energy

Each trip segment is driven along a speed profile in 1-second steps (steady speeds are calculated directly):

```
F = ½·ρ·Cd·A·v²            air drag        ρ = p / (287.05 · T): air temperature and altitude (standard atmosphere)
  + Crr(v, p_tyre)·m·g      rolling         Crr ∝ 0.005 + (0.01 + 0.0095·(v/100)²)/p, scaled to the tyre value at 80 km/h
  + m·g·sin(atan s)         hills           s = +slope uphill, −slope downhill, 0 on the flat (see Hills)
  + 1.05·m·a                acceleration    1.05 = rotating parts
battery = F·v / η_drive  (driving)    or    F·v · η_regen  (braking, downhill, within the regeneration limits)
```

- **Hills** (user request 20 Nov 2026; `src/engine/physics/terrain.ts`). Every test takes the altitude change
  start → finish Δh, the total climb H⁺ (all uphill metres, at least Δh) and the typical slope s; Battery life and
  Cost take a climb per 100 km with Δh = 0. The descent is H⁻ = H⁺ − Δh. The segment is driven as a mix:
  `H⁺ / sin(atan s)` km uphill, `H⁻ / sin(atan s)` km downhill and the rest flat. Each part runs the same speed
  trace through the same simulation, so the net slope work is exactly m·g·Δh. When the hills do not fit into the
  distance at s, the slope is raised until they do (said in the calculation). What comes back on the descents
  follows from the forces, with no extra factor:
  - **Gentle descents:** gravity is smaller than air drag + rolling, so it replaces the motor and is used
    completely.
  - **Steeper descents:** the excess is regenerated at `regen_efficiency_pct` (70 %, wheel → battery) and spent
    again through the drivetrain. A round trip comes to about η_regen × η_drive ≈ 60 %. Boretti (SAE 2013-01-2872)
    measured about 70 % for a round trip, so 70 % wheel → battery is on the safe side.
  - **Descents beyond the regeneration limits** go to the friction brakes. The limits are 0.2 g, together with the
    braking of the trace, and 10 km/h.
  - **Petrol cars** keep only the part that replaces the engine; the rest goes to engine braking and the brakes.

  Example: BYD Atto 3, 100 km of country road (Rural profile cruising at 90 km/h, average 52 km/h), 500 m up and
  500 m down (m·g·h = 2.5 kWh). Against the flat (11.0 kWh) it costs +0.19 kWh at 2 % slopes, +0.46 kWh at 5 % and
  +0.62 kWh at 8 %. Of the descent, 87 / 79 / 74 % comes back. The Honda City (petrol, 1,144 kg) gets 67 / 43 / 31 %
  back and pays +3.3 / +8.5 / +11.4 % over its flat consumption, against +1.7 / +4.2 / +5.6 % for the Atto 3. The
  Physics page shows the table for the ticked cars.

  The terrain presets are in `data/terrain.csv`:

  | Preset | Climb per 100 km | Slope |
  |---|---|---|
  | Flat | 0 m | 2 % |
  | Rolling | 300 m | 4 % |
  | Hilly | 800 m | 5 % |
  | Mountain | 2,000 m | 7 % |

  The slopes are taken from the steepest grades of main roads by terrain (AASHTO, via the WSDOT Design Manual 1220).
  The climbs per 100 km are judgement values. The standard of every test is flat, as in the spreadsheet.

  **Not modelled:** no regeneration with a full battery (starting at the top of a mountain at 100 %), drivers
  slowing down on steep slopes, and the air getting thinner with height (the Conditions' altitude sets the air
  density for the whole trip).

- **Regeneration limits:** the motor brakes with at most the force that decelerates the car at
  `regen_max_decel_ms2` (1.96 m/s² = 0.2 g, the usual series-braking threshold), and not below `regen_min_kmh`
  (10 km/h). Braking beyond that goes to the friction brakes and is lost as heat (shown in the calculation as
  "lost to the friction brakes").

- Tyre pressure is set as **% of each car's recommended pressure** (default 100 %). The calibration on the test
  cycle already contains the tyres at their recommended pressure, so only the deviation matters. The formula is
  evaluated around a typical recommended pressure (`tyre_pressure_ref_bar`, 2.5 bar): 80 % pressure (where UN R141
  tyre-pressure warnings come on) gives +14 % rolling resistance at 80 km/h, about 1.5 % per psi, close to the
  1.4 % per psi measured for passenger tyres (National Academies SR 286). For scale: the US DOE assumes real
  cars run about 10 % low on average, and NHTSA (2012) found 12 % of cars with a tyre at least 25 % low. Before 19 Nov 2026 the input was in bar;
  saved scenarios are converted (bar ÷ 2.5).
- `m` = curb weight + payload. Missing Cd / frontal area come from `body_types.csv`; frontal area can also be
  0.85 × width × height. Missing weights are estimated from battery size (a fit over the cars that have both).
- **Driving profiles** (`data/profiles.csv`, user's choice 20 Nov 2026). The speed set for a profile is what the
  profile's `speed` column says:
  - *Steady*: a constant speed (10–200 km/h);
  - *City* (WLTP low + medium phases, 30–60 km/h), *Rural* (WLTP high phase, 50–100 km/h), *Highway* (US EPA
    HWFET, 60–120 km/h) and *Motorway* (WLTP extra-high phase, 80–160 km/h): the **cruising speed**, the fastest
    the trace goes. The recorded trace is stretched in time to it: `v'(t) = k·v(t/k)` with `k` = speed ÷ recorded
    top speed, so speeds and durations scale with `k`, the length of a stretch with `k²` and the accelerations stay
    as recorded. The stops are those of the recording (City about one every 0.6–1.3 km, Rural one every 7 km at
    its recorded speeds, Highway one every 17 km). The Motorway is the extra-high phase cut where it passes
    105 km/h on its way up and down and joined, so repeating it never stops (judgement);
  - *Mixed*: the whole WLTP at its own speeds (average 46.5 km/h): a mix of roads has no single speed;
  - *traffic jam*: the low phase slowed down (all speeds scaled) to the jam's average speed, distance ÷ time.

  The speed ranges follow the EU real-driving test (Regulation (EU) 2017/1151, Annex IIIA, points 6.3–6.8: urban
  up to 60 km/h, motorway normally up to 145 km/h plus 15 km/h for a short time) and the speed limits (Germany:
  50 km/h in towns and 100 km/h outside, StVO § 3, 130 km/h recommended on the Autobahn; Thailand: 90 km/h on
  highways, 120 km/h on signed four-lane sections since 2021). Each profile keeps the speed set inside its range,
  and the car's top speed (`top_speed_kmh`) caps the trace, with a warning. The segment's time is distance ÷ the
  trace's average speed incl. stops (Highway at 90 km/h: 73 km/h), which also sets the onboard energy and the long
  trip's driving time.

  Before 20 Nov 2026 the speed was the average incl. stops and the speeds of the trace were multiplied to reach it,
  which also multiplied the accelerations: at "70 km/h" the Rural profile peaked at 112 km/h, City at 155 and Mixed
  at 171, and the No-charger standard (Rural, 70 km/h) gave the Hyptec HT 16.8 kWh/100 km, about 25 % more than
  its owner measures. Below a profile's own average the speed only added standing time, so slower driving used
  more energy. Now faster cruising always costs more on country roads, highways and motorways; in town the
  driving energy hardly changes with the cruising speed (accelerations and stops per km stay the same) and a slow
  crawl costs more per km because heating / AC and electronics run longer. Saved scenarios of older versions
  (`Scenario.version` missing) are converted: a test still at the old standard driving gets the new standard, a
  changed one keeps its numbers, read as the cruising speed.
- **Driving style** (Conditions, user request 19 Nov 2026): accelerations and braking in % of the WLTP's
  (Gentle 65 % · Normal 100 % · Sporty 170 %, or any value 40–200 %). Each speed's deviation from its 30-second
  local mean is scaled: `v' = max(0, v̄ + k·(v − v̄))`, then the trace is rescaled to its original distance, so
  time and average speed stay the same. Sporty reaches higher peaks and brakes harder (more kinetic energy braked
  away, more of it beyond the regeneration limit, more drag at the peaks, more battery I²R losses from the power
  swings); Gentle stays close to the mean and rolls towards stops. The presets are the edges of what the EU
  real-driving test accepts (Regulation (EU) 2017/1151, Annex IIIA, Appendix 7a): Gentle puts the relative
  positive acceleration (RPA) of the WLTP low phase at its lower bound, Sporty the 95th percentile of v·a⁺ of the
  city phases at its upper bound. Normal → Sporty adds about 27–34 % driving energy in the city (EVs), close to the
  ~30 % Bingham et al. (2012) measured between moderate and aggressive driving. The style applies to every speed
  profile except Steady (constant speed; the user chose no special treatment for the sprint), and through the
  battery-life driving also to the battery ageing and the cost. The test-cycle calibration always replays the
  cycle as is.

## 2. Calibration: each car keeps its own consumption

A car's rated consumption comes from the same source as its rated range, so the standard of the range (NEDC,
WLTP, EPA, CLTC) says which test cycle it was measured on. The model replays that official cycle at test
conditions (23 °C, sea level, curb + 100 kg, the car class's electronics on, no AC) and solves for the one
unknown, the **drivetrain efficiency η_drive**:

```
rated × η_charge × distance = Σ(F·v)⁺ / η_drive − η_regen · Σ|F·v|⁻ (within the regeneration limits) + electronics · time + battery losses
```

- Test values are measured from the grid, so the charging efficiency (90 %) is removed; a consumption calculated
  as battery ÷ range is already at the battery and is used as is.
- EPA label values are lab results × 0.7; the calibration uses 55 % city (UDDS) and 45 % highway (HWFET).
- If the result is outside 50–100 %, η_drive is limited and the car is flagged: its consumption is too low for
  its weight, drag and test cycle (often a consumption from a different standard, or a gross instead of a curb
  weight).

**Petrol cars** (since 21 Nov 2026, user request: they did too well in the traffic jam). Fuel follows the Willans
line of a combustion engine: the warm engine burns its idle fuel all the time it runs, everything else comes on top
at one marginal efficiency η (kWh at the wheels per litre beyond idling):

```
litres = idle × (time − fuel cut-off) + (Σ(F·v)⁺ + electric loads ÷ η_alternator · time + AC compressor shaft work) ÷ η
idle   = 0.40 l/h per litre of engine size (engine_cc)
```

- Idle: Argonne measured 0.279 cc/s (1.0 l/h) for a warm 2011 Ford Fusion 2.5 l at 21 °C without accessories,
  0.2–0.5 gal/h for passenger cars across sizes (Gaines, Rask, Keller 2013). The engine is assumed to run all the
  time: standing in traffic (DOE: "When waiting in traffic, you must keep your car running"); start-stop is not
  modelled.
- Fuel cut-off: while the car slows down above 15 km/h (`fuel_cut_min_kmh`, judgement) the engine gets no fuel, so
  no idle fuel either. 15 km/h fits ADAC's Golf data better than 0 or 25 km/h.
- **Real-world calibration** (user's choice 21 Nov 2026): lab values of petrol cars are well below their road
  consumption, so a petrol car with measured drives in `data/real_world_fuel.csv` is calibrated on them. Each drive
  (a test cycle's phases at their recorded speeds, or a profile at a speed; its air temperature, AC and load) is
  replayed and η is fitted by least squares: `1/η = Σ work·(fuel − idle) ÷ Σ work²`. A petrol car without drives
  uses its official value. Outside 15–45 % of the fuel energy η is limited and the car is flagged.

| Car | Measured drive (source) | Measured | Model |
|---|---|---|---|
| VW Golf 1.5 TSI (η 2.95 kWh/l, 33 %) | ADAC Ecotest, in town (WLTC low + medium, 23 °C, AC, 200 kg) | 5.9 | 6.2 |
| | ADAC Ecotest, out of town (WLTC high) | 5.0 | 5.0 |
| | ADAC Ecotest, motorway (Motorway profile at 130 km/h) | 6.3 | 6.0 |
| | official WLTP (not used) | 5.40 | 5.31 |
| Honda City 1.0 Turbo (η 2.56 kWh/l, 29 %) | HeadLight Magazine 2020: 19.66 km/l at 110 km/h, AC, 2 people (steady 110, 30 °C, 150 kg) | 5.09 | 5.09 |
| | official NEDC (not used) | 4.41 | 5.01 |

  ADAC tested the Golf 1.5 TSI Life (same engine, gearbox and weight as the Trend, Dec 2024); which WLTC phases
  give ADAC's in-town and out-of-town values is not published (judgement), and ADAC's own motorway cycle (up to 130
  km/h) is driven as the Motorway profile. HeadLight tested the City RS (same engine and CVT); the air temperature
  and the load are judgement. The remaining misfit of the Golf (town +5 %, motorway −5 %) is the engine friction
  rising with engine speed, which one η cannot show.
- Results: the standard jam (35 °C, AC) costs the Honda City 1.01 l/h and the Golf 1.13 l/h (before 21 Nov: 0.64
  and 0.59, without idling); steady 120 km/h City 5.8, Golf 5.9 l/100 km.

## 3. Onboard systems

```
onboard power = electronics (car class) + cabin heating/AC holding the set cabin temperature (or off)
              + once per trip: bringing the parked cabin to temperature
battery heating/cooling: per trip, from the battery's temperature (section 4)
```

Parameters: `data/onboard/classes.csv` (per car class) and the *Cabin climate* group in `data/assumptions.csv`.

**Electronics:** control units, pumps, lights, steering and brakes, screens and audio, driver assistance.
Regular car 0.22 kW (0.15 + 0.05 + 0.02), large/premium 0.42 kW (0.20 + 0.10 + 0.12 for an assistance computer and
its sensors). Argonne measured 0.14–0.23 kW of non-climate load in two parked EVs; Tesla's self-driving computer
(HW3) draws 72 W and an NVIDIA Orin module 15–60 W. The electronics also run during the official test (section 2).

**Cabin heating and AC:** a steady heat balance of the cabin held at the cabin temperature set in each stress test
(default 22 °C, as in Argonne's tests at 72 °F):

```
heat into the cabin  Q = UA · (T_air − T_cabin)               walls and windows, 45 W/K
                       + ṁ_fresh · c_p · (T_air − T_cabin)     fresh air: 100 m³/h when heating (against fogged
                                                               windows), 45 m³/h when cooling (mostly recirculated)
                       + I_sun · A_sun                          sunshine (Conditions) × 1.0 m² (premium 1.2 m²)
                       + people + screens + blower              73 W per person + their heat
heating (Q < 0):  P = |Q| · (share_hp / COP_hp + (1 − share_hp))   resistive heater: 1 kW per kW of heat
cooling (Q > 0):  P = (Q + moisture) / COP_ac                       moisture: fresh air dried to the 5 °C evaporator
                                                                    + 59 W per person
+ blower 0.10 kW (premium 0.12)
```

- **AC efficiency** COP_ac = 0.40 × T_evap ÷ (T_air + 15 K − T_evap), in kelvin: 3.2 at 25 °C, 2.5 at 35 °C,
  2.0 at 45 °C (vapour-compression systems reach 30–50 % of the ideal Carnot COP). Also used for battery cooling.
- **Heat pump** COP_hp = 0.35 × T_cond ÷ (T_cond − (T_air − 10 K)) with T_cond = 45 °C: 2.0 at 0 °C, 1.7 at −10 °C.
  A Tesla Model 3 measured 1.5–3.3 at 0 °C and 0.8–1.9 at −10 °C (TEEL dynamometer). The heat pump delivers all
  the heat down to −5 °C and none below −22 °C (Argonne: 79 % of the heating power from the heat pump at −6.7 °C,
  19 % at −17.8 °C). Which cars have one: column `heat_pump` (blank = resistive heater, the conservative case).
- **Start of a trip:** a parked cabin is at the air temperature plus 22 K × sunshine ÷ 1000 W/m² (parked cars
  warm by about 22 K within an hour in full sun, McLaren et al. 2005). Heating or cooling its 200 kJ/K (premium
  230) to the setpoint costs C · ΔT ÷ COP, once per trip; with *preconditioned*, nothing.
- **Cabin temperature** per stress test (traffic jam: outside and in the jam): *Off* or 16–28 °C. The heat
  balance decides how much heating or AC that needs under the Conditions; *Off* means fan and windows only (no
  blower, no start energy; the electronics stay on). If the heating/AC is off outside the jam and on in it, the
  parked-cabin start energy is counted in the jam. A change of temperature between phases is not counted.
  The long trip has a checkbox *Heating / AC on while charging (waiting in the car)*, at the trip's cabin
  temperature; it adds to the onboard drain that slows charging. Before 19 Nov 2026 this input was a usage %
  (share of the time on, a leftover of the spreadsheet); saved scenarios convert 0 % to *Off* and anything else to
  the default 22 °C.
- **Petrol car:** the AC compressor is belt-driven: its shaft work (cooling ÷ COP) costs litres at the engine's
  calibrated η; electronics and blower come from the alternator (55 %, Remy 2008). Heating uses the engine's waste
  heat: 30 % of the fuel energy reaches the coolant (judgement; 8.8 kWh per litre, AFDC). If the cabin needs more
  than the coolant's share of the fuel burned (idle + driving + loads), the engine burns extra fuel for heat, of which
  again 30 % reaches the heater: extra l/h = (heat needed − heat available) ÷ (0.30 × 8.8 kWh/l). In the standard
  jam the Honda City idles at 0.60 l/h incl. its loads, enough heat down to about 0 °C; at −10 °C it needs 0.32 l/h
  extra. A cold engine's warm-up is not modelled.

**Checked against measurements** (`data/onboard/measurements.csv`, also on the Physics page):

| Measurement | Air | Measured | Model | Facts tab |
|---|---|---|---|---|
| Argonne BEV 1 (heat pump), parked, heating only | −17.8 °C | 3.38 kW | 3.02 kW | 5.50 kW |
| Argonne BEV 1 (heat pump), parked, heating only | −6.7 °C | 1.85 kW | 1.43 kW | 5.50 kW |
| Argonne BEV 1, parked, AC with sun lamps | 35 °C | 0.96 kW | 0.94 kW | 5.50 kW |
| Argonne BEV 2 (resistive), parked, heating only | −17.8 °C | 3.73 kW | 3.30 kW | 5.50 kW |
| Argonne BEV 2 (resistive), parked, heating only | −6.7 °C | 2.90 kW | 2.32 kW | 5.50 kW |
| Argonne BEV 2, parked, AC with sun lamps | 35 °C | 0.76 kW | 0.94 kW | 5.50 kW |
| Argonne, both cars, electronics | 22 °C | 0.14–0.23 kW | 0.22 kW | 1.56 kW |
| ADAC, 7 EVs parked, cabin 20 °C, total | −10 °C | 1.5–2.3 kW | 2.64 kW | 7.06 kW |
| ADAC, Tesla Model Y in a summer jam, total | 35 °C | 1.50 kW | 1.43 kW | 10.86 kW |
| Car and Driver, Tesla Model 3 parked, total | −9.4 °C | 1.60 kW | 2.53 kW | 10.89 kW |
| TEEL, Tesla Model 3 (heat pump) at 105 km/h, heating | −10 °C | 1.50 kW | 1.78 kW | 7.29 kW |

All but one lie within ±25 %, about the spread between cars (insulation, fresh-air setting). The Car and Driver
Model 3 most likely recirculated its cabin air; the model keeps fresh air on, the safer assumption with people in
the car. The Facts-tab curves were 1.5–9× higher than every measurement: their 3.5 kW AC, 2 kW battery
heating/cooling and 0.8–2.5 kW autonomous-driving computer are peak ratings or prototype values, not what a car
draws while holding a temperature.

## 4. Battery

- **Temperature:** a lumped pack, `C · dT/dt = losses + heating − cooling − UA · (T − T_air)`. Heat capacity
  C = pack mass (kWh ÷ 140 Wh/kg for LFP, 170 Wh/kg for NMC) × cell specific heat (1100 / 1000 J/(kg·K)), i.e.
  about 7 kJ/K per kWh. Heat loss to the air UA = 15 W/K (a parked Nissan Leaf pack cools with a time constant of
  about 9 h). The pack starts at the air temperature (parked) or at the preconditioning temperature; *managed*
  heats it below 10 °C and cools it above 35 °C with up to 2 kW (cooling at the AC's COP). The time-averaged
  temperature is used for the discharge; the heating/cooling energy is added to each stress test. With the battery
  life case, each day's drive (km per year ÷ 365) is one trip. Options: no thermal management, or preconditioned.
- **Discharge:** equivalent circuit per chemistry: open-circuit voltage vs. state of charge, internal resistance
  vs. temperature (Arrhenius), deliverable capacity vs. temperature. Power → current
  (`P = (V_oc − R·I)·I`) → state of charge; losses `R·I²`; voltage cut-off and power limit.
- **"Battery needed"** is the capacity a battery of the same kind and age would need to deliver the trip's energy
  in the given charge window, at the conditions; it is compared with the car's capacity after the km driven (below).

### Battery ageing (Conditions: km driven)

The stress tests use the capacity left after the **km driven** (Conditions, default 100,000 km) instead of the
spreadsheet's fixed 80 % "long-term capacity". The battery-life test and the cost of ownership start from a new
battery. Code: `src/engine/battery/ageing.ts`.

    capacity left = 100 % − cycle wear − calendar ageing
    cycle wear       = (100 % − 80 %) × (full cycles ÷ rated cycles)^z
    calendar ageing  = k₂₅ × exp(−Ea/R × (1/T − 1/298 K)) × years^n

- **Driving and age** come from the battery-life inputs: the energy per km is the battery-life test's (its speed,
  profile and cabin temperature, with onboard systems, cabin start, battery heating/cooling and losses), and the
  age is km ÷ km per year (100,000 km at 15,000 km/year = 6.7 years). T is the air temperature of the **Battery
  life page's** Conditions: a parked car spends most of its life at the air temperature. Each test has its own
  conditions, so the battery's past (climate and driving style) comes from the Battery life page and the km driven
  from the test's own Conditions; the weather of a stress test (e.g. the traffic jam at 35 °C) is the trip's, not
  the battery's past. Until 20 Nov 2026 all tests shared one set of conditions, so the two were the same.
- **Full cycles** count full discharges of the ageing battery (dE ÷ capacity at that point, integrated over the
  km), the way rated cycles are measured. The battery-life test counts its cycles the same way, so it needs fewer
  cycles than with the old division by 80 % of nominal (BYD Atto 3: 872 → 798; the Hyundai Inster, which was at
  100 %, now needs more), and it also shows the capacity left at the end.
- **Cycle wear** reaches 80 % capacity (assumption `rated_cycles_end_capacity_pct`, 80 %, or the
  car's `end_of_life_capacity_pct`) at the car's **rated cycles**, so the rating sets its size. Rated cycles
  (since 21 Nov 2026): the maker's figure for the car's own battery where one was found (`battery_cycles` +
  `battery_cycles_source` in cars.csv: BYD Atto 3 / Dolphin / Seal 5,000 to 70 % (BYD states no limit; its battery warranty guarantees 70 %), XPeng G6 2,000 to 70 %, Citroën ë-C3 1,000),
  otherwise the chemistry default in `data/battery/chemistries.csv` (the user's research: LFP 2,000, NMC 1,100). Makers
  rate under their own test conditions, so the figures compare only roughly. "Years until 80 %" uses the assumption
  for every car, whatever capacity a maker rates its cycles to. NREL's BLAST-Lite lab cells were checked as
  defaults (250 Ah LFP ≈ 3,700, 75 Ah NMC ≈ 3,350 full cycles to 80 % at C/2 and 25 °C) and not used: together with
  their own calendar ageing (LFP 1.4 %, NMC 0.8 % after a year at 25 °C) they predict 2.7 (LFP) and 7.7 (NMC) points
  more capacity than the fleet data, and scaling them to the fleet would treat makers' ratings inconsistently.
  The chemistry sets its shape: z = 0.83 (LFP) and 1.11 (NMC), from NREL's BLAST-Lite models of a 250 Ah prismatic
  LFP cell and a 75 Ah automotive NMC pouch cell (NREL 2023, J. Energy Storage 73, 109042).
- **Calendar ageing** per chemistry (`data/battery/chemistries.csv`): time exponents n = 0.53 (LFP) and 0.58 (NMC)
  from the same models; Ea = 30 kJ/mol (the NREL cell models span 16–67 kJ/mol; Geotab 2026 reports about
  0.4 %/year faster ageing in hot climates, which fits 20–30 kJ/mol), so it doubles about every 17 °C. The size
  k₂₅ (LFP 2.3 %, NMC 2.45 % after one year at 25 °C) is fitted to real-world fleet data, because lab cells
  disagree by up to 10× (NMC: 1.8–21 % after 10 years at 25 °C).
- **Fleet check** (`data/battery/degradation_measurements.csv`, test ±4 points): Tesla Model 3 in Sweden past
  100,000 km (Carla / AVILOO 2022–2026: LFP 93.3 %, NMC 91.5 %; model 93.3 / 93.1 %), Tesla Model 3/Y after 200,000
  miles (≈ 85 %; model 81.8 % with the placeholder 1,100 NMC cycles), Geotab 2026 (2.3 %/year over 22,700 EVs; model
  91.9 % vs. 88.5 % after 5 years). Ages, km and temperatures of these rows are assumptions (see the file).
- **Results at the defaults** (100,000 km, 25 °C, typical care): 87–91 % left for most cars (BYD Atto 3 90.2 %,
  Zeekr X 87.4 %, Hyundai Inster 85.5 %); at 35 °C 80–87 %. Not modelled: lithium plating in the cold, harm from
  sitting nearly empty, and resistance growth.
- The spreadsheet's per-car "Long-term effective capacity" (Car Details row 7) is no longer imported; the
  Hyundai Inster's 100 % was removed with it.

### Battery care (battery-life inputs)

How the battery was charged, as two habits (or the presets Gentle / Typical / Hard, `care_*` in
`data/assumptions.csv`): the **share of charging at DC fast chargers** and the **share of the time parked above
80 % charge**. They are the two habits the largest real-world study (Geotab 2026, 22,700 EVs) found to matter:
cars that fast-charged often lost 2.2–3.0 %/year vs. 1.5 %/year, cars parked at very high or low charge for over
80 % of the time 2.0 vs. 1.4 %/year; charging to 100 % and then driving made no measurable difference. *Typical*
(25 % DC, 50 % of the time full) is the fleet average the size of the fade is fitted to, so both factors are 1
there. The km-driven wear of the stress tests uses the same habits.

    cycle wear uses    full cycles × (1 + s_dc × k × C) ÷ (1 + 25 % × k × 1 C)
    calendar ageing ×  [t × F(90 %) + (1 − t) × F(55 %)] ÷ [50 % × F(90 %) + 50 % × F(55 %)]

- **Fast charging → cycle wear.** s_dc is the share of fast charging, C the car's fast-charging rate from its charging
  test (`charge_from_pct` → `charge_to_pct` in `charge_time_min`: BYD Atto 3 1.14 C, Aion Hyptec HT 2.4 C) and
  k = 0.07 per C (`fast_charge_wear_per_c`), fitted to INL's controlled test: four 2012 Nissan Leafs charged twice
  a day, the 50 kW DC-only packs lost 27.4 % and the AC-only packs 24.8 % after 50,000 miles (INL/MIS-13-29877).
  Geotab's gap between its fast-charging groups is larger, but those cars also drive more; the model reproduces
  Geotab's groups (within ±3 points) when the fast-charging-heavy cars drive about 35,000 km a year vs. 15,000
  (an assumption, stated in `degradation_measurements.csv`). So in this model, fast charging alone matters little.
- **Parked full → calendar ageing.** F(SoC) is the calendar-ageing rate vs. charge level from the same NREL
  BLAST-Lite cell models (their anode-potential term, graphite potential from Safari & Delacourt 2011;
  `data/battery/calendar_soc.csv`, written by `scripts/build_reference_data.py`): parked at 90 % instead of 55 %
  ages LFP 1.5× and NMC 2.8× as fast. t is the share of the time parked above 80 %; that time is taken at 90 %
  (`care_high_soc_pct`) and the rest at 55 % (`care_normal_soc_pct`). With no extra fitting this reproduces
  Geotab's charge-level groups within ±1.1 points. A low charge slows calendar ageing in the lab data, so "below
  20 %" is not counted as harmful.
- **Effect** (100,000 km, 25 °C, Gentle / Typical / Hard): LFP cars 89–92 / 88–91 / 88–90 %, NMC cars 88–92 /
  85–90 / 82–87 %.

**Battery-life result.** The result is the capacity left after the chosen years (cycle wear + calendar ageing +
care), without a pass or fail since 21 Nov 2026 (user's choice: users judge for themselves). It is shown green from
80 %, orange from 60 % and red below (`capacity_good_pct`, `capacity_poor_pct`, judgement values) and no longer counts
in Compare's checks. "Years until 80 %" (or the car's `end_of_life_capacity_pct`) is found by bisection over km (up
to 60 years). Until 19 Nov 2026 it passed when the full cycles needed fitted within the rated cycles, so heat, age and
care did not count; until 21 Nov 2026 it passed at 80 % capacity left. At the defaults (20 years × 15,000 km, 25 °C) only
the Neta S keeps 80 % with typical care (Gentle: also the Atto 3, Nio ET7, Neta X and Aion Hyptec HT); most cars
reach 80 % after 14–20 years, the Zeekr X after 11 and the Hyundai Inster after 9 (NMC with the placeholder 1,100
rated cycles).

## 5. Sources

The full list with links is on the Assumptions page (from `data/sources.csv`).

| What | Source |
|---|---|
| WLTC class 3b, NEDC speed traces | UN GTR No. 15 / Regulation (EU) 2017/1151; UN R83/R101 — taken from the JRC `wltp` package (EUPL) |
| EPA UDDS, HWFET | US EPA dynamometer drive schedules |
| NMC open-circuit voltage | Chen et al. 2020, J. Electrochem. Soc. 167, 080534 (LG M50), via the PyBaMM `Chen2020` parameter set |
| LFP open-circuit voltage | Prada et al. 2013, J. Electrochem. Soc. 160(4), A616 (A123), LFP OCP Afshar 2017, via PyBaMM `Prada2013` |
| NMC resistance vs. temperature | Kubal et al. 2022, J. Power Sources 543, 231864 (Argonne, OSTI 1962091): 27–31 kJ/mol |
| LFP resistance vs. temperature | Fitted to the A123 ANR26650M1-B datasheet (2.5C discharge at 0 °C and −15 °C): 27 kJ/mol |
| Capacity vs. temperature | NMC: Kubal et al.; LFP: A123 datasheet + indicative vendor notes — **indicative, replace with datasheet values** |
| Onboard measurements (heating, AC, electronics) | Argonne National Laboratory via DOE Vehicle Technologies Office Program Record "Impact of Cold Ambient Temperature and Extreme Conditions on EVs" (Sep 2024), Table 2; ADAC winter test (InsideEVs 2022) and summer traffic-jam test (electrive 2024); Car and Driver 2022; TEEL dynamometer data reported by Zhang & He 2026 (arXiv 2605.05919) |
| Heat pump COP, share in deep cold | TEEL Tesla Model 3 (Humphries & Loiselle-Lapointe 2026, via Zhang & He 2026); Argonne (DOE 2024, Fig. 6) |
| Body heat and moisture | ASHRAE Handbook – Fundamentals, Table 1 of the people heat gains (as tabulated in the Autodesk Revit help) |
| Cabin warming in the sun | McLaren, Null & Quinn 2005, Pediatrics 116:e109 |
| Driver-assistance computers | Tesla FSD computer (HW3) 72 W (ComputerBase 2019; TechCrunch: about 100 W); NVIDIA Orin modules 15–60 W (NVIDIA); robotaxi-class Drive AGX Pegasus 500 W (ComputerBase); Gawron et al. 2018, Environ. Sci. Technol. 52:3249 (200 W modelled) |
| Pack heat capacity and heat loss | Cell specific heat: measured LFP 1.0–1.15, NMC 0.96–1.04 J/(g·K) (batterydesign.net); pack specific energy: vendor figures; heat loss: Nissan Leaf owner measurement (~9 h time constant) |
| Your Facts-tab onboard curves | Kept in `data/onboard/facts_tab.csv` for comparison only |
| Rolling resistance | EU tyre label (Regulation (EU) 2020/740), class C = 8 N/kN; speed/pressure shape: empirical car-tyre formula, checked against National Academies Special Report 286 (2006, ≈1.4 % per psi); under-inflated case: UN R141 TPMS warning at 20 % loss; real-world under-inflation: FuelEconomy.gov (US DOE), NHTSA DOT HS 811 681 (2012) |
| Battery ageing | Shape: NREL BLAST-Lite models (250 Ah LFP, 75 Ah NMC automotive cells; NREL 2023, J. Energy Storage 73, 109042). Size and temperature: fleet data from Carla / AVILOO (Electrek, Jul 2026), Tesla (Impact Report 2023, as quoted there) and Geotab (Jan 2026) |
| Battery care | Fast-charging wear: INL DC Fast Charge Effects study, 50,000-mile update (INL/MIS-13-29877, 2014). Charge level: BLAST-Lite anode-potential terms with the graphite potential of Safari & Delacourt 2011 (J. Electrochem. Soc. 158(5), A562). Groups and presets: Geotab's battery-health guide (2026) |
| Exchange rates | Your Currency_Converter.ods (Frankfurter, 2026-09-18) |
| Driving style, regeneration limits | RDE trip-dynamics bounds: Regulation (EU) 2017/1151, Annex IIIA, Appendix 7a (as amended by 2017/1154); regeneration alone below 0.2 g: NPTEL lecture on EV brake systems (series braking strategy); regeneration above 10 km/h: Kia owner's manual, Mazda; plausibility: Bingham, Walsh & Carroll 2012, IET Intell. Transp. Syst. 6(1) 29 (~30 % more energy for aggressive driving) |
| Hills, regeneration efficiency | Terrain slopes: steepest grades of main roads by terrain (AASHTO Green Book, via WSDOT Design Manual M 22-01, ch. 1220); climbs per 100 km: judgement; regeneration round trip near 70 %: Boretti 2013, SAE 2013-01-2872 |
| Running costs (Thailand) | `data/markets/TH/costs.csv` with sources per row: electricity your spreadsheet (public DC price), compulsory insurance Roojai/OIC, class-1 insurance quotes (Green Energy Thailand 2026, PrakanEV 2026; EV vs petrol: Viriyah via Thai Examiner 2025), servicing Thaiger 2025 via Green Energy Thailand, loss of value Krungsri Research 2024, tyres Thairath and Pirelli, load dependence KIT review; judgement values labelled |
| Road tax (Thailand) | `data/markets/TH/road_tax.csv`: EV weight bands (Thansettakij; Motorist 2026), petrol per cc and age discount (Motorist 2026); Honda City 988 cc (Honda Thailand 2026) |
| Running costs (Germany) | `data/markets/DE/costs.csv`: electricity ACE/Hocsy 2026 (public DC, ad hoc 50–80 ct/kWh), ADAC, BDEW (home 37 ct/kWh); Haftpflicht GDV via checkalle.de; Vollkasko Stiftung Warentest 11/2026 via t-online, Verivox 2026; Teilkasko Allianz; servicing ADAC 2026; loss of value DAT (Sep 2026); tyres testbericht.de; judgement values labelled |
| Road tax (Germany) | `data/markets/DE/road_tax.csv`: electric cars tax-free for 10 years when first registered by 2030 (Bundestag, Dec 2025), then § 9 KraftStG per 200 kg, halved; petrol cars (first registered since 2021) 2 EUR per 100 cc plus 2.00–4.00 EUR per g/km of CO₂ above 95 g/km (§ 9 Abs. 1 Nr. 2 c KraftStG), checked against ADAC's 85 EUR for the Golf 1.5 TSI |
| Car data (20 Nov 2026) | `data/cars.csv` `source_url` per car (specs) and `data/markets/<id>/offers.csv` (prices): Thai prices rodfaifa, Bangkok Motorhaus, Paul Tan, Headlight Magazine; Thai specs ZigWheels, Autospinn; EU type approval (WLTP range and consumption, usable battery, weight, size) and German prices EV Database; drag coefficients from the makers; choice of German cars: KBA via electrive (Oct 2026) |
| Petrol cars | Honda City (Thailand): Honda Thailand's 2026 specification (40 l tank, 1,144 kg, 22.7 km/l, 599,000 THB), Motorist and Paul Tan 2026; Gasohol 95 39.34 THB/l (Thai government, 11 Nov 2026). VW Golf 1.5 TSI (Germany, the best-selling car in 2025: KBA via Motor1): ADAC Autokatalog (30,210 EUR, WLTP 5.4 l/100 km, 122 g/km, 45 l, 1,307 kg EU), Volkswagen press kit 2019 (Cd 0.275, 2.21 m²); Super E10 1.978 EUR/l (ADAC, 11 Nov 2026) |
| Driving profiles | Traces: WLTC class 3b phases (UN GTR No. 15, Regulation (EU) 2017/1151), US EPA HWFET (EPA dynamometer drive schedules). Speed ranges: EU real-driving test (Regulation (EU) 2017/1151, Annex IIIA, points 6.3–6.8: urban up to 60 km/h, motorway normally up to 145 km/h + 15 km/h), StVO § 3 (50 km/h in towns, 100 km/h outside), Autobahn-Richtgeschwindigkeits-Verordnung (130 km/h), Thailand's 120 km/h on divided four-lane highways (The Nation, March 2021). Judgement: the Motorway's join at 105 km/h and the standard speeds (your choice) |
| Consumption checks | Sources of the No-charger analysis (20 Nov 2026), listed under "Consumption checks" on the Assumptions page: Hyptec HT WLTP rating (Motorist Singapore), PakWheels highway test, Bjørn Nyland's Atto 3 test (InsideEVs), Hyptec HT specifications (CarNewsChina, auto-data.net, Paul Tan, ZigWheels) |

## 6. Spreadsheet issues fixed

1. Long-trip charging time subtracted onboard power (kW) from a charging speed in %/h. Now the onboard drain is
   converted to %/h of the battery.
2. The fast-charge window used `MAX(to, stop)` instead of `MIN`, and the condition for the slow part above the
   window was reversed.
3. MG Windsor / MG Windsor LG had no high-speed consumption (Sprint showed 2.3 / 0.8 kWh needed). The sprint now
   comes from the physics at the sprint speed for every car, instead of the spreadsheet's 2.5× factor.
4. Total cost used motor consumption only; it now includes the onboard systems like every other case.
5. Aion Y Plus horsepower was calculated from torque; horsepower is now always kW × 1.341.
6. Mixed currencies: each car has a currency; prices and cost overrides are converted with the exchange rates.
   The market picked in the car list (`data/markets.csv`) sets the currency shown and its running costs
   (`data/markets/<id>/`, plus inheritable values from its bloc and World, `data/blocs.csv`; since 21 Nov 2026 a
   market without a value shows a gap instead of using `cost_default_market`'s). All markets keeps `display_currency`
   and uses `cost_default_market`'s running costs.
7. The total cost had one "maintenance per year" (8,000 THB) for every car and nothing back at the end. Since
   20 Nov 2026 it is purchase − value at the end + energy, insurance, road tax, servicing & repairs and tyres, with
   the rules below (section "Cost of ownership").

Until the Simple model was removed, a parity test showed that it reproduced the Battery Sizing and Summary tabs
for all 21 cars before these fixes.

## 7. How the results moved (spreadsheet defaults, 25 °C)

Each cell: **spreadsheet** · **Physics model**. Percentages are the spare (+) or missing (−) battery capacity. The
spreadsheet ran the heating/AC 50–90 % of the time; the Physics model holds the cabin at 22 °C in every test. The
spreadsheet used 80 % of nominal as the battery; the Physics model uses the capacity after 100,000 km (85–91 %).
The battery-life column shows the full cycles needed; the verdict itself is now the capacity left after 20 years
(section 4, battery care). The Physics values were recalculated on 20 Nov 2026 with the car data of November 2026
and the driving profiles of section 1: the speed is the cruising speed, No charger and Long trip drive the Highway
profile at 90 km/h (the spreadsheet: 70 and 60 km/h average), the roads around the traffic jam the City profile at
50 km/h (spreadsheet: 40 km/h average), Battery life and Cost the WLTP at its own speeds (spreadsheet: 40 km/h);
the hills are flat in every standard. The cost column compares two different totals: the spreadsheet's purchase + energy +
one maintenance figure, against today's full cost of ownership (depreciation, energy, insurance, road tax, servicing
& repairs, tyres).

| Car | Traffic jam | No charger | Sprint | Long trip (h) | Battery life (cycles) | Cost (THB/km) |
|---|---|---|---|---|---|---|
| Neta V | +26 % · **+69 %** | −29 % · **−1 %** | −41 % · **+15 %** | 16.8 · **13.2** | 1308 · **1242** | 3.21 · **3.79** |
| Ora Good Cat | −25 % · **+70 %** | −87 % · **−5 %** | −100 % · **+12 %** | 18.4 · **13.1** | 1941 · **1296** | 4.51 · **5.61** |
| BYD Atto 3 | +12 % · **+78 %** | −4 % · **+27 %** | −8 % · **+40 %** | 15.5 · **12.0** | 1134 · **891** | 4.32 · **5.98** |
| Tesla Model 3 2021 | −34 % · **+71 %** | −34 % · **+29 %** | −35 % · **+46 %** | 15.4 · **11.7** | 1513 · **886** | 6.93 · **9.07** |
| Nio ET7 75kW | −13 % · **+75 %** | −29 % · **+28 %** | −34 % · **+47 %** | 15.8 · **11.8** | 1415 · **904** | 7.75 · **10.42** |
| Neta S | +42 % · **+85 %** | +25 % · **+52 %** | +21 % · **+65 %** | 15.5 · **11.7** | 801 · **587** | 7.61 · **9.81** |
| Neta X | +13 % · **+78 %** | −6 % · **+23 %** | −11 % · **+37 %** | 16.3 · **12.5** | 1143 · **948** | 4.17 · **5.69** |
| Aion Y Plus | +12 % · **+78 %** | −13 % · **+24 %** | −19 % · **+37 %** | 16.8 · **12.5** | 1209 · **925** | 4.91 · **5.45** |
| Aion Hyptec HT | +7 % · **+79 %** | +4 % · **+42 %** | +3 % · **+56 %** | 14.3 · **11.4** | 1074 · **708** | 6.49 · **7.91** |
| Deepal L07 | +20 % · **+78 %** | +5 % · **+32 %** | +2 % · **+48 %** | 16.4 · **12.4** | 1027 · **862** | 5.89 · **7.78** |
| BYD Seal low | +9 % · **+77 %** | −27 % · **+30 %** | −35 % · **+48 %** | 17.0 · **12.3** | 1337 · **875** | 5.06 · **7.75** |
| BYD Seal high | +30 % · **+82 %** | −9 % · **+41 %** | −17 % · **+57 %** | 16.3 · **11.7** | 1124 · **745** | 5.94 · **9.15** |
| Zeekr X | +15 % · **+76 %** | −25 % · **+19 %** | −34 % · **+35 %** | 15.4 · **11.6** | 1304 · **1002** | 5.83 · **6.20** |
| Xpeng G6 | −20 % · **+75 %** | −38 % · **+29 %** | −42 % · **+43 %** | 15.0 · **11.3** | 1506 · **867** | 6.65 · **7.77** |
| Avatar 11 | +31 % · **+83 %** | +17 % · **+48 %** | +13 % · **+60 %** | 15.2 · **11.7** | 900 · **654** | 8.96 · **12.71** |
| Ora 07 | +31 % · **+82 %** | −6 % · **+44 %** | −14 % · **+57 %** | 16.7 · **12.0** | 1096 · **709** | 6.25 · **7.76** |
| Honda City | +35 % · **+86 %** | +56 % · **+64 %** | +60 % · **+74 %** | 13.3 · **11.0** | 550 · **469** | 4.28 · **6.09** |
| Deepal S05 | +1 % · **+76 %** | −39 % · **+21 %** | −47 % · **+37 %** | 15.3 · **11.8** | 1457 · **973** | 4.38 · **5.57** |
| BYD Dolphin | +35 % · **+74 %** | −38 % · **+13 %** | −53 % · **+27 %** | 16.0 · **12.3** | 1358 · **1071** | 3.34 · **4.70** |
| Dolphin ER | +45 % · **+78 %** | −19 % · **+26 %** | −33 % · **+39 %** | 15.3 · **12.1** | 1172 · **907** | 3.73 · **5.26** |
| Hyundai Inster (Standard Range) | +32 % · **+65 %** | −43 % · **−9 %** | −59 % · **+9 %** | 15.6 · **12.5** | 1408 · **1425** | 1.76 · **5.90** |
| MG Windsor LG | +42 % · **+75 %** | −4 % · **+16 %** | −14 % · **+30 %** | 15.7 · **12.5** | 1048 · **1031** | – · **–** |
| MG Windsor | +22 % · **+66 %** | −40 % · **−16 %** | −53 % · **+2 %** | 16.7 · **13.3** | 1415 · **1445** | – · **–** |

What drives the differences:

- **Onboard systems** are now about 0.6–1.0 kW at the default 25 °C (electronics + AC holding 22 °C with some sun)
  instead of 3.8–5.8 kW from the Facts-tab curves, in line with the measurements in section 3. That is why the
  **traffic jam** now passes for every car (+62 to +89 %; with the Facts-tab loads the physics model gave −38 to
  +71 %), and why **no charger**, **battery life** and **long trip** improved. In the 5-hour jam the onboard systems now
  use about 3.5–5 kWh instead of 19–29 kWh.
- **Sprint** improves for almost every car: the spreadsheet's 2.5× high-speed factor is much more pessimistic than
  air drag and rolling resistance at 120 km/h.
- **No charger** still fails for small batteries and cars whose rated consumption is high for their size (e.g.
  Neta V, Ora Good Cat, Hyundai Inster, MG Windsor): 300 km on the highway at 90 km/h need more than their
  capacity after 100,000 km. Before the driving profiles were changed (20 Nov 2026) the standard drove the WLTP
  high phase at a 70 km/h average, with peaks of 112 km/h; every car needed about 25 % more energy.
- **Hot or cold days** (presets): at 35 °C with strong sun the AC needs about 1.1 kW (premium 1.3 kW) plus 0.6 kWh
  to cool the parked cabin; at −10 °C a resistive heater needs about 2.4 kW plus up to 4 kWh to warm the battery
  in a long jam, so the traffic jam fails for the smallest batteries.
- **Cost** is higher for every car (by about 1–4 THB/km): it now counts the loss of value, insurance, road tax,
  servicing, repairs and tyres instead of one maintenance figure, plus the onboard systems and charging losses. The
  Hyundai Inster rises most because its EUR price is now converted to THB. The MG Windsors have no price.
