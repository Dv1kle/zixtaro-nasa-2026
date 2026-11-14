// src/lib/data/fetch/power.test.ts
import { describe, expect, it } from 'vitest'
import { parsePowerExtra, powerValues, POWER_EXTRA } from './power'

/** A POWER daily answer with constant values over 400 days ending 2026-09-20; the last 3 days not yet published. */
function answer(v: Partial<Record<(typeof POWER_EXTRA)[number], number>>) {
  const days: string[] = []
  const t0 = Date.UTC(2025, 7, 17)
  for (let i = 0; i < 403; i++) days.push(new Date(t0 + i * 86_400_000).toISOString().slice(0, 10).replaceAll('-', ''))
  const parameter: Record<string, Record<string, number>> = {}
  for (const p of POWER_EXTRA) parameter[p] = Object.fromEntries(days.map((d, i) => [d, i >= 400 ? -999 : (v[p] ?? 1)]))
  return { properties: { parameter } }
}

describe('NASA POWER extended daily', () => {
  it('parses into compact series and drops unpublished days', () => {
    const p = parsePowerExtra(answer({ RH2M: 70 }))
    expect(p.start).toBe('2025-08-17')
    expect(p.v.RH2M).toHaveLength(403)
    expect(p.v.RH2M[402]).toBeNull()
  })
  it('turns the last 365 days into dossier values', () => {
    const p = parsePowerExtra(answer({ RH2M: 70, PRECTOTCORR: 2, ALLSKY_SFC_PAR_TOT: 10, ALLSKY_SFC_SW_DWN: 20, ALLSKY_SFC_SW_DIFF: 8, T2M_MAX: 25, T2MDEW: 15, GWETROOT: 0.6 }))
    const v = Object.fromEntries(powerValues(p, 51, 'live').map((x) => [x.id, x]))
    expect(v.rh.v).toBeCloseTo(70, 6)
    expect(v.rain_365.v).toBeCloseTo(730, 6)
    expect(v.dli.v).toBeCloseTo(45.7, 6)
    expect(v.diffuse.v).toBeCloseTo(40, 6)
    expect(v.vpd_day.v).toBeCloseTo(3.168 - 1.705, 2)
    expect(v.gwet_root.v).toBeCloseTo(0.6, 6)
    expect(v.gwet_root.series!.length).toBeGreaterThan(40)
    expect(v.rh.asOf).toBe('2026-09-20')
  })
})
