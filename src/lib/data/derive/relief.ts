// src/lib/data/derive/relief.ts
// Terrain of the field from a DEM grid: slope and aspect (Horn 1981), ruggedness (Riley et al. 1999), where water
// collects (priority-flood filling, Barnes et al. 2014; D8 flow; TWI, Beven & Kirkby 1979) and the erosion LS factor
// from upslope area (Moore & Burch 1986). Pure functions on a Float32Array; the fetcher builds the grid.
import { pointInRing, type Field } from '../../geo'

export type Grid = { w: number; h: number; z: Float32Array; cell: number; zoom: number; x0: number; y0: number }

const DX = [-1, 0, 1, -1, 1, -1, 0, 1]
const DY = [-1, -1, -1, 0, 0, 1, 1, 1]

export function slopeAspect(g: Grid): { slope: Float32Array; aspect: Float32Array } {
  const { w, h, z, cell } = g
  const slope = new Float32Array(w * h)
  const aspect = new Float32Array(w * h).fill(NaN)
  const at = (i: number, j: number) => z[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))]
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const a = at(i - 1, j - 1), b = at(i, j - 1), c = at(i + 1, j - 1)
      const d = at(i - 1, j), f = at(i + 1, j)
      const gg = at(i - 1, j + 1), hh = at(i, j + 1), ii = at(i + 1, j + 1)
      const dzdx = (c + 2 * f + ii - (a + 2 * d + gg)) / (8 * cell) // east positive
      const dzdy = (gg + 2 * hh + ii - (a + 2 * b + c)) / (8 * cell) // south positive (rows grow southwards)
      const k = j * w + i
      slope[k] = Math.hypot(dzdx, dzdy)
      // downhill direction, degrees clockwise from north
      if (slope[k] > 1e-6) aspect[k] = (((Math.atan2(-dzdx, dzdy) * 180) / Math.PI) + 360) % 360
    }
  return { slope, aspect }
}

export function tri(g: Grid): Float32Array {
  const { w, h, z } = g
  const out = new Float32Array(w * h)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let s = 0
      for (let n = 0; n < 8; n++) {
        const x = Math.min(w - 1, Math.max(0, i + DX[n]))
        const y = Math.min(h - 1, Math.max(0, j + DY[n]))
        s += (z[y * w + x] - z[j * w + i]) ** 2
      }
      out[j * w + i] = Math.sqrt(s)
    }
  return out
}

/** Minimal binary heap of [elevation, index]. */
class Heap {
  private a: number[] = []
  private b: number[] = []
  get size() {
    return this.a.length
  }
  push(v: number, k: number) {
    this.a.push(v)
    this.b.push(k)
    let i = this.a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.a[p] <= this.a[i]) break
      ;[this.a[p], this.a[i]] = [this.a[i], this.a[p]]
      ;[this.b[p], this.b[i]] = [this.b[i], this.b[p]]
      i = p
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.a[0], this.b[0]]
    const lv = this.a.pop()!
    const lk = this.b.pop()!
    if (this.a.length) {
      this.a[0] = lv
      this.b[0] = lk
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.a.length && this.a[l] < this.a[m]) m = l
        if (r < this.a.length && this.a[r] < this.a[m]) m = r
        if (m === i) break
        ;[this.a[m], this.a[i]] = [this.a[i], this.a[m]]
        ;[this.b[m], this.b[i]] = [this.b[i], this.b[m]]
        i = m
      }
    }
    return top
  }
}

/** Priority-flood depression filling with a small gradient so every cell drains to the edge (Barnes et al. 2014). */
export function fillDepressions(g: Grid, eps = 1e-3): Float32Array {
  const { w, h } = g
  const z = Float32Array.from(g.z)
  const done = new Uint8Array(w * h)
  const heap = new Heap()
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1) {
        heap.push(z[j * w + i], j * w + i)
        done[j * w + i] = 1
      }
  while (heap.size) {
    const [v, k] = heap.pop()
    const i = k % w
    const j = (k - i) / w
    for (let n = 0; n < 8; n++) {
      const x = i + DX[n]
      const y = j + DY[n]
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const q = y * w + x
      if (done[q]) continue
      done[q] = 1
      if (z[q] <= v) z[q] = v + eps
      heap.push(z[q], q)
    }
  }
  return z
}

