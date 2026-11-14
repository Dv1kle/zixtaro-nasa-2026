// The field's plant builder: one plant (or a clump of them) as a single indexed geometry carrying what the field's
// material reads - a colour with the ground's occlusion baked in, and `aWind` (how far this vertex swings in the wind,
// in metres per radian of bend; how much it lags as part of a nodding ear; how thin the tissue is, i.e. how much low
// sun passes through it). Primitives write straight into flat arrays: no intermediate BufferGeometries, so a field's
// worth of prototypes builds in a few milliseconds.
import * as THREE from 'three'

export type Vec = THREE.Vector3
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
export type Rand = () => number
export type Tint = THREE.Color | ((t: number) => THREE.Color)

/** deterministic, so the same field looks the same on every visit */
export function rng(seed: number): Rand {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
export const C = (c: THREE.ColorRepresentation) => new THREE.Color(c)
export const mixC = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, clamp(t))

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()

export class Geo {
  pos: number[] = []
  col: number[] = []
  wnd: number[] = []
  idx: number[] = []
  /** a nodding ear in progress: vertices lag the stem by their distance from its base */
  ear: { base: Vec; len: number } | null = null
  /** a part hung from a point (an ear, a cob, a head): it swings as one with that point */
  pinY: number | null = null
  /** occlusion toward the ground (off for soil pieces) */
  ao = true
  /** how far the plant's own height bends (stiff stalks less) */
  stiff = 1
  constructor(readonly H: number) {}

  get count() {
    return this.pos.length / 3
  }

  vert(p: Vec, c: THREE.Color, thin: number) {
    this.pos.push(p.x, p.y, p.z)
    const y = Math.max(0, p.y)
    // light reaches into a canopy only from the top: the lower stems sink into shade
    const k = this.ao ? 0.1 + 0.9 * Math.pow(sstep(0.05, 1.0, y / this.H), 1.5) : 1
    this.col.push(c.r * k, c.g * k, c.b * k)
    const wy = this.pinY !== null ? Math.max(y, this.pinY) : y
    const w = Math.pow(clamp(wy / this.H), 1.6) * this.H * this.stiff
    const lag = this.ear ? clamp(p.distanceTo(this.ear.base) / this.ear.len) : 0
    this.wnd.push(w, lag, thin)
    return this.count - 1
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c)
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wnd, 3))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

const tint = (t: Tint, k: number) => (typeof t === 'function' ? t(k) : t)

/** a smooth path through points (centripetal Catmull-Rom), sampled at `n + 1` evenly spaced parameters */
export function path(pts: Vec[], n: number): { p: Vec[]; t: Vec[] } {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const p: Vec[] = []
  const t: Vec[] = []
  for (let i = 0; i <= n; i++) {
    p.push(curve.getPoint(i / n))
    t.push(curve.getTangent(i / n).normalize())
  }
  return { p, t }
}

/** any unit vector perpendicular to `d` */
export function perp(d: Vec, hint = V(0, 1, 0)) {
  const s = new THREE.Vector3().crossVectors(d, hint)
  if (s.lengthSq() < 1e-6) s.crossVectors(d, V(1, 0, 0))
  return s.normalize()
}

/** a stalk: a tapering tube of `sides` facets along a path; its colour runs base → tip */
export function tube(g: Geo, pts: Vec[], r: (t: number) => number, sides: number, segs: number, color: Tint, thin = 0.15) {
  const { p, t } = path(pts, segs)
  let nrm = perp(t[0], V(0, 0, 1))
  const start = g.count
  for (let i = 0; i <= segs; i++) {
    const k = i / segs
    if (i > 0) {
      // parallel transport: no twisting of the facets along a bent stem
      nrm.addScaledVector(t[i], -nrm.dot(t[i])).normalize()
    }
    const bin = tmpA.crossVectors(t[i], nrm).normalize().clone()
    const rr = Math.max(1e-5, r(k))
    const c = tint(color, k)
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2
      const v = p[i].clone().addScaledVector(nrm, Math.cos(a) * rr).addScaledVector(bin, Math.sin(a) * rr)
      g.vert(v, c, thin)
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < sides; j++) {
      const a = start + i * sides + j
      const b = start + i * sides + ((j + 1) % sides)
      g.tri(a, a + sides, b)
      g.tri(b, a + sides, b + sides)
    }
  }
  return { p, t }
}

