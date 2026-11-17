// Rolling resistance coefficient as a function of speed and tyre pressure.
//
// Shape from a widely used empirical formula for car tyres on hard roads:
//     Crr = 0.005 + (0.01 + 0.0095 · (v / 100)²) / p        v in km/h, p in bar
// The car's tyre value (EU tyre label, measured at 80 km/h per ISO 28580) sets the level; the formula only
// supplies the relative change with speed and pressure.

function shape(speedKmh: number, pressureBar: number): number {
  return 0.005 + (0.01 + 0.0095 * (speedKmh / 100) ** 2) / pressureBar;
}

export const CRR_REFERENCE_SPEED_KMH = 80;

export function rollingCoefficient(speedKmh: number, pressureBar: number, crrRef: number, pressureRefBar: number): number {
  return (crrRef * shape(speedKmh, pressureBar)) / shape(CRR_REFERENCE_SPEED_KMH, pressureRefBar);
}
