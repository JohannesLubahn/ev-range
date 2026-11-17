# The model

Two models can be switched at the top of the app:

- **Physics** (default): consumption from the forces on the car, calibrated per car; onboard loads and the
  battery follow the air temperature; the battery is simulated per chemistry.
- **Simple**: the spreadsheet's model (constant consumption, 2.5× at high speed, onboard kW × usage %, ideal
  battery), with the spreadsheet's formula issues fixed.

The stress tests are the same in both: traffic jam, no charger, sprint, battery life, long trip, total cost.

## 1. Driving energy

Each trip segment is driven along a speed profile in 1-second steps (steady speeds are calculated directly):

```
F = ½·ρ·Cd·A·v²            air drag        ρ = p / (287.05 · T): air temperature and altitude (standard atmosphere)
  + Crr(v, p_tyre)·m·g      rolling         Crr ∝ 0.005 + (0.01 + 0.0095·(v/100)²)/p, scaled to the tyre value at 80 km/h
  + m·g·slope               hills           net climb or descent of the segment, spread evenly
  + 1.05·m·a                acceleration    1.05 = rotating parts
battery = F·v / η_drive  (driving)    or    F·v · η_regen  (braking, downhill)
```

- `m` = curb weight + payload. Missing Cd / frontal area come from `body_types.csv`; frontal area can also be
  0.85 × width × height. Missing weights are estimated from battery size (a fit over the cars that have both).
- Profiles: *steady*; *motorway*, *rural*, *city* and *mixed* use the WLTP class 3b phases (extra-high, high,
  low + medium, all); *traffic jam* is the low phase slowed down to crawl speed. If the requested average speed is
  above the profile's moving average, its speeds are scaled up; a lower average only adds standing time.

## 2. Calibration: each car keeps its own consumption

A car's rated consumption comes from the same source as its rated range, so the standard of the range (NEDC,
WLTP, EPA, CLTC) says which test cycle it was measured on. The model replays that official cycle at test
conditions (23 °C, sea level, curb + 100 kg, base loads only, no AC) and solves for the one unknown, the
**drivetrain efficiency η_drive**:

```
rated × η_charge × distance = Σ(F·v)⁺ / η_drive − η_regen · Σ|F·v|⁻ + base loads · time + battery losses
```

- Test values are measured from the grid, so the charging efficiency (90 %) is removed; a consumption calculated
  as battery ÷ range is already at the battery and is used as is.
- EPA label values are lab results × 0.7; the calibration uses 55 % city (UDDS) and 45 % highway (HWFET).
- If the result is outside 50–100 %, η_drive is limited and the car is flagged: its consumption is too low for
  its weight, drag and test cycle (often a consumption from a different standard, or a gross instead of a curb
  weight).

## 3. Onboard systems (your Facts tab)

`onboard power = base loads (car class) + cabin heating/AC(T) × usage % + battery heating/cooling(T)`

Base loads: regular 0.41 + 0.35 + 0.8 kW (general, infotainment, autonomous driving), large/premium
0.5 + 0.7 + 2.5 kW. Cabin and battery heating/cooling vs. temperature come from `data/onboard/hvac.csv`.

## 4. Battery

- **Temperature:** the battery is kept at 10–21 °C by up to 2 kW of heating or cooling (your Facts tab implies
  0.2 kW per °C, i.e. ~200 W/K of heat exchange). Beyond that it drifts with the air temperature; resistive losses
  warm it. Options: no thermal management, or preconditioned.
- **Discharge:** equivalent circuit per chemistry: open-circuit voltage vs. state of charge, internal resistance
  vs. temperature (Arrhenius), deliverable capacity vs. temperature. Power → current
  (`P = (V_oc − R·I)·I`) → state of charge; losses `R·I²`; voltage cut-off and power limit.
- **"Battery needed"** is the long-term capacity a battery of the same kind would need to deliver the trip's
  energy in the given charge window, at the conditions; it is compared with the car's long-term capacity
  (80 % of nominal unless `long_term_capacity_pct` says otherwise).

## 5. Sources