/**
 * a blade or a leaf: three vertices across (edge, midrib, edge), folded along the midrib into a shallow V, twisting
 * along its run; `wave` ruffles the margin (maize), `w(t)` is the half-width along the run
 */
export function ribbon(
  g: Geo,
  pts: Vec[],
  w: (t: number) => number,
  side0: Vec,
  o: { segs: number; fold?: number; twist?: number; wave?: number; waveN?: number; color: Tint; thin: number },
) {
  const { p, t } = path(pts, o.segs)
  const start = g.count
  const q = new THREE.Quaternion()
  for (let i = 0; i <= o.segs; i++) {
    const k = i / o.segs
    const s = side0.clone().addScaledVector(t[i], -side0.dot(t[i]))
    if (s.lengthSq() < 1e-8) s.copy(perp(t[i]))
    s.normalize()
    if (o.twist) s.applyQuaternion(q.setFromAxisAngle(t[i], o.twist * k))
    const n = tmpB.crossVectors(t[i], s).normalize()
    const ww = Math.max(0, w(k))
    const f = (o.fold ?? 0) * ww
    const wv = o.wave ? Math.sin(k * (o.waveN ?? 14) * Math.PI) * o.wave * Math.min(1, ww * 30) : 0
    const c = tint(o.color, k)
    // the edges a shade lighter than the midrib: a leaf reads as a leaf, not a flat strip
    const ce = c.clone().multiplyScalar(1.08)
    g.vert(p[i].clone().addScaledVector(s, -ww).addScaledVector(n, f + wv), ce, o.thin)
    g.vert(p[i].clone(), c.clone().multiplyScalar(0.9), o.thin)
    g.vert(p[i].clone().addScaledVector(s, ww).addScaledVector(n, f - wv), ce, o.thin)
  }
  for (let i = 0; i < o.segs; i++) {
    const a = start + i * 3
    const b = a + 3
    g.tri(a, b, a + 1)
    g.tri(b, b + 1, a + 1)
    g.tri(a + 1, b + 1, a + 2)
    g.tri(b + 1, b + 2, a + 2)
  }
}

/** a grass-type blade leaving a stem at `base`, heading out along `yaw`: rises, arches over and droops */
export function blade(
  g: Geo,
  base: Vec,
  yaw: number,
  len: number,
  halfW: number,
  o: { rise: number; droop: number; twist?: number; fold?: number; segs?: number; wave?: number; color: Tint; thin: number; lift?: number; w?: (t: number) => number },
) {
  const dx = Math.sin(yaw)
  const dz = Math.cos(yaw)
  const pts: Vec[] = []
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    const out = len * (0.18 + 0.82 * t) * t
    const y = (o.lift ?? 0.12) * len * t + o.rise * len * Math.sin(t * 1.5) * (1 - t * 0.3) - o.droop * len * t * t * t
    pts.push(V(base.x + dx * out, base.y + y, base.z + dz * out))
  }
  ribbon(g, pts, o.w ?? ((t) => halfW * Math.min(1, 0.45 + t * 5) * Math.pow(1 - t, 0.55)), V(dz, 0, -dx), {
    segs: o.segs ?? 6,
    fold: o.fold ?? 0.35,
    twist: o.twist ?? 0,
    wave: o.wave,
    waveN: 18,
    color: o.color,
    thin: o.thin,
  })
}

