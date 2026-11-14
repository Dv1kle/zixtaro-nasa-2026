import { describe, expect, it } from 'vitest'
import { planLens, type LensIntent } from './lens'

const field: LensIntent = { focus: {}, bloom: {}, vignette: { offset: 0.3, darkness: 0.6 }, grain: 0.12, thinLines: true }
const air: LensIntent = { bloom: {}, vignette: { offset: 0.32, darkness: 0.5 }, grain: 0.1 }

describe('planLens', () => {
  it('multisamples and finishes the frame in one effect pass on the high tier', () => {
    expect(planLens(field, 4)).toEqual({ msaa: 4, passes: [['dof', 'bloom', 'tone', 'vignette', 'grain']] })
  })

  it('never pays for multisampling and SMAA together', () => {
    for (const intent of [field, air])
      for (const samples of [0, 4, 8])
        for (const tier of ['high', 'low'] as const) {
          const plan = planLens(intent, samples, tier)
          expect(plan.msaa > 0 && plan.passes.flat().includes('smaa')).toBe(false)
          expect(plan.msaa > 0 || plan.passes.flat().includes('smaa')).toBe(true)
        }
  })

  it('falls back to SMAA where the renderer cannot multisample, leading its own pass after the tone map', () => {
    expect(planLens(field, 0)).toEqual({ msaa: 0, passes: [['dof', 'bloom', 'tone'], ['smaa', 'vignette', 'grain']] })
  })

  it('drops multisampling on the low tier, except for scenes of hair-thin lines', () => {
    expect(planLens(air, 4, 'low').msaa).toBe(0)
    expect(planLens(field, 4, 'low').msaa).toBe(4)
  })

  it('caps multisampling at 4', () => {
    expect(planLens(air, 16).msaa).toBe(4)
  })

  it('applies grain once and tone maps once', () => {
    const effects = planLens(field, 0).passes.flat()
    expect(effects.filter((e) => e === 'grain')).toHaveLength(1)
    expect(effects.filter((e) => e === 'tone')).toHaveLength(1)
  })

  it('puts the tilt-shift with the scene, ahead of the tone map', () => {
    expect(planLens({ tilt: {}, bloom: {}, vignette: { offset: 0.3, darkness: 0.5 }, grain: 0.08 }, 4).passes).toEqual([['tilt', 'bloom', 'tone', 'vignette', 'grain']])
  })

  it('leaves out what the development switches turn off', () => {
    expect(planLens(field, 4, 'high', ['dof', 'bloom', 'grain']).passes).toEqual([['tone', 'vignette']])
  })
})