| What | Source |
|---|---|
| WLTC class 3b, NEDC speed traces | UN GTR No. 15 / Regulation (EU) 2017/1151; UN R83/R101 — taken from the JRC `wltp` package (EUPL) |
| EPA UDDS, HWFET | US EPA dynamometer drive schedules |
| NMC open-circuit voltage | Chen et al. 2020, J. Electrochem. Soc. 167, 080534 (LG M50), via the PyBaMM `Chen2020` parameter set |
| LFP open-circuit voltage | Prada et al. 2013, J. Electrochem. Soc. 159(9) (A123), LFP OCP Afshar 2017, via PyBaMM `Prada2013` |
| NMC resistance vs. temperature | Kubal et al., Argonne National Laboratory (OSTI 1962091): 27–31 kJ/mol |
| LFP resistance vs. temperature | Fitted to the A123 ANR26650M1-B datasheet (2.5C discharge at 0 °C and −15 °C): 27 kJ/mol |
| Capacity vs. temperature | NMC: Kubal et al.; LFP: A123 datasheet + indicative vendor notes — **indicative, replace with datasheet values** |
| Onboard loads, heating/cooling | Your Facts tab |
| Rolling resistance | EU tyre label (Regulation (EU) 2020/740), class C = 8 N/kN; speed/pressure shape: empirical car-tyre formula |
| Exchange rates | Your Currency_Converter.ods (Frankfurter, 2026-09-18) |

## 6. Spreadsheet issues fixed

1. Long-trip charging time subtracted onboard power (kW) from a charging speed in %/h. Now the onboard drain is
   converted to %/h of the battery.
2. The fast-charge window used `MAX(to, stop)` instead of `MIN`, and the condition for the slow part above the
   window was reversed.
3. MG Windsor / MG Windsor LG had no high-speed consumption (Sprint showed 2.3 / 0.8 kWh needed). Derived values
   are now computed for every car.
4. Total cost used motor consumption only; it now includes the onboard systems like every other case.
5. Aion Y Plus horsepower was calculated from torque; horsepower is now always kW × 1.341.
6. Mixed currencies: each car has a currency; prices and cost overrides are converted with the exchange rates.

The parity test (`tests/parity.test.ts`) proves that the Simple model in "exact spreadsheet" mode reproduces the
Battery Sizing and Summary tabs for all 21 cars before these fixes.

## 7. How the results moved (spreadsheet defaults, 25 °C)

Each cell: **spreadsheet** · **Simple model (fixed)** · **Physics model**. Percentages are the spare (+) or missing
(−) battery capacity.

