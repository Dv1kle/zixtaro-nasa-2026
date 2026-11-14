// src/lib/data/derive/soilwater.test.ts
import { describe, expect, it } from 'vitest'
import type { Daily } from '../../dailyFormat'
import { saxtonRawls } from '../../soil'
import { CN_ROW_CROPS, cnForRain5, fitVG, hydrologicGroup, KPA_TO_CM, pF, runoffShare, saxtonRawlsFull, scsRunoff, suctionFromPoints, vgSuction, vgTheta } from './soilwater'

describe('Saxton and Rawls (2006)', () => {
  it('keeps the engine’s wilting point and field capacity', () => {
    const a = saxtonRawls(40, 20, 2.5)
    const b = saxtonRawlsFull(40, 20, 2.5)
    expect(b.wp).toBeCloseTo(a.wp, 10)
    expect(b.fc).toBeCloseTo(a.fc, 10)
  })
  it('gives plausible saturation and conductivity for loam, sand and clay', () => {
    const loam = saxtonRawlsFull(40, 20, 2.5)
    expect(loam.sat).toBeGreaterThan(0.42)
    expect(loam.sat).toBeLessThan(0.5)
    expect(loam.ksat).toBeGreaterThan(5)
    expect(loam.ksat).toBeLessThan(30)
    expect(saxtonRawlsFull(88, 5, 0.5).ksat).toBeGreaterThan(60)
    expect(saxtonRawlsFull(20, 50, 2).ksat).toBeLessThan(5)
  })
})

describe('van Genuchten', () => {
  const truth = { thetaR: 0.05, thetaS: 0.45, alpha: 0.02, n: 1.6 }
  it('round-trips suction and water content', () => {
    const th = vgTheta(truth, 337)
    expect(vgSuction(truth, th)).toBeCloseTo(337, 3)
    expect(vgSuction(truth, 0.46)).toBe(0)
    expect(vgSuction(truth, 0.04)).toBe(Infinity)
  })
  it('recovers a curve from three retention points and saturation', () => {
    const pts = [10, 33, 1500].map((kPa) => ({ kPa, theta: vgTheta(truth, kPa * KPA_TO_CM) }))
    const fit = fitVG(pts, truth.thetaS)
    for (const kPa of [20, 100, 500]) expect(vgTheta(fit, kPa * KPA_TO_CM)).toBeCloseTo(vgTheta(truth, kPa * KPA_TO_CM), 2)
  })
  it('reports pF as log10 of cm of water', () => {
    expect(pF(1000)).toBeCloseTo(3, 6)
  })
})

describe('tension from the retention points', () => {
  const pts = [{ kPa: 10, theta: 0.39 }, { kPa: 33, theta: 0.34 }, { kPa: 1500, theta: 0.16 }]
  const vg = fitVG(pts, 0.5)
  it('reads exactly the SoilGrids points and interpolates log-suction between them', () => {
    expect(suctionFromPoints(pts, vg, 0.34)).toBeCloseTo(33, 6)
    expect(suctionFromPoints(pts, vg, 0.16)).toBeCloseTo(1500, 6)
    const mid = suctionFromPoints(pts, vg, 0.25)
    expect(mid).toBeGreaterThan(33)
    expect(mid).toBeLessThan(1500)
  })
  it('falls back to the fitted curve outside the points', () => {
    expect(suctionFromPoints(pts, vg, 0.45)).toBeLessThan(10)
    expect(suctionFromPoints(pts, vg, 0.1)).toBeGreaterThan(1500)
  })
})

describe('runoff', () => {
  it('reproduces TR-55: 127 mm on CN 80 gives 73.5 mm', () => {
    expect(scsRunoff(127, 80)).toBeCloseTo(73.5, 0)
    expect(scsRunoff(5, 80)).toBe(0)
  })
  it('groups soils by Ksat and adjusts CN for the rain of the 5 days before', () => {
    expect(hydrologicGroup(200)).toBe('A')
    expect(hydrologicGroup(50)).toBe('B')
    expect(hydrologicGroup(10)).toBe('C')
    expect(hydrologicGroup(1)).toBe('D')
    expect(CN_ROW_CROPS.B).toBe(78)
    expect(cnForRain5(78, 10)).toBeLessThan(78)
    expect(cnForRain5(78, 60)).toBeGreaterThan(78)
    expect(cnForRain5(78, 45)).toBe(78)
  })
  it('turns a daily record into the share of rain that runs off', () => {
    const d: Daily = { start: '2011-01-01', tmax: Array(3650).fill(20), tmin: Array(3650).fill(10), prcp: Array.from({ length: 3650 }, (_, i) => (i % 30 === 0 ? 80 : 0)) }
    const share = runoffShare(d, 78, [2011, 2020])!
    expect(share).toBeGreaterThan(0.1)
    expect(share).toBeLessThan(0.5)
  })
})
