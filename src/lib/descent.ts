// The page is a descent, and one number says where the reader is: over the hero, the camera's own height above the
// field; below it, the height each section measures at (2.5 m, 2 m, 0 m, −0.6 m, ▲ 0 m). These values change on
// every frame of a flight or a scroll, so they live in tiny stores that write straight to the DOM or a canvas -
// never React state.

type Listener<T> = (v: T) => void

function store<T>() {
  let value: T | null = null
  const listeners = new Set<Listener<T>>()
  return {
    get: (): T | null => value,
    set(v: T) {
      value = v
      listeners.forEach((f) => f(v))
    },
    subscribe(f: Listener<T>): () => void {
      listeners.add(f)
      return () => {
        listeners.delete(f)
      }
    },
  }
}

/** The globe reports here while the camera moves (km above the field); the altimeter and the hero's dive read it. */
export const cameraAltitude = store<number>()

/** The closing film's camera on its way back up, km above the field; 0 while that stretch is not on screen. */
export const ascentAltitude = store<number>()

/**
 * Where the reader is in the descent, published by the altimeter on every scroll frame.
 * - `stratum`: a continuous 0 … 5 the atmosphere and the crossings read -
 *   0 orbit · 1 the cloud deck · 2 air over the field · 3 the surface (canopy, the field, under glass) · 4 the soil ·
 *   5 back at the surface (the plan, the market: dawn)
 * - `metres`: the altimeter's height in metres (negative below ground)
 */
export const descentDepth = store<{ stratum: number; metres: number }>()

/** Each section's place in the strata (see `descentDepth`); the hero's own stretch passes the cloud deck. */
export const STRATUM: Record<string, number> = { orbit: 0, ground: 2, air: 2.4, field: 3, house: 3, energy: 3.2, roots: 4, plan: 5, market: 5 }

/** The altimeter's own format: "705 km", "1.8 km", "420 m", "2.4 m", "−0.3 m". */
export function formatAltitude(m: number): string {
  const a = Math.abs(m)
  if (a >= 100_000) return `${Math.round(m / 1000).toLocaleString('en-US')} km`
  if (a >= 1000) return `${(m / 1000).toFixed(1)} km`
  if (a >= 10) return `${Math.round(m)} m`
  if (a < 0.05) return '0 m'
  return `${m < 0 ? '−' : ''}${a.toFixed(1)} m`
}

/** A stop's height in metres: "705 km" → 705 000, "−0.6 m" → −0.6, "▲ 0 m" → 0; words ("roof") → a greenhouse roof. */
export function stopMetres(alt: string): number {
  const m = alt.replace('−', '-').match(/(-?\d+(?:\.\d+)?)\s*(km|m)\b/)
  if (!m) return 5
  return Number(m[1]) * (m[2] === 'km' ? 1000 : 1)
}

/** From one height to the next: logarithmic while both are well above ground (2 km → 2 m is mostly the last
 *  hundred metres, as a falling camera sees it), linear near and below the surface. */
export function between(a: number, b: number, t: number): number {
  if (a > 0.5 && b > 0.5) return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t)
  return a + (b - a) * t
}

/** Dwell on a section's height, then move on over its last stretch - readable numbers, not a running blur. */
export function dwell(t: number, from = 0.55): number {
  const x = Math.min(1, Math.max(0, (t - from) / (1 - from)))
  return x * x * (3 - 2 * x)
}
