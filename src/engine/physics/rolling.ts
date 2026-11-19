// Rolling resistance coefficient as a function of speed and tyre pressure.
//
// Shape from a widely used empirical formula for car tyres on hard roads:
//     Crr = 0.005 + (0.01 + 0.0095 · (v / 100)²) / p        v in km/h, p in bar
// The car's tyre value (EU tyre label, measured at 80 km/h per ISO 28580) sets the level; the formula only
// supplies the relative change with speed and pressure.
//
// Tyre pressure is given as a percentage of the car's recommended pressure: each car is calibrated on its test
// cycle at its recommended pressure, so only the deviation from it matters. The formula is evaluated around a
// typical recommended pressure (assumption, 2.5 bar), where it gives ≈1.5 % more rolling resistance per psi below
// it; the US National Academies report ≈1.4 % per psi for passenger tyres at 24–36 psi (Special Report 286, 2006).

function shape(speedKmh: number, pressureBar: number): number {
  return 0.005 + (0.01 + 0.0095 * (speedKmh / 100) ** 2) / pressureBar;
}

export const CRR_REFERENCE_SPEED_KMH = 80;

/**
 * @param pressurePct tyre pressure as % of the recommended pressure (100 = as recommended)
 * @param typicalBar  typical recommended pressure around which the formula is evaluated
 */
export function rollingCoefficient(speedKmh: number, pressurePct: number, crrRef: number, typicalBar: number): number {
  return (crrRef * shape(speedKmh, (typicalBar * pressurePct) / 100)) / shape(CRR_REFERENCE_SPEED_KMH, typicalBar);
}