/** a thin flat strip from a to b (an awn, a pod, a twig): one triangle when it ends in a point */
export function stick(g: Geo, a: Vec, b: Vec, w0: number, w1: number, c: Tint, thin: number, face?: Vec) {
  const d = b.clone().sub(a).normalize()
  const s = perp(d, face ?? V(0.3, 1, 0.5).normalize())
  const ca = tint(c, 0)
  const cb = tint(c, 1)
  const i0 = g.vert(a.clone().addScaledVector(s, -w0), ca, thin)
  const i1 = g.vert(a.clone().addScaledVector(s, w0), ca, thin)
  if (w1 <= 0) {
    const i2 = g.vert(b, cb, thin)
    g.tri(i0, i1, i2)
    return
  }
  const i2 = g.vert(b.clone().addScaledVector(s, -w1), cb, thin)
  const i3 = g.vert(b.clone().addScaledVector(s, w1), cb, thin)
  g.tri(i0, i1, i2)
  g.tri(i1, i3, i2)
}

/** a grain, a bud, a spikelet: a double pyramid of `sides` facets along `d` */
export function grain(g: Geo, center: Vec, d: Vec, len: number, rad: number, sides: number, c: THREE.Color, thin: number, rot = 0, rad2?: number) {
  const dn = d.clone().normalize()
  const e1 = perp(dn)
  const e2 = new THREE.Vector3().crossVectors(dn, e1)
  const b = g.vert(center.clone().addScaledVector(dn, -len * 0.5), c.clone().multiplyScalar(0.8), thin)
  const tp = g.vert(center.clone().addScaledVector(dn, len * 0.5), c.clone().multiplyScalar(1.1), thin)
  const ring: number[] = []
  for (let j = 0; j < sides; j++) {
    const a = rot + (j / sides) * Math.PI * 2
    const rr = j % 2 && rad2 !== undefined ? rad2 : rad
    ring.push(g.vert(center.clone().addScaledVector(dn, -len * 0.08).addScaledVector(e1, Math.cos(a) * rr).addScaledVector(e2, Math.sin(a) * rr), c, thin))
  }
  for (let j = 0; j < sides; j++) {
    const r0 = ring[j]
    const r1 = ring[(j + 1) % sides]
    g.tri(b, r1, r0)
    g.tri(tp, r0, r1)
  }
}

/** a surface of revolution around `axis` from `origin`: profile = [radius, height] pairs (a head, a husk, a crown) */
export function lathe(g: Geo, origin: Vec, axis: Vec, profile: [number, number][], segs: number, color: Tint, thin: number) {
  const ax = axis.clone().normalize()
  const e1 = perp(ax)
  const e2 = new THREE.Vector3().crossVectors(ax, e1)
  const start = g.count
  profile.forEach(([r, h], i) => {
    const c = tint(color, i / Math.max(1, profile.length - 1))
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      g.vert(origin.clone().addScaledVector(ax, h).addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r), c, thin)
    }
  })
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = start + i * segs + j
      const b = start + i * segs + ((j + 1) % segs)
      g.tri(a, b, a + segs)
      g.tri(b, b + segs, a + segs)
    }
  }
}

/** a small flower: `n` cupped petals around a centre, facing `d` */
export function flower(g: Geo, center: Vec, d: Vec, n: number, len: number, wid: number, cup: number, petal: THREE.Color, eye: THREE.Color | null, thin: number, rot = 0) {
  const dn = d.clone().normalize()
  const e1 = perp(dn)
  const e2 = new THREE.Vector3().crossVectors(dn, e1)
  const c0 = g.vert(center.clone().addScaledVector(dn, len * 0.08), eye ?? petal, thin)
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * Math.PI * 2
    const out = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a))
    const side = new THREE.Vector3().crossVectors(dn, out)
    const mid = center.clone().addScaledVector(out, len * 0.55).addScaledVector(dn, cup * len * 0.4)
    const tip = center.clone().addScaledVector(out, len).addScaledVector(dn, cup * len)
    const l = g.vert(mid.clone().addScaledVector(side, -wid), petal, thin)
    const r = g.vert(mid.clone().addScaledVector(side, wid), petal, thin)
    const t = g.vert(tip, petal.clone().multiplyScalar(1.08), thin)
    g.tri(c0, l, r)
    g.tri(l, t, r)
  }
}
