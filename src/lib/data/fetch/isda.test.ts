// src/lib/data/fetch/isda.test.ts
import { describe, expect, it } from 'vitest'
import { inAfrica, ISDA_LAYERS, isdaValues, pixelOf } from './isda'

describe('iSDAsoil', () => {
  it('knows Africa from elsewhere', () => {
    expect(inAfrica(1, 35)).toBe(true)
    expect(inAfrica(51.5, 13)).toBe(false)
    expect(inAfrica(-30, 25)).toBe(true)
  })
  it('finds the Web Mercator pixel of a Kenyan field', () => {
    expect(pixelOf(1, 35, [-3502582.8076430312, 4530073.13045243], [30, -30])).toEqual({ col: 246625, row: 147291 })
  })
  it('back-transforms the stored integers', () => {
    const back = (id: string, x: number) => ISDA_LAYERS.find((l) => l.id === id)!.back(x)
    expect(back('isda_ph', 56)).toBeCloseTo(5.6, 6)
    expect(back('isda_n', 113)).toBeCloseTo(2.096, 3)
    expect(back('isda_p', 25)).toBeCloseTo(11.18, 2)
    expect(back('isda_depth', 150)).toBe(150)
  })
  it('makes values only for layers that answered', () => {
    const v = isdaValues({ isda_ph: 5.6, isda_p: null }, 'live')
    expect(v.map((x) => x.id)).toEqual(['isda_ph'])
  })
})
