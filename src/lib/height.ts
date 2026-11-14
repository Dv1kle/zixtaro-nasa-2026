// NASA POWER's temperatures moved from its grid cell's height to the field's.
//
// POWER gives its values "at 2 m above the average elevation of the grid box", the mean height of the land under a
// 0.5° × 0.625° MERRA-2 cell (power.larc.nasa.gov/docs/methodology/meteorology/; the API returns that height as the
// point's third coordinate), and adjusts only the surface pressure to a site's height (.../meteorology/pressure/). In
// mountains a field can lie far from that mean: the cell at 32.75 N 76.25 E (Chamba, western Himalaya) averages 3 371 m
// and 3.8 °C. The mean, the hottest maximum and the dew point (relative humidity kept, as the what-if keeps it) move by
// LAPSE per km of height, the daily maxima and minima too, and the surface pressure by FAO-56 eq. 7; ET₀ then follows
// from the moved inputs as it always does. Rain, sunshine, wind and soil wetness stay the cell's: no simple rule moves
// them with height. Evidence register: height.

import type { RawPower } from './climate'
import type { Daily } from './dailyFormat'

/** the cell's mean height and the field's, m */
export type Height = { cell: number; field: number }

/**
 * °C per km of height. 6.5 (the standard atmosphere) earlier: held-out check S judged it and, as registered, did
 * not confirm it - its script let in two stations whose GHCN height is the missing code 9 999 - and on the 194 stations
 * seen by then the move gained most at 5.0 (all of them; 4.5-5.0 at 1 000 m or higher, 5.5-6.0 below), as near-surface
 * gradients are gentler than the free air's (Dutra et al. 2020: −4.5 K/km over the western USA). Held-out check T
 * confirmed 5.0 on 96 fresh stations: at 1 000 m or higher 0.42 °C closer to them [0.05, 0.82], below 0.17 [0.03, 0.34].
 */
export const LAPSE = 5.0

/** How much warmer the field is than its POWER cell, °C (negative above the cell's mean height). */
export const heightShift = (cellZ: number, fieldZ: number) => (LAPSE * (cellZ - fieldZ)) / 1000

/** FAO-56 eq. 7, atmospheric pressure at height z (kPa); the cell's pressure moves by the ratio. */
const pressure = (z: number) => 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26

const moved = (x: Record<string, number> | undefined, f: (v: number) => number) =>
  x && Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v > -900 ? f(v) : v]))

/** The cell's monthly series at the field's height. */
export function powerAtHeight(raw: RawPower, cellZ: number, fieldZ: number): RawPower {
  const dT = heightShift(cellZ, fieldZ)
  const r = pressure(fieldZ) / pressure(cellZ)
  return { ...raw, T2M: moved(raw.T2M, (v) => v + dT), T2M_MAX: moved(raw.T2M_MAX, (v) => v + dT), T2MDEW: moved(raw.T2MDEW, (v) => v + dT), PS: moved(raw.PS, (v) => v * r) }
}

/** The cell's daily maxima and minima at the field's height. */
export function dailyAtHeight(d: Daily, cellZ: number, fieldZ: number): Daily {
  const dT = heightShift(cellZ, fieldZ)
  const shift = (xs: (number | null)[]) => xs.map((v) => (v == null ? v : Math.round((v + dT) * 10) / 10))
  return { ...d, tmax: shift(d.tmax), tmin: shift(d.tmin) }
}
