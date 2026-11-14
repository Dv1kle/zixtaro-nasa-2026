import { describe, expect, it } from 'vitest'
import { cadence, createGovernor, crossingHolds, lensTier, pixelRatio, shadowSize, startTier, WINDOW, type Governor } from './budget'

const HZ165 = 1000 / 165
const HZ60 = 1000 / 60

/** run `frames` animation frames `gap` ms apart from `t`; the tiers the governor passed through, and the end time */
function run(g: Governor, t: number, frames: number, gap: number, base = HZ165): { t: number; tiers: string[] } {
  const tiers: string[] = []
  for (let i = 0; i < frames; i++) {
    t += gap
    if (g.sample(t, base)) tiers.push(g.tier())
  }
  return { t, tiers }
}

describe('startTier', () => {
  it('starts integrated graphics and unknown GPUs in the middle', () => {
    expect(startTier('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('mid')
    expect(startTier('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('mid')
    expect(startTier('')).toBe('mid')
  })
  it('starts discrete cards and Apple silicon high, software renderers low', () => {
    expect(startTier('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('high')
    expect(startTier('ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('high')
    expect(startTier('Apple M2')).toBe('high')
    expect(startTier('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe('low')
  })
})

describe('what a tier means', () => {
  it('sets every scene its pixel ratio, never above the device or the canvas', () => {
    expect(pixelRatio('high', 2)).toBe(1.5)
    expect(pixelRatio('high', 1)).toBe(1)
    expect(pixelRatio('mid', 1.5)).toBe(1.25)
    expect(pixelRatio('low', 1.5)).toBe(0.8)
    // a soft backdrop asks for a share of it
    expect(pixelRatio('high', 1.5, 0.5)).toBe(0.75)
  })
  it('steers the lens and the shadows', () => {
    expect(lensTier('high')).toBe('high')
    expect(lensTier('mid')).toBe('high')
    expect(lensTier('low')).toBe('low')
    expect(shadowSize('mid')).toBe(2048)
    expect(shadowSize('low')).toBe(1024)
  })
})

describe('the governor', () => {
  it('steps down at once when the frame is slow, one tier per window', () => {
    const g = createGovernor('high')
    // 45 fps on a 165 Hz display: the measured laptop
    const { tiers } = run(g, 0, WINDOW * 2 + 1, 22)
    expect(tiers).toEqual(['mid', 'low'])
  })

  it('does not count pauses (a hidden tab, a long task) as slow frames', () => {
    const g = createGovernor('high')
    let t = 0
    for (let i = 0; i < WINDOW * 3; i++) {
      t += i % 2 ? 400 : HZ165
      expect(g.sample(t, HZ165)).toBe(false)
    }
    expect(g.tier()).toBe('high')
  })

  it('goes up only after a calm stretch and once the hold is over', () => {
    const g = createGovernor('mid')
    let r = run(g, 0, WINDOW + 1, 22)
    expect(r.tiers).toEqual(['low'])
    // calm at once: but the way up is held for 8 s
    r = run(g, r.t, WINDOW * 3, HZ165)
    expect(g.tier()).toBe('low')
    r = run(g, r.t, Math.ceil(9000 / HZ165), HZ165)
    expect(g.tier()).toBe('mid')
  })

  it('does not thrash: a step up that does not hold makes the next one wait twice as long', () => {
    const g = createGovernor('mid')
    let t = run(g, 0, WINDOW + 1, 22).t
    const changes: { at: number; tier: string }[] = []
    // a GPU that keeps mid only while it is not asked for it: calm on low, slow on mid, for two minutes
    while (t < 120000) {
      t += g.tier() === 'low' ? HZ165 : 22
      if (g.sample(t, HZ165)) changes.push({ at: t, tier: g.tier() })
    }
    const ups = changes.filter((c) => c.tier === 'mid').map((c) => c.at)
    // a handful of tries in two minutes, each further from the last
    expect(ups.length).toBeLessThanOrEqual(4)
    for (let i = 2; i < ups.length; i++) expect(ups[i] - ups[i - 1]).toBeGreaterThan(ups[i - 1] - ups[i - 2])
  })

  it('falls back to every second frame on a fast display when even the lowest tier is slow', () => {
    const g = createGovernor('low')
    run(g, 0, WINDOW * 2 + 1, 22)
    expect(g.stride()).toBe(2)
    const slow60 = createGovernor('low')
    run(slow60, 0, WINDOW * 3, 40, HZ60)
    expect(slow60.stride()).toBe(1)
  })

  it('stays put when the tier was asked for', () => {
    const g = createGovernor('high', { fixed: true })
    run(g, 0, WINDOW * 4, 40)
    expect(g.tier()).toBe('high')
  })

  it('starts its window again after frames that were not steady', () => {
    const g = createGovernor('high')
    const t = run(g, 0, WINDOW - 5, 30).t
    g.skip()
    run(g, t, 20, HZ165)
    expect(g.tier()).toBe('high')
  })
})

describe('cadence', () => {
  it('keeps a scene its own cap but never slower than every second frame', () => {
    expect(cadence(HZ60, 1)).toBe(0)
    expect(cadence(HZ60, 1, 30)).toBe(30)
    expect(cadence(HZ60, 1, 33)).toBeCloseTo(HZ60 * 2 - 1.5)
    expect(cadence(HZ165, 1, 33)).toBeCloseTo(HZ165 * 2 - 1.5)
    expect(cadence(HZ165, 2)).toBeCloseTo(HZ165 * 2 - 1.5)
  })
})

describe('crossingHolds', () => {
  const w = (share: number, prev: number, held = false, ready = true) => ({ share, prev, held, ready })
  it('draws both scenes of a crossing while both are well on screen', () => {
    expect(crossingHolds([w(0.6, 0.62), w(0.4, 0.38)])).toEqual([false, false])
  })
  it('holds the one on its way out once little of it is left', () => {
    expect(crossingHolds([w(0.15, 0.17), w(0.85, 0.83)])).toEqual([true, false])
  })
  it('never holds the one coming in, so it cannot jump where it is seen', () => {
    expect(crossingHolds([w(0.85, 0.87), w(0.15, 0.13)])).toEqual([false, false])
  })
  it('keeps a held scene held while it stands still, and lets it go when it grows past the line', () => {
    expect(crossingHolds([w(0.15, 0.15, true), w(0.85, 0.85)])).toEqual([true, false])
    expect(crossingHolds([w(0.25, 0.18, true), w(0.75, 0.82)])).toEqual([false, false])
  })
  it('holds nothing that has no frame yet, and nothing alone on screen', () => {
    expect(crossingHolds([w(0.1, 0.12, false, false), w(0.9, 0.88)])).toEqual([false, false])
    expect(crossingHolds([w(0.1, 0.12)])).toEqual([false])
  })
})
