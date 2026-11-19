# The model

Consumption comes from the forces on the car, calibrated per car (sections 1–2); heating and AC from a heat
balance of the cabin (air temperature, sun, humidity, section 3); the battery is simulated per chemistry, with its
temperature over the trip from its heat capacity, losses and thermal management (section 4). On the Assumptions page
the battery can be switched to *ideal* (every kWh of the charge window is delivered, at any temperature and load).

The stress tests are traffic jam, no charger, sprint, long trip and battery life; the cost of ownership has its own
page. Each stress test shows, per car:

- the battery needed vs. available (traffic jam, no charger, sprint), the trip time with charging (long trip) or the
  charge cycles needed vs. rated (battery life);
- the **average consumption**: the energy taken from the battery over the test ÷ its distance, in kWh/100 km, split
  into driving, onboard systems (electronics, heating/AC, bringing the parked cabin to temperature) and battery
  heating/cooling. In a traffic jam it is far above the rated value because the onboard systems run for hours
  over a short distance. Petrol cars: litres per 100 km. The cost of ownership uses the same energy from the grid,
  i.e. ÷ the charging efficiency and including the battery's own losses.

The spreadsheet's own model (constant consumption, 2.5× at high speed, onboard kW × usage %, ideal battery) was
available as the *Simple* model until 18 Nov 2026 and was then removed at your request; it is in the git history
(up to commit 6ba5808).

## 1. Driving energy

Each trip segment is driven along a speed profile in 1-second steps (steady speeds are calculated directly):

```
F = ½·ρ·Cd·A·v²            air drag        ρ = p / (287.05 · T): air temperature and altitude (standard atmosphere)
  + Crr(v, p_tyre)·m·g      rolling         Crr ∝ 0.005 + (0.01 + 0.0095·(v/100)²)/p, scaled to the tyre value at 80 km/h
  + m·g·slope               hills           net climb or descent of the segment, spread evenly
  + 1.05·m·a                acceleration    1.05 = rotating parts
battery = F·v / η_drive  (driving)    or    F·v · η_regen  (braking, downhill)
```

- Tyre pressure is set as **% of each car's recommended pressure** (default 100 %). The calibration on the test
  cycle already contains the tyres at their recommended pressure, so only the deviation matters. The formula is
  evaluated around a typical recommended pressure (`tyre_pressure_ref_bar`, 2.5 bar): 80 % pressure (where UN R141
  tyre-pressure warnings come on) gives +14 % rolling resistance at 80 km/h, about 1.5 % per psi, close to the
  1.4 % per psi measured for passenger tyres (National Academies SR 286). For scale: the US DOE assumes real
  cars run about 10 % low on average, and NHTSA (2012) found 12 % of cars with a tyre at least 25 % low. Before 19 Nov 2026 the input was in bar;
  saved scenarios are converted (bar ÷ 2.5).
- `m` = curb weight + payload. Missing Cd / frontal area come from `body_types.csv`; frontal area can also be
  0.85 × width × height. Missing weights are estimated from battery size (a fit over the cars that have both).
- Profiles: *steady*; *motorway*, *rural*, *city* and *mixed* use the WLTP class 3b phases (extra-high, high,
  low + medium, all); *traffic jam* is the low phase slowed down to crawl speed. If the requested average speed is
  above the profile's moving average, its speeds are scaled up; a lower average only adds standing time.

## 2. Calibration: each car keeps its own consumption

