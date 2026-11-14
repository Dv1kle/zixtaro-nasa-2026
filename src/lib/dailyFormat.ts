// Compact storage for NASA POWER daily series (import-free: scripts/prebake.mjs uses it too).

/** Compact daily series: value i belongs to `start` + i days. null = missing. */
export type Daily = { start: string; tmax: (number | null)[]; tmin: (number | null)[]; prcp: (number | null)[] }

type RawDaily = Partial<Record<'T2M_MAX' | 'T2M_MIN' | 'PRECTOTCORR', Record<string, number>>>

const ok = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > -900
const round1 = (v: number) => Math.round(v * 10) / 10

export function compactDaily(raw: RawDaily): Daily {
  const keys = Object.keys(raw.T2M_MAX ?? {}).sort()
  const tmax: (number | null)[] = []
  const tmin: (number | null)[] = []
  const prcp: (number | null)[] = []
  for (const k of keys) {
    const a = raw.T2M_MAX?.[k]
    const b = raw.T2M_MIN?.[k]
    const c = raw.PRECTOTCORR?.[k]
    tmax.push(ok(a) ? round1(a) : null)
    tmin.push(ok(b) ? round1(b) : null)
    prcp.push(ok(c) ? round1(c) : null)
  }
  const k0 = keys[0] ?? '19810101'
  return { start: `${k0.slice(0, 4)}-${k0.slice(4, 6)}-${k0.slice(6, 8)}`, tmax, tmin, prcp }
}
