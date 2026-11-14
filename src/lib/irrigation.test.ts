// How much of the cropland around a field is irrigated (FAO GMIA v5 on the CROPGRIDS grid).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { irrigatedShare, MOSTLY_IRRIGATED } from './irrigation'

const real = new Uint8Array(readFileSync('public/data/irrigation/share.bin'))

describe('irrigated share of cropland', () => {
  it('reads the grid cell of a point', () => {
    const g = new Uint8Array(720 * 360).fill(255)
    g[Math.floor((90 - 10.25) / 0.5) * 720 + Math.floor((20.25 + 180) / 0.5)] = 40
    expect(irrigatedShare(g, 10.25, 20.25)).toBeCloseTo(0.4, 6)
    expect(irrigatedShare(g, -40, -60)).toBeNull() // 255: no cropland recorded
  })
  it('knows the irrigated heartlands and the rainfed ones (real grid)', () => {
    expect(irrigatedShare(real, 30.8, 31.0)!).toBeGreaterThan(MOSTLY_IRRIGATED) // Nile delta
    expect(irrigatedShare(real, 30.5, 75.5)!).toBeGreaterThan(MOSTLY_IRRIGATED) // Indian Punjab
    expect(irrigatedShare(real, 42.03, -93.47)!).toBeLessThan(0.1) // Story County, Iowa
    expect(irrigatedShare(real, 51.52, 13.05)!).toBeLessThan(0.1) // Torgau
  })
})
