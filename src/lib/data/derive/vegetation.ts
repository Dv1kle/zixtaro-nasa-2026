// src/lib/data/derive/vegetation.ts
// Canopy measures from a vegetation index.

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Fraction of vegetation cover, the squared scaled NDVI (Carlson & Ripley 1997), bare soil 0.15, full cover 0.85. */
export const fvcFromNdvi = (ndvi: number, soil = 0.15, veg = 0.85) => clamp01((ndvi - soil) / (veg - soil)) ** 2

/** fAPAR from NDVI (Myneni & Williams 1994). */
export const faparFromNdvi = (ndvi: number) => clamp01(1.24 * ndvi - 0.168)

/** Standard deviation over mean; NaN when the mean is not positive. */
export const coefficientOfVariation = (mean: number, sd: number) => (mean > 0 ? sd / mean : NaN)