| Car | Traffic jam | No charger | Sprint | Battery life (cycles) | Long trip (h) | Cost (THB/km) |
|---|---|---|---|---|---|---|
| Neta V | +26 % · +26 % · **−29 %** | −29 % · −29 % · **−75 %** | −41 % · −41 % · **−3 %** | 1308 · 1308 · **1864** | 16.8 · 17.0 · **18.2** | 3.21 · 3.43 · **4.05** |
| Ora Good Cat | −25 % · −25 % · **−20 %** | −87 % · −87 % · **−87 %** | −100 % · −100 % · **−6 %** | 1941 · 1941 · **1931** | 18.4 · 18.8 · **17.8** | 4.51 · 4.96 · **5.15** |
| BYD Atto 3 | +12 % · +12 % · **+13 %** | −4 % · −4 % · **−19 %** | −8 % · −8 % · **+30 %** | 1134 · 1134 · **1254** | 15.5 · 15.6 · **15.4** | 4.32 · 4.77 · **5.09** |
| Tesla Model 3 2021 | −34 % · −34 % · **−38 %** | −34 % · −34 % · **−45 %** | −35 % · −35 % · **+28 %** | 1513 · 1513 · **1662** | 15.4 · 15.5 · **15.2** | 6.93 · 7.61 · **7.99** |
| Nio ET7 75kW | −13 % · −13 % · **−15 %** | −29 % · −29 % · **−37 %** | −34 % · −34 % · **+34 %** | 1415 · 1415 · **1519** | 15.8 · 15.9 · **15.5** | 7.75 · 8.43 · **8.81** |
| Neta S | +42 % · +42 % · **+42 %** | +25 % · +25 % · **+15 %** | +21 % · +21 % · **+55 %** | 801 · 801 · **882** | 15.5 · 15.6 · **15.3** | 7.61 · 8.06 · **8.39** |
| Neta X | +13 % · +13 % · **+14 %** | −6 % · −6 % · **−23 %** | −11 % · −11 % · **+28 %** | 1143 · 1143 · **1283** | 16.3 · 16.5 · **16.2** | 4.17 · 4.62 · **4.97** |
| Aion Y Plus | +12 % · +12 % · **+13 %** | −13 % · −13 % · **−31 %** | −19 % · −19 % · **+24 %** | 1209 · 1209 · **1356** | 16.8 · 16.9 · **16.7** | 4.91 · 5.36 · **5.73** |
| Aion Hyptec HT | +7 % · +7 % · **+4 %** | +4 % · +4 % · **−14 %** | +3 % · +3 % · **+42 %** | 1074 · 1074 · **1261** | 14.3 · 14.5 · **14.4** | 6.49 · 7.17 · **7.71** |
| Deepal L07 | +20 % · +20 % · **+18 %** | +5 % · +5 % · **−7 %** | +2 % · +2 % · **+42 %** | 1027 · 1027 · **1140** | 16.4 · 16.6 · **16.3** | 5.89 · 6.34 · **6.66** |
| BYD Seal low | +9 % · +9 % · **+9 %** | −27 % · −27 % · **−43 %** | −35 % · −35 % · **+27 %** | 1337 · 1337 · **1474** | 17.0 · 17.2 · **16.8** | 5.06 · 5.51 · **5.88** |
| BYD Seal high | +30 % · +30 % · **+30 %** | −9 % · −9 % · **−22 %** | −17 % · −17 % · **+40 %** | 1124 · 1124 · **1230** | 16.3 · 16.3 · **16.1** | 5.94 · 6.39 · **6.79** |
| Zeekr X | +15 % · +15 % · **+14 %** | −25 % · −25 % · **−44 %** | −34 % · −34 % · **+19 %** | 1304 · 1304 · **1454** | 15.4 · 15.4 · **15.2** | 5.83 · 6.28 · **6.70** |
| Xpeng G6 | −20 % · −20 % · **−24 %** | −38 % · −38 % · **−64 %** | −42 % · −42 % · **+14 %** | 1506 · 1506 · **1769** | 15.0 · 15.0 · **14.9** | 6.65 · 7.32 · **7.93** |
| Avatar 11 | +31 % · +31 % · **+27 %** | +17 % · +17 % · **+2 %** | +13 % · +13 % · **+49 %** | 900 · 900 · **1044** | 15.2 · 15.2 · **15.1** | 8.96 · 9.64 · **10.24** |
| Ora 07 | +31 % · +31 % · **+29 %** | −6 % · −6 % · **−20 %** | −14 % · −14 % · **+39 %** | 1096 · 1096 · **1205** | 16.7 · 16.8 · **16.5** | 6.25 · 6.70 · **7.10** |
| Honda City | +35 % · +35 % · **+71 %** | +56 % · +56 % · **+56 %** | +60 % · +60 % · **+81 %** | 550 · 550 · **456** | 13.3 · 13.3 · **13.3** | 4.28 · 6.38 · **5.73** |
| Deepal S05 | +1 % · +1 % · **+2 %** | −39 % · −39 % · **−59 %** | −47 % · −47 % · **+13 %** | 1457 · 1457 · **1623** | 15.3 · 15.4 · **15.2** | 4.38 · 4.83 · **5.22** |
| BYD Dolphin | +35 % · +35 % · **−9 %** | −38 % · −38 % · **−72 %** | −53 % · −53 % · **+4 %** | 1358 · 1358 · **1770** | 16.0 · 16.0 · **16.5** | 3.34 · 3.56 · **4.18** |
| Dolphin ER | +45 % · +45 % · **+9 %** | −19 % · −19 % · **−48 %** | −33 % · −33 % · **+18 %** | 1172 · 1172 · **1513** | 15.3 · 15.4 · **15.6** | 3.73 · 3.95 · **4.57** |
| Hyundai Inster | +32 % · +32 % · **−13 %** | −43 % · −43 % · **−57 %** | −59 % · −59 % · **+10 %** | 1408 · 1408 · **1648** | 15.6 · 15.7 · **15.7** | 1.76 · 5.01 · **5.43** |
| MG Windsor LG | +42 % · +42 % · **−0 %** | −4 % · −4 % · **−38 %** | −14 % · −14 % · **+20 %** | 1048 · 1048 · **1455** | 15.7 · 15.7 · **16.3** | – · – · **–** |
| MG Windsor | +22 % · +22 % · **−35 %** | −40 % · −40 % · **−83 %** | −53 % · −53 % · **−7 %** | 1415 · 1415 · **1946** | 16.7 · 16.9 · **17.7** | – · – · **–** |

What drives the differences:

- **Sprint** improves for almost every car: the spreadsheet's 2.5× high-speed factor is much more pessimistic than
  air drag and rolling resistance at 120 km/h.
- **No charger** and **traffic jam** get worse for cars with small onboard values in the spreadsheet (2 kW): the
  Facts-tab loads include 0.8 kW for an autonomous-driving computer, 0.8 kW battery cooling at 25 °C and cabin AC.
  Change `data/onboard/classes.csv` if a car class should have other base loads.
- **Cost** rises slightly: onboard systems and charging losses are now included, and EUR prices are converted.
