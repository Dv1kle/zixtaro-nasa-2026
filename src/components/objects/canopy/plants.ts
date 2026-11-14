// The crops of the field crossing, plant by plant: real plants per family, each in two levels of detail - a full
// plant for the few metres around the lens (jointed stems, arched and twisted leaves folded on the midrib, ears built
// of spikelets with their awns, maize tassels and cobs, rapeseed racemes in flower, sunflower heads, trifoliate
// legumes, beet rosettes on their ridges) and a clump of simplified stems for the field beyond. Botanical colours, the
// crop's own UI colour only as a faint tint.
import * as THREE from 'three'
import { blade, C, flower, Geo, grain, lathe, mixC, perp, rng, ribbon, sstep, stick, tube, V, type Rand, type Vec } from './geo'

const TAU = Math.PI * 2
const UP = V(0, 1, 0)

export type Kind = 'cereal' | 'tall' | 'brassica' | 'sunflower' | 'bush' | 'rosette' | 'cover'

export type FieldSpec = {
  kind: Kind
  /** canopy height, m */
  H: number
  /** drill row spacing and the in-row step between full-detail instances, m */
  row: number
  step: number
  /** the far LOD: rows per clump row and steps per clump */
  row1: number
  step1: number
  /** narrow-drilled crops carry tramlines (the camera comes down one) */
  tramline: boolean
  /** random yaw of instances (sunflowers all face the sun) */
  yaw: number
  /** bend amplitude in the wind, rad */
  wind: number
  /** the canopy top seen from far away, and the soil */
  canopy: THREE.Color
  soil: THREE.Color
  /** radius of full detail around the lens, m */
  r0: number
  lod0: (r: Rand) => THREE.BufferGeometry
  lod1: (r: Rand) => THREE.BufferGeometry
}

type Crop = { id: string; color: string; family: string }

// ---------- cereals ----------

type CerealP = {
  H: number
  earLen: number
  n: number
  w: number
  awn: number
  nod: number
  rows6?: boolean
  panicle?: 'oats' | 'rice' | 'millet'
  straw: THREE.Color
  ear: THREE.Color
  awnC: THREE.Color
  leaf: THREE.Color
  leafDry: THREE.Color
}

/** an ear's axis: leaves the stem along its heading and bends over by `nod` (0 upright … 1 hanging) */
function earAxis(top: Vec, tan: Vec, L: number, nod: number, m = 6) {
  const hd = V(tan.x, 0, tan.z)
  if (hd.lengthSq() < 1e-6) hd.set(1, 0, 0)
  hd.normalize()
  const phi0 = Math.acos(Math.min(1, Math.max(-1, tan.y)))
  const phi1 = Math.max(phi0, nod * 1.95)
  const pts: Vec[] = [top.clone()]
  const tans: Vec[] = []
  const p = top.clone()
  for (let i = 0; i < m; i++) {
    const phi = phi0 + (phi1 - phi0) * Math.pow((i + 0.5) / m, 0.8)
    const d = hd.clone().multiplyScalar(Math.sin(phi)).addScaledVector(UP, Math.cos(phi))
    tans.push(d)
    p.addScaledVector(d, L / m)
    pts.push(p.clone())
  }
  tans.push(tans[m - 1].clone())
  const at = (t: number) => {
    const f = Math.min(m - 1e-6, t * m)
    const i = Math.floor(f)
    return { p: pts[i].clone().lerp(pts[i + 1], f - i), t: tans[i].clone().lerp(tans[i + 1], f - i).normalize() }
  }
  return at
}

function spike(g: Geo, r: Rand, P: CerealP, top: Vec, tan: Vec, lod: 0 | 1) {
  const L = P.earLen * (0.85 + 0.3 * r())
  const axis = earAxis(top, tan, L, P.nod * (0.8 + 0.4 * r()))
  g.ear = { base: top.clone(), len: L + P.awn }
  g.pinY = top.y
  const earC = P.ear.clone().multiplyScalar(0.92 + 0.16 * r())
  if (lod === 1) {
    // two long grains along the bent axis: at 10 m an ear is a bright spindle with a few awns
    for (const [a, b] of [
      [0.0, 0.55],
      [0.45, 1.0],
    ]) {
      const A = axis(a).p
      const B = axis(b).p
      grain(g, A.clone().lerp(B, 0.5), B.clone().sub(A), A.distanceTo(B) * 1.15, P.w * 0.5, 4, earC, 0.55, r() * TAU, P.w * 0.32)
    }
    if (P.awn > 0.02) {
      for (let k = 0; k < 3; k++) {
        const { p, t } = axis(0.3 + k * 0.3)
        stick(g, p, p.clone().addScaledVector(t.clone().add(perp(t).multiplyScalar(0.25 * (k - 1))).normalize(), P.awn * 0.9), 0.0012, 0, P.awnC, 1)
      }
    }
    g.ear = null
    g.pinY = null
    return
  }
  const rv = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
  for (let i = 0; i < P.n; i++) {
    const tt = (i + 0.5) / P.n
    const { p, t } = axis(tt)
    const sx = perp(t, rv)
    const nx = new THREE.Vector3().crossVectors(t, sx)
    const prof = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, tt * 1.05 + 0.08))
    const side = i % 2 ? 1 : -1
    const ls = (L / P.n) * 2.7
    const rs = P.w * 0.36 * prof
    const lanes: [Vec, number][] = [[sx, side]]
    if (P.rows6) lanes.push([nx, 1], [nx, -1])
    for (const [ax, sg] of lanes) {
      const c = p.clone().addScaledVector(ax, sg * P.w * 0.42 * prof)
      const d = t.clone().addScaledVector(ax, sg * 0.55).normalize()
      grain(g, c, d, ls, rs, 3, earC.clone().multiplyScalar(0.94 + 0.12 * r()), 0.6, r() * TAU, rs * 0.7)
      if (P.awn > 0) {
        const a0 = c.clone().addScaledVector(d, ls * 0.45)
        const ad = d.clone().multiplyScalar(0.28).addScaledVector(t, 0.72).add(V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.12)).normalize()
        const al = P.awn * (0.65 + 0.35 * r()) * (0.5 + 0.5 * prof)
        stick(g, a0, a0.clone().addScaledVector(ad, al), 0.00085, 0, P.awnC, 1, nx)
      }
    }
  }
  g.ear = null
  g.pinY = null
}

