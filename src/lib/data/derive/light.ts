// src/lib/data/derive/light.ts
// Astronomy for the dossier: day length (photoperiod) and the conversion of PAR energy to a daily light integral.

const rad = (d: number) => (d * Math.PI) / 180

/** Solar declination, rad (FAO-56 eq. 24). */
export const declination = (doy: number) => 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39)

/** Hours from sunrise to sunset, with 0.83° for refraction and the sun's disc; polar day 24, polar night 0. */
export function dayLength(lat: number, doy: number): number {
  const phi = rad(lat)
  const d = declination(doy)
  const c = (Math.sin(rad(-0.833)) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d))
  if (c <= -1) return 24
  if (c >= 1) return 0
  return ((2 * Math.acos(c)) / (2 * Math.PI)) * 24
}

/** PAR energy (MJ m⁻² day⁻¹) → daily light integral (mol m⁻² day⁻¹); 4.57 µmol per J for sunlight (McCree 1972). */
export const dliFromPar = (parMJ: number) => parMJ * 4.57

/** Day of the year, 1-366, of an ISO date. */
export const dayOfYear = (iso: string) => {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Math.round((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / 86_400_000) + 1
}