/** Cells draining through each cell (itself included) along the steepest of 8 neighbours. */
export function d8Accumulation(z: Float32Array, w: number, h: number): Float32Array {
  const n = w * h
  const to = new Int32Array(n).fill(-1)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      let best = 0
      for (let d = 0; d < 8; d++) {
        const x = i + DX[d]
        const y = j + DY[d]
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const drop = (z[k] - z[y * w + x]) / (DX[d] && DY[d] ? Math.SQRT2 : 1)
        if (drop > best) {
          best = drop
          to[k] = y * w + x
        }
      }
    }
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => z[b] - z[a])
  const acc = new Float32Array(n).fill(1)
  for (const k of order) if (to[k] >= 0) acc[to[k]] += acc[k]
  return acc
}

/** Centre of a grid cell in degrees (Web Mercator world pixels at `zoom`). */
export function cellLatLon(g: Grid, i: number, j: number): { lat: number; lon: number } {
  const n = 256 * 2 ** g.zoom
  const x = g.x0 + i + 0.5
  const y = g.y0 + j + 0.5
  const lon = (x / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  return { lat, lon }
}

/** 1 for cells inside the field (a 300 m square around a point field). */
export function maskFor(g: Grid, field: Field): Uint8Array {
  const m = new Uint8Array(g.w * g.h)
  const dLat = 150 / 111_320
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const c = cellLatLon(g, i, j)
      if (field.kind === 'area') m[j * g.w + i] = pointInRing(c.lat, c.lon, field.ring) ? 1 : 0
      else {
        const dLon = dLat / Math.cos((field.lat * Math.PI) / 180)
        m[j * g.w + i] = Math.abs(c.lat - field.lat) <= dLat && Math.abs(c.lon - field.lon) <= dLon ? 1 : 0
      }
    }
  return m
}

export type ReliefStats = { elev: number; slopeMean: number; slopeP90: number; aspectDeg: number | null; tri: number; twiMedian: number; wetShare: number; lsMedian: number; cells: number }

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN
}

export function reliefStats(g: Grid, mask: Uint8Array): ReliefStats {
  const { slope, aspect } = slopeAspect(g)
  const rug = tri(g)
  const acc = d8Accumulation(fillDepressions(g), g.w, g.h)
  const slopes: number[] = []
  const twis: number[] = []
  const lss: number[] = []
  let triSum = 0
  let elevSum = 0
  let wet = 0
  let vx = 0
  let vy = 0
  let n = 0
  for (let k = 0; k < g.w * g.h; k++) {
    if (!mask[k]) continue
    n++
    elevSum += g.z[k]
    const s = slope[k]
    slopes.push(s)
    triSum += rug[k]
    const a = acc[k] * g.cell // specific catchment area, m
    const tanB = Math.max(s, 0.001)
    twis.push(Math.log(a / tanB))
    const sinB = Math.sin(Math.atan(s))
    lss.push((a / 22.13) ** 0.4 * (sinB / 0.0896) ** 1.3)
    if (acc[k] * g.cell * g.cell >= 10_000) wet++
    if (Number.isFinite(aspect[k])) {
      vx += Math.sin((aspect[k] * Math.PI) / 180) * s
      vy += Math.cos((aspect[k] * Math.PI) / 180) * s
    }
  }
  const slopeMean = slopes.reduce((x, y) => x + y, 0) / Math.max(1, n)
  return {
    elev: elevSum / Math.max(1, n),
    slopeMean,
    slopeP90: q(slopes, 0.9),
    aspectDeg: slopeMean > 0.01 && Math.hypot(vx, vy) > 0 ? (((Math.atan2(vx, vy) * 180) / Math.PI) + 360) % 360 : null,
    tri: triSum / Math.max(1, n),
    twiMedian: q(twis, 0.5),
    wetShare: n ? wet / n : 0,
    lsMedian: q(lss, 0.5),
    cells: n,
  }
}
