// How often a scene draws and how sharp, against the display's own frame (6.9 ms at 144 Hz, 16.7 at 60 - lib/refresh).
// A stage with a canvas of its own only (lib/objects/stage): the scenes on the shared canvas are paced by its frame
// budget instead (lib/objects/budget), one tier for all of them.
//
// An overloaded GPU stretches the interval between animation frames past the display's, so the mean interval over ~45
// frames steers the pixel ratio a step at a time - down at once when frames drop, up only after a calm stretch (no
// popping back and forth). A scene that cannot keep a fast display's every frame even at its lowest resolution draws
// every second one instead: an even half rate at full sharpness beats an uneven full rate at none.
import { displayInterval } from '../refresh'

export type PaceOptions = {
  /** a continuous loop (drift, wind); false = still, drawn only when asked */
  animate: boolean
  /** device-pixel-ratio cap (default 1.5); below 1 draws at a fraction of CSS resolution (soft, costly scenes) */
  maxDpr?: number
  /** frame-rate cap for the ambient loop, in ms between frames (a scroll change still draws at once) */
  minFrameMs?: number
  /** adaptive resolution: the pixel ratio follows the measured frame time between these bounds (a strong GPU gets
   * a sharp frame, a weak one keeps its frame rate); starts at maxDpr */
  adaptive?: { min: number; max: number }
}

export type Pacer = {
  /** the pixel ratio to draw at now */
  dpr: () => number
  /** the least time between two ambient draws: the scene's own cap (never slower than every second frame of a fast
   * display - a 30 fps scene beside a 144 Hz scroll reads as broken), or the half rate it fell back to */
  cadence: () => number
  /** an animation frame went by with this scene the only one drawing; true when the pixel ratio changed with it */
  tick: (now: number) => boolean
  /** the frames since the last tick were not this scene's own (another one was drawing too): start the count again */
  skip: () => void
}

export function createPacer(opts: PaceOptions): Pacer {
  const cap = Math.min(window.devicePixelRatio, opts.adaptive?.max ?? opts.maxDpr ?? 1.5)
  let dpr = opts.adaptive ? Math.min(cap, opts.maxDpr ?? cap) : cap
  let sum = 0
  let n = 0
  let lastTick = 0
  let holdUntil = 0
  let stride = 1
  let short = 0
  return {
    dpr: () => dpr,
    cadence: () => {
      const base = displayInterval()
      const least = opts.minFrameMs ? Math.min(opts.minFrameMs, base * 2 - 1.5) : 0
      return Math.max(least, stride > 1 ? base * stride - 1.5 : 0)
    },
    tick: (now) => {
      const a = opts.adaptive
      const gap = lastTick ? now - lastTick : 0
      lastTick = now
      if (!a || !opts.animate || gap <= 0 || gap > 250) return false
      sum += gap
      n += 1
      if (n < 45) return false
      const mean = sum / n
      sum = 0
      n = 0
      let next = dpr
      const base = displayInterval()
      if (mean > base * 1.26) {
        if (dpr > a.min + 0.01) {
          next = Math.max(a.min, dpr - 0.15)
          short = 0
        } else if (stride === 1 && base < 13 && ++short >= 2) stride = 2
        holdUntil = now + 6000
      } else if (mean < base * 1.07 && now > holdUntil) next = Math.min(Math.min(window.devicePixelRatio, a.max), dpr + 0.1)
      if (Math.abs(next - dpr) < 0.01) return false
      dpr = next
      return true
    },
    skip: () => {
      lastTick = 0
      sum = 0
      n = 0
    },
  }
}
