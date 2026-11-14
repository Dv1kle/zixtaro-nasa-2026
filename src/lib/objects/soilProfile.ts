// The soil monolith's surface, baked once on the CPU from the field's SoilGrids horizons: an atlas holding the two cut
// faces and the core's outer skin, with
//  - albedo: each horizon's colour from its texture and organic carbon (sand pale and granular, clay a reddish brown,
//    carbon darkening toward a near-black humus), boundaries that wander and interfinger like real horizon
//    boundaries, the horizon's structure (crumb in a humic topsoil, blocky peds with dark cracks in clay, loose grains
//    with bright quartz in sand), pores, worm burrows filled with darker topsoil, old root channels and the contact
//    darkness around each stone;
//  - a normal map from the same height field (each crumb, ped and pore catches the raking light);
//  - data: R the horizon's plant-available water (scaled), G where water is held and runs first (pores, burrows,
//    cracks), B quartz glints.
// Nothing here is invented as data: colour, structure and water strength follow the layer values; the look of the
// structure is the generic look of such a horizon, seeded by the field so the same field always looks the same.
//
// Pure arithmetic on typed arrays - no three.js, no DOM - so the whole bake runs in a worker (soilBake.worker.ts) and
// the page never waits for it; soilTextures.ts asks for it and wraps the arrays as textures.
import type { SoilLayer } from '../soil'

export const ATLAS_W = 1024
export const ATLAS_H = 1536
/** atlas columns: face A [0, FACE), face B [FACE, 2 FACE), skin [2 FACE, W) */
export const FACE_COLS = 256

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** integer hash → [0, 1) */
export function hash3(x: number, y: number, s: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1440662683)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** periodic value noise from a 256² table (one table, many octaves) */
export function makeNoise(seed: number) {
  const N = 256
  const t = new Float32Array(N * N)
  const r = rng(seed)
  for (let i = 0; i < t.length; i++) t[i] = r()
  const n2 = (x: number, y: number) => {
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    let fx = x - xf
    let fy = y - yf
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    const x0 = xf & 255
    const y0 = yf & 255
    const x1 = (x0 + 1) & 255
    const y1 = (y0 + 1) & 255
    const a = t[y0 * N + x0]
    const b = t[y0 * N + x1]
    const c = t[y1 * N + x0]
    const d = t[y1 * N + x1]
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
  }
  const fbm = (x: number, y: number, oct = 4) => {
    let s = 0
    let amp = 0.5
    let norm = 0
    for (let i = 0; i < oct; i++) {
      s += amp * n2(x, y)
      norm += amp
      x = x * 2.03 + 17.1
      y = y * 2.03 + 3.7
      amp *= 0.5
    }
    return s / norm
  }
  return { n2, fbm }
}

// voronoi results (module scratch, no allocation in the hot loop)
let vF1 = 0
let vF2 = 0
let vId = 0
/** cellular noise in cell units: F1, F2 distances and the nearest cell's hash; `period` wraps the cells (tiling) */
function voronoi(x: number, y: number, salt: number, period = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let f1 = 9
  let f2 = 9
  let id = 0
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i
      const cy = yi + j
      const hx = period ? ((cx % period) + period) % period : cx
      const hy = period ? ((cy % period) + period) % period : cy
      const px = cx + 0.1 + 0.8 * hash3(hx, hy, salt)
      const py = cy + 0.1 + 0.8 * hash3(hx, hy, salt + 7)
      const dx = px - x
      const dy = py - y
      const d = dx * dx + dy * dy
      if (d < f1) {
        f2 = f1
        f1 = d
        id = hash3(hx, hy, salt + 13)
      } else if (d < f2) f2 = d
    }
  vF1 = Math.sqrt(f1)
  vF2 = Math.sqrt(f2)
  vId = id
}

// ---------- horizon colour ----------