function panicle(g: Geo, r: Rand, P: CerealP, top: Vec, tan: Vec, lod: 0 | 1) {
  const droop = P.panicle === 'rice' ? 0.95 : P.panicle === 'millet' ? 0.8 : 0.45
  const L = P.earLen * (0.85 + 0.3 * r())
  const axis = earAxis(top, tan, L, droop)
  g.ear = { base: top.clone(), len: L * 1.3 }
  g.pinY = top.y
  const earC = P.ear.clone().multiplyScalar(0.92 + 0.16 * r())
  const twig = P.straw.clone().multiplyScalar(0.9)
  const nW = lod ? 2 : 5
  for (let k = 0; k < nW; k++) {
    const tt = 0.12 + (0.86 * k) / nW
    const { p, t } = axis(tt)
    const nb = lod ? 2 : P.panicle === 'oats' ? 3 : 4
    for (let b = 0; b < nb; b++) {
      const a = r() * TAU
      const out = perp(t, V(Math.cos(a), 0.2, Math.sin(a)))
      const blen = (P.panicle === 'oats' ? 0.08 : 0.06) * (1.15 - tt * 0.6) * (0.8 + 0.4 * r())
      const dir = out.multiplyScalar(0.85).addScaledVector(t, 0.25).add(V(0, -(0.15 + droop * 0.55), 0)).normalize()
      const mid = p.clone().addScaledVector(dir, blen * 0.5).add(V(0, blen * 0.12, 0))
      const end = p.clone().addScaledVector(dir, blen)
      stick(g, p, mid, 0.0007, 0.0005, twig, 0.5)
      stick(g, mid, end, 0.0005, 0.0003, twig, 0.5)
      if (P.panicle === 'oats') {
        // oat spikelets hang like little lanterns from the twig ends
        for (let s = 0; s < (lod ? 1 : 2); s++) {
          const at = end.clone().add(V((r() - 0.5) * 0.01, -0.01 - s * 0.006, (r() - 0.5) * 0.01))
          grain(g, at, V((r() - 0.5) * 0.3, -1, (r() - 0.5) * 0.3), 0.024, 0.0045, 3, earC, 0.75, r() * TAU, 0.0025)
        }
      } else {
        const ng = lod ? 2 : P.panicle === 'rice' ? 5 : 7
        for (let s = 0; s < ng; s++) {
          const f = 0.35 + (0.65 * s) / ng
          const at = p.clone().lerp(end, f).add(V((r() - 0.5) * 0.008, -0.004, (r() - 0.5) * 0.008))
          const sz = P.panicle === 'rice' ? 0.009 : 0.005
          grain(g, at, dir.clone().add(V(0, -0.6, 0)), sz, sz * 0.32, 3, earC, 0.6, r() * TAU)
        }
      }
    }
  }
  g.ear = null
  g.pinY = null
}

function cerealStem(g: Geo, r: Rand, P: CerealP, base: Vec, h: number, lean: number, la: number, lod: 0 | 1) {
  const lx = Math.cos(la) * lean * h
  const lz = Math.sin(la) * lean * h
  const top = V(base.x + lx, base.y + h, base.z + lz)
  const mid = V(base.x + lx * 0.32, base.y + h * 0.5, base.z + lz * 0.32)
  const segs = lod ? 2 : 6
  // the straw darkens at its nodes - a jointed stem, not a wire
  const strawC = (k: number) => P.straw.clone().multiplyScalar(Math.round(k * 6) % 2 ? 0.86 : 1.0)
  const { p, t } = tube(g, [base, mid, top], (k) => (lod ? 0.0034 : 0.0024) * (1 - 0.35 * k), 3, segs, strawC, 0.35)
  if (lod === 0) {
    const leaves: [number, number, number][] = [
      [0.16, 0.22, 1],
      [0.36, 0.22, 0.65],
      [0.58, 0.17, 0.25],
    ]
    for (const [k, len, dry] of leaves) {
      const i = Math.min(segs, Math.round(k * segs))
      const at = p[i].clone()
      const lc = mixC(P.leaf, P.leafDry, dry * (0.7 + 0.3 * r()))
      blade(g, at, r() * TAU, len * h * (0.85 + 0.3 * r()), 0.0062, {
        rise: 0.25 + 0.35 * r() * (1 - dry * 0.6),
        droop: 0.6 + 0.9 * dry + 0.4 * r(),
        twist: (r() - 0.5) * 3.2,
        fold: 0.4,
        segs: 6,
        // the tips dry first
        color: (u) => mixC(lc, P.leafDry.clone().multiplyScalar(0.9), sstep(0.55, 1, u)),
        thin: 0.8,
      })
    }
  } else if (r() < 0.6) {
    blade(g, p[1].clone(), r() * TAU, 0.18 * h, 0.007, { rise: 0.3, droop: 1.1, fold: 0, segs: 3, color: P.leafDry, thin: 0.8 })
  }
  const tan = t[segs]
  if (P.panicle) panicle(g, r, P, top, tan, lod)
  else spike(g, r, P, top, tan, lod)
}

function cereal(P: CerealP, lod: 0 | 1) {
  return (r: Rand) => {
    const g = new Geo(P.H)
    const n = lod ? 5 : 3
    for (let s = 0; s < n; s++) {
      const spread = lod ? 0.07 : 0.014
      const base = V((r() - 0.5) * spread, 0, (r() - 0.5) * spread * (lod ? 1.6 : 1))
      const h = P.H * (0.88 + 0.2 * r())
      cerealStem(g, r, P, base, h, 0.03 + 0.08 * r(), r() * TAU, lod)
    }
    return g.build()
  }
}

const CEREALS: Record<string, Partial<CerealP>> = {
  wheat: { H: 0.92, earLen: 0.085, n: 18, w: 0.011, awn: 0.014, nod: 0.12 },
  triticale: { H: 1.05, earLen: 0.1, n: 20, w: 0.012, awn: 0.04, nod: 0.18 },
  barley: { H: 0.8, earLen: 0.065, n: 16, w: 0.009, awn: 0.12, nod: 0.95, rows6: true, ear: C('#d6bd7e'), awnC: C('#efdca8') },
  rye: { H: 1.3, earLen: 0.11, n: 24, w: 0.008, awn: 0.055, nod: 0.35, ear: C('#bfa57a'), straw: C('#bba06a') },
  oats: { H: 1.0, earLen: 0.2, n: 0, w: 0.01, awn: 0, nod: 0.2, panicle: 'oats', ear: C('#dccb98'), leaf: C('#9c9c62') },
  rice: { H: 0.95, earLen: 0.2, n: 0, w: 0.01, awn: 0, nod: 0.9, panicle: 'rice', ear: C('#d3b45f'), leaf: C('#7d8f45'), straw: C('#a8a058') },
  millet: { H: 0.85, earLen: 0.18, n: 0, w: 0.01, awn: 0, nod: 0.8, panicle: 'millet', ear: C('#c9a45a') },
  fonio: { H: 0.55, earLen: 0.12, n: 0, w: 0.01, awn: 0, nod: 0.6, panicle: 'millet', ear: C('#c9a45a') },
}

