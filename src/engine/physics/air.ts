/** Specific gas constant of dry air, J/(kg·K). */
export const R_AIR = 287.05;
/** Standard gravity, m/s². */
export const G = 9.80665;
export const SEA_LEVEL_PA = 101325;

/** Air pressure at an altitude (international standard atmosphere, troposphere). */
export function pressureAtAltitude(altitudeM: number): number {
  return SEA_LEVEL_PA * Math.pow(1 - 2.25577e-5 * altitudeM, 5.25588);
}

/** Density of dry air from the ideal gas law: ρ = p / (R · T). */
export function airDensity(temperatureC: number, pressurePa: number = SEA_LEVEL_PA): number {
  return pressurePa / (R_AIR * (temperatureC + 273.15));
}