/** sRGB 0..1 */
export type RGB = [number, number, number]
const SAND: RGB = [0.74, 0.66, 0.52]
const SILT: RGB = [0.6, 0.55, 0.47]
const CLAY: RGB = [0.55, 0.41, 0.32]
const HUMUS: RGB = [0.12, 0.1, 0.085]

/** a horizon's moist colour: texture sets the hue and value, organic carbon darkens it toward humus */
export function horizonColor(l: SoilLayer): RGB {
  const tot = Math.max(1, l.sand + l.silt + l.clay)
  const c: RGB = [0, 0, 0]
  for (let k = 0; k < 3; k++) c[k] = (SAND[k] * l.sand + SILT[k] * l.silt + CLAY[k] * l.clay) / tot
  // SoilGrids runs ~25-60 g/kg in a chernozem's A horizon, ~10 in a sandy plough layer, ~1.5 at two metres
  const k = Math.pow(clamp01((l.soc - 1.2) / 26), 0.62)
  for (let i = 0; i < 3; i++) c[i] = c[i] + (HUMUS[i] - c[i]) * (0.04 + 0.86 * k)
  return c
}

export type StoneSpot = { face: 0 | 1; s: number; d: number; size: number }

/** The baked atlas, ATLAS_W × ATLAS_H: three RGBA images and the relief's height field (0 … 1 around 0.5). */
export type ProfileBake = {
  albedo: Uint8Array
  normal: Uint8Array
  data: Uint8Array
  height: Float32Array
}
/** relief amplitude, m: a height of 1 stands this far out of the cut */
export const RELIEF_AMP = 0.0035

/** what the bake needs from each horizon */
export type LayerInfo = {
  top: number // m
  col: RGB
  crumb: number
  blocky: number
  grain: number
  paw: number // 0..1 scaled
  pores: number
  amp: number // boundary waviness, m
}

export function layerInfo(layers: SoilLayer[]): LayerInfo[] {
  return layers.map((l, i) => {
    const tot = Math.max(1, l.sand + l.silt + l.clay)
    const sand = l.sand / tot
    const clay = l.clay / tot
    const topM = l.top / 100
    return {
      top: topM,
      col: horizonColor(l),
      // humic topsoil crumbs; clay builds blocky peds; sand stays single-grained
      crumb: sstep(3, 14, l.soc) * (topM < 0.35 ? 1 : 0.35),
      blocky: sstep(0.14, 0.34, clay) * (topM < 0.1 ? 0.4 : 1),
      grain: sstep(0.42, 0.8, sand),
      paw: clamp01((Number.isFinite(l.paw) ? l.paw : 0.12) / 0.24),
      pores: 0.25 + 0.75 * sstep(2, 18, l.soc) - 0.15 * clay,
      amp: i === 0 ? 0 : 0.012 + 0.025 * sstep(0.2, 1.2, topM) + 0.015 * clay,
    }
  })
}

type Region = { cols: number; c0: number; width: number }

/**
 * Bake the atlas. `column(i)` gives an atlas column's plan position (x, z), its metric surface coordinate s and its
 * region (0, 1 the cut faces, 2 the skin) with the region's metric width. Yields between row bands so the page keeps
 * its frame rate while the field's core is being built.
 */