function cerealSpec(crop: Crop): FieldSpec {
  const tint = C(crop.color)
  const base: CerealP = {
    H: 0.92,
    earLen: 0.085,
    n: 18,
    w: 0.011,
    awn: 0.014,
    nod: 0.12,
    straw: C('#c7a35e'),
    ear: C('#d9b065'),
    awnC: C('#e9d098'),
    leaf: C('#a89358'),
    leafDry: C('#86703f'),
  }
  const P: CerealP = { ...base, ...(CEREALS[crop.id] ?? CEREALS.wheat) }
  P.ear = P.ear.clone().lerp(tint, 0.06)
  P.straw = P.straw.clone().lerp(tint, 0.05)
  return {
    kind: 'cereal',
    H: P.H,
    row: 0.125,
    step: 0.1,
    row1: 0.25,
    step1: 0.24,
    tramline: true,
    yaw: TAU,
    wind: 0.13,
    canopy: P.ear.clone().multiplyScalar(0.72),
    soil: C('#3a2f22'),
    r0: 6.5,
    lod0: cereal(P, 0),
    lod1: cereal(P, 1),
  }
}

// ---------- tall C4 grasses: maize, sorghum, pearl millet, cane ----------

type TallP = { H: number; nL: number; leafLen: number; leafW: number; head: 'tassel' | 'plume' | 'candle' | 'none'; cob: boolean; green: THREE.Color; headC: THREE.Color }

function tall(P: TallP, lod: 0 | 1) {
  return (r: Rand) => {
    const g = new Geo(P.H + 0.3)
    g.stiff = 0.55
    const H = P.H * (0.9 + 0.18 * r())
    const bx = (r() - 0.5) * 0.12
    const bz = (r() - 0.5) * 0.12
    const at = (k: number) => V(bx * k * k, H * k, bz * k * k)
    const stalkC = (k: number) => mixC(P.green.clone().multiplyScalar(0.9), C('#a39457'), 0.35 - k * 0.3).multiplyScalar(Math.round(k * 9) % 2 ? 0.88 : 1)
    tube(g, [at(0), at(0.5), at(1)], (k) => 0.014 * (1 - 0.45 * k), lod ? 3 : 5, lod ? 3 : 9, stalkC, 0.25)
    const nL = lod ? Math.ceil(P.nL * 0.55) : P.nL
    const yaw0 = r() * TAU
    for (let i = 0; i < nL; i++) {
      const u = i / Math.max(1, nL - 1)
      const k = 0.1 + 0.74 * u
      const len = P.leafLen * (0.5 + 0.5 * Math.sin(Math.PI * (0.18 + 0.72 * u))) * (0.85 + 0.3 * r())
      const old = sstep(0.25, 0, u)
      const lc = mixC(P.green.clone().multiplyScalar(0.92 + 0.16 * r()), C('#9c8a4a'), old * 0.8)
      blade(g, at(k), yaw0 + (i % 2) * Math.PI + (r() - 0.5) * 0.7, len, P.leafW * (0.8 + 0.3 * r()), {
        rise: 0.6 - 0.3 * u + 0.15 * r(),
        droop: 1.0 + 0.6 * r() + old,
        twist: (r() - 0.5) * 1.4,
        fold: 0.28,
        segs: lod ? 4 : 10,
        wave: lod ? 0 : 0.005,
        lift: 0.2,
        color: (t) => mixC(lc, C('#a08a52'), sstep(0.8, 1, t) * 0.8),
        thin: 0.9,
      })
    }
    const top = at(1)
    const tan = at(1).sub(at(0.9)).normalize()
    g.ear = { base: top.clone(), len: 0.35 }
    g.pinY = top.y
    if (P.head === 'tassel') {
      const tip = top.clone().addScaledVector(tan, 0.3)
      stick(g, top, tip, 0.003, 0.0008, P.headC, 0.6)
      const nb = lod ? 3 : 9
      for (let b = 0; b < nb; b++) {
        const a = r() * TAU
        const s = top.clone().addScaledVector(tan, 0.03 + 0.12 * r())
        const out = V(Math.cos(a), 0.0, Math.sin(a))
        const m = s.clone().addScaledVector(out, 0.08).add(V(0, 0.04, 0))
        const e = m.clone().addScaledVector(out, 0.08).add(V(0, -0.06 - 0.04 * r(), 0))
        stick(g, s, m, 0.0016, 0.0012, P.headC, 0.7)
        stick(g, m, e, 0.0012, 0, P.headC, 0.7)
      }
    } else if (P.head === 'plume' || P.head === 'candle') {
      const candle = P.head === 'candle'
      const hh = candle ? 0.26 : 0.2
      const rr = candle ? 0.022 : 0.045
      const n = lod ? 8 : candle ? 70 : 60
      for (let i = 0; i < n; i++) {
        const y = i / n
        const prof = candle ? 0.9 : Math.pow(Math.sin(Math.PI * (0.1 + y * 0.85)), 0.7)
        const a = i * 2.39996
        const c = top.clone().addScaledVector(tan, 0.02 + y * hh).add(V(Math.cos(a) * rr * prof, 0, Math.sin(a) * rr * prof))
        grain(g, c, V(Math.cos(a), 0.6, Math.sin(a)), lod ? 0.05 : 0.016, lod ? 0.02 : 0.007, 3, P.headC.clone().multiplyScalar(0.9 + 0.2 * r()), 0.4, a)
      }
    }
    g.ear = null
    g.pinY = null
    if (P.cob && lod === 0) {
      // the cob in its husk, standing off the stalk, its silk drying at the tip
      const k = 0.48
      const o = at(k)
      const out = V(Math.cos(yaw0 + Math.PI / 2), 0, Math.sin(yaw0 + Math.PI / 2))
      const d = out.clone().multiplyScalar(0.45).add(UP).normalize()
      g.pinY = o.y
      lathe(
        g,
        o.clone().addScaledVector(out, 0.012),
        d,
        [
          [0.006, 0],
          [0.02, 0.03],
          [0.027, 0.08],
          [0.023, 0.14],
          [0.011, 0.19],
          [0.002, 0.215],
        ],
        6,
        (t) => mixC(C('#8d9a55'), C('#b5a565'), t),
        0.6,
      )
      const tip = o.clone().addScaledVector(out, 0.012).addScaledVector(d, 0.215)
      for (let s = 0; s < 6; s++) {
        const a = r() * TAU
        stick(g, tip, tip.clone().add(V(Math.cos(a) * 0.03, 0.02 - 0.05 * r(), Math.sin(a) * 0.03)), 0.0012, 0, C('#8f5d38'), 0.9)
      }
      g.pinY = null
    }
    return g.build()
  }
}

const TALLS: Record<string, Partial<TallP>> = {
  maize: {},
  silagemaize: {},
  sorghum: { H: 1.6, nL: 9, leafLen: 0.7, head: 'plume', cob: false, headC: C('#8a5634') },
  foragesorghum: { H: 2.2, nL: 10, leafLen: 0.75, head: 'plume', cob: false, headC: C('#8a6a44') },
  pearlmillet: { H: 1.9, nL: 9, leafLen: 0.7, leafW: 0.03, head: 'candle', cob: false, headC: C('#9e8a5c') },
  sugarcane: { H: 2.8, nL: 14, leafLen: 1.1, leafW: 0.03, head: 'none', cob: false },
  quinoa: { H: 1.3, nL: 8, leafLen: 0.25, leafW: 0.04, head: 'plume', cob: false, headC: C('#a5603c'), green: C('#6e8a3c') },
}

