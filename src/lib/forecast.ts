// Live 16-day outlook from Open-Meteo: what the next two weeks mean for field work and soil water.

export type ForecastDay = {
  date: string
  code: number
  tmax: number
  tmin: number
  rain: number
  rainProb: number
  et0: number
  windMax: number
  rootMoisture: number | null // m³/m³, 27-81 cm, daily mean
}

export type Forecast = {
  now: { temp: number; humidity: number; rain: number; code: number; wind: number; time: string }
  days: ForecastDay[]
  totals: { rain: number; et0: number; frostDays: number; workableDays: number }
  timezone: string
}

type Raw = {
  timezone: string
  current: { time: string; temperature_2m: number; relative_humidity_2m: number; precipitation: number; weather_code: number; wind_speed_10m: number }
  daily: Record<string, (number | string | null)[]>
  hourly: { time: string[]; soil_moisture_27_to_81cm: (number | null)[] }
}

export function parseForecast(r: Raw): Forecast {
  const d = r.daily
  const soilByDay = new Map<string, number[]>()
  r.hourly.time.forEach((t, i) => {
    const v = r.hourly.soil_moisture_27_to_81cm[i]
    if (v == null) return
    const day = t.slice(0, 10)
    soilByDay.set(day, [...(soilByDay.get(day) ?? []), v])
  })
  const num = (k: string, i: number) => Number(d[k]?.[i] ?? 0)
  const days: ForecastDay[] = (d.time as string[]).map((date, i) => {
    const sm = soilByDay.get(date)
    return {
      date,
      code: num('weather_code', i),
      tmax: num('temperature_2m_max', i),
      tmin: num('temperature_2m_min', i),
      rain: num('precipitation_sum', i),
      rainProb: num('precipitation_probability_max', i),
      et0: num('et0_fao_evapotranspiration', i),
      windMax: num('wind_speed_10m_max', i),
      rootMoisture: sm ? sm.reduce((a, b) => a + b, 0) / sm.length : null,
    }
  })
  return {
    now: {
      temp: r.current.temperature_2m,
      humidity: r.current.relative_humidity_2m,
      rain: r.current.precipitation,
      code: r.current.weather_code,
      wind: r.current.wind_speed_10m,
      time: r.current.time,
    },
    days,
    totals: {
      rain: days.reduce((s, x) => s + x.rain, 0),
      et0: days.reduce((s, x) => s + x.et0, 0),
      frostDays: days.filter((x) => x.tmin < 0).length,
      workableDays: days.filter(isWorkable).length,
    },
    timezone: r.timezone,
  }
}

/** Dry and calm enough for drilling, spraying or harvest. */
export const isWorkable = (d: ForecastDay) => d.rain < 1 && d.windMax < 25

/** WMO weather code → short label. */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code >= 85 && code <= 86) return 'Snow showers'
  if (code >= 95) return 'Thunderstorm'
  return 'Mixed'
}

/**
 * Drill check: of the forecast days inside the crop's sowing month, which ones a drill can go out on - workable,
 * and for spring-sown crops warm enough (daily mean air temperature as the soil's proxy), frost-free for frost-
 * tender ones - and the longest run of them. When none of the days is in the window, how many days until it opens.
 */
export type DrillCheck = { inside: boolean[]; inWindow: number; good: boolean[]; workable: number; run: [number, number] | null; opensIn: number | null }

export function drillCheck(days: ForecastDay[], sowMonth: number, minT?: number, frostTender = false): DrillCheck {
  const month = (d: ForecastDay) => Number(d.date.slice(5, 7))
  const inside = days.map((d) => month(d) === sowMonth)
  const good = days.map((d, i) => inside[i] && isWorkable(d) && (minT === undefined || (d.tmax + d.tmin) / 2 >= minT) && (!frostTender || d.tmin > 0))
  let run: [number, number] | null = null
  for (let i = 0; i < good.length; i++) {
    if (!good[i]) continue
    let j = i
    while (j + 1 < good.length && good[j + 1]) j++
    if (!run || j - i > run[1] - run[0]) run = [i, j]
    i = j
  }
  const inWindow = inside.filter(Boolean).length
  let opensIn: number | null = null
  if (!inWindow && days.length) {
    const first = new Date(`${days[0].date}T12:00:00Z`)
    const y = first.getUTCFullYear() + (sowMonth < first.getUTCMonth() + 1 ? 1 : 0)
    opensIn = Math.round((Date.UTC(y, sowMonth - 1, 1, 12) - first.getTime()) / 86_400_000)
  }
  return { inside, inWindow, good, workable: good.filter(Boolean).length, run, opensIn }
}
