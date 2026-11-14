// src/lib/data/derive/relief.test.ts
import { describe, expect, it } from 'vitest'
import { d8Accumulation, fillDepressions, maskFor, reliefStats, slopeAspect, tri, type Grid } from './relief'

const grid = (w: number, h: number, cell: number, f: (i: number, j: number) => number): Grid => {
  const z = new Float32Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) z[j * w + i] = f(i, j)
  return { w, h, z, cell, zoom: 14, x0: 0, y0: 0 }
}
const all = (g: Grid) => new Uint8Array(g.w * g.h).fill(1)

describe('relief', () => {
  it('reads a 5 % plane rising to the east as a 5 % west-facing slope', () => {
    const g = grid(20, 20, 10, (i) => 0.05 * i * 10)
    const { slope, aspect } = slopeAspect(g)
    const mid = 10 * 20 + 10
    expect(slope[mid]).toBeCloseTo(0.05, 4)
    expect(aspect[mid]).toBeCloseTo(270, 1)
    expect(tri(g)[mid]).toBeGreaterThan(0)
  })
  it('fills a pit up to its spill level', () => {
    const g = grid(5, 5, 10, (i, j) => (i === 2 && j === 2 ? 0 : 10))
    const f = fillDepressions(g)
    expect(f[2 * 5 + 2]).toBeGreaterThanOrEqual(10)
  })
  it('routes a V-shaped valley to its outlet and finds the wet valley floor', () => {
    // valley along the middle column, falling to the south edge
    const g = grid(21, 30, 10, (i, j) => Math.abs(i - 10) * 2 + (30 - j) * 0.5)
    const acc = d8Accumulation(fillDepressions(g), g.w, g.h)
    const outlet = 29 * 21 + 10
    expect(acc[outlet]).toBeGreaterThan(21 * 20)
    const s = reliefStats(g, all(g))
    expect(s.wetShare).toBeGreaterThan(0)
    expect(s.wetShare).toBeLessThan(0.2)
    expect(s.twiMedian).toBeGreaterThan(0)
    expect(s.lsMedian).toBeGreaterThan(0)
  })
  it('returns no aspect on flat ground', () => {
    const g = grid(10, 10, 10, () => 100)
    expect(reliefStats(g, all(g)).aspectDeg).toBeNull()
  })
  it('masks a 300 m square around a point field', () => {
    const zoom = 14
    const n = 256 * 2 ** zoom
    const lat = 50
    const lon = 10
    const sn = Math.sin((lat * Math.PI) / 180)
    const cx = ((lon + 180) / 360) * n
    const cy = (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * n
    const g: Grid = { w: 80, h: 80, z: new Float32Array(6400), cell: 6.1, zoom, x0: Math.floor(cx) - 40, y0: Math.floor(cy) - 40 }
    const count = maskFor(g, { kind: 'point', lat, lon }).reduce((a, b) => a + b, 0)
    expect(count).toBeGreaterThan(1500) // about 49 x 49 cells of 6.1 m
    expect(count).toBeLessThan(3500)
  })
})