function tallSpec(crop: Crop): FieldSpec {
  const P: TallP = { H: 2.1, nL: 11, leafLen: 0.85, leafW: 0.042, head: 'tassel', cob: true, green: C('#5a7d32'), headC: C('#b89c62'), ...(TALLS[crop.id] ?? {}) }
  return {
    kind: 'tall',
    H: P.H,
    row: 0.75,
    step: 0.18,
    row1: 0.75,
    step1: 0.3,
    tramline: false,
    yaw: TAU,
    wind: 0.08,
    canopy: P.green.clone().multiplyScalar(0.55),
    soil: C('#352a1e'),
    r0: 9,
    lod0: tall(P, 0),
    lod1: tall(P, 1),
  }
}

// ---------- rapeseed (and the other flowering oilseeds) ----------

function brassica(petal: THREE.Color, H0: number, lod: 0 | 1) {
  return (r: Rand) => {
    const g = new Geo(H0)
    g.stiff = 0.8
    const H = H0 * (0.88 + 0.22 * r())
    const stemC = C('#6c8a3c')
    const jx = (r() - 0.5) * 0.06
    const jz = (r() - 0.5) * 0.06
    const at = (k: number) => V(jx * k * k, H * k, jz * k * k)
    const main = tube(g, [at(0), at(0.5), at(1)], (k) => 0.006 * (1 - 0.55 * k), lod ? 3 : 4, lod ? 2 : 7, stemC, 0.4)
    const tips: [Vec, Vec][] = [[at(1), main.t[main.t.length - 1]]]
    const nb = lod ? 2 : 4
    for (let b = 0; b < nb; b++) {
      const k = 0.42 + (0.3 * b) / nb + r() * 0.05
      const s = at(k)
      const a = r() * TAU
      const out = V(Math.cos(a), 0, Math.sin(a))
      const tip = s.clone().addScaledVector(out, 0.1 + 0.1 * r()).add(V(0, (H - s.y) * (0.78 + 0.18 * r()), 0))
      const mid = s.clone().addScaledVector(out, 0.08).add(V(0, (tip.y - s.y) * 0.4, 0))
      const br = tube(g, [s, mid, tip], (u) => 0.0032 * (1 - 0.5 * u), 3, lod ? 2 : 5, stemC, 0.4)
      tips.push([tip, br.t[br.t.length - 1]])
    }
    for (const [tip, tan] of tips) {
      g.ear = { base: tip.clone().addScaledVector(tan, -0.12), len: 0.18 }
      if (lod === 0) {
        // the raceme: pods set below, open flowers in a dome above, buds at the very tip
        for (let k = 0; k < 7; k++) {
          const a = k * 2.39996 + r()
          const s = tip.clone().addScaledVector(tan, -0.03 - k * 0.016)
          const d = tan.clone().multiplyScalar(0.75).addScaledVector(V(Math.cos(a), 0, Math.sin(a)), 0.65).normalize()
          stick(g, s, s.clone().addScaledVector(d, 0.045 + 0.015 * r()), 0.0017, 0.0007, C('#86a04a'), 0.6)
        }
        for (let k = 0; k < 9; k++) {
          const a = k * 2.39996 + r()
          const rr = 0.012 + 0.016 * Math.sqrt(k / 9)
          const c = tip.clone().addScaledVector(tan, 0.012 - rr * 0.5).add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr))
          const d = tan.clone().multiplyScalar(0.7).addScaledVector(V(Math.cos(a), 0, Math.sin(a)), 0.7)
          flower(g, c, d, 4, 0.0105, 0.0045, 0.3, petal.clone().multiplyScalar(0.9 + 0.2 * r()), null, 1, r() * TAU)
        }
        for (let k = 0; k < 4; k++) grain(g, tip.clone().addScaledVector(tan, 0.022 + k * 0.004).add(V((r() - 0.5) * 0.01, 0, (r() - 0.5) * 0.01)), tan, 0.007, 0.0028, 3, C('#c7c04c'), 0.6)
      } else {
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + r()
          const c = tip.clone().add(V(Math.cos(a) * 0.012, 0.004, Math.sin(a) * 0.012))
          flower(g, c, tan.clone().addScaledVector(V(Math.cos(a), 0, Math.sin(a)), 0.6), 4, 0.018, 0.009, 0.25, petal, null, 1, r() * TAU)
        }
      }
      g.ear = null
    }
    if (lod === 0) {
      const leafC = C('#56784c')
      for (let i = 0; i < 3; i++) {
        blade(g, at(0.04 + i * 0.05), r() * TAU, 0.2 + 0.06 * r(), 0.035, {
          rise: 0.5,
          droop: 1.1,
          fold: 0.3,
          twist: (r() - 0.5) * 1.2,
          segs: 6,
          color: leafC.clone().multiplyScalar(0.85 + 0.25 * r()),
          thin: 0.7,
          // lobed, as a rapeseed leaf is
          w: (t) => 0.035 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6) * (0.75 + 0.25 * Math.sin(t * 19)),
        })
      }
      blade(g, at(0.35), r() * TAU, 0.08, 0.014, { rise: 0.8, droop: 0.5, segs: 3, color: leafC, thin: 0.7 })
    }
    return g.build()
  }
}

// ---------- sunflower ----------

