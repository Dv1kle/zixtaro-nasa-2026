// The frame budget: how much a frame of the shared canvas may cost, decided in one place.
//
// Each scene used to decide this for itself - its own pixel-ratio ceiling and its own pacer stepping the ratio by
// 0.15 every 45 frames (every step reallocated the scene's whole post chain and drew it twice), its own shadow-map
// size, and the canvas drew two scenes in a crossing on alternate frames, so each camera moved at half rate under
// windows whose edges moved at full rate. Nothing could say "this is a weak GPU, step down" for all of them.
//
// Here the canvas (lib/objects/world) picks one of three quality TIERS - first from the GPU, then from the measured
// frame - and everything follows from it: every scene's pixel ratio, the lens's anti-aliasing, the shadow maps' size.
// The tiers are few and far apart, and the way back up is slow and gets slower each time it was taken too early, so a
// laptop settles on a tier instead of hunting around it. A scene says only what it is (`resolution`: a soft scene is
// drawn at a share of the tier's ratio); it no longer says how sharp it may be.
//
// Everything here is pure, for the tests: the canvas feeds it frame times and reads decisions back.
import type { LensTier } from './lens'

export type Tier = 'low' | 'mid' | 'high'
const ORDER: readonly Tier[] = ['low', 'mid', 'high']

/** the pixel ratio a full-sharpness scene is drawn at on each tier (never above the device's own) */
export const TIER_DPR: Readonly<Record<Tier, number>> = { low: 0.8, mid: 1.25, high: 1.5 }

/** A scene's pixel ratio on this tier. `resolution`: the scene's share of it (a soft backdrop asks for less). */
export function pixelRatio(tier: Tier, deviceDpr: number, resolution = 1): number {
  return Math.min(deviceDpr, TIER_DPR[tier]) * resolution
}

/** what the lens may spend: multisampling on the upper tiers, SMAA on the lowest */
export function lensTier(tier: Tier): LensTier {
  return tier === 'low' ? 'low' : 'high'
}

/** the side of a shadow map; it is redrawn only when its casters move, so only the lowest tier halves it */
export function shadowSize(tier: Tier): number {
  return tier === 'low' ? 1024 : 2048
}

/**
 * Where to start, from the GPU's own name (WEBGL_debug_renderer_info; empty when the browser hides it). A software
 * renderer starts low; a discrete card (or Apple silicon) high; integrated graphics and anything unknown in the middle,
 * from where the measured frame moves it.
 */
export function startTier(gpu: string): Tier {
  const g = gpu.toLowerCase()
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(g)) return 'low'
  if (/nvidia|geforce|quadro|rtx|gtx|radeon\s*(rx|pro|vii|r9)|intel.*arc|apple m\d|apple gpu/.test(g)) return 'high'
  return 'mid'
}

/** a requested tier (`?tier=low`), for measuring each one on the same machine */
export function parseTier(s: string | null | undefined): Tier | null {
  return s === 'low' || s === 'mid' || s === 'high' ? s : null
}

/** frames in one measuring window */
export const WINDOW = 45
/** a window whose mean frame is this much longer than the display's is slow: one tier down, at once */
const SLOW = 1.26
/** a window this close to the display's frame is calm; CALM_RUN calm windows in a row (and no hold) go one tier up */
const CALM = 1.07
const CALM_RUN = 3
/** after a step down the way up is closed this long; a step up undone within RELAPSE_MS doubles it, up to HOLD_MAX_MS */
const HOLD_MS = 8000
const HOLD_MAX_MS = 64000
const RELAPSE_MS = 20000
/** a gap longer than this is not a slow frame but a pause (a hidden tab, a long task): not counted */
const PAUSE_MS = 250

export type Governor = {
  tier: () => Tier
  /** 1, or 2 when even the lowest tier cannot keep a fast display's every frame: an even half rate beats an uneven one */
  stride: () => number
  /** an animation frame went by at `now` with the frame steady (one scene drawing); `base`: the display's frame (ms).
   * True when the tier changed with it. */
  sample: (now: number, base: number) => boolean
  /** the frames since the last sample were not steady (a crossing, two scenes at once): start the window again */
  skip: () => void
}

export function createGovernor(start: Tier, opts: { fixed?: boolean } = {}): Governor {
  let level = ORDER.indexOf(start)
  let stride = 1
  let sum = 0
  let n = 0
  let lastTick = 0
  let calm = 0
  let slowAtFloor = 0
  let hold = HOLD_MS
  let holdUntil = 0
  let roseAt = -Infinity
  const skip = () => {
    lastTick = 0
    sum = 0
    n = 0
  }
  return {
    tier: () => ORDER[level],
    stride: () => stride,
    skip,
    sample: (now, base) => {
      const gap = lastTick ? now - lastTick : 0
      lastTick = now
      if (opts.fixed || gap <= 0 || gap > PAUSE_MS) return false
      sum += gap
      n += 1
      if (n < WINDOW) return false
      const mean = sum / n
      sum = 0
      n = 0
      if (mean > base * SLOW) {
        calm = 0
        // a step up that did not hold: the next one waits twice as long
        if (now - roseAt < RELAPSE_MS) hold = Math.min(HOLD_MAX_MS, hold * 2)
        holdUntil = now + hold
        if (level > 0) {
          level -= 1
          slowAtFloor = 0
          return true
        }
        if (stride === 1 && base < 13 && ++slowAtFloor >= 2) stride = 2
        return false
      }
      if (mean < base * CALM) {
        calm += 1
        if (calm >= CALM_RUN && now >= holdUntil && level < ORDER.length - 1) {
          calm = 0
          level += 1
          roseAt = now
          // one tier at a time: the new one is lived with for a while before the next is tried
          holdUntil = now + HOLD_MS
          return true
        }
        return false
      }
      calm = 0
      return false
    },
  }
}

/**
 * The least time between two ambient draws of a scene: its own cap `minFrameMs` (never slower than every second frame
 * of a fast display - a 30 fps scene beside a 144 Hz scroll reads as broken), or the half rate the budget fell back to.
 */
export function cadence(base: number, stride: number, minFrameMs?: number): number {
  const least = minFrameMs ? Math.min(minFrameMs, base * 2 - 1.5) : 0
  return Math.max(least, stride > 1 ? base * stride - 1.5 : 0)
}

/** a scene leaving a crossing with less than this share of the screen is held at its last frame */
export const HOLD_SHARE = 0.2

export type CrossingWindow = {
  /** the share of the screen's height its window covers now */
  share: number
  /** ... and in the frame before */
  prev: number
  /** it is held now */
  held: boolean
  /** it has a frame to hold */
  ready: boolean
}

/**
 * A crossing: two scenes on screen, one dissolving into the other. Both are drawn on every frame - taking turns, each
 * camera moved at half rate under edges moving at full rate, a judder at every dissolve - except the one on its way
 * out once little of it is left: it is held at its last frame (it is mostly dissolved by then) and costs nothing.
 * One coming in is always drawn, so it never jumps from an old frame to the live one where it can be seen. The one
 * with the most of the screen is never held. Returns which windows are held.
 */
export function crossingHolds(wins: readonly CrossingWindow[]): boolean[] {
  if (wins.length < 2) return wins.map(() => false)
  let main = 0
  for (let i = 1; i < wins.length; i++) if (wins[i].share > wins[main].share) main = i
  return wins.map((w, i) => i !== main && w.ready && w.share < HOLD_SHARE && (w.held || w.share < w.prev))
}