export async function bakeProfile(o: {
  layers: SoilLayer[]
  seed: number
  coreH: number
  column: (i: number) => { x: number; z: number; s: number; region: 0 | 1 | 2; width: number }
  stones: StoneSpot[]
  cancelled?: () => boolean
  /** how long to work before letting the thread breathe (the main thread: a frame or so; a worker: never) */
  yieldMs?: number
}): Promise<ProfileBake | null> {
  const W = ATLAS_W
  const H = ATLAS_H
  const L = layerInfo(o.layers)
  const { n2, fbm } = makeNoise(o.seed)
  const r = rng(o.seed ^ 0x9e3779b9)
  const alb = new Uint8Array(W * H * 4)
  const dat = new Uint8Array(W * H * 4)
  const hgt = new Float32Array(W * H)
  const dm = o.coreH / H // metres per row

  // per column: its surface coordinate and the waviness of every boundary there (the same at a shared edge)
  const colS = new Float32Array(W)
  const colReg = new Uint8Array(W)
  const colW = new Float32Array(W)
  const bound = L.map(() => new Float32Array(W))
  for (let i = 0; i < W; i++) {
    const c = o.column(i)
    colS[i] = c.s
    colReg[i] = c.region
    colW[i] = c.width
    for (let k = 1; k < L.length; k++) {
      const w = fbm(c.x * 4.2 + k * 3.1, c.z * 4.2 - k * 1.7, 3) - 0.5
      const w2 = n2(c.x * 23 + k * 9.3, c.z * 23) - 0.5
      bound[k][i] = L[k].top + L[k].amp * (w * 2.2 + w2 * 0.6)
    }
  }
  let lastYield = performance.now()
  const yieldMs = o.yieldMs ?? 24
  const breathe = async () => {
    if (performance.now() - lastYield > yieldMs) {
      // a message-channel yield: not clamped like a nested setTimeout
      await new Promise<void>((res) => {
        const ch = new MessageChannel()
        ch.port1.onmessage = () => res()
        ch.port2.postMessage(0)
      })
      lastYield = performance.now()
    }
    return !o.cancelled?.()
  }

  for (let j = 0; j < H; j++) {
    if (!(await breathe())) return null
    const d = (H - 1 - j + 0.5) * dm // row 0 is v = 0, the bottom of the core
    for (let i = 0; i < W; i++) {
      const reg = colReg[i]
      const s = colS[i]
      // which horizon: wavy boundaries with an interfingered transition of a few centimetres
      let k = 0
      for (let q = 1; q < L.length; q++) if (d >= bound[q][i] - 0.025) k = q
      if (k > 0) {
        const b = bound[k][i]
        const t = sstep(b - 0.022, b + 0.022, d)
        const nn = n2(s * 180 + 7, d * 140) * 0.7 + n2(s * 31, d * 26) * 0.3
        if (nn > t) k -= 1
      }
      const ly = L[k]
      let h = 0.5
      let wet = 0 // where water sits and runs: pores, burrows, cracks
      let quartz = 0
      const skin = reg === 2
      // mottling: a cut face is never one flat colour
      const mot = fbm(s * 9 + reg * 11, d * 7, 3)
      let shade = 0.88 + 0.26 * mot
      // blocky peds: cells a few centimetres across, taller than wide deeper down, dark cracks between, each ped's face
      // a little brighter or darker (it faces the light differently)
      if (ly.blocky > 0.03 && !skin) {
        const ped = 0.022 + 0.018 * sstep(0.3, 1.4, d)
        voronoi(s / ped, d / (ped * (1 + 0.6 * sstep(0.5, 1.5, d))), 31 + k)
        const crack = (1 - sstep(0.02, 0.07, vF2 - vF1)) * sstep(0.35, 0.65, n2(s * 60 + 5, d * 60))
        h += ly.blocky * ((vId - 0.5) * 0.3 - crack * 0.5)
        shade *= 1 + ly.blocky * ((vId - 0.5) * 0.12 - crack * 0.25)
        wet = Math.max(wet, crack * ly.blocky)
      }
      // crumb: rounded aggregates of a few millimetres, a dark gap around each
      if (ly.crumb > 0.03 && !skin) {
        const cell = 0.0055 + 0.0025 * n2(s * 40, d * 40)
        voronoi(s / cell, d / cell, 53 + k)
        const bump = 1 - Math.min(1, vF1 * 1.35) ** 2
        const gap = 1 - sstep(0.04, 0.16, vF2 - vF1)
        h += ly.crumb * (bump * 0.55 - gap * 0.6)
        shade *= 1 + ly.crumb * ((vId - 0.5) * 0.22 + bump * 0.08 - gap * 0.5)
        wet = Math.max(wet, gap * ly.crumb * 0.7)
      }
      // sand: loose grains, a fine speckle and the odd bright quartz grain
      if (ly.grain > 0.03) {
        const g = n2(s * 900, d * 900)
        h += ly.grain * (g - 0.5) * 0.35
        shade *= 1 + ly.grain * (g - 0.5) * 0.16
        if (hash3(i, j, 99) < 0.012 * ly.grain) {
          quartz = 1
          shade *= 1.45
        }
      }
      // the general crumble of a hand-prepared face
      h += (fbm(s * 70, d * 60, 2) - 0.5) * 0.5
      if (!skin) {
        // pores: small dark round holes, more in a humic, biologically busy horizon
        const pc = 0.006
        const px = Math.floor(s / pc)
        const py = Math.floor(d / pc)
        if (hash3(px, py, 71 + reg) < 0.16 * ly.pores) {
          const cx = (px + 0.25 + 0.5 * hash3(px, py, 72)) * pc
          const cy = (py + 0.25 + 0.5 * hash3(px, py, 73)) * pc
          const rr = pc * (0.08 + 0.17 * hash3(px, py, 74))
          const dd = Math.hypot(s - cx, d - cy)
          if (dd < rr) {
            const pf = 1 - dd / rr
            h -= 0.9 * Math.sqrt(pf)
            shade *= 0.45 + 0.4 * (1 - pf)
            wet = 1
          }
        }
      } else {
        // the skin: smeared by the tube, faint vertical scratches
        const sc = n2(s * 380, d * 3)
        h += (sc - 0.5) * 0.5
        shade *= 0.94 + 0.08 * sc
      }
      // the surface crust: the first centimetre is darker
      if (d < 0.012) shade *= 0.78 + 0.22 * (d / 0.012)
      const idx = j * W + i
      hgt[idx] = h
      const p = idx * 4
      alb[p] = Math.min(255, ly.col[0] * shade * 255)
      alb[p + 1] = Math.min(255, ly.col[1] * shade * 255)
      alb[p + 2] = Math.min(255, ly.col[2] * shade * 255)
      alb[p + 3] = 255
      dat[p] = ly.paw * 255
      dat[p + 1] = clamp01(wet) * 255
      dat[p + 2] = quartz * 255
      dat[p + 3] = 255
    }
  }

  // ---- stamped features: burrows, root channels, stone contact shadows ----
  const regions: Region[] = [
    { cols: FACE_COLS, c0: 0, width: colW[0] },
    { cols: FACE_COLS, c0: FACE_COLS, width: colW[FACE_COLS] },
    { cols: W - 2 * FACE_COLS, c0: 2 * FACE_COLS, width: colW[2 * FACE_COLS] },
  ]
  /** paint a soft disc at (s in the region's metres, d) */
  const stamp = (reg: Region, s: number, d: number, rad: number, fn: (idx: number, f: number) => void) => {
    const sx = reg.width / reg.cols
    const ci = s / sx
    const rj = H - 1 - d / dm
    const ri = rad / sx
    const rr = rad / dm
    for (let jj = Math.floor(rj - rr - 1); jj <= Math.ceil(rj + rr + 1); jj++) {
      if (jj < 0 || jj >= H) continue
      for (let ii = Math.floor(ci - ri - 1); ii <= Math.ceil(ci + ri + 1); ii++) {
        if (ii < 0 || ii >= reg.cols) continue
        const dx = (ii - ci) * sx
        const dy = (jj - rj) * dm
        const f = 1 - Math.hypot(dx, dy) / rad
        if (f > 0) fn(jj * W + reg.c0 + ii, f)
      }
    }
  }
  const top = L[0].col
  const soc0 = o.layers[0]?.soc ?? 8
  for (const reg of regions.slice(0, 2)) {
    if (!(await breathe())) return null
    // earthworm burrows: in a living topsoil they run down into the subsoil and fill with dark topsoil (krotovinas)
    const nb = Math.round(4 + 10 * sstep(4, 20, soc0))
    for (let b = 0; b < nb; b++) {
      let s = (0.08 + 0.84 * r()) * reg.width
      let d = 0.02 + 0.3 * r()
      const len = 0.25 + 0.8 * r()
      const rad = 0.0022 + 0.0028 * r()
      let ang = (r() - 0.5) * 0.6
      for (let w = 0; w < len; w += 0.0012) {
        ang += (r() - 0.5) * 0.08 - ang * 0.01
        s = Math.min(reg.width - 0.01, Math.max(0.01, s + Math.sin(ang) * 0.0012))
        d += Math.cos(ang) * 0.0012
        if (d > o.coreH - 0.02) break
        stamp(reg, s, d, rad * 1.35, (idx, f) => {
          const p = idx * 4
          if (f > 0.26) {
            const k = 0.62 + 0.3 * hash3(idx, 0, 5)
            alb[p] = Math.min(alb[p], top[0] * 255 * k)
            alb[p + 1] = Math.min(alb[p + 1], top[1] * 255 * k)
            alb[p + 2] = Math.min(alb[p + 2], top[2] * 255 * k)
            hgt[idx] = Math.min(hgt[idx], 0.5 - 0.5 * Math.sqrt(f))
            dat[p + 1] = 255
          } else {
            // the burrow's lining: pressed smooth, a little paler
            alb[p] = Math.min(255, alb[p] * 1.06 + 4)
            alb[p + 1] = Math.min(255, alb[p + 1] * 1.06 + 3)
            alb[p + 2] = Math.min(255, alb[p + 2] * 1.05 + 2)
          }
        })
      }
    }
    // old root channels: thin dark threads, mostly vertical, deep
    for (let c = 0; c < 26; c++) {
      let s = (0.05 + 0.9 * r()) * reg.width
      let d = 0.05 + 0.6 * r() * r()
      const len = 0.15 + 1.1 * r()
      const rad = 0.0007 + 0.0009 * r()
      let ang = (r() - 0.5) * 0.9
      for (let w = 0; w < len; w += 0.001) {
        ang += (r() - 0.5) * 0.12 - ang * 0.02
        s = Math.min(reg.width - 0.005, Math.max(0.005, s + Math.sin(ang) * 0.001))
        d += Math.cos(ang) * 0.001
        if (d > o.coreH - 0.02) break
        stamp(reg, s, d, rad, (idx, f) => {
          const p = idx * 4
          const k = 1 - 0.55 * f
          alb[p] *= k
          alb[p + 1] *= k
          alb[p + 2] *= k
          hgt[idx] -= 0.5 * f
          dat[p + 1] = Math.max(dat[p + 1], 200 * f)
        })
      }
    }
  }
  // stones sit in their own little hollow and throw a contact darkness around them
  for (const st of o.stones) {
    stamp(regions[st.face], st.s, st.d, st.size * 1.9, (idx, f) => {
      const p = idx * 4
      const k = 1 - 0.5 * f * f
      alb[p] *= k
      alb[p + 1] *= k
      alb[p + 2] *= k
      hgt[idx] -= 0.4 * f * f
    })
  }
  if (!(await breathe())) return null

  // ---- normals from the height field (per region, metric) ----
  const nor = new Uint8Array(W * H * 4)
  const AMP = RELIEF_AMP
  for (let j = 0; j < H; j++) {
    if ((j & 63) === 0 && !(await breathe())) return null
    const j0 = Math.max(0, j - 1)
    const j1 = Math.min(H - 1, j + 1)
    for (let i = 0; i < W; i++) {
      const reg = i < FACE_COLS ? regions[0] : i < 2 * FACE_COLS ? regions[1] : regions[2]
      const i0 = Math.max(reg.c0, i - 1)
      const i1 = Math.min(reg.c0 + reg.cols - 1, i + 1)
      const sx = reg.width / reg.cols
      const dx = ((hgt[j * W + i1] - hgt[j * W + i0]) * AMP) / ((i1 - i0) * sx)
      const dy = ((hgt[j1 * W + i] - hgt[j0 * W + i]) * AMP) / ((j1 - j0) * dm)
      const inv = 1 / Math.hypot(dx, dy, 1)
      const p = (j * W + i) * 4
      nor[p] = (-dx * inv * 0.5 + 0.5) * 255
      nor[p + 1] = (-dy * inv * 0.5 + 0.5) * 255
      nor[p + 2] = (inv * 0.5 + 0.5) * 255
      nor[p + 3] = 255
    }
  }

  return { albedo: alb, normal: nor, data: dat, height: hgt }
}

