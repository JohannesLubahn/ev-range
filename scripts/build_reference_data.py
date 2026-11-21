#!/usr/bin/env python3
"""Build the reference data tables used by the physics engine, from published sources.

Usage:
    python3 -I scripts/build_reference_data.py [--cache DIR]

Downloads (or reads from --cache) the official speed traces and writes:
    data/cycles/index.csv          one row per test cycle (duration, distance, source)
    data/cycles/wltc3b.csv         WLTC class 3b, 1 Hz, with phases low/medium/high/extra_high
    data/cycles/nedc.csv           NEDC, 1 Hz, with phases ece/eudc
    data/cycles/epa_udds.csv       EPA Urban Dynamometer Driving Schedule (city)
    data/cycles/epa_hwfet.csv      EPA Highway Fuel Economy Test (highway)
    data/battery/chemistries.csv   per chemistry: voltages, resistance, temperature sensitivity, sources
    data/battery/ocv.csv           open-circuit voltage vs. state of charge per chemistry (cell level)
    data/battery/temperature.csv   deliverable capacity vs. temperature per chemistry (indicative, see notes)
    data/battery/calendar_soc.csv  calendar-ageing rate vs. state of charge per chemistry (1 at 50 %)

The CLTC-P trace (GB/T 38146.1-2019) is not openly available; save it yourself as
data/cycles/cltc_p.csv (columns time_s,speed_kmh) and add a row to index.csv to enable it.

Standard library only. Every number written here carries its source in the CSV files.
"""
from __future__ import annotations

import ast
import csv
import io
import math
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MPH = 1.609344

SOURCES = {
    "wltp_wheel": "https://files.pythonhosted.org/packages/33/b3/72cd36633b52f044c98437819207a5ae10fda894bcf658bfb11adf58e1f1/wltp-0.1.2a0-py2.py3-none-any.whl",
    "udds": "https://www.epa.gov/sites/default/files/2015-10/uddscol.txt",
    "hwfet": "https://www.epa.gov/sites/default/files/2015-10/hwycol.txt",
}
CACHE_NAMES = {"wltp_wheel": "wltp.whl", "udds": "uddscol.txt", "hwfet": "hwycol.txt"}