function sunflower(sunHd: Vec, lod: 0 | 1) {
  return (r: Rand) => {
    const g = new Geo(1.9)
    g.stiff = 0.4
    const H = 1.75 * (0.9 + 0.2 * r())
    // mature heads nod: they face the sun's side, tipped down
    const tilt = 0.35 + 0.35 * r()
    const yawJ = (r() - 0.5) * 0.7
    const hd = sunHd.clone().applyAxisAngle(UP, yawJ)
    const face = hd.clone().multiplyScalar(Math.cos(tilt)).add(V(0, -Math.sin(tilt), 0)).normalize()
    const top = V(hd.x * 0.1, H, hd.z * 0.1)
    const stem = tube(
      g,
      [V(0, 0, 0), V(0, H * 0.55, 0), V(hd.x * 0.035, H * 0.92, hd.z * 0.035), top],
      (k) => 0.017 * (1 - 0.4 * k),
      lod ? 3 : 6,
      lod ? 3 : 10,
      (k) => mixC(C('#6b8436'), C('#8a8a48'), k * 0.4),
      0.2,
    )
    void stem
    g.pinY = top.y
    g.ear = { base: top.clone(), len: 0.3 }
    const c0 = top.clone().addScaledVector(face, 0.02)
    // back of the head: a green cup with its bracts; the face: a dark disc of florets, a ring of rays
    lathe(
      g,
      c0,
      face,
      lod
        ? [
            [0.02, -0.035],
            [0.11, 0.0],
            [0.08, 0.025],
            [0.0, 0.03],
          ]
        : [
            [0.015, -0.04],
            [0.065, -0.022],
            [0.1, -0.006],
            [0.118, 0.01],
            [0.1, 0.022],
            [0.06, 0.03],
            [0.0, 0.034],
          ],
      lod ? 6 : 16,
      (t) => (t < 0.5 ? mixC(C('#5b7432'), C('#4a6a2c'), t * 2) : mixC(C('#4a3018'), C('#2c1c0e'), (t - 0.5) * 2)),
      0.3,
    )
    const e1 = perp(face)
    const e2 = new THREE.Vector3().crossVectors(face, e1)
    const nP = lod ? 10 : 24
    const petal = C('#e5a32c')
    for (let k = 0; k < nP; k++) {
      const a = (k / nP) * TAU + r() * 0.1
      const out = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a))
      const rim = c0.clone().addScaledVector(out, 0.112).addScaledVector(face, 0.012)
      const len = 0.065 + 0.02 * r()
      if (lod) {
        stick(g, rim, rim.clone().addScaledVector(out, len), 0.012, 0, petal, 1)
        continue
      }
      ribbon(
        g,
        [rim, rim.clone().addScaledVector(out, len * 0.5).addScaledVector(face, 0.006), rim.clone().addScaledVector(out, len).addScaledVector(face, -0.008 - 0.012 * r())],
        (t) => 0.0105 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.9)), 0.6),
        e1.clone().multiplyScalar(-Math.sin(a)).addScaledVector(e2, Math.cos(a)),
        { segs: 3, fold: 0.25, twist: (r() - 0.5) * 0.6, color: petal.clone().multiplyScalar(0.9 + 0.2 * r()), thin: 1 },
      )
    }
    if (!lod) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * TAU
        const out = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a))
        const s = c0.clone().addScaledVector(out, 0.1).addScaledVector(face, -0.008)
        stick(g, s, s.clone().addScaledVector(out, 0.03).addScaledVector(face, -0.02), 0.006, 0, C('#55702e'), 0.6)
      }
    }
    g.pinY = null
    g.ear = null
    const nL = lod ? 4 : 12
    let yaw = r() * TAU
    for (let i = 0; i < nL; i++) {
      const u = i / nL
      yaw += 2.4
      const old = sstep(0.3, 0, u)
      const lc = mixC(C('#4c7030').multiplyScalar(0.9 + 0.2 * r()), C('#7d6e38'), old)
      const L = 0.3 * (0.75 + 0.4 * Math.sin(Math.PI * (0.2 + 0.7 * u)))
      blade(g, V(0, H * (0.1 + 0.75 * u), 0), yaw, L, 0.09, {
        rise: 0.35,
        droop: 1.2 + old * 1.5,
        fold: 0.25,
        twist: (r() - 0.5) * 0.8,
        segs: lod ? 3 : 6,
        color: lc,
        thin: 0.8,
        lift: 0.3,
        // a petiole, then a heart-shaped blade
        w: (t) => (t < 0.25 ? 0.004 : L * 0.42 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.2) / 0.8)), 0.55) * (1 - 0.3 * t)),
      })
    }
    return g.build()
  }
}

// ---------- legumes and other bushy crops ----------

type BushP = { H: number; leaf: 'tri' | 'pinnate' | 'simple'; leafLen: number; n: number; leafC: THREE.Color; extra?: 'pods' | 'bolls' | 'flowersW' | 'fruit' }

function leaflet(g: Geo, a: Vec, dir: Vec, L: number, hw: number, c: THREE.Color, segs: number, r: Rand) {
  const d = dir.clone().normalize()
  const side = perp(d, UP)
  ribbon(
    g,
    [a, a.clone().addScaledVector(d, L * 0.5).add(V(0, L * 0.06, 0)), a.clone().addScaledVector(d, L).add(V(0, -L * 0.15, 0))],
    (t) => hw * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + t)), 0.7) * (1.1 - 0.3 * t),
    side,
    { segs, fold: 0.22, twist: (r() - 0.5) * 0.8, color: c, thin: 0.8 },
  )
}

function bush(P: BushP, lod: 0 | 1) {
  return (r: Rand) => {
    const g = new Geo(P.H)
    g.stiff = 0.7
    const H = P.H * (0.85 + 0.3 * r())
    const stemC = C('#6f8240')
    const stems: { at: (k: number) => Vec }[] = []
    const jx = (r() - 0.5) * 0.08
    const jz = (r() - 0.5) * 0.08
    const main = (k: number) => V(jx * k, H * k * 0.95, jz * k)
    tube(g, [main(0), main(0.5), main(1)], (k) => 0.0045 * (1 - 0.5 * k), 3, lod ? 2 : 5, stemC, 0.4)
    stems.push({ at: main })
    for (let b = 0; b < (lod ? 1 : 3); b++) {
      const k0 = 0.15 + 0.25 * r()
      const s = main(k0)
      const a = r() * TAU
      const e = s.clone().add(V(Math.cos(a) * H * 0.3, H * (0.45 + 0.2 * r()), Math.sin(a) * H * 0.3))
      const m = s.clone().lerp(e, 0.5).add(V(Math.cos(a) * 0.03, -0.02, Math.sin(a) * 0.03))
      tube(g, [s, m, e], () => 0.0028, 3, lod ? 1 : 3, stemC, 0.4)
      stems.push({ at: (k: number) => (k < 0.5 ? s.clone().lerp(m, k * 2) : m.clone().lerp(e, (k - 0.5) * 2)) })
    }
    const n = lod ? Math.ceil(P.n * 0.4) : P.n
    for (let j = 0; j < n; j++) {
      const st = stems[j % stems.length]
      const a0 = st.at(0.3 + 0.7 * r())
      const yaw = r() * TAU
      const pd = V(Math.cos(yaw), 0.5 + 0.3 * r(), Math.sin(yaw)).normalize()
      const pl = P.leaf === 'simple' ? 0.06 : 0.05 + 0.04 * r()
      const e = a0.clone().addScaledVector(pd, pl)
      stick(g, a0, e, 0.0012, 0.0009, stemC, 0.5)
      const lc = P.leafC.clone().multiplyScalar(0.85 + 0.3 * r())
      const L = P.leafLen * (0.8 + 0.4 * r())
      const segs = lod ? 2 : 4
      const h = V(pd.x, 0, pd.z).normalize()
      if (P.leaf === 'tri') {
        leaflet(g, e, h.clone().add(V(0, 0.15, 0)), L, L * 0.33, lc, segs, r)
        leaflet(g, e, h.clone().applyAxisAngle(UP, 1.1).add(V(0, -0.1, 0)), L * 0.85, L * 0.3, lc, segs, r)
        leaflet(g, e, h.clone().applyAxisAngle(UP, -1.1).add(V(0, -0.1, 0)), L * 0.85, L * 0.3, lc, segs, r)
      } else if (P.leaf === 'pinnate') {
        const np = lod ? 1 : 3
        for (let q = 0; q < np; q++) {
          const s = a0.clone().lerp(e, 0.4 + 0.2 * q).addScaledVector(h, q * L * 0.5)
          leaflet(g, s, h.clone().applyAxisAngle(UP, 1.2).add(V(0, 0.1, 0)), L * 0.6, L * 0.22, lc, 2, r)
          leaflet(g, s, h.clone().applyAxisAngle(UP, -1.2).add(V(0, 0.1, 0)), L * 0.6, L * 0.22, lc, 2, r)
        }
      } else {
        leaflet(g, e, h.clone().add(V(0, 0.1, 0)), L, L * 0.48, lc, lod ? 3 : 5, r)
      }
    }
    if (lod === 0 && P.extra) {
      for (let k = 0; k < 6; k++) {
        const st = stems[k % stems.length]
        const a = st.at(0.35 + 0.5 * r())
        g.pinY = a.y
        if (P.extra === 'pods') grain(g, a.clone().add(V((r() - 0.5) * 0.03, -0.02, (r() - 0.5) * 0.03)), V(r() - 0.5, -1, r() - 0.5), 0.045, 0.006, 3, C('#9a9455'), 0.5)
        else if (P.extra === 'bolls') grain(g, a.clone().add(V(0, 0.02, 0)), UP, 0.04, 0.02, 4, C('#e8e2d4'), 0.5, r(), 0.016)
        else if (P.extra === 'fruit') grain(g, a.clone().add(V(0, -0.025, 0)), V(0, -1, 0), 0.03, 0.016, 4, C('#a8432a'), 0.4, r())
        else flower(g, a, V(r() - 0.5, 0.6, r() - 0.5), 5, 0.009, 0.004, 0.3, C('#e9e4dc'), C('#3a2a3a'), 0.9, r() * TAU)
        g.pinY = null
      }
    }
    return g.build()
  }
}