export type SurfaceOptions = { tile: number; size?: number; dryness?: number }

/**
 * A tiling image pair for a crumbly soil surface (albedo + normal, RGBA, `size` square), `tile` metres across: the
 * field's dry topsoil, or the core's own top.
 */
export function surfaceArrays(seed: number, soil: RGB, o: SurfaceOptions): { map: Uint8Array; normal: Uint8Array; size: number } {
  const N = o.size ?? 512
  const dryK = o.dryness ?? 1.3
  const { n2 } = makeNoise(seed + 5)
  const alb = new Uint8Array(N * N * 4)
  const hg = new Float32Array(N * N)
  // a dry surface is paler than the moist cut
  const dry: RGB = [soil[0] * dryK + 0.02, soil[1] * dryK + 0.02, soil[2] * dryK + 0.02]
  const cr = Math.round(40 * o.tile) // crumbs across the tile
  const cl = Math.round(9 * o.tile) // clods across the tile
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const fx = i / N
      const fy = j / N
      voronoi(fx * cr, fy * cr, 5, cr)
      const crumb = 1 - Math.min(1, vF1 * 1.3) ** 2
      const gap = 1 - sstep(0.03, 0.15, vF2 - vF1)
      const cid = vId
      voronoi(fx * cl, fy * cl, 9, cl)
      const clod = 1 - Math.min(1, vF1 * 1.1) ** 1.5
      const cgap = 1 - sstep(0.02, 0.12, vF2 - vF1)
      const lid = vId
      const fine = n2(fx * 256, fy * 256)
      const h = clod * 0.9 + crumb * 0.35 - gap * 0.3 - cgap * 0.6 + fine * 0.15
      hg[j * N + i] = h
      const sh = (0.6 + 0.4 * clod) * (1 - 0.4 * gap) * (1 - 0.5 * cgap) * (0.88 + 0.24 * lid) * (0.93 + 0.14 * cid) * (0.94 + 0.12 * fine)
      const p = (j * N + i) * 4
      alb[p] = Math.min(255, dry[0] * sh * 255)
      alb[p + 1] = Math.min(255, dry[1] * sh * 255)
      alb[p + 2] = Math.min(255, dry[2] * sh * 255)
      alb[p + 3] = 255
    }
  const nor = new Uint8Array(N * N * 4)
  const px = o.tile / N
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const hx = ((hg[j * N + ((i + 1) % N)] - hg[j * N + ((i + N - 1) % N)]) * 0.006) / (2 * px)
      const hy = ((hg[((j + 1) % N) * N + i] - hg[((j + N - 1) % N) * N + i]) * 0.006) / (2 * px)
      const inv = 1 / Math.hypot(hx, hy, 1)
      const p = (j * N + i) * 4
      nor[p] = (-hx * inv * 0.5 + 0.5) * 255
      nor[p + 1] = (-hy * inv * 0.5 + 0.5) * 255
      nor[p + 2] = (inv * 0.5 + 0.5) * 255
      nor[p + 3] = 255
    }
  return { map: alb, normal: nor, size: N }
}
