import { describe, expect, it } from 'vitest'
import { NDVI_LEGEND } from './color'
import { classifySeason, greenness, sampleTile, tilePixel, type Obs } from './ndviHistory'

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]

/** A season's composites from a greenness function of the season day (0 = 1 October before the harvest). */
function season(harvest: number, f: (d: number) => number, south = false): Obs[] {
  const start = south ? Date.UTC(harvest - 1, 3, 1) : Date.UTC(harvest - 1, 9, 1)
  const out: Obs[] = []
  for (let d = 4; d < 365; d += 16) {
    const t = new Date(start + d * 86_400_000)
    const doy = Math.round((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000) + 1
    out.push({ date: t.toISOString().slice(0, 10), doy, year: t.getUTCFullYear(), g: f(d) })
  }
  return out
}
const bump = (centre: number, width: number, top = 0.85, base = 0.2) => (d: number) => base + (top - base) * Math.exp(-(((d - centre) / width) ** 2))

describe('MODIS greenness history', () => {
  it('reads the legend colours back in order, and rejects colours off the ramp', () => {
    const vals = NDVI_LEGEND.map((h) => greenness(...rgb(h))!)
    vals.forEach((v, i) => expect(v).toBeCloseTo(i / (NDVI_LEGEND.length - 1), 5))
    expect(greenness(255, 255, 255)).toBeNull() // cloud / snow
    expect(greenness(0, 0, 255)).toBeNull() // water
    expect(greenness(100, 150, 50, 0)).toBeNull() // no data
  })

  it('finds the tile pixel of a point (Web Mercator, zoom 9)', () => {
    expect(tilePixel(0, 0)).toEqual({ tx: 256, ty: 256, px: 0, py: 0 })
    const t = tilePixel(51.55, 13.0)
    expect(t.tx).toBe(274)
    expect(t.ty).toBeGreaterThan(165)
    expect(t.ty).toBeLessThan(175)
  })

  it('tells a winter crop, a summer crop, a ley and bare ground apart', () => {
    // winter wheat: green from March, peak in May (season day ~220), harvested in July
    expect(classifySeason(season(2023, bump(220, 45)), 2023, false).type).toBe('winter')
    // maize: bare until June, peak in early August (~305)
    expect(classifySeason(season(2023, bump(305, 35)), 2023, false).type).toBe('summer')
    // grass ley: green all season
    expect(classifySeason(season(2023, (d) => 0.6 + 0.1 * Math.sin(d / 58)), 2023, false).type).toBe('perennial')
    // bare fallow
    expect(classifySeason(season(2023, () => 0.15), 2023, false).type).toBe('bare')
  })

  it('shifts the calendar in the southern hemisphere', () => {
    // Argentine soybean: sown in November, peak in February = season day ~305 on the shifted calendar
    const soy = season(2023, bump(305, 35), true)
    expect(classifySeason(soy, 2023, true).type).toBe('summer')
  })

  it('says unclear instead of guessing when there are too few clear composites', () => {
    const few = season(2023, bump(305, 35)).slice(0, 8)
    expect(classifySeason(few, 2023, false).type).toBe('unclear')
  })

  it('samples the median of a 3 × 3 window, ignoring off-ramp pixels', () => {
    const rgba = new Uint8ClampedArray(256 * 256 * 4)
    const [r, g, b] = rgb(NDVI_LEGEND[5])
    for (let i = 0; i < rgba.length; i += 4) rgba.set([r, g, b, 255], i)
    rgba.set([255, 255, 255, 255], (10 * 256 + 10) * 4) // one cloudy pixel
    expect(sampleTile(rgba, 10, 10)).toBeCloseTo(5 / 7, 5)
  })
})