const BUSHES: Record<string, Partial<BushP>> = {
  soybean: { H: 0.8, leaf: 'tri', leafLen: 0.09, n: 12, leafC: C('#6e8a35'), extra: 'pods' },
  drybean: { H: 0.5, leaf: 'tri', leafLen: 0.09, n: 10, extra: 'pods' },
  cowpea: { H: 0.5, leaf: 'tri', leafLen: 0.1, n: 9, extra: 'pods' },
  pigeonpea: { H: 1.4, leaf: 'tri', leafLen: 0.08, n: 16, extra: 'pods' },
  groundnut: { H: 0.35, leaf: 'pinnate', leafLen: 0.07, n: 10 },
  bambara: { H: 0.3, leaf: 'tri', leafLen: 0.06, n: 9 },
  pea: { H: 0.6, leaf: 'pinnate', leafLen: 0.06, n: 12, extra: 'flowersW' },
  lentil: { H: 0.4, leaf: 'pinnate', leafLen: 0.03, n: 12 },
  chickpea: { H: 0.45, leaf: 'pinnate', leafLen: 0.03, n: 12, leafC: C('#6f8c4a') },
  vetch: { H: 0.5, leaf: 'pinnate', leafLen: 0.03, n: 12 },
  faba: { H: 1.0, leaf: 'pinnate', leafLen: 0.07, n: 12, leafC: C('#5f7f4e'), extra: 'flowersW' },
  lupin: { H: 0.7, leaf: 'simple', leafLen: 0.07, n: 12, extra: 'flowersW' },
  cotton: { H: 1.1, leaf: 'simple', leafLen: 0.11, n: 10, extra: 'bolls' },
  okra: { H: 1.2, leaf: 'simple', leafLen: 0.14, n: 9, extra: 'pods' },
  tobacco: { H: 1.4, leaf: 'simple', leafLen: 0.3, n: 8 },
  castor: { H: 1.6, leaf: 'simple', leafLen: 0.25, n: 7, leafC: C('#4f6a34') },
  chilli: { H: 0.6, leaf: 'simple', leafLen: 0.07, n: 12, extra: 'fruit' },
  tomato: { H: 0.7, leaf: 'pinnate', leafLen: 0.07, n: 12, extra: 'fruit' },
  sesame: { H: 1.1, leaf: 'simple', leafLen: 0.08, n: 12, extra: 'flowersW' },
  safflower: { H: 0.9, leaf: 'simple', leafLen: 0.06, n: 12 },
  linseed: { H: 0.7, leaf: 'pinnate', leafLen: 0.025, n: 12 },
  buckwheat: { H: 0.8, leaf: 'simple', leafLen: 0.06, n: 10, extra: 'flowersW' },
}

// ---------- rosettes: beet, potato, cabbage, onion, low vines ----------

type RosP = { H: number; n: number; petiole: number; bladeLen: number; bladeW: number; upright: number; ridge: boolean; leafC: THREE.Color; petC: THREE.Color; extra?: 'crown' | 'flowers' | 'head' | 'tubes' }