def fetch(key: str, cache: Path | None) -> bytes:
    if cache is not None:
        for p in (cache / CACHE_NAMES[key], *cache.rglob(CACHE_NAMES[key])):
            if p.exists():
                return p.read_bytes()
    req = urllib.request.Request(SOURCES[key], headers={"User-Agent": "ev-compare reference-data builder"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


# --------------------------------------------------------------------------------------------- cycles
def wltp_cycles(wheel: bytes):
    """Extract WLTC class 3b and NEDC speed traces from the JRC 'wltp' package as plain data (no code run)."""
    z = zipfile.ZipFile(io.BytesIO(wheel))

    def list_in_function(src: str, func: str, var: str):
        for node in ast.walk(ast.parse(src)):
            if isinstance(node, ast.FunctionDef) and node.name == func:
                for sub in ast.walk(node):
                    if isinstance(sub, ast.Assign) and any(isinstance(t, ast.Name) and t.id == var for t in sub.targets):
                        return ast.literal_eval(sub.value)
        raise ValueError(f"{func}.{var} not found")

    def dict_value(src: str, key: str):
        for node in ast.walk(ast.parse(src)):
            if isinstance(node, ast.Dict):
                for k, v in zip(node.keys, node.values):
                    if isinstance(k, ast.Constant) and k.value == key:
                        return ast.literal_eval(v)
        raise ValueError(key)

    c3b = list_in_function(z.read("wltp/cycles/class3.py").decode(), "class_data_b", "cycle")
    assert len(c3b) == 1801 and abs(sum(c3b) - 83758.6) < 0.05, "WLTC 3b checksum mismatch"
    nedc = dict_value(z.read("wltp/cycles/nedc.py").decode(), "cycle")
    assert len(nedc) == 1180
    return c3b, nedc


def epa_trace(raw: bytes):
    out = []
    for line in raw.decode("latin-1").splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[0].isdigit():
            out.append(float(parts[1]) * MPH)
    return out


def write_trace(path: Path, speeds, phases):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["time_s", "speed_kmh", "phase"])
        for t, v in enumerate(speeds):
            ph = next(name for name, (a, b) in phases.items() if a <= t <= b)
            w.writerow([t, f"{v:.2f}", ph])


def stats(speeds):
    dist = sum(speeds) / 3600.0
    return len(speeds) - 1, dist, dist / ((len(speeds) - 1) / 3600.0), max(speeds)


# --------------------------------------------------------------------------------------------- battery
F = 96485.33212


def u_graphite_chen2020(s):
    return (1.9793 * math.exp(-39.3631 * s) + 0.2482 - 0.0909 * math.tanh(29.8538 * (s - 0.1234))
            - 0.04478 * math.tanh(14.9159 * (s - 0.2769)) - 0.0205 * math.tanh(30.4444 * (s - 0.6103)))


def u_nmc811_chen2020(s):
    return (-0.8090 * s + 4.4875 - 0.0428 * math.tanh(18.5138 * (s - 0.5542))
            - 17.7326 * math.tanh(15.7890 * (s - 0.3117)) + 17.5842 * math.tanh(15.9308 * (s - 0.3120)))


def u_lfp_afshar2017(s):
    return 3.4077 - 0.020269 * s + 0.5 * math.exp(-150 * s) - 0.9 * math.exp(-30 * (1 - s))


def full_cell_ocv(up, un, eps_n, l_n, cmax_n, eps_p, l_p, cmax_p, area, y100, x100, vmin):
    """Full-cell OCV vs SoC from electrode OCPs, with lithium inventory conserved between the electrodes.
    SoC 100 % = the parameter set's initial stoichiometries; 0 % = where the OCV reaches the lower cut-off."""
    qn = eps_n * l_n * area * cmax_n * F / 3600
    qp = eps_p * l_p * area * cmax_p * F / 3600

    def ocv(d):  # d = stoichiometry change of the negative electrode from 100 % SoC
        return up(x100 + d * qn / qp) - un(y100 - d)

    lo, hi = 0.0, y100 - 1e-9
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if ocv(mid) > vmin else (lo, mid)
    d0 = (lo + hi) / 2
    return [ocv(d0 * (1 - soc / 100)) for soc in range(101)], d0 * qn


# Battery ageing per chemistry (src/engine/battery/ageing.ts). Exponents from NREL's BLAST-Lite fits of large-format
# automotive cells; the size of the calendar fade is fitted to the fleet data in data/battery/degradation_measurements.csv.
_EA_NOTE = ("Activation energy 30 kJ/mol: inside the range of the lab fits (about 16–67 kJ/mol across the NREL "
            "BLAST-Lite cell models) and in line with Geotab 2026 (EVs in hot climates fade about 0.4 %/year faster "
            "than in mild ones)")
AGEING_SOURCE = {
    "LFP": ("Shape: NREL BLAST-Lite model of a 250 Ah prismatic LFP/graphite cell (NREL 2023, J. Energy "
            "Storage 73, 109042): calendar fade ∝ time^0.526, cycle fade ∝ cycles^0.828. "
            + _EA_NOTE + ". Size: fitted to Tesla Model 3 LFP (CATL) packs in Sweden, 93.3 % after more than "
            "100,000 km (Carla / AVILOO tests 2022–2026); see degradation_measurements.csv"),
    "NMC": ("Shape: NREL BLAST-Lite model of a 75 Ah automotive NMC/graphite pouch cell (NREL 2023, J. "
            "Energy Storage 73, 109042): calendar fade ∝ time^0.578, cycle fade ∝ cycles^1.11. "
            + _EA_NOTE + ". Size: fitted to fleet data (Tesla Model 3 NMC in Sweden, Tesla Model 3/Y after 200,000 "
            "miles, Geotab 2026 average 2.3 %/year); see degradation_measurements.csv"),
}

_SOC_NOTE = (". Calendar ageing vs. state of charge (calendar_soc.csv, used for the time parked above 80 %): the anode-"
             "potential term of the same BLAST-Lite model, graphite potential vs. charge from Safari & Delacourt 2011 "
             "(J. Electrochem. Soc. 158(5), A562), at 25 °C")
AGEING_SOURCE = {k: v + _SOC_NOTE for k, v in AGEING_SOURCE.items()}

# Rated cycles for cars without a maker figure of their own (cars.csv battery_cycles): the user's research.
RATED_CYCLES_SOURCE = "your-ev-calculations;nrel-blast-lite"
RATED_CYCLES_NOTE = {
    "LFP": ("Your research (EV Calculations.ods, Car Details). For comparison, NREL's large-format lab cell (250 Ah, BLAST-Lite) reaches 80 % after about 3,700 full cycles at C/2 and 25 °C"),
    "NMC": ("Your research (EV Calculations.ods, Car Details). For comparison, NREL's large-format lab cell (75 Ah, a high-power cell, BLAST-Lite) reaches 80 % after about 3,350 full cycles at C/2 and 25 °C"),
}


def graphite_potential_safari2011(soc):
    """Graphite anode potential vs. Li (V) at a cell state of charge 0..1, as used by NREL BLAST-Lite."""
    x = 8.5e-3 + soc * (0.78 - 8.5e-3)
    return (0.6379 + 0.5416 * math.exp(-305.5309 * x) + 0.044 * math.tanh(-(x - 0.1958) / 0.1088)
            - 0.1978 * math.tanh((x - 1.0571) / 0.0854) - 0.6875 * math.tanh((x + 0.0117) / 0.0529)
            - 0.0175 * math.tanh((x - 0.5692) / 0.0875))


def calendar_soc_rows(t_k=298.15):
    """Calendar-ageing rate vs. state of charge, relative to 50 %, from the BLAST-Lite anode-potential terms.

    LFP (250 Ah prismatic): k_cal ∝ exp(p3·Ua/T), p3 = -3.56e3 K/V.
    NMC (75 Ah pouch):      k_cal ∝ exp(p2·(T/308.15)^3 / (Ua/0.123)^(1/3)), p2 = 10.
    """
    def lfp(s):
        return math.exp(-3.56e3 * graphite_potential_safari2011(s) / t_k)

    def nmc(s):
        return math.exp(10 * (t_k / 308.15) ** 3 / (graphite_potential_safari2011(s) / 0.123) ** (1 / 3))

    return [(soc, f"{lfp(soc / 100) / lfp(0.5):.4f}", f"{nmc(soc / 100) / nmc(0.5):.4f}") for soc in range(101)]


def battery_tables():
    nmc, nmc_ah = full_cell_ocv(u_nmc811_chen2020, u_graphite_chen2020, 0.75, 8.52e-5, 33133, 0.665, 7.56e-5, 63104,
                                0.065 * 1.58, 29866 / 33133, 17038 / 63104, 2.5)
    lfp, lfp_ah = full_cell_ocv(u_lfp_afshar2017, u_graphite_chen2020, 0.58, 3.4e-5, 30555, 0.374, 8e-5, 22806,
                                0.18, 0.81, 0.0038, 2.0)

    def mean(v):
        return (sum(v) - 0.5 * (v[0] + v[-1])) / 100

    ocv_rows = [(soc, f"{lfp[soc]:.4f}", f"{nmc[soc]:.4f}") for soc in range(101)]
    chem = [
        ("chemistry", "label", "nominal_cell_v", "cutoff_cell_v", "max_cell_v", "dv_1c_25c_pct",
         "resistance_ea_kj_per_mol", "pack_wh_per_kg", "specific_heat_j_per_kgk", "ocv_source", "resistance_source",
         "capacity_source", "thermal_source", "calendar_loss_pct_1y_25c", "calendar_time_exponent",
         "calendar_ea_kj_per_mol", "cycle_fade_exponent", "ageing_source", "rated_cycles", "rated_cycles_source",
         "rated_cycles_note"),
        ("LFP", "Lithium iron phosphate (LiFePO4) / graphite", f"{mean(lfp):.3f}", f"{lfp[0]:.2f}", f"{lfp[100]:.2f}",
         "3.0", "27", "140", "1100",
         "Prada et al. 2013, J. Electrochem. Soc. 160(4), A616 (A123 LFP/graphite cell model); LFP OCP Afshar 2017, "
         f"graphite OCP Chen 2020; full-cell curve computed from the PyBaMM 'Prada2013' parameter set ({lfp_ah:.2f} Ah vs 2.3 Ah rated)",
         "Activation energy fitted to the A123 ANR26650M1-B datasheet (MD100113-02, 2.5C discharge): voltage drop "
         "x2.5 at 0 °C and x5 at -15 °C vs 23 °C, both = 27 kJ/mol. Voltage drop at 1C/25 °C: assumption for a "
         "complete EV pack incl. interconnects",
         "See temperature.csv",
         "Pack: BYD Han Blade pack ≈ 140 Wh/kg (vendor figure; Tesla's LFP Model 3 pack ≈ 125 Wh/kg). Cells: measured LFP pouch and prismatic cells 1.0–1.15 J/(g·K) (batterydesign.net summary of measurements)",
         "2.3", "0.53", "30", "0.83", AGEING_SOURCE["LFP"], "2000", RATED_CYCLES_SOURCE, RATED_CYCLES_NOTE["LFP"]),
        ("NMC", "Lithium nickel manganese cobalt oxide (NMC811) / graphite", f"{mean(nmc):.3f}", f"{nmc[0]:.2f}",
         f"{nmc[100]:.2f}", "3.0", "28", "170", "1000",
         "Chen et al. 2020, J. Electrochem. Soc. 167, 080534 (LG M50 NMC811/graphite-SiOx cell); full-cell curve "
         f"computed from the PyBaMM 'Chen2020' parameter set ({nmc_ah:.2f} Ah vs 5.0 Ah rated)",
         "Kubal et al. 2022, J. Power Sources 543, 231864 (Argonne National Laboratory, OSTI 1962091): apparent activation energy of the area-specific "
         "impedance 27-31 kJ/mol for NMC532/622/811 full cells, -20..40 °C. Voltage drop at 1C/25 °C: assumption "
         "for a complete EV pack incl. interconnects",
         "See temperature.csv",
         "Pack: NMC packs ≈ 160–180 Wh/kg (vendor figures). Cells: measured NMC cells 0.96–1.04 J/(g·K) (batterydesign.net summary of measurements)",
         "2.45", "0.58", "30", "1.11", AGEING_SOURCE["NMC"], "1100", RATED_CYCLES_SOURCE, RATED_CYCLES_NOTE["NMC"]),
    ]
    temp = [
        ("temperature_c", "LFP", "NMC", "note"),
        ("-30", "65", "78", "extrapolated from the points below - indicative only"),
        ("-20", "78", "88",
         "NMC: Kubal et al. (C/20: 10-13 % below 20 °C). LFP: indicative - sources range from ~95 % (A123 datasheet, "
         "-15 °C at 2.5C with self-heating) to 50-70 % (vendor technical notes, energy cells)"),
        ("-10", "88", "94", "interpolated"),
        ("0", "95", "99",
         "NMC: Kubal et al. (no notable loss at <= C/5). LFP: A123 datasheet, 0 °C at 2.5C = ~96 % of 23 °C capacity"),
        ("10", "98", "100", "interpolated"),
        ("25", "100", "100", "reference"),
        ("40", "100", "100", "Kubal et al.: capacities similar at 20 and 40 °C; A123: 45 °C slightly above 23 °C"),
        ("50", "100", "100", "held constant"),
    ]
    return ocv_rows, chem, temp


# --------------------------------------------------------------------------------------------- main
def write_rows(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f, lineterminator="\n").writerows(rows)
    print(f"  wrote {path.relative_to(ROOT)}")


def main(argv):
    cache = Path(argv[argv.index("--cache") + 1]) if "--cache" in argv else None
    c3b, nedc = wltp_cycles(fetch("wltp_wheel", cache))
    udds = epa_trace(fetch("udds", cache))
    hwfet = epa_trace(fetch("hwfet", cache))
    cyc = ROOT / "data" / "cycles"
    write_trace(cyc / "wltc3b.csv", c3b, {"low": (0, 589), "medium": (590, 1022), "high": (1023, 1477),
                                          "extra_high": (1478, 1800)})
    write_trace(cyc / "nedc.csv", nedc, {"ece": (0, 780), "eudc": (781, 1179)})
    write_trace(cyc / "epa_udds.csv", udds, {"city": (0, len(udds) - 1)})
    write_trace(cyc / "epa_hwfet.csv", hwfet, {"highway": (0, len(hwfet) - 1)})
    index = [("cycle", "file", "duration_s", "distance_km", "avg_speed_kmh", "max_speed_kmh", "description", "source")]
    for name, file, sp, desc, src in [
        ("WLTP", "wltc3b.csv", c3b, "WLTC class 3b (vehicles > 34 W/kg, v_max >= 120 km/h)",
         "UN GTR No. 15 / Regulation (EU) 2017/1151 Annex XXI; trace from the JRC 'wltp' package (EUPL), checksum 83758.6"),
        ("NEDC", "nedc.csv", nedc, "New European Driving Cycle (4 x ECE-15 + EUDC)",
         "UN Regulation No. 83/101; trace from the JRC 'wltp' package (EUPL)"),
        ("EPA_CITY", "epa_udds.csv", udds, "US EPA Urban Dynamometer Driving Schedule (UDDS)",
         "US EPA dynamometer drive schedules (uddscol.txt), converted from mph"),
        ("EPA_HIGHWAY", "epa_hwfet.csv", hwfet, "US EPA Highway Fuel Economy Test (HWFET)",
         "US EPA dynamometer drive schedules (hwycol.txt), converted from mph"),
    ]:
        dur, dist, avg, vmax = stats(sp)
        index.append((name, file, str(dur), f"{dist:.3f}", f"{avg:.2f}", f"{vmax:.1f}", desc, src))
    write_rows(cyc / "index.csv", index)

    ocv_rows, chem, temp = battery_tables()
    bat = ROOT / "data" / "battery"
    write_rows(bat / "ocv.csv", [("soc_pct", "LFP", "NMC"), *ocv_rows])
    write_rows(bat / "chemistries.csv", chem)
    write_rows(bat / "temperature.csv", temp)
    write_rows(bat / "calendar_soc.csv", [("soc_pct", "LFP", "NMC"), *calendar_soc_rows()])


if __name__ == "__main__":
    main(sys.argv[1:])
