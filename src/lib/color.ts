// Tiny colour ramps for the climate stripes and soil rendering (no d3-interpolate needed).

type RGB = [number, number, number]

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** Piecewise-linear ramp through evenly spaced colour stops; t in [0, 1]. */
export function ramp(stops: string[]): (t: number) => string {
  const rgb = stops.map(hex)
  return (t: number) => {
    const x = Math.max(0, Math.min(1, t)) * (rgb.length - 1)
    const i = Math.min(rgb.length - 2, Math.floor(x))
    const f = x - i
    return toHex([0, 1, 2].map((k) => rgb[i][k] + (rgb[i + 1][k] - rgb[i][k]) * f) as RGB)
  }
}

export function mix(a: string, b: string, t: number): string {
  return ramp([a, b])(t)
}

// Ed Hawkins-style warming stripes (ColorBrewer RdBu).
const RDBU = ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#deebf7', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d']
// Dry ↔ wet (ColorBrewer BrBG).
const BRBG = ['#3d2203', '#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30']

export const warmRamp = ramp(RDBU)
export const wetRamp = ramp(BRBG)

/** Map a symmetric anomaly to [0, 1] around 0. */
export const diverging = (v: number, maxAbs: number) => 0.5 + Math.max(-1, Math.min(1, v / maxAbs)) / 2

// GIBS colour maps, sampled from gibs.earthdata.nasa.gov/colormaps/v1.3.
export const SMAP_LEGEND = ['#ffa200', '#ffec00', '#82c100', '#009e3e', '#00ffff', '#0047ff', '#0000b7', '#121264']
export const NDVI_LEGEND = ['#e5dbcd', '#b9ab9b', '#a58468', '#a0c030', '#56a100', '#2e8000', '#006400', '#001801']
// MODIS land surface temperature (K → roughly −15 … 55 °C)
export const LST_LEGEND = ['#00e6ff', '#66ff12', '#dbff00', '#ffbe00', '#ff5e00', '#ff0100']
// GPM IMERG precipitation rate, light to heavy - rain in greens to reds, snow in blues to violets: read from the
// palette of the layer's own tiles (GIBS publishes no colour-map file for it), so the ends are named in words, not
// in mm/h
export const IMERG_LEGEND = ['#00764e', '#009c14', '#68cb00', '#e6ec00', '#ffb006', '#ff532a', '#f30000', '#900000']
export const IMERG_SNOW_LEGEND = ['#b1faee', '#81d9ec', '#5b95d3', '#4558cd', '#6a1fe8', '#70067d']
