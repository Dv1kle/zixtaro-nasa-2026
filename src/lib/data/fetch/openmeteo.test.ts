// src/lib/data/fetch/openmeteo.test.ts
import { describe, expect, it } from 'vitest'
import type { MonthNormal } from '../../climate'
import { archiveValues, floodValues, forecastValues, parseArchive, parseFlood, parseForecastAgro, parseSeasonal, seasonalValues } from './openmeteo'

const hours = (n: number, from = '2026-09-28T00:00') => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}Z`) + i * 3_600_000).toISOString().slice(0, 16))

describe('Open-Meteo forecast', () => {
  it('reads the current hour and the 16 days', () => {
    const time = hours(48)
    const col = (v: number) => time.map(() => v)
    const f = parseForecastAgro({
      current: { time: '2026-09-28T05:00' },
      hourly: {
        time, temperature_2m: col(20), relative_humidity_2m: col(50), dew_point_2m: col(9.3), vapour_pressure_deficit: col(1.17),
        precipitation: col(0), wind_speed_10m: col(8), wind_gusts_10m: col(30), soil_temperature_6cm: col(14),
        soil_temperature_18cm: col(13), soil_temperature_54cm: col(12), cape: col(0), lifted_index: col(5),
        leaf_wetness_probability: col(0), pressure_msl: time.map((_, i) => 1010 + i),
      },
    })
    expect(f.nowIdx).toBe(5)
    const v = Object.fromEntries(forecastValues(f, 'live').map((x) => [x.id, x]))
    expect(v.vpd_now.v).toBeCloseTo(1.17, 6)
    expect(v.ah_now.v).toBeCloseTo(8.64, 1)
    expect(v.deltat_now.v).toBeCloseTo(6.3, 1)
    expect(v.st_6.v).toBe(14)
    expect(v.pressure_now.note).toBe('+3 hPa in 3 h')
    expect(f.daily).toHaveLength(2)
  })
})

describe('ERA5-Land archive', () => {
  it('gives the latest soil moisture per layer and a wind rose', () => {
    const date = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']
    const a = parseArchive({
      daily: {
        time: date, soil_moisture_0_to_7cm_mean: [0.2, 0.21, 0.22, null], soil_moisture_7_to_28cm_mean: [0.25, 0.25, 0.26, 0.27],
        soil_moisture_28_to_100cm_mean: [0.3, 0.3, 0.3, 0.3], soil_moisture_100_to_255cm_mean: [0.32, 0.32, 0.32, 0.32],
        wind_direction_10m_dominant: [0, 90, 180, 270], wind_speed_10m_mean: [10, 10, 10, 10],
      },
    })
    const v = Object.fromEntries(archiveValues(a, 'live').map((x) => [x.id, x]))
    expect(v.sm_0_7).toMatchObject({ v: 0.22, asOf: '2026-09-22' })
    expect(v.sm_7_28.v).toBe(0.27)
    expect(v.wind_rose.series!.map((p) => p.t)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])
    expect(v.wind_rose.series![0].v).toBe(25)
  })
})

describe('seasonal and flood', () => {
  it('compares the next three months of the ensemble with the normal', () => {
    const time = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 86_400_000).toISOString().slice(0, 10))
    const daily: Record<string, (number | string)[]> = { time }
    for (let m = 0; m <= 50; m++) {
      const suffix = m === 0 ? '' : `_member${String(m).padStart(2, '0')}`
      daily[`temperature_2m_mean${suffix}`] = time.map(() => 12)
      daily[`precipitation_sum${suffix}`] = time.map(() => (m < 26 ? 1 : 2))
    }
    const s = parseSeasonal({ daily })
    const normals = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, t: 10, p: 45, pet: 50, tMax: 15, w: 0.5 })) as MonthNormal[]
    const v = Object.fromEntries(seasonalValues(s, normals, '2026-09-28', 'live').map((x) => [x.id, x]))
    expect(v.seas_t.v).toBeCloseTo(2, 6)
    expect(v.seas_p_dry.v).toBeCloseTo((26 / 51) * 100, 6)
    expect(v.seas_t.text).toBe('Oct-Dec')
  })
  it('ranks the coming peak discharge against the record and counts P95 days', () => {
    const time: string[] = []
    const q: (number | null)[] = []
    for (let i = 0; i < 4000; i++) {
      time.push(new Date(Date.UTC(2015, 0, 1) + i * 86_400_000).toISOString().slice(0, 10))
      q.push(i % 100 === 0 ? 500 : 10)
    }
    const f = parseFlood({ daily: { time, river_discharge: q } })
    const today = time[3850] // the 500 m³/s day at index 3900 lies ahead
    const { values, floodDays } = floodValues(f, today, 'live')
    const v = Object.fromEntries(values.map((x) => [x.id, x]))
    expect(v.flood_now.v).toBeGreaterThanOrEqual(95)
    expect(v.flood_days.v).toBeGreaterThan(0)
    expect(floodDays.has(time[3900])).toBe(true)
    expect(floodDays.has(time[3800])).toBe(false) // past floods are not "coming"
  })
})