A car's rated consumption comes from the same source as its rated range, so the standard of the range (NEDC,
WLTP, EPA, CLTC) says which test cycle it was measured on. The model replays that official cycle at test
conditions (23 °C, sea level, curb + 100 kg, the car class's electronics on, no AC) and solves for the one
unknown, the **drivetrain efficiency η_drive**:

```
rated × η_charge × distance = Σ(F·v)⁺ / η_drive − η_regen · Σ|F·v|⁻ + electronics · time + battery losses
```

- Test values are measured from the grid, so the charging efficiency (90 %) is removed; a consumption calculated
  as battery ÷ range is already at the battery and is used as is.
- EPA label values are lab results × 0.7; the calibration uses 55 % city (UDDS) and 45 % highway (HWFET).
- If the result is outside 50–100 %, η_drive is limited and the car is flagged: its consumption is too low for
  its weight, drag and test cycle (often a consumption from a different standard, or a gross instead of a curb
  weight).

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
- **Petrol car:** heating uses engine waste heat (only the blower costs fuel); AC as above, converted to litres.

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
- **"Battery needed"** is the long-term capacity a battery of the same kind would need to deliver the trip's
  energy in the given charge window, at the conditions; it is compared with the car's long-term capacity
  (80 % of nominal unless `long_term_capacity_pct` says otherwise).

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
| Exchange rates | Your Currency_Converter.ods (Frankfurter, 2026-09-18) |

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

Until the Simple model was removed, a parity test showed that it reproduced the Battery Sizing and Summary tabs
for all 21 cars before these fixes.

## 7. How the results moved (spreadsheet defaults, 25 °C)

Each cell: **spreadsheet** · **Physics model**. Percentages are the spare (+) or missing (−) battery capacity. The
spreadsheet ran the heating/AC 50–90 % of the time; the Physics model holds the cabin at 22 °C in every test.

| Car | Traffic jam | No charger | Sprint | Long trip (h) | Battery life (cycles) | Cost (THB/km) |
|---|---|---|---|---|---|---|
| Neta V | +26 % · **+65 %** | −29 % · **−39 %** | −41 % · **+10 %** | 16.8 · **16.0** | 1308 · **1291** | 3.21 · **3.53** |
| Ora Good Cat | −25 % · **+64 %** | −87 % · **−58 %** | −100 % · **+3 %** | 18.4 · **16.2** | 1941 · **1452** | 4.51 · **4.66** |
| BYD Atto 3 | +12 % · **+76 %** | −4 % · **+6 %** | −8 % · **+39 %** | 15.5 · **14.5** | 1134 · **872** | 4.32 · **4.57** |
| Tesla Model 3 2021 | −34 % · **+68 %** | −34 % · **−2 %** | −35 % · **+41 %** | 15.4 · **14.2** | 1513 · **973** | 6.93 · **7.11** |
| Nio ET7 75kW | −13 % · **+71 %** | −29 % · **−2 %** | −34 % · **+45 %** | 15.8 · **14.5** | 1415 · **957** | 7.75 · **7.93** |
| Neta S | +42 % · **+82 %** | +25 % · **+27 %** | +21 % · **+59 %** | 15.5 · **14.5** | 801 · **666** | 7.61 · **7.94** |
| Neta X | +13 % · **+75 %** | −6 % · **−4 %** | −11 % · **+34 %** | 16.3 · **15.1** | 1143 · **952** | 4.17 · **4.51** |
| Aion Y Plus | +12 % · **+74 %** | −13 % · **−12 %** | −19 % · **+30 %** | 16.8 · **15.4** | 1209 · **1023** | 4.91 · **5.27** |
| Aion Hyptec HT | +7 % · **+76 %** | +4 % · **+15 %** | +3 % · **+51 %** | 14.3 · **13.9** | 1074 · **795** | 6.49 · **6.85** |
| Deepal L07 | +20 % · **+76 %** | +5 % · **+10 %** | +2 % · **+47 %** | 16.4 · **15.1** | 1027 · **832** | 5.89 · **6.20** |
| BYD Seal low | +9 % · **+71 %** | −27 % · **−23 %** | −35 % · **+34 %** | 17.0 · **15.6** | 1337 · **1137** | 5.06 · **5.42** |
| BYD Seal high | +30 % · **+75 %** | −9 % · **−7 %** | −17 % · **+45 %** | 16.3 · **15.2** | 1124 · **980** | 5.94 · **6.33** |
| Zeekr X | +15 % · **+72 %** | −25 % · **−26 %** | −34 % · **+25 %** | 15.4 · **14.7** | 1304 · **1145** | 5.83 · **6.24** |
| Xpeng G6 | −20 % · **+68 %** | −38 % · **−27 %** | −42 % · **+25 %** | 15.0 · **14.3** | 1506 · **1175** | 6.65 · **7.06** |
| Avatar 11 | +31 % · **+80 %** | +17 % · **+22 %** | +13 % · **+56 %** | 15.2 · **14.3** | 900 · **711** | 8.96 · **9.38** |
| Ora 07 | +31 % · **+76 %** | −6 % · **−5 %** | −14 % · **+43 %** | 16.7 · **15.5** | 1096 · **957** | 6.25 · **6.64** |
| Honda City | +35 % · **+91 %** | +56 % · **+63 %** | +60 % · **+84 %** | 13.3 · **13.3** | 550 · **337** | 4.28 · **4.90** |
| Deepal S05 | +1 % · **+69 %** | −39 % · **−37 %** | −47 % · **+19 %** | 15.3 · **14.6** | 1457 · **1254** | 4.38 · **4.76** |
| BYD Dolphin | +35 % · **+66 %** | −38 % · **−48 %** | −53 % · **+11 %** | 16.0 · **15.4** | 1358 · **1358** | 3.34 · **3.72** |
| Dolphin ER | +45 % · **+71 %** | −19 % · **−28 %** | −33 % · **+24 %** | 15.3 · **14.9** | 1172 · **1171** | 3.73 · **4.11** |
| Hyundai Inster | +32 % · **+67 %** | −43 % · **−30 %** | −59 % · **+19 %** | 15.6 · **14.8** | 1408 · **1200** | 1.76 · **4.94** |
| MG Windsor LG | +42 % · **+72 %** | −4 % · **−10 %** | −14 % · **+29 %** | 15.7 · **15.0** | 1048 · **1017** | – · **–** |
| MG Windsor | +22 % · **+63 %** | −40 % · **−45 %** | −53 % · **+6 %** | 16.7 · **15.8** | 1415 · **1347** | – · **–** |

What drives the differences:

- **Onboard systems** are now about 0.6–1.0 kW at the default 25 °C (electronics + AC holding 22 °C with some sun)
  instead of 3.8–5.8 kW from the Facts-tab curves, in line with the measurements in section 3. That is why the
  **traffic jam** now passes for every car (+63 to +91 %; with the Facts-tab loads the physics model gave −38 to
  +71 %), and why **no charger**, **battery life** and **long trip** improved. In the 5-hour jam the onboard systems now
  use about 3.5–5 kWh instead of 19–29 kWh.
- **Sprint** improves for almost every car: the spreadsheet's 2.5× high-speed factor is much more pessimistic than
  air drag and rolling resistance at 120 km/h.
- **No charger** still fails for small batteries and cars whose rated consumption is high for their size (e.g.
  Neta V, Ora Good Cat, BYD Dolphin): 300 km at 70 km/h need more than 90 % of their long-term capacity even
  without AC.
- **Hot or cold days** (presets): at 35 °C with strong sun the AC needs about 1.1 kW (premium 1.3 kW) plus 0.6 kWh
  to cool the parked cabin; at −10 °C a resistive heater needs about 2.4 kW plus up to 4 kWh to warm the battery
  in a long jam, so the traffic jam fails for the smallest batteries.
- **Cost** changes slightly: onboard systems and charging losses are included, and EUR prices are converted.