function rosette(P: RosP, soil: THREE.Color, step: number, lod: 0 | 1) {
  return (r: Rand) => {
    const g = new Geo(P.H)
    g.stiff = 0.5
    if (P.ridge) {
      // the ridge this plant stands on: a soil mound running along the row
      g.ao = false
      const L = step * (lod ? 2.2 : 1.1)
      const segA = 6
      const base = g.count
      for (let zi = 0; zi <= 1; zi++) {
        for (let a = 0; a <= segA; a++) {
          const u = a / segA
          const x = (u - 0.5) * 0.5
          const y = 0.11 * Math.pow(Math.cos((u - 0.5) * Math.PI), 1.4) - 0.005
          g.vert(V(x, y, (zi - 0.5) * L), soil.clone().multiplyScalar(0.75 + 0.35 * Math.cos((u - 0.5) * Math.PI)), 0)
        }
      }
      for (let a = 0; a < segA; a++) {
        g.tri(base + a, base + a + 1, base + segA + 1 + a)
        g.tri(base + a + 1, base + segA + 2 + a, base + segA + 1 + a)
      }
      g.ao = true
    }
    const y0 = P.ridge ? 0.1 : 0.01
    if (P.extra === 'tubes') {
      for (let i = 0; i < (lod ? 4 : 8); i++) {
        const a = r() * TAU
        const e = V(Math.cos(a) * 0.08, y0 + P.H * (0.7 + 0.3 * r()), Math.sin(a) * 0.08)
        tube(g, [V(0, y0, 0), V(e.x * 0.3, (y0 + e.y) * 0.5, e.z * 0.3), e], (k) => 0.005 * (1 - 0.7 * k), 3, lod ? 2 : 4, P.leafC, 0.8)
      }
      return g.build()
    }
    const n = lod ? Math.ceil(P.n * 0.45) : P.n
    for (let i = 0; i < n; i++) {
      const u = i / n
      const yaw = i * 2.39996 + r() * 0.4
      const up = P.upright * (1 - u * 0.45)
      const L = (P.petiole + P.bladeLen) * (0.75 + 0.4 * r()) * (1 - u * 0.25)
      const tp = P.petiole / (P.petiole + P.bladeLen)
      const lc = P.leafC.clone().multiplyScalar(0.85 + 0.3 * r())
      blade(g, V(0, y0, 0), yaw, L, P.bladeW, {
        rise: up,
        droop: 0.5 + 0.6 * u + 0.3 * r(),
        fold: 0.3,
        twist: (r() - 0.5) * 1.0,
        segs: lod ? 3 : 7,
        wave: lod ? 0 : 0.004,
        lift: 0.35,
        color: (t) => (t < tp ? mixC(P.petC, lc, t / tp) : lc),
        thin: 0.75,
        w: (t) => (t < tp ? 0.004 : P.bladeW * Math.pow(Math.sin(Math.PI * Math.min(1, (t - tp) / (1 - tp) + 0.05)), 0.6)),
      })
    }
    if (P.extra === 'crown') lathe(g, V(0, y0 - 0.03, 0), UP, [[0.0, 0], [0.05, 0.02], [0.055, 0.045], [0.0, 0.055]], lod ? 4 : 8, C('#cdb9a2'), 0.2)
    if (P.extra === 'head') lathe(g, V(0, y0, 0), UP, [[0.02, 0], [0.08, 0.04], [0.095, 0.1], [0.07, 0.16], [0.0, 0.18]], lod ? 5 : 10, C('#8aa37f'), 0.4)
    if (P.extra === 'flowers' && lod === 0) {
      for (let k = 0; k < 2; k++) {
        const a = r() * TAU
        const top = V(Math.cos(a) * 0.08, y0 + P.H * 1.05, Math.sin(a) * 0.08)
        stick(g, V(0, y0 + 0.1, 0), top, 0.0015, 0.001, C('#6f8240'), 0.4)
        g.pinY = top.y
        for (let f = 0; f < 4; f++) flower(g, top.clone().add(V((r() - 0.5) * 0.04, r() * 0.02, (r() - 0.5) * 0.04)), V(r() - 0.5, 1, r() - 0.5), 5, 0.012, 0.006, 0.2, C('#e6e0ea'), C('#d9b84a'), 0.9, r() * TAU)
        g.pinY = null
      }
    }
    return g.build()
  }
}

const ROSETTES: Record<string, Partial<RosP>> = {
  sugarbeet: { extra: 'crown' },
  potato: { H: 0.55, n: 10, petiole: 0.08, bladeLen: 0.22, bladeW: 0.045, upright: 1.1, ridge: true, leafC: C('#4d6e30'), petC: C('#6d8540'), extra: 'flowers' },
  sweetpotato: { H: 0.3, n: 12, petiole: 0.1, bladeLen: 0.1, bladeW: 0.05, upright: 0.5, ridge: true, leafC: C('#4f7234') },
  cassava: { H: 1.2, n: 10, petiole: 0.2, bladeLen: 0.18, bladeW: 0.03, upright: 1.4, ridge: true },
  yam: { H: 0.8, n: 10, petiole: 0.1, bladeLen: 0.14, bladeW: 0.06, upright: 1.2, ridge: true },
  taro: { H: 0.9, n: 6, petiole: 0.4, bladeLen: 0.35, bladeW: 0.16, upright: 1.6, ridge: false },
  cabbage: { H: 0.35, n: 12, petiole: 0.03, bladeLen: 0.22, bladeW: 0.1, upright: 0.7, ridge: false, leafC: C('#6f8f75'), petC: C('#9ab09a'), extra: 'head' },
  onion: { H: 0.45, n: 8, petiole: 0, bladeLen: 0.4, bladeW: 0.01, upright: 2, ridge: true, leafC: C('#5f7f4a'), extra: 'tubes' },
  watermelon: { H: 0.25, n: 12, petiole: 0.08, bladeLen: 0.14, bladeW: 0.06, upright: 0.4, ridge: false },
}

// ---------- cover, ley, fallow ----------

function cover(id: string, lod: 0 | 1) {
  const fallow = id === 'fallow'
  return (r: Rand) => {
    const g = new Geo(0.35)
    const n = lod ? 6 : 14
    for (let i = 0; i < n; i++) {
      const b = V((r() - 0.5) * (lod ? 0.25 : 0.12), 0, (r() - 0.5) * (lod ? 0.25 : 0.12))
      if (fallow && i % 2 === 0) {
        // last year's stubble, cut straw standing in the soil
        const h = 0.1 + 0.08 * r()
        tube(g, [b, b.clone().add(V((r() - 0.5) * 0.02, h * 0.5, 0)), b.clone().add(V((r() - 0.5) * 0.04, h, (r() - 0.5) * 0.02))], () => 0.0028, 3, 1, C('#b69a62'), 0.4)
        continue
      }
      if (!fallow && i % 4 === 3) {
        // clover among the grass
        const e = b.clone().add(V(0, 0.08 + 0.1 * r(), 0))
        stick(g, b, e, 0.001, 0.0008, C('#5d7a36'), 0.5)
        for (let k = 0; k < 3; k++) leaflet(g, e, V(Math.cos(k * 2.1 + r()), 0.2, Math.sin(k * 2.1 + r())), 0.025, 0.012, C('#4f7a34'), 2, r)
        continue
      }
      blade(g, b, r() * TAU, 0.14 + 0.16 * r(), 0.003, { rise: 1.4, droop: 0.9, fold: 0.3, twist: (r() - 0.5) * 2, segs: lod ? 2 : 4, color: fallow ? C('#7d7a3e') : C('#5f8236').multiplyScalar(0.85 + 0.3 * r()), thin: 0.85 })
    }
    return g.build()
  }
}

// ---------- the field's margins and its far edge ----------

