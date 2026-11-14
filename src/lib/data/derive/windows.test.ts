// src/lib/data/derive/windows.test.ts
import { describe, expect, it } from 'vitest'
import { buildWindows, sprayOk, type Hourly } from './windows'

/** 16 days of hourly weather from a function of (day, hour). */
function hourly(f: (day: number, hour: number) => Partial<Record<Exclude<keyof Hourly, 'time'>, number | null>>): Hourly {
  const h: Hourly = { time: [], t: [], rh: [], precip: [], wind: [], gust: [], st6: [], cape: [], li: [], leafWet: [] }
  for (let d = 0; d < 16; d++)
    for (let hr = 0; hr < 24; hr++) {
      const base = { t: 18, rh: 60, precip: 0, wind: 8, gust: 20, st6: 12, cape: 0, li: 5, leafWet: 0, ...f(d, hr) }
      h.time.push(`2026-05-${String(d + 1).padStart(2, '0')}T${String(hr).padStart(2, '0')}:00`)
      for (const k of ['t', 'rh', 'precip', 'wind', 'gust', 'st6', 'cape', 'li', 'leafWet'] as const) h[k].push(base[k] ?? null)
    }
  return h
}

describe('work windows', () => {
  it('accepts a calm, mild, dry hour for spraying and refuses wind, rain ahead and a large delta-T', () => {
    const h = hourly((d, hr) => (d === 0 && hr === 12 ? { wind: 25 } : d === 1 && hr === 14 ? { precip: 2 } : d === 2 ? { t: 30, rh: 20 } : {}))
    expect(sprayOk(h, 10)).toBe(true)
    expect(sprayOk(h, 12)).toBe(false) // too windy
    expect(sprayOk(h, 24 + 10)).toBe(false) // rain within 6 hours
    expect(sprayOk(h, 48 + 10)).toBe(false) // 30 °C, delta-T far above 8
    const w = buildWindows(h, { crop: 'maize', lat: 50 })
    expect(w.nextSpray).toBe('2026-05-01T00:00')
    expect(w.grid.days).toHaveLength(16)
    expect(w.grid.rows.map((r) => r.id)).toEqual(['spray', 'sow', 'disease', 'storm', 'frost', 'heat', 'lodging', 'flood'])
  })

  it('finds the first of three days warm enough to sow maize (10 °C at 6 cm)', () => {
    const h = hourly((d) => ({ st6: d < 5 ? 8 : 11 }))
    expect(buildWindows(h, { crop: 'maize', lat: 50 }).sowDate).toBe('2026-05-06')
  })

  it('flags late blight on potato by the Hutton criteria (two days, Tmin ≥ 10 °C, ≥ 6 h at RH ≥ 90 %)', () => {
    const h = hourly((d, hr) => (d === 3 || d === 4 ? { t: 14, rh: hr < 8 ? 95 : 70 } : {}))
    const w = buildWindows(h, { crop: 'potato', lat: 52 })
    const row = w.grid.rows.find((r) => r.id === 'disease')!
    expect(row.cells[4]).toBe('bad')
    expect(row.cells[3]).not.toBe('bad')
    expect(w.diseaseDays).toBe(1)
  })

  it('counts storm, frost, heat and lodging days', () => {
    const h = hourly((d, hr) => ({
      ...(d === 2 && hr === 15 ? { cape: 1500, li: -4 } : {}),
      ...(d === 5 && hr === 5 ? { t: -1 } : {}),
      ...(d === 7 && hr === 14 ? { t: 37 } : {}),
      ...(d === 9 ? { precip: 1 } : {}),
      ...(d === 10 && hr === 16 ? { gust: 70 } : {}),
    }))
    const w = buildWindows(h, { crop: 'maize', lat: 45, floodDays: new Set(['2026-05-12']) })
    expect(w.stormDays).toBe(1)
    expect(w.frostDays).toBe(1)
    expect(w.heatDays).toBe(1) // maize critical 35 °C
    expect(w.lodgingDays).toBe(1) // 24 mm the day before + 70 km/h
    expect(w.grid.rows.find((r) => r.id === 'flood')!.cells[11]).toBe('bad')
  })
})
