// src/lib/data/derive/humidity.ts
// Moist-air physics for the dossier: vapour pressure deficit, dew point, absolute humidity and the wet-bulb
// temperature that sets delta-T for spraying. Temperatures in °C, RH in %, pressures in kPa.

/** Saturation vapour pressure, kPa (FAO-56 eq. 11). */
export const esat = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))

/** Vapour pressure deficit, kPa, from RH (never negative). */
export const vpd = (t: number, rh: number) => Math.max(0, esat(t) * (1 - Math.min(100, rh) / 100))

/** Vapour pressure deficit, kPa, with the dew point as actual vapour pressure (FAO-56 eq. 14). */
export const vpdFromDew = (t: number, td: number) => Math.max(0, esat(t) - esat(td))

/** Dew point, °C: the inverse of eq. 11 at the actual vapour pressure. */
export function dewPoint(t: number, rh: number): number {
  const g = Math.log(Math.max(0.1, Math.min(100, rh)) / 100) + (17.27 * t) / (t + 237.3)
  return (237.3 * g) / (17.27 - g)
}

/** Water vapour per cubic metre of air, g/m³ (ideal gas: e·Mw / (R·T)). */
export const absoluteHumidity = (t: number, rh: number) => (esat(t) * (Math.min(100, rh) / 100) * 1000 * 18.015) / (8.314 * (t + 273.15))

/** How much more water the air could hold, g/m³. */
export const humidityDeficit = (t: number, rh: number) => absoluteHumidity(t, 100) - absoluteHumidity(t, rh)

/** Wet-bulb temperature, °C (Stull 2011; valid for RH 5-99 % and -20 to 50 °C). */
export function wetBulb(t: number, rh: number): number {
  const r = Math.max(5, Math.min(99, rh))
  return (
    t * Math.atan(0.151977 * Math.sqrt(r + 8.313659)) +
    Math.atan(t + r) -
    Math.atan(r - 1.676331) +
    0.00391838 * r ** 1.5 * Math.atan(0.023101 * r) -
    4.686035
  )
}

/** Delta-T, °C: air minus wet-bulb temperature, the spray-drift guide (2-8 °C suits spraying). */
export const deltaT = (t: number, rh: number) => t - wetBulb(t, rh)