/** a poppy or a cornflower among the crop (a few, in the gaps) */
export function wildflower(kind: 'poppy' | 'cornflower', H: number) {
  return (r: Rand) => {
    const g = new Geo(H)
    const h = kind === 'poppy' ? 0.62 + 0.18 * r() : 0.55 + 0.15 * r()
    const bend = V((r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.06)
    const top = V(bend.x, h, bend.z)
    const { t } = tube(g, [V(0, 0, 0), V(bend.x * 0.3, h * 0.55, bend.z * 0.3), top], () => 0.0018, 3, 4, C('#5f7a3a'), 0.4)
    g.pinY = top.y
    if (kind === 'poppy') {
      const face = t[t.length - 1].clone().add(V(r() - 0.5, 0.2, r() - 0.5).multiplyScalar(0.8)).normalize()
      flower(g, top, face, 4, 0.034, 0.024, 0.65, C('#c9472a'), C('#1c1512'), 1, r() * TAU)
      flower(g, top.clone().addScaledVector(face, 0.004), face, 4, 0.028, 0.02, 0.8, C('#b83c24'), C('#1c1512'), 1, r() * TAU + 0.8)
    } else {
      flower(g, top, t[t.length - 1].clone().add(V(0, 0.4, 0)), 9, 0.017, 0.0055, 0.15, C('#4d6fc8'), C('#2a3570'), 0.9, r() * TAU)
    }
    g.pinY = null
    for (let k = 0; k < 2; k++) blade(g, V(0, 0.05 + k * 0.12, 0), r() * TAU, 0.08, 0.008, { rise: 0.6, droop: 0.8, segs: 3, color: C('#55743a'), thin: 0.7 })
    return g.build()
  }
}

/** a tree of the far hedgerow: a short trunk and a crown of lumpy faceted masses (it stands in the haze) */
export function treeGeo(r: Rand, shrub: boolean) {
  const g = new Geo(12)
  g.ao = false
  const trunkH = shrub ? 0.6 : 2.2 + r() * 1.5
  tube(g, [V(0, 0, 0), V(0.1, trunkH * 0.5, 0), V(0.2, trunkH + 0.5, 0)], (k) => (shrub ? 0.12 : 0.28) * (1 - 0.4 * k), 4, 2, C('#2a2621'), 0)
  const nb = shrub ? 4 : 9 + Math.floor(r() * 5)
  const R = shrub ? 1.5 : 2.4 + r() * 1.2
  const crownY = trunkH + R * 0.9
  const ico = new THREE.IcosahedronGeometry(1, 1)
  const ip = ico.attributes.position as THREE.BufferAttribute
  for (let b = 0; b < nb; b++) {
    // masses of foliage: big ones low in the crown, small ones ragged at its edge
    const u = b / nb
    const c = V((r() - 0.5) * R * (1.7 - u * 0.6), crownY + (u - 0.35) * R * (shrub ? 0.5 : 1.5) + (r() - 0.5) * R * 0.4, (r() - 0.5) * R * 1.3)
    const rad = R * (0.62 - u * 0.3) * (0.7 + 0.4 * r())
    const base = g.count
    const sq = 0.8 + 0.25 * r()
    for (let i = 0; i < ip.count; i++) {
      const n = V(ip.getX(i), ip.getY(i), ip.getZ(i))
      const bump = 0.82 + 0.3 * Math.abs(Math.sin(n.x * 5.3 + b) * Math.cos(n.z * 4.1 + n.y * 3.7))
      const p = c.clone().add(n.multiplyScalar(rad * bump).multiply(V(1, sq, 1)))
      const shade = 0.65 + 0.45 * sstep(c.y - rad, c.y + rad, p.y)
      g.vert(p, C('#27331f').multiplyScalar(shade), 0.25)
    }
    for (let i = 0; i < ip.count; i += 3) g.tri(base + i, base + i + 1, base + i + 2)
  }
  ico.dispose()
  return g.build()
}

// ---------- the spec for a crop ----------

export function fieldSpec(crop: Crop, sunHd: Vec): FieldSpec {
  const id = crop.id
  if (CEREALS[id]) return cerealSpec(crop)
  if (TALLS[id]) return tallSpec(crop)
  if (crop.family === 'poaceae' && id !== 'grassley') return cerealSpec({ ...crop, id: 'wheat' })
  if (id === 'rapeseed' || id === 'linseed' || crop.family === 'brassicaceae' && id !== 'cabbage') {
    const petal = id === 'linseed' ? C('#6f86c8') : C('#efc63a')
    const H = id === 'linseed' ? 0.7 : 1.35
    return {
      kind: 'brassica',
      H,
      row: 0.25,
      step: 0.11,
      row1: 0.5,
      step1: 0.25,
      tramline: true,
      yaw: TAU,
      wind: 0.08,
      canopy: petal.clone().multiplyScalar(0.62),
      soil: C('#382c20'),
      r0: 7,
      lod0: brassica(petal, H, 0),
      lod1: brassica(petal, H, 1),
    }
  }
  if (id === 'sunflower') {
    return {
      kind: 'sunflower',
      H: 1.75,
      row: 0.75,
      step: 0.28,
      row1: 0.75,
      step1: 0.4,
      tramline: false,
      yaw: 0,
      wind: 0.05,
      canopy: C('#6f6a2a'),
      soil: C('#352a1e'),
      r0: 9,
      lod0: sunflower(sunHd, 0),
      lod1: sunflower(sunHd, 1),
    }
  }
  if (BUSHES[id] || crop.family === 'fabaceae' || crop.family === 'malvaceae' || crop.family === 'polygonaceae' || crop.family === 'pedaliaceae') {
    if (id === 'clover') return coverSpec(id)
    const P: BushP = { H: 0.7, leaf: 'tri', leafLen: 0.08, n: 11, leafC: C('#5f7e34'), ...(BUSHES[id] ?? {}) }
    return {
      kind: 'bush',
      H: P.H,
      row: P.H > 1 ? 0.75 : 0.45,
      step: 0.12,
      row1: P.H > 1 ? 0.75 : 0.45,
      step1: 0.28,
      tramline: false,
      yaw: TAU,
      wind: 0.07,
      canopy: P.leafC.clone().multiplyScalar(0.7),
      soil: C('#352a1f'),
      r0: 7,
      lod0: bush(P, 0),
      lod1: bush(P, 1),
    }
  }
  if (id === 'cover' || id === 'fallow' || id === 'grassley' || crop.family === 'mixed' || crop.family === 'none') return coverSpec(id)
  const soil = C('#3a2d20')
  const P: RosP = { H: 0.45, n: 14, petiole: 0.1, bladeLen: 0.22, bladeW: 0.06, upright: 1.0, ridge: false, leafC: C('#3f6a2c'), petC: C('#b89a86'), ...(ROSETTES[id] ?? {}) }
  const row = P.ridge ? 0.75 : 0.45
  const step = P.ridge ? 0.3 : 0.2
  return {
    kind: 'rosette',
    H: P.H,
    row,
    step,
    row1: row,
    step1: step * 2,
    tramline: false,
    yaw: TAU,
    wind: 0.05,
    canopy: P.leafC.clone().multiplyScalar(0.6),
    soil,
    r0: 8,
    lod0: rosette(P, soil, step, 0),
    lod1: rosette(P, soil, step * 2, 1),
  }
}

function coverSpec(id: string): FieldSpec {
  const fallow = id === 'fallow'
  return {
    kind: 'cover',
    H: 0.3,
    row: 0.2,
    step: 0.14,
    row1: 0.4,
    step1: 0.3,
    tramline: false,
    yaw: TAU,
    wind: 0.1,
    canopy: fallow ? C('#5a4e30') : C('#3f5a2a'),
    soil: C('#3a2d20'),
    r0: 6,
    lod0: cover(id, 0),
    lod1: cover(id, 1),
  }
}

export { rng }
