// Crop specimens: each crop as a small crafted object of the plant itself - an ear of wheat with its awns, a maize cob
// half out of its husk, a rapeseed raceme in flower over its pods, a sunflower head, an open pod with its seeds, a
// beet, tubers, a tomato truss... built from procedural three.js geometry per archetype, tinted by the crop's colour,
// and lit like the page's golden-hour scenes: a warm low key, a cool slate fill from the other side, a warm rim from
// behind, a soft contact shadow on an invisible floor.
//
// One shared offscreen renderer draws each crop ONCE into a transparent image (an object URL, cached for the session);
// the cards show that image. No card holds a live WebGL context. Lazy: this module (and three.js) loads only when the
// first card asks for a specimen; renders are queued one per frame so a page of cards never stalls the main thread.
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { calm, RANK } from './calm'

export type SpecimenCrop = { id?: string; name: string; latin?: string; color: string }

const SIZE = 320

// ---------- small maths ----------

function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const h3 = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}
/** smooth 3D value noise, 0…1 */
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => h3(xi + dx, yi + dy, zi + dz)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const col = (a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t)

// ---------- geometry helpers ----------

/** strip a geometry to position + normal (+ its painted colour), non-indexed, so anything merges with anything */
function clean(g: THREE.BufferGeometry, keepColor = false) {
  const n = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && !(keepColor && k === 'color')) n.deleteAttribute(k)
  if (!n.attributes.normal) n.computeVertexNormals()
  return n
}
/** one geometry from many; when any of them is painted, the unpainted ones are painted white so the colours survive */
function merge(list: THREE.BufferGeometry[]) {
  const painted = list.some((g) => !!g.attributes.color)
  const ready = list.map((g) => {
    const n = clean(g, painted)
    if (painted && !n.attributes.color) n.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n.attributes.position.count * 3).fill(1), 3))
    return n
  })
  return mergeGeometries(ready, false) ?? new THREE.BufferGeometry()
}
const at = (g: THREE.BufferGeometry, m: THREE.Matrix4) => g.applyMatrix4(m)
const place = (p: THREE.Vector3, rot: THREE.Euler | THREE.Quaternion, s: THREE.Vector3 | number = 1) =>
  new THREE.Matrix4().compose(p, rot instanceof THREE.Euler ? new THREE.Quaternion().setFromEuler(rot) : rot, typeof s === 'number' ? V(s, s, s) : s)
/** the rotation that turns +y onto `dir` */
const aim = (dir: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize())

/** a tube along points, its radius a function of the run (0 at the start … 1 at the end) */
function tube(pts: THREE.Vector3[], r: (t: number) => number, radial = 7, segs = 28) {
  const curve = new THREE.CatmullRomCurve3(pts)
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false)
  const pos = g.attributes.position as THREE.BufferAttribute
  const c = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c)
    const rr = Math.max(1e-4, r(i / segs))
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rr).add(c)
      pos.setXYZ(k, v.x, v.y, v.z)
    }
  }
  g.computeVertexNormals()
  return g
}
/** a leaf or petal: a ribbon along points, folded on its midrib, its half-width a function of the run */
function ribbon(pts: THREE.Vector3[], width: (t: number) => number, side = V(1, 0, 0), fold = 0.25, segs = 22, twist = 0) {
  const curve = new THREE.CatmullRomCurve3(pts)
  const pos: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const s = new THREE.Vector3()
  const n = new THREE.Vector3()
  const q = new THREE.Quaternion()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    curve.getPointAt(t, p)
    curve.getTangentAt(t, tan)
    s.copy(side).addScaledVector(tan, -side.dot(tan)).normalize()
    if (twist) s.applyQuaternion(q.setFromAxisAngle(tan, twist * t))
    n.crossVectors(tan, s).normalize()
    const w = width(t)
    const l = p.clone().addScaledVector(s, -w).addScaledVector(n, fold * w)
    const r = p.clone().addScaledVector(s, w).addScaledVector(n, fold * w)
    pos.push(l.x, l.y, l.z, p.x, p.y, p.z, r.x, r.y, r.z)
    if (i < segs) {
      const a = i * 3
      const b = a + 3
      idx.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
const leafW = (w: number, k = 0.85) => (t: number) => w * Math.pow(Math.sin(Math.PI * Math.min(1, t)), k) * (1 - 0.25 * t)
function ellipsoid(rx: number, ry: number, rz: number, w = 12, h = 9) {
  const g = new THREE.SphereGeometry(1, w, h)
  g.scale(rx, ry, rz)
  return g
}
/** a lumpy solid: a sphere pushed in and out by noise (tubers, clods, cotton lint) */
function lump(rx: number, ry: number, rz: number, amp: number, freq: number, seed: number, detail = 4) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g, 1e-4)
  const pos = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    const d = 1 + amp * (noise3(v.x * freq + seed, v.y * freq, v.z * freq) - 0.5) * 2
    pos.setXYZ(i, v.x * d * rx, v.y * d * ry, v.z * d * rz)
  }
  g.computeVertexNormals()
  return g
}
function lathe(profile: [number, number][], segs = 32) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs)
}
/** a flower: n petals round a centre, opening upward from a point */
function flower(n: number, len: number, wid: number, cup = 0.35) {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const dir = V(Math.cos(a), cup, Math.sin(a)).normalize()
    const pts = [V(0, 0, 0), dir.clone().multiplyScalar(len * 0.5).add(V(0, len * 0.08, 0)), dir.clone().multiplyScalar(len)]
    parts.push(ribbon(pts, leafW(wid, 0.6), V(-Math.sin(a), 0, Math.cos(a)), 0.15, 8))
  }
  return merge(parts)
}

// ---------- materials ----------

type Parts = { geo: THREE.BufferGeometry; mat: THREE.Material; noShadow?: boolean }[]
// Every material in the studio carries the same switches (a trace of sheen and clearcoat, both sides), so they all
// share a handful of shader programs: compiling a new program costs more than drawing a specimen.
const UNI = { sheen: 0.001, clearcoat: 0.001, side: THREE.DoubleSide } as const
/**
 * A skin for a closed shape: every point is pushed along its normal and painted - mottled, pitted, soiled - where one
 * flat colour on a smooth lump read as modelling clay. `f` writes the point's colour into `out` and returns how far to
 * push it. (The shape wants a few thousand points for this: see `lump`'s detail.)
 */
function skin(g: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => number) {
  if (!g.attributes.normal) g.computeVertexNormals()
  const pos = g.attributes.position as THREE.BufferAttribute
  const nor = g.attributes.normal as THREE.BufferAttribute
  const paint = new Float32Array(pos.count * 3)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nor, i)
    const push = f(p, n, c)
    pos.setXYZ(i, p.x + n.x * push, p.y + n.y * push, p.z + n.z * push)
    paint.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(paint, 3))
  g.computeVertexNormals()
  return g
}
/** smoothstep from a to b - either way round (three's own returns 1 for anything past the upper edge) */
const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** set a shape down on the table: its lowest point at y */
function rest(g: THREE.BufferGeometry, y = 0) {
  g.computeBoundingBox()
  return g.translate(0, y - g.boundingBox!.min.y, 0)
}

/**
 * A tuber as it comes out of the ground: an uneven body, eyes pressed into the skin (each with its brow), the skin
 * mottled and speckled with lenticels, soil still on it. `cut`: halved, the flesh and its ring showing.
 */
function tuberBody(seed: number, size: THREE.Vector3, o: { base: string; russet: string; flesh: string; eyes: number; amp?: number; cut?: boolean; taper?: number }) {
  const r = rng(seed * 977 + 13)
  const g = lump(size.x, size.y, size.z, o.amp ?? 0.1, 1.6, seed * 3.1, 26)
  const pos = g.attributes.position as THREE.BufferAttribute
  if (o.taper) {
    // a spindle (a sweet potato): drawn out to a point at both ends
    for (let i = 0; i < pos.count; i++) {
      const k = 1 - o.taper * Math.pow(Math.abs(pos.getY(i)) / size.y, 2.2)
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k)
    }
  }
  if (o.cut) for (let i = 0; i < pos.count; i++) if (pos.getX(i) > 0) pos.setX(i, 0)
  g.computeVertexNormals()
  const eyes: { p: THREE.Vector3; r: number }[] = []
  for (let k = 0; k < o.eyes; k++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, Math.floor(r() * pos.count))
    if (!(o.cut && p.x > -0.02)) eyes.push({ p, r: (0.1 + 0.07 * r()) * Math.min(size.x, size.z) })
  }
  const base = new THREE.Color(o.base)
  const russet = new THREE.Color(o.russet)
  const soil = new THREE.Color('#4b3828')
  const pit = new THREE.Color(o.russet).multiplyScalar(0.55)
  const flesh = new THREE.Color(o.flesh)
  return skin(g, (p, _n, c) => {
    if (o.cut && p.x > -1e-4) {
      const d = Math.hypot(p.y / size.y, p.z / size.z)
      c.copy(flesh).multiplyScalar(0.93 + 0.07 * noise3(p.y * 30, p.z * 30, seed))
      // the vascular ring a little inside the skin, the skin's own edge
      if (d > 0.76 && d < 0.84) c.multiplyScalar(0.92)
      if (d > 0.965) c.lerp(base, 0.75)
      return 0
    }
    c.copy(base).lerp(russet, ss(0.48, 0.85, noise3(p.x * 9 + seed, p.y * 9, p.z * 9)) * 0.6)
    if (noise3(p.x * 70 + seed, p.y * 70, p.z * 70) > 0.73) c.multiplyScalar(0.8)
    c.lerp(soil, ss(0.46, 0.76, noise3(p.x * 6 - seed, p.y * 6 + 3, p.z * 6)) * 0.62)
    let push = (noise3(p.x * 40, p.y * 40, p.z * 40 + seed) - 0.5) * 0.0045
    for (const e of eyes) {
      const d = p.distanceTo(e.p) / e.r
      if (d >= 1.7) continue
      const k = d < 1 ? (1 - d * d) * (1 - d * d) : 0
      push -= e.r * 0.55 * k
      // the brow: a small ridge round the upper side of the eye
      if (d > 0.9 && d < 1.5 && p.y > e.p.y) push += e.r * 0.12 * Math.sin(((d - 0.9) / 0.6) * Math.PI)
      c.lerp(pit, Math.max(k, 0.3 * ss(1.7, 0.9, d)))
    }
    return push
  })
}

const plant = (c: THREE.ColorRepresentation, o: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({
    ...UNI,
    color: c,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.55,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(c).lerp(new THREE.Color('#fff2da'), 0.55),
    side: THREE.DoubleSide,
    ...o,
  })
const glossy = (c: THREE.ColorRepresentation, o: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ ...UNI, color: c, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.18, ...o })

// ---------- the archetypes ----------

type Kind =
  | 'ear' | 'panicle' | 'spike' | 'cob' | 'raceme' | 'sunflower' | 'thistle' | 'pod' | 'tuber' | 'taproot' | 'bulb'
  | 'boll' | 'cane' | 'broadleaf' | 'head' | 'truss' | 'longfruit' | 'melon' | 'herb' | 'tuft' | 'clod'
const KIND: Record<string, Kind> = {
  wheat: 'ear', barley: 'ear', rye: 'ear', triticale: 'ear',
  oats: 'panicle', rice: 'panicle', millet: 'panicle', fonio: 'panicle',
  sorghum: 'spike', foragesorghum: 'spike', pearlmillet: 'spike', quinoa: 'spike',
  maize: 'cob', silagemaize: 'cob',
  rapeseed: 'raceme', linseed: 'raceme', sesame: 'raceme', lupin: 'raceme', buckwheat: 'raceme', vetch: 'raceme',
  sunflower: 'sunflower', safflower: 'thistle',
  soybean: 'pod', pea: 'pod', faba: 'pod', lentil: 'pod', chickpea: 'pod', cowpea: 'pod', drybean: 'pod', groundnut: 'pod', pigeonpea: 'pod', bambara: 'pod',
  potato: 'tuber', sweetpotato: 'tuber', cassava: 'tuber', yam: 'tuber',
  sugarbeet: 'taproot', onion: 'bulb', cotton: 'boll',
  sugarcane: 'cane', jute: 'cane',
  tobacco: 'broadleaf', taro: 'broadleaf', castor: 'broadleaf',
  cabbage: 'head', lettuce: 'head',
  tomato: 'truss', cherry: 'truss', strawberry: 'truss',
  pepper: 'longfruit', chilli: 'longfruit', eggplant: 'longfruit', okra: 'longfruit', cucumber: 'longfruit', courgette: 'longfruit',
  watermelon: 'melon', basil: 'herb',
  clover: 'tuft', cover: 'tuft', grassley: 'tuft',
  fallow: 'clod',
}

const STRAW = '#c9a35e'
const STEM_GREEN = '#6f8f3a'
const LEAF_GREEN = '#5d8a3a'

function ear(id: string, c: string, r: () => number): Parts {
  const awn = id === 'barley' ? 0.55 : id === 'rye' ? 0.42 : id === 'triticale' ? 0.3 : 0.12
  const grain = col('#d9b26a', c, 0.25)
  const L = id === 'rye' ? 0.95 : 0.8
  const N = id === 'barley' ? 22 : 16
  // the rachis nods a little at the tip, as a ripe ear does
  const axis = new THREE.CatmullRomCurve3([V(0, -0.1, 0), V(0.02, L * 0.5, 0.01), V(0.09, L, 0.03)])
  const grains: THREE.BufferGeometry[] = []
  const awns: THREE.BufferGeometry[] = []
  const p = new THREE.Vector3()
  const tan = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    const t = 0.04 + (i / (N - 1)) * 0.92
    axis.getPointAt(t, p)
    axis.getTangentAt(t, tan)
    const size = (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (id === 'barley' ? 0.8 : 1)
    for (const side of [-1, 1]) {
      for (const face of [0, 1]) {
        const out = V(side * Math.cos(face * 0.9), 0, Math.sin(face * 0.9) * (face ? 1 : 0.3)).normalize()
        const dir = tan.clone().multiplyScalar(1).addScaledVector(out, 0.75).normalize()
        const q = aim(dir)
        const pos = p.clone().addScaledVector(out, 0.028 * size)
        grains.push(at(ellipsoid(0.026 * size, 0.06 * size, 0.022 * size, 10, 8), place(pos, q)))
        if (awn > 0.05) {
          const a = awn * (0.75 + 0.35 * r()) * (0.6 + 0.4 * t)
          const tip = pos.clone().addScaledVector(dir, 0.05 * size)
          const ad = dir.clone().lerp(tan, 0.55).normalize()
          awns.push(tube([tip, tip.clone().addScaledVector(ad, a * 0.5).add(V(0.004, 0, 0)), tip.clone().addScaledVector(ad, a)], (k) => 0.0028 * (1 - k * 0.8), 3, 8))
        }
      }
    }
  }
  const stem = tube([V(-0.05, -0.75, 0), V(-0.03, -0.42, 0), V(0, -0.1, 0)], () => 0.011, 6, 16)
  const leaf = ribbon([V(-0.04, -0.6, 0), V(0.08, -0.46, 0.05), V(0.2, -0.4, 0.08), V(0.3, -0.48, 0.07)], leafW(0.03), V(0, 0, 1), 0.35, 20, 0.6)
  return [
    { geo: merge(grains), mat: plant(grain, { roughness: 0.55, sheen: 0.8 }) },
    { geo: merge(awns.length ? awns : [new THREE.BufferGeometry()]), mat: plant(col('#e6cf98', c, 0.12), { roughness: 0.5 }) },
    { geo: merge([stem]), mat: plant(col(STRAW, c, 0.15)) },
    { geo: merge([leaf]), mat: plant(col('#b9a067', LEAF_GREEN, 0.25)) },
  ]
}

function panicle(id: string, c: string, r: () => number): Parts {
  const grains: THREE.BufferGeometry[] = []
  const twigs: THREE.BufferGeometry[] = []
  const droop = id === 'rice' ? 0.9 : id === 'millet' ? 0.7 : 0.35
  const axisPts = [V(0, -0.6, 0), V(0, -0.1, 0), V(0.12, 0.45, 0.02), V(0.2 + droop * 0.25, 0.7 - droop * 0.25, 0.05)]
  const axis = new THREE.CatmullRomCurve3(axisPts)
  twigs.push(tube(axisPts, (t) => 0.012 * (1 - t * 0.7), 6, 30))
  const nB = id === 'oats' ? 9 : 14
  const p = new THREE.Vector3()
  for (let b = 0; b < nB; b++) {
    const t = 0.42 + (b / nB) * 0.56
    axis.getPointAt(t, p)
    const a = b * 2.39996
    const len = (id === 'oats' ? 0.32 : 0.26) * (1 - (t - 0.42) * 0.8)
    const dir = V(Math.cos(a) * 0.9, -0.15 - droop * 0.5, Math.sin(a) * 0.6)
    const end = p.clone().addScaledVector(dir.normalize(), len)
    const mid = p.clone().lerp(end, 0.5).add(V(0, 0.05, 0))
    twigs.push(tube([p, mid, end], () => 0.0035, 3, 8))
    const nG = id === 'oats' ? 2 : id === 'rice' ? 6 : 8
    for (let g = 0; g < nG; g++) {
      const k = id === 'oats' ? 1 : 0.35 + (g / nG) * 0.65
      const gp = new THREE.CatmullRomCurve3([p, mid, end]).getPointAt(k)
      const hang = V(0.1 * (r() - 0.5), -1, 0.1 * (r() - 0.5))
      const s = id === 'oats' ? 1.6 : id === 'millet' || id === 'fonio' ? 0.55 : 1
      grains.push(at(ellipsoid(0.017 * s, 0.04 * s, 0.014 * s, 9, 7), place(gp.clone().addScaledVector(hang, 0.025 * s), aim(hang.negate()))))
    }
  }
  const leaf = ribbon([V(0, -0.5, 0), V(-0.12, -0.34, 0.05), V(-0.28, -0.28, 0.08), V(-0.4, -0.36, 0.06)], leafW(0.028), V(0, 0, 1), 0.35, 20, -0.5)
  return [
    { geo: merge(grains), mat: plant(col('#d8b770', c, 0.3), { roughness: 0.5, sheen: 0.8 }) },
    { geo: merge(twigs), mat: plant(col(STRAW, c, 0.12)) },
    { geo: merge([leaf]), mat: plant(col('#a9a064', LEAF_GREEN, 0.3)) },
  ]
}

function spike(id: string, c: string, r: () => number): Parts {
  // sorghum: a dense oval head of round grains; pearl millet: a long candle; quinoa: a lumpy coloured plume
  const candle = id === 'pearlmillet'
  const H = candle ? 0.85 : 0.6
  const R = candle ? 0.09 : id === 'quinoa' ? 0.17 : 0.15
  const n = candle ? 520 : 380
  const grains: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const y = (i / n) * H
    const t = y / H
    const prof = candle ? 0.85 + 0.15 * Math.sin(Math.PI * t) : Math.sin(Math.PI * (0.08 + t * 0.9)) ** 0.7
    const a = i * 2.39996
    const rr = R * prof * (id === 'quinoa' ? 0.8 + 0.4 * noise3(t * 6, a, 1) : 1)
    const pos = V(Math.cos(a) * rr, y, Math.sin(a) * rr)
    const s = (candle ? 0.016 : id === 'quinoa' ? 0.02 : 0.024) * (0.85 + 0.3 * r())
    grains.push(at(new THREE.IcosahedronGeometry(s, 1), place(pos, new THREE.Euler())))
  }
  const stem = tube([V(0.04, -0.6, 0), V(0.02, -0.28, 0), V(0, 0.02, 0)], () => 0.016, 6, 14)
  const leaf = ribbon([V(0.02, -0.48, 0), V(0.16, -0.34, 0.05), V(0.34, -0.26, 0.08), V(0.48, -0.34, 0.06)], leafW(0.045), V(0, 0, 1), 0.3, 22, 0.5)
  const head = col(id === 'quinoa' ? '#c0623e' : id === 'pearlmillet' ? '#9d8a63' : '#a5532e', c, 0.3)
  return [
    { geo: merge(grains), mat: plant(head, { roughness: 0.45, sheen: 0.4 }) },
    { geo: merge([stem]), mat: plant(col('#8e8a4c', c, 0.1)) },
    { geo: merge([leaf]), mat: plant(LEAF_GREEN) },
  ]
}

function cob(c: string, r: () => number): Parts {
  const kernels: THREE.BufferGeometry[] = []
  const rows = 14
  const per = 20
  const L = 0.95
  for (let j = 0; j < per; j++) {
    const t = j / (per - 1)
    const rad = 0.13 * (1 - 0.32 * t ** 1.6) * (0.92 + 0.08 * Math.sin(Math.PI * t))
    for (let i = 0; i < rows; i++) {
      const a = (i / rows) * Math.PI * 2 + (j % 2) * (Math.PI / rows)
      const n = V(Math.cos(a), 0.15 * (t - 0.5), Math.sin(a)).normalize()
      const pos = V(Math.cos(a) * rad, t * L, Math.sin(a) * rad)
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n)
      kernels.push(at(ellipsoid(0.03 * (1 - 0.2 * t), 0.024, 0.022, 8, 6), place(pos, q)))
    }
  }
  // the husk peeled back from the lower half, the silk spilling from the tip
  const husk: THREE.BufferGeometry[] = []
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4
    const out = V(Math.cos(a), 0, Math.sin(a))
    husk.push(ribbon([V(0, -0.08, 0), out.clone().multiplyScalar(0.14).add(V(0, 0.15, 0)), out.clone().multiplyScalar(0.24).add(V(0, 0.32, 0)), out.clone().multiplyScalar(0.36).add(V(0, 0.38, 0))], leafW(0.07, 0.6), V(-out.z, 0, out.x), 0.6, 18))
  }
  const silk: THREE.BufferGeometry[] = []
  for (let k = 0; k < 14; k++) {
    const a = r() * Math.PI * 2
    const top = V(0, L + 0.02, 0)
    silk.push(tube([top, top.clone().add(V(Math.cos(a) * 0.05, 0.08, Math.sin(a) * 0.05)), top.clone().add(V(Math.cos(a) * 0.14, 0.05 + r() * 0.06, Math.sin(a) * 0.14))], () => 0.0025, 3, 8))
  }
  const shank = tube([V(0, -0.35, 0), V(0, -0.08, 0)], () => 0.03, 8, 4)
  return [
    { geo: merge(kernels), mat: glossy(col('#e9b847', c, 0.25), { roughness: 0.35, clearcoat: 0.4 }) },
    { geo: merge(husk), mat: plant(col('#b8b06a', '#d8c58a', 0.35), { roughness: 0.7 }) },
    { geo: merge(silk), mat: plant('#c98f4e', { roughness: 0.5 }) },
    { geo: merge([shank]), mat: plant('#9b9a5c') },
  ]
}

function raceme(id: string, c: string, r: () => number): Parts {
  const petalCol = id === 'linseed' || id === 'lupin' ? '#6f8fd6' : id === 'vetch' ? '#9a62b8' : id === 'sesame' ? '#efe6dc' : id === 'buckwheat' ? '#f1dfe2' : '#f2cd2a'
  const nPet = id === 'linseed' ? 5 : id === 'sesame' || id === 'lupin' || id === 'vetch' ? 5 : 4
  const stemPts = [V(0, -0.55, 0), V(0.03, -0.15, 0.01), V(0, 0.25, 0), V(-0.04, 0.62, 0.02)]
  const axis = new THREE.CatmullRomCurve3(stemPts)
  const stems: THREE.BufferGeometry[] = [tube(stemPts, (t) => 0.014 * (1 - t * 0.5), 6, 30)]
  const flowers: THREE.BufferGeometry[] = []
  const pods: THREE.BufferGeometry[] = []
  const p = new THREE.Vector3()
  // pods below, flowers above: the raceme opens from the bottom up
  const nPods = id === 'buckwheat' ? 0 : 12
  for (let i = 0; i < nPods; i++) {
    const t = 0.28 + (i / nPods) * 0.42
    axis.getPointAt(t, p)
    const a = i * 2.39996
    const dir = V(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize()
    const stalk = p.clone().addScaledVector(V(Math.cos(a), 0.2, Math.sin(a)).normalize(), 0.04)
    stems.push(tube([p, stalk], () => 0.004, 3, 3))
    if (id === 'linseed') pods.push(at(ellipsoid(0.03, 0.034, 0.03, 10, 8), place(stalk, aim(dir))))
    else if (id === 'sesame') pods.push(at(ellipsoid(0.022, 0.07, 0.022, 8, 8), place(stalk.clone().addScaledVector(dir, 0.06), aim(dir))))
    else {
      const len = id === 'lupin' || id === 'vetch' ? 0.13 : 0.2
      pods.push(tube([stalk, stalk.clone().addScaledVector(dir, len * 0.5).add(V(0.01, 0, 0)), stalk.clone().addScaledVector(dir, len)], (k) => 0.011 * Math.sin(Math.PI * Math.min(1, 0.08 + k)) + 0.002, 6, 12))
    }
  }
  const nFl = id === 'buckwheat' ? 26 : 16
  for (let i = 0; i < nFl; i++) {
    const t = id === 'buckwheat' ? 0.55 + (i / nFl) * 0.45 : 0.72 + (i / nFl) * 0.28
    axis.getPointAt(Math.min(1, t), p)
    const a = i * 2.39996
    const spread = (1 - (t - 0.72) * 2.5) * 0.09 + 0.02
    const pos = p.clone().add(V(Math.cos(a) * spread, 0.02, Math.sin(a) * spread))
    const up = V(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize()
    const s = id === 'buckwheat' ? 0.55 : 1
    flowers.push(at(flower(nPet, 0.065 * s, 0.028 * s, 0.4), place(pos, aim(up))))
  }
  const leaf = ribbon([V(0, -0.42, 0), V(0.14, -0.3, 0.05), V(0.26, -0.27, 0.06), V(0.36, -0.36, 0.04)], leafW(id === 'rapeseed' ? 0.08 : 0.045), V(0, 0, 1), 0.2, 18)
  return [
    { geo: merge(flowers), mat: plant(col(petalCol, c, 0.15), { roughness: 0.5, sheen: 0.9, emissive: new THREE.Color(petalCol).multiplyScalar(0.06) }) },
    { geo: merge(pods.length ? pods : [new THREE.BufferGeometry()]), mat: plant(col('#8fa152', c, 0.15), { roughness: 0.55 }) },
    { geo: merge(stems), mat: plant(STEM_GREEN) },
    { geo: merge([leaf]), mat: plant(col('#5f8e48', '#7aa2b0', id === 'rapeseed' ? 0.25 : 0)) },
  ]
}

function sunflower(c: string, r: () => number): Parts {
  const seeds: THREE.BufferGeometry[] = []
  const R = 0.36
  const n = 420
  for (let i = 0; i < n; i++) {
    const rr = R * 0.92 * Math.sqrt(i / n)
    const a = i * 2.39996
    const z = 0.05 * (1 - (rr / R) ** 2) * 0.6
    seeds.push(at(ellipsoid(0.011, 0.016, 0.009, 6, 5), place(V(Math.cos(a) * rr, Math.sin(a) * rr, z + 0.02), new THREE.Euler(0, 0, a))))
  }
  const rays: THREE.BufferGeometry[] = []
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + k * 0.13
      const out = V(Math.cos(a), Math.sin(a), 0)
      const base = out.clone().multiplyScalar(R * 0.98).add(V(0, 0, k ? -0.02 : 0))
      const len = 0.24 + 0.05 * r()
      rays.push(ribbon([base, base.clone().addScaledVector(out, len * 0.5).add(V(0, 0, 0.03)), base.clone().addScaledVector(out, len).add(V(0, 0, -0.01 - 0.04 * r()))], leafW(0.035, 0.7), V(-out.y, out.x, 0), 0.25, 10, 0.3 * (r() - 0.5)))
    }
  }
  const back = lathe([[0.001, -0.07], [0.2, -0.06], [R * 1.02, -0.01], [R * 1.02, 0.01]], 40)
  back.rotateX(Math.PI / 2)
  const stem = tube([V(0, -0.05, -0.08), V(0.04, -0.6, -0.2), V(0.02, -1.2, -0.25)], () => 0.035, 8, 12)
  return [
    { geo: merge(seeds), mat: plant(col('#3b2a1c', c, 0.1), { roughness: 0.75, sheen: 0.3 }) },
    { geo: merge(rays), mat: plant(col('#f2b81e', c, 0.15), { roughness: 0.5, sheen: 0.8, emissive: new THREE.Color('#f2b81e').multiplyScalar(0.05) }) },
    { geo: merge([back]), mat: plant('#5f7d36') },
    { geo: merge([stem]), mat: plant('#6c8a3c') },
  ]
}

function thistle(c: string, r: () => number): Parts {
  // safflower: an orange brush of florets on a spiny green bract cup
  const florets: THREE.BufferGeometry[] = []
  for (let i = 0; i < 90; i++) {
    const a = i * 2.39996
    const u = Math.sqrt(i / 90)
    const dir = V(Math.cos(a) * u * 0.7, 1, Math.sin(a) * u * 0.7).normalize()
    const base = V(Math.cos(a) * u * 0.08, 0.1, Math.sin(a) * u * 0.08)
    florets.push(tube([base, base.clone().addScaledVector(dir, 0.1), base.clone().addScaledVector(dir, 0.18 + 0.04 * r())], () => 0.006, 3, 6))
  }
  const cup = lathe([[0.001, -0.08], [0.1, -0.05], [0.13, 0.04], [0.09, 0.12]], 24)
  const bracts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const out = V(Math.cos(a), 0, Math.sin(a))
    bracts.push(ribbon([out.clone().multiplyScalar(0.1), out.clone().multiplyScalar(0.18).add(V(0, 0.06, 0)), out.clone().multiplyScalar(0.24).add(V(0, 0.16, 0))], leafW(0.025), V(-out.z, 0, out.x), 0.4, 8))
  }
  const stem = tube([V(0, -0.08, 0), V(0.03, -0.3, 0), V(0, -0.55, 0)], () => 0.016, 6, 10)
  return [
    { geo: merge(florets), mat: plant(col('#ec7a1c', c, 0.15), { roughness: 0.5, sheen: 0.9 }) },
    { geo: merge([cup, ...bracts]), mat: plant('#6a8a3a') },
    { geo: merge([stem]), mat: plant('#7b9449') },
  ]
}

function pod(id: string, c: string, r: () => number): Parts {
  const seedCol: Record<string, string> = { soybean: '#d9c58a', pea: '#8dbb4a', faba: '#b9c78a', lentil: '#a8794a', chickpea: '#d8b77e', cowpea: '#e8dcc0', drybean: '#8e2f2a', groundnut: '#c98a5e', pigeonpea: '#b98e4e', bambara: '#5b3a2a' }
  const podCol: Record<string, string> = { soybean: '#9a8a52', pea: '#7fae45', faba: '#86a454', lentil: '#a9a463', chickpea: '#b5a86a', cowpea: '#c5b07a', drybean: '#c9b380', groundnut: '#c9a874', pigeonpea: '#7a8f48', bambara: '#9a8558' }
  const nSeeds = id === 'lentil' ? 2 : id === 'chickpea' || id === 'bambara' ? 1 : id === 'groundnut' ? 2 : id === 'cowpea' ? 8 : id === 'faba' ? 4 : 5
  const L = id === 'cowpea' ? 1.1 : id === 'faba' ? 0.75 : id === 'lentil' ? 0.3 : id === 'chickpea' || id === 'bambara' ? 0.28 : id === 'groundnut' ? 0.42 : 0.6
  const seedR = id === 'groundnut' ? 0.06 : id === 'chickpea' ? 0.07 : id === 'faba' ? 0.08 : id === 'lentil' ? 0.045 : id === 'drybean' ? 0.07 : 0.055
  const curveBend = id === 'cowpea' ? 0.25 : id === 'drybean' ? 0.12 : 0.08
  const seeds: THREE.BufferGeometry[] = []
  const shells: THREE.BufferGeometry[] = []
  // an open pod: one valve lies back, the seeds sit in a row in the other
  const pts = [V(0, 0, 0), V(L * 0.33, curveBend, 0), V(L * 0.66, curveBend * 0.9, 0), V(L, 0, 0)]
  const line = new THREE.CatmullRomCurve3(pts)
  const bump = (t: number) => {
    const k = t * nSeeds
    return seedR * 1.12 * (0.82 + 0.18 * Math.abs(Math.sin(Math.PI * k))) * Math.min(1, Math.sin(Math.PI * t) * 3)
  }
  const shellOf = (half: number) => {
    const g = new THREE.TubeGeometry(line, 40, 1, 12, false)
    const pos = g.attributes.position as THREE.BufferAttribute
    const cc = new THREE.Vector3()
    const v = new THREE.Vector3()
    for (let i = 0; i <= 40; i++) {
      line.getPointAt(i / 40, cc)
      for (let j = 0; j <= 12; j++) {
        const k = i * 13 + j
        v.fromBufferAttribute(pos, k).sub(cc)
        // flatten into a valve: keep one half of the round, flattened
        const ang = (j / 12) * Math.PI * 2
        const keep = half > 0 ? Math.sin(ang) >= -0.05 : Math.sin(ang) <= 0.05
        v.multiplyScalar(bump(i / 40) * (keep ? 1 : 0.15))
        v.z *= 0.7
        pos.setXYZ(k, v.x + cc.x, v.y + cc.y, v.z + cc.z)
      }
    }
    g.computeVertexNormals()
    return g
  }
  const lower = shellOf(-1)
  shells.push(lower)
  const upper = shellOf(1)
  upper.applyMatrix4(new THREE.Matrix4().makeRotationX(-1.1).premultiply(new THREE.Matrix4().makeTranslation(0, 0.02, -0.06)))
  if (id !== 'groundnut' && id !== 'chickpea' && id !== 'bambara') shells.push(upper)
  const p = new THREE.Vector3()
  for (let i = 0; i < nSeeds; i++) {
    const t = (i + 0.5) / nSeeds
    line.getPointAt(t, p)
    const s = id === 'faba' ? V(seedR, seedR * 0.75, seedR * 0.55) : id === 'drybean' || id === 'cowpea' ? V(seedR * 0.75, seedR * 0.5, seedR * 0.45) : V(seedR * 0.85, seedR * 0.8, seedR * 0.8)
    const g = id === 'chickpea' ? lump(s.x, s.y, s.z, 0.12, 2.2, i * 3.1, 3) : ellipsoid(s.x, s.y, s.z, 14, 10)
    seeds.push(at(g, place(p.clone().add(V(0, 0.012, 0.01)), new THREE.Euler(0, 0, 0.2 * (r() - 0.5)))))
  }
  // a second pod, closed, lying behind; a trifoliate leaf
  const closed = shellOf(1)
  const closed2 = shellOf(-1)
  const m2 = new THREE.Matrix4().compose(V(-0.12, -0.1, -0.22), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.5, -0.4)), V(0.95, 0.95, 0.95))
  closed.applyMatrix4(m2)
  closed2.applyMatrix4(m2)
  shells.push(closed, closed2)
  const leaves: THREE.BufferGeometry[] = []
  for (let k = 0; k < 3; k++) {
    const a = -0.6 + k * 0.6
    const dir = V(Math.cos(a + Math.PI * 0.75), 0.3, Math.sin(a + Math.PI * 0.75) * 0.6).normalize()
    const b = V(-0.05, 0.02, -0.05)
    leaves.push(ribbon([b, b.clone().addScaledVector(dir, 0.15), b.clone().addScaledVector(dir, 0.3)], leafW(0.07, 0.6), V(0, 0, 1).cross(dir).normalize(), 0.2, 14))
  }
  return [
    { geo: merge(seeds), mat: glossy(col(seedCol[id] ?? '#c9b07a', c, 0.12), { roughness: 0.38, clearcoat: 0.35 }) },
    { geo: merge(shells), mat: plant(col(podCol[id] ?? '#8fa152', c, 0.1), { roughness: 0.6, sheen: 0.7 }) },
    { geo: merge(leaves), mat: plant(LEAF_GREEN) },
  ]
}

function tuber(id: string, c: string, r: () => number): Parts {
  const skin: Record<string, string> = { potato: '#b8946a', sweetpotato: '#a2493a', cassava: '#7a5236', yam: '#5e4030' }
  const parts: THREE.BufferGeometry[] = []
  if (id === 'cassava') {
    for (let k = 0; k < 3; k++) {
      const g = lump(0.07, 0.48, 0.07, 0.08, 3.5, k * 3.3 + 2, 4)
      const pp = g.attributes.position as THREE.BufferAttribute
      const v = new THREE.Vector3()
      for (let i = 0; i < pp.count; i++) {
        v.fromBufferAttribute(pp, i)
        const t = (v.y + 0.48) / 0.96
        const taper = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.8))
        pp.setXYZ(i, v.x * taper, v.y, v.z * taper)
      }
      g.computeVertexNormals()
      parts.push(at(g, place(V((k - 1) * 0.12, k === 1 ? 0.04 : 0, (k - 1) * -0.05), new THREE.Euler(0.1 * k, 0, 1.25 + (k - 1) * 0.18))))
    }
  } else if (id === 'potato') {
    // three as they were lifted, soil still on them, and one cut to show what is inside
    const look = { base: '#c9a56b', russet: '#8a6238', flesh: '#f0e3b4', eyes: 13 }
    return [
      {
        geo: merge([
          rest(at(tuberBody(1, V(0.21, 0.155, 0.165), look), place(V(-0.27, 0, 0.0), new THREE.Euler(0.2, 0.5, 0.12)))),
          rest(at(tuberBody(2, V(0.18, 0.135, 0.15), look), place(V(0.14, 0, -0.2), new THREE.Euler(0.4, 2.1, -0.2)))),
          rest(at(tuberBody(3, V(0.13, 0.105, 0.115), { ...look, eyes: 9 }), place(V(-0.02, 0, 0.25), new THREE.Euler(1.0, 4.0, 0.3)))),
          rest(at(tuberBody(4, V(0.19, 0.14, 0.155), { ...look, cut: true }), place(V(0.36, 0, 0.14), new THREE.Euler(0.15, -0.9, 1.25)))),
        ]),
        mat: painted({ roughness: 0.8, sheen: 0.25 }),
      },
    ]
  } else if (id === 'sweetpotato') {
    const look = { base: '#b25a41', russet: '#7a3527', flesh: '#ee9440', eyes: 5, taper: 0.82, amp: 0.13 }
    const tails: THREE.BufferGeometry[] = []
    const roots: [THREE.Vector3, THREE.Euler, THREE.Vector3][] = [
      [V(-0.24, 0, 0.02), new THREE.Euler(0.2, 0.4, 1.25), V(0.12, 0.33, 0.115)],
      [V(0.08, -0.01, -0.2), new THREE.Euler(0.1, 2.0, 1.45), V(0.105, 0.27, 0.1)],
    ]
    const bodies = roots.map(([p, e, s], k) => {
      const m = place(p, e)
      const body = at(tuberBody(k + 5, s, look), m)
      body.computeBoundingBox()
      const down = -body.boundingBox!.min.y
      // the thin root each one ends in
      for (const end of [-1, 1]) tails.push(at(tube([V(0, end * s.y * 0.96, 0), V(0.02 * end, end * (s.y + 0.08), 0.015), V(0.05, end * (s.y + 0.17), -0.02 * end)], (t) => 0.009 * (1 - 0.85 * t), 5, 8), m.clone()).translate(0, down, 0))
      return body.translate(0, down, 0)
    })
    bodies.push(rest(at(tuberBody(8, V(0.11, 0.2, 0.105), { ...look, cut: true, taper: 0.6 }), place(V(0.34, 0, 0.16), new THREE.Euler(0.1, -0.8, 1.3)))))
    return [
      { geo: merge(bodies), mat: painted({ roughness: 0.72, sheen: 0.3 }) },
      { geo: merge(tails), mat: plant('#8a4a36', { roughness: 0.8 }) },
    ]
  } else {
    // a yam: one long rough tuber
    return [{ geo: merge([at(tuberBody(9, V(0.22, 0.55, 0.2), { base: skin[id] ?? '#5e4030', russet: '#3a2618', flesh: '#efe6cf', eyes: 6, amp: 0.18 }), place(V(0, 0, 0), new THREE.Euler(r() * 0.3, r() * 3, 0.4 * (r() - 0.3))))]), mat: painted({ roughness: 0.88, sheen: 0.2 }) }]
  }
  return [{ geo: merge(parts), mat: plant(col(skin[id] ?? '#a07a55', c, 0.12), { roughness: 0.82, sheen: 0.35 }) }]
}

/**
 * A sugar beet, pulled: the cone of the root with its two grooves winding down it (the rootlets grow out of them, and
 * the soil stays in them), the wrinkled shoulder, the grey crown where the old leaves stood, a tail; and a full
 * rosette - upright young leaves in the heart, long ones lying outward.
 */
function taproot(c: string): Parts {
  const r = rng(47)
  const NT = 120
  const NA = 96
  const profile = new THREE.SplineCurve([[0.004, -1.0], [0.02, -0.82], [0.07, -0.56], [0.15, -0.3], [0.205, -0.05], [0.2, 0.08], [0.15, 0.16], [0.06, 0.2], [0.001, 0.21]].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(NT)
  const groove = (t: number) => 0.6 + 1.1 * (1 - t)
  const bend = (t: number) => 0.16 * Math.pow(1 - t, 3)
  const cream = new THREE.Color(col('#e9dfc4', c, 0.06))
  const soil = new THREE.Color('#5b4631')
  const crown = new THREE.Color('#aaa783')
  const pos: number[] = []
  const paint: number[] = []
  const idx: number[] = []
  const tint = new THREE.Color()
  for (let i = 0; i <= NT; i++) {
    const t = i / NT
    const y = profile[i].y
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * Math.PI * 2
      let da = Math.abs((((a - groove(t)) % Math.PI) + Math.PI) % Math.PI)
      da = Math.min(da, Math.PI - da)
      const gv = Math.exp(-((da / 0.28) ** 2)) * ss(0.04, 0.3, t) * (1 - ss(0.78, 0.92, t))
      const lumpy = noise3(Math.cos(a) * 2 + 5, y * 3, Math.sin(a) * 2)
      const wrinkle = 0.0045 * Math.sin(y * 130 + lumpy * 6) * ss(0.5, 0.75, t) * (1 - ss(0.9, 0.98, t))
      const rad = profile[i].x * (1 - 0.11 * gv) * (1 + 0.07 * (lumpy - 0.5)) + wrinkle
      pos.push(Math.cos(a) * rad + bend(t), y, Math.sin(a) * rad)
      const grit = noise3(Math.cos(a) * 9, y * 12, Math.sin(a) * 9)
      tint.copy(cream).multiplyScalar(0.9 + 0.14 * noise3(Math.cos(a) * 30, y * 40, Math.sin(a) * 30))
      tint.lerp(soil, Math.min(0.9, 0.9 * gv + 0.75 * ss(0.42, 0.75, grit) * (1 - ss(0.3, 0.75, t)) + 0.45 * ss(0.56, 0.8, grit)))
      // the crown: grey-green, ringed by the scars of the season's first leaves
      const up = ss(0.86, 0.95, t)
      tint.lerp(crown, up * 0.8).multiplyScalar(1 - 0.22 * up * (0.5 + 0.5 * Math.sin(y * 420)))
      paint.push(tint.r, tint.g, tint.b)
      if (i < NT && j < NA) {
        const k = i * (NA + 1) + j
        idx.push(k, k + NA + 1, k + 1, k + 1, k + NA + 1, k + NA + 2)
      }
    }
  }
  const root = new THREE.BufferGeometry()
  root.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  root.setAttribute('color', new THREE.Float32BufferAttribute(paint, 3))
  root.setIndex(idx)
  root.computeVertexNormals()
  // rootlets, out of the grooves
  const lets: THREE.BufferGeometry[] = []
  for (let k = 0; k < 22; k++) {
    const t = 0.1 + 0.62 * r()
    const i = Math.round(t * NT)
    const a = groove(t) + (k % 2 ? Math.PI : 0) + (r() - 0.5) * 0.3
    const out = V(Math.cos(a), 0, Math.sin(a))
    const p0 = V(out.x * profile[i].x * 0.86 + bend(t), profile[i].y, out.z * profile[i].x * 0.86)
    const len = 0.07 + 0.13 * r()
    lets.push(tube([p0, p0.clone().addScaledVector(out, len * 0.55).add(V(0, -len * 0.25, (r() - 0.5) * 0.05)), p0.clone().addScaledVector(out, len).add(V((r() - 0.5) * 0.05, -len * 0.75, (r() - 0.5) * 0.06))], (u) => 0.0055 * (1 - 0.8 * u), 4, 7))
  }
  // the rosette
  const stalks: THREE.BufferGeometry[] = []
  const blades: THREE.BufferGeometry[] = []
  const N = 13
  for (let k = 0; k < N; k++) {
    const a = k * 2.4 + 0.3
    const outer = k / (N - 1)
    const out = V(Math.cos(a), 0, Math.sin(a))
    const base = V(out.x * 0.03 * outer, 0.2, out.z * 0.03 * outer)
    const reach = 0.12 + 0.3 * outer
    const rise = 0.36 - 0.2 * outer
    const neck = base.clone().addScaledVector(out, reach * 0.5).add(V(0, rise, 0))
    stalks.push(tube([base, base.clone().addScaledVector(out, reach * 0.2).add(V(0, rise * 0.55, 0)), neck], (u) => 0.017 - 0.007 * u, 6, 9))
    const len = 0.34 + 0.2 * outer + 0.06 * r()
    // the blade lifts from the stalk, then bows under its own weight - the outer ones right over
    const droop = 0.1 + 0.34 * outer
    blades.push(ribbon([neck, neck.clone().addScaledVector(out, len * 0.34).add(V(0, len * (0.42 - 0.3 * outer), 0)), neck.clone().addScaledVector(out, len * 0.72).add(V(0, len * (0.5 - 0.7 * outer), 0)), neck.clone().addScaledVector(out, len).add(V(0, len * (0.42 - 0.7 * outer) - droop * 0.5, 0))], leafW(0.13 + 0.07 * outer, 0.5), V(-out.z, 0, out.x), 0.16, 24, 0.05 + 0.12 * r()))
  }
  return [
    { geo: merge([root]), mat: painted({ roughness: 0.74, sheen: 0.3 }) },
    { geo: merge(lets), mat: plant('#cdbb92', { roughness: 0.8 }) },
    { geo: merge(stalks), mat: plant('#a9bd73', { roughness: 0.5 }) },
    { geo: merge(blades), mat: plant('#3f7234', { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 }) },
  ]
}

/**
 * A shape turned on a lathe, with a skin: `f` is asked, ring by ring and round each ring, for the radius there and
 * the colour (t 0…1 up the profile, a the angle).
 */
function turned(profile: [number, number][], NT: number, NA: number, f: (t: number, a: number, rad: number, y: number, out: THREE.Color) => number) {
  const pts = new THREE.SplineCurve(profile.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(NT)
  const pos: number[] = []
  const paint: number[] = []
  const idx: number[] = []
  const tint = new THREE.Color()
  for (let i = 0; i <= NT; i++) {
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * Math.PI * 2
      const rad = f(i / NT, a, pts[i].x, pts[i].y, tint)
      pos.push(Math.cos(a) * rad, pts[i].y, Math.sin(a) * rad)
      paint.push(tint.r, tint.g, tint.b)
      if (i < NT && j < NA) {
        const k = i * (NA + 1) + j
        idx.push(k, k + NA + 1, k + 1, k + 1, k + NA + 1, k + NA + 2)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(paint, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** An onion: the papery skin streaked from root to neck, fine veins in it, the dry neck, the beard of roots. */
function bulb(c: string, r: () => number): Parts {
  const base = new THREE.Color(col('#c98a40', c, 0.15))
  const vein = new THREE.Color('#8a5424')
  const dry = new THREE.Color('#d8bd8e')
  const plate = new THREE.Color('#b29a70')
  const b = turned([[0.001, -0.18], [0.1, -0.166], [0.2, -0.075], [0.236, 0.03], [0.2, 0.14], [0.105, 0.235], [0.045, 0.3], [0.03, 0.38], [0.022, 0.46], [0.001, 0.47]], 90, 120, (t, a, rad, y, out) => {
    const x = Math.cos(a)
    const z = Math.sin(a)
    const streak = noise3(x * 6 + 2, 0.4, z * 6)
    const lines = Math.pow(0.5 + 0.5 * Math.sin(a * 44 + 5 * noise3(x * 2, y * 3, z * 2)), 10)
    out.copy(base).multiplyScalar(0.78 + 0.4 * streak).lerp(vein, 0.4 * lines)
    out.lerp(dry, ss(0.66, 0.86, t) * 0.85).lerp(plate, ss(0.1, 0.02, t))
    // the skin sits in shallow flutes, and wrinkles where it dries toward the neck
    return rad * (1 + 0.012 * Math.sin(a * 22 + streak * 4)) + 0.004 * Math.sin(a * 60) * ss(0.7, 0.95, t)
  })
  const roots: THREE.BufferGeometry[] = []
  for (let k = 0; k < 20; k++) {
    const a = r() * Math.PI * 2
    const d = 0.02 + 0.03 * r()
    roots.push(tube([V(Math.cos(a) * d, -0.172, Math.sin(a) * d), V(Math.cos(a) * (d + 0.04), -0.24, Math.sin(a) * (d + 0.04)), V(Math.cos(a + 0.4) * (d + 0.09), -0.3 - 0.06 * r(), Math.sin(a + 0.4) * (d + 0.09))], (u) => 0.0042 * (1 - 0.7 * u), 4, 7))
  }
  return [
    { geo: merge([b]), mat: painted({ roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.3 }) },
    { geo: merge(roots), mat: plant('#d8c6a2') },
  ]
}

function boll(r: () => number): Parts {
  const lint: THREE.BufferGeometry[] = []
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2
    lint.push(at(lump(0.13, 0.12, 0.13, 0.22, 3.2, k * 2.3, 4), place(V(Math.cos(a) * 0.1, 0.08, Math.sin(a) * 0.1), new THREE.Euler(r(), r(), r()))))
  }
  const bracts: THREE.BufferGeometry[] = []
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const out = V(Math.cos(a), 0, Math.sin(a))
    bracts.push(ribbon([V(0, -0.02, 0), out.clone().multiplyScalar(0.14).add(V(0, -0.04, 0)), out.clone().multiplyScalar(0.24).add(V(0, 0.04, 0))], leafW(0.06, 0.5), V(-out.z, 0, out.x), 0.4, 10))
  }
  const stem = tube([V(0, -0.04, 0), V(0.04, -0.25, 0), V(0.02, -0.5, 0)], () => 0.014, 6, 10)
  return [
    { geo: merge(lint), mat: plant('#f1ece2', { roughness: 0.95, sheen: 1, sheenRoughness: 0.9 }) },
    { geo: merge([...bracts, stem]), mat: plant('#6e4a30', { roughness: 0.8 }) },
  ]
}

function cane(id: string, c: string, r: () => number): Parts {
  const stalks: THREE.BufferGeometry[] = []
  const nodes: THREE.BufferGeometry[] = []
  const n = id === 'jute' ? 1 : 3
  for (let s = 0; s < n; s++) {
    const x = (s - (n - 1) / 2) * 0.1
    const R = id === 'jute' ? 0.018 : 0.04
    stalks.push(tube([V(x, -1.2, s * 0.03), V(x + 0.02, 0, 0), V(x + 0.05, 0.9, -s * 0.02)], () => R, 10, 20))
    for (let k = 0; k < 7; k++) nodes.push(at(new THREE.TorusGeometry(R * 1.02, R * 0.12, 6, 16), place(V(x + 0.02 * (k / 7), -1.0 + k * 0.28, 0), new THREE.Euler(Math.PI / 2, 0, 0))))
  }
  const leaves: THREE.BufferGeometry[] = []
  for (let k = 0; k < 5; k++) {
    const a = k * 2.4
    const out = V(Math.cos(a), 0, Math.sin(a))
    const base = V(0.04, 0.4 + k * 0.12, 0)
    leaves.push(ribbon([base, base.clone().addScaledVector(out, 0.25).add(V(0, 0.25, 0)), base.clone().addScaledVector(out, 0.55).add(V(0, 0.1, 0))], leafW(id === 'jute' ? 0.05 : 0.045), V(-out.z, 0, out.x), 0.35, 18, 0.4))
  }
  return [
    { geo: merge(stalks), mat: glossy(col(id === 'jute' ? '#7d8f46' : '#a8a050', c, 0.15), { roughness: 0.4, clearcoat: 0.3 }) },
    { geo: merge(nodes.length ? nodes : [new THREE.BufferGeometry()]), mat: plant('#c9b88a') },
    { geo: merge(leaves), mat: plant('#6b9442') },
  ]
}

function broadleaf(id: string, c: string, r: () => number): Parts {
  const leaves: THREE.BufferGeometry[] = []
  const extra: Parts = []
  if (id === 'castor') {
    // a palmate leaf: seven lobes from one point, and the spiny capsules below
    for (let k = 0; k < 7; k++) {
      const a = Math.PI / 2 + (k - 3) * 0.48
      const out = V(Math.cos(a), Math.sin(a) * 0.9, 0.12)
      leaves.push(ribbon([V(0, 0, 0), out.clone().multiplyScalar(0.28), out.clone().multiplyScalar(0.55).add(V(0, 0, -0.04))], leafW(0.09, 0.8), V(-out.y, out.x, 0), 0.3, 14))
    }
    const caps: THREE.BufferGeometry[] = []
    for (let k = 0; k < 5; k++) caps.push(at(lump(0.06, 0.06, 0.06, 0.35, 6, k, 3), place(V(-0.05 + k * 0.06, -0.35 - (k % 2) * 0.06, 0.08), new THREE.Euler())))
    extra.push({ geo: merge(caps), mat: plant(col('#8a3a3a', c, 0.2), { roughness: 0.6 }) })
    leaves.push(tube([V(0, 0, 0), V(0, -0.3, 0.02), V(0.05, -0.7, 0)], () => 0.014, 6, 10))
  } else {
    // tobacco: a rosette of long leaves; taro: one broad heart leaf on its stalk, the corm below
    const n = id === 'taro' ? 1 : 4
    for (let k = 0; k < n; k++) {
      const a = id === 'taro' ? 0 : k * 1.6 + 0.4
      const out = V(Math.cos(a), 0.6, Math.sin(a) * 0.7).normalize()
      const base = id === 'taro' ? V(0, 0.3, 0) : V(0, -0.1 + k * 0.12, 0)
      const len = id === 'taro' ? 0.8 : 0.85 - k * 0.1
      const w = id === 'taro' ? 0.36 : 0.24
      leaves.push(ribbon([base, base.clone().addScaledVector(out, len * 0.4).add(V(0, 0.08, 0)), base.clone().addScaledVector(out, len).add(V(0, -0.05, 0))], (t) => w * Math.pow(Math.sin(Math.PI * Math.min(1, id === 'taro' ? 0.25 + t * 0.75 : t)), 0.7), V(-out.z, 0, out.x), 0.15, 22, 0.2))
    }
    if (id === 'taro') {
      leaves.push(tube([V(0, -0.5, 0), V(0.05, -0.1, 0), V(0, 0.3, 0)], () => 0.025, 6, 10))
      extra.push({ geo: merge([at(lump(0.18, 0.22, 0.18, 0.12, 2.6, 3, 4), place(V(0, -0.65, 0), new THREE.Euler()))]), mat: plant('#6b4a35', { roughness: 0.85 }) })
    } else leaves.push(tube([V(0, -0.6, 0), V(0, 0.4, 0)], () => 0.02, 6, 8))
  }
  return [{ geo: merge(leaves), mat: plant(col(id === 'tobacco' ? '#7a9a48' : '#4f8040', c, 0.12), { roughness: 0.5, sheen: 0.6 }) }, ...extra]
}

function head(id: string, c: string, r: () => number): Parts {
  const cab = id === 'cabbage'
  const core = cab ? lump(0.26, 0.24, 0.26, 0.05, 2.2, 2, 4) : lump(0.15, 0.12, 0.15, 0.12, 3, 5, 4)
  const inner: THREE.BufferGeometry[] = []
  const outer: THREE.BufferGeometry[] = []
  // rings of leaves, each a patch of a sphere cupped round the head and flared out at its rim, creased on its midrib
  const rings = cab
    ? [{ n: 5, R: 0.29, open: 0.12, h: 1.5 }, { n: 7, R: 0.36, open: 0.5, h: 1.45 }]
    : [{ n: 6, R: 0.2, open: 0.35, h: 1.6 }, { n: 8, R: 0.3, open: 0.75, h: 1.5 }, { n: 9, R: 0.38, open: 1.05, h: 1.35 }]
  rings.forEach((ring, ri) => {
    for (let k = 0; k < ring.n; k++) {
      const a = (k / ring.n) * Math.PI * 2 + ri * 0.4 + r() * 0.25
      const g = new THREE.SphereGeometry(ring.R, 22, 16, Math.PI - 0.65, 1.3, 0.3, ring.h)
      const pos = g.attributes.position as THREE.BufferAttribute
      const v = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        const up = Math.max(0, v.y / ring.R)
        const ang = Math.atan2(v.z, v.x) // 0 on the leaf's midrib (+x)
        const ruff = 1 + (cab ? 0.025 : 0.09) * Math.sin(ang * (cab ? 9 : 17) + v.y * 30) * up
        const crease = 1 - 0.04 * Math.exp(-(ang * ang) * 40)
        pos.setXYZ(i, v.x * ruff * crease, v.y, v.z * ruff * crease)
      }
      g.computeVertexNormals()
      const m = new THREE.Matrix4().makeTranslation(0, ring.R * 0.55, 0)
      m.premultiply(new THREE.Matrix4().makeRotationZ(-ring.open))
      m.premultiply(new THREE.Matrix4().makeTranslation(0, -ring.R * 0.55, 0))
      m.premultiply(new THREE.Matrix4().makeRotationY(a))
      g.applyMatrix4(m)
      ;(ri === 0 ? inner : outer).push(g)
    }
  })
  return [
    { geo: merge([core, ...inner]), mat: plant(col(cab ? '#c9d9a4' : '#b9df7a', c, 0.08), { roughness: 0.42, sheen: 0.8 }) },
    { geo: merge(outer), mat: plant(col(cab ? '#6f9a84' : '#7fbf4f', c, 0.1), { roughness: 0.48, sheen: 0.7 }) },
  ]
}

function truss(id: string, c: string, r: () => number): Parts {
  const fruit: THREE.BufferGeometry[] = []
  const green: THREE.BufferGeometry[] = []
  const seeds: THREE.BufferGeometry[] = []
  if (id === 'strawberry') {
    for (let k = 0; k < 2; k++) {
      const berry = lathe([[0.001, -0.22], [0.08, -0.15], [0.14, -0.02], [0.13, 0.06], [0.06, 0.1], [0.001, 0.1]], 28)
      const pos = V(k * 0.22 - 0.1, k * -0.08, k * 0.05)
      const rot = new THREE.Euler(0.2, 0, 0.3 - k * 0.6)
      fruit.push(at(berry, place(pos, rot)))
      green.push(at(flower(7, 0.09, 0.025, -0.15), place(pos.clone().add(V(0, 0.1, 0)), rot)))
      for (let i = 0; i < 46; i++) {
        const y = -0.2 + (i / 46) * 0.28
        const a = i * 2.39996
        const t = (y + 0.22) / 0.32
        const rr = 0.135 * Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.75)) + 0.004
        seeds.push(at(ellipsoid(0.006, 0.009, 0.005, 5, 4), place(V(Math.cos(a) * rr, y, Math.sin(a) * rr), new THREE.Euler()).premultiply(place(pos, rot))))
      }
    }
  } else {
    const n = id === 'cherry' ? 6 : 4
    const R = id === 'cherry' ? 0.075 : 0.15
    const spine = [V(-0.45, 0.35, 0), V(-0.15, 0.32, 0.02), V(0.1, 0.22, 0), V(0.35, 0.08, 0.02)]
    green.push(tube(spine, () => 0.014, 6, 20))
    const axis = new THREE.CatmullRomCurve3(spine)
    const p = new THREE.Vector3()
    for (let k = 0; k < n; k++) {
      axis.getPointAt(0.15 + (k / n) * 0.82, p)
      const pos = p.clone().add(V((r() - 0.5) * 0.05, -R * 1.25 - 0.05 * (k % 2), (k % 2 ? 1 : -1) * R * 0.5))
      green.push(tube([p, p.clone().lerp(pos, 0.5).add(V(0, 0.02, 0)), pos.clone().add(V(0, R * 0.9, 0))], () => 0.006, 4, 6))
      const ball = new THREE.SphereGeometry(R, 32, 22)
      const pp = ball.attributes.position as THREE.BufferAttribute
      const v = new THREE.Vector3()
      for (let i = 0; i < pp.count; i++) {
        v.fromBufferAttribute(pp, i)
        const a = Math.atan2(v.z, v.x)
        const rib = 1 + (id === 'tomato' ? 0.035 * Math.cos(a * 6) * (1 - Math.abs(v.y / R)) : 0)
        pp.setXYZ(i, v.x * rib, v.y * 0.86, v.z * rib)
      }
      ball.computeVertexNormals()
      fruit.push(at(ball, place(pos, new THREE.Euler(0, r() * 3, 0))))
      green.push(at(flower(5, R * 0.55, R * 0.12, 0.1), place(pos.clone().add(V(0, R * 0.84, 0)), new THREE.Euler())))
    }
  }
  return [
    { geo: merge(fruit), mat: glossy(col(id === 'strawberry' ? '#c8243a' : '#c9321f', c, 0.1), { roughness: 0.2, clearcoat: 0.9 }) },
    { geo: merge(green), mat: plant('#4f8a3a', { roughness: 0.5 }) },
    ...(seeds.length ? [{ geo: merge(seeds), mat: plant('#e8c84a') }] : []),
  ]
}

function longfruit(id: string, c: string): Parts {
  const body: Record<string, string> = { pepper: '#e8a020', chilli: '#c42a1a', eggplant: '#3e1f4a', okra: '#6e9a3e', cucumber: '#2f5a2a', courgette: '#4d7a35' }
  let g: THREE.BufferGeometry
  if (id === 'pepper') {
    g = lump(0.2, 0.24, 0.2, 0.05, 1.5, 4, 4)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const a = Math.atan2(v.z, v.x)
      const lobe = 1 + 0.12 * Math.cos(a * 3) * (0.5 - v.y)
      const taper = 1 - 0.25 * Math.max(0, -v.y / 0.24)
      pos.setXYZ(i, v.x * lobe * taper, v.y, v.z * lobe * taper)
    }
    g.computeVertexNormals()
  } else {
    const L = id === 'chilli' ? 0.75 : id === 'okra' ? 0.65 : id === 'eggplant' ? 0.7 : 0.95
    const R = id === 'chilli' ? 0.05 : id === 'okra' ? 0.06 : id === 'eggplant' ? 0.17 : 0.1
    const bend = id === 'chilli' ? 0.18 : id === 'eggplant' ? 0.08 : 0.04
    const prof = (t: number) => (id === 'eggplant' ? R * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.85)) ** 0.6 * (0.6 + 0.4 * t)) : id === 'chilli' || id === 'okra' ? R * (1 - t * 0.85) : R * (0.85 + 0.15 * Math.sin(Math.PI * t)))
    g = tube([V(0, 0, 0), V(L * 0.35, -bend, 0), V(L * 0.7, -bend * 0.6, 0), V(L, bend * 0.3, 0)], prof, id === 'okra' ? 10 : 16, 30)
    if (id === 'okra' || id === 'cucumber') {
      const pos = g.attributes.position as THREE.BufferAttribute
      const radial = id === 'okra' ? 10 : 16
      const line = new THREE.CatmullRomCurve3([V(0, 0, 0), V(L * 0.35, -bend, 0), V(L * 0.7, -bend * 0.6, 0), V(L, bend * 0.3, 0)])
      const cc = new THREE.Vector3()
      const v = new THREE.Vector3()
      for (let i = 0; i <= 30; i++) {
        line.getPointAt(i / 30, cc)
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j
          v.fromBufferAttribute(pos, k).sub(cc)
          const ridge = id === 'okra' ? 1 + 0.16 * Math.cos((j / radial) * Math.PI * 2 * 5) : 1 + 0.04 * (noise3(i * 0.7, j * 0.9, 3) - 0.5)
          pos.setXYZ(k, cc.x + v.x * ridge, cc.y + v.y * ridge, cc.z + v.z * ridge)
        }
      }
      g.computeVertexNormals()
    }
  }
  const capPos = id === 'pepper' ? V(0, 0.22, 0) : V(-0.01, 0, 0)
  const cap = at(flower(5, id === 'eggplant' ? 0.14 : 0.07, 0.03, -0.2), place(capPos, id === 'pepper' ? new THREE.Euler() : new THREE.Euler(0, 0, Math.PI / 2)))
  const stalk = id === 'pepper' ? tube([V(0, 0.2, 0), V(0.02, 0.3, 0), V(0.06, 0.36, 0)], () => 0.016, 6, 6) : tube([V(0, 0, 0), V(-0.06, 0.02, 0), V(-0.12, 0.06, 0)], () => 0.012, 6, 6)
  return [
    { geo: merge([g]), mat: glossy(col(body[id] ?? '#c9321f', c, 0.1), { roughness: id === 'okra' ? 0.5 : 0.2, clearcoat: id === 'okra' ? 0.1 : 0.85 }) },
    { geo: merge([cap, stalk]), mat: plant('#4f7d34') },
  ]
}

function melon(c: string): Parts {
  const g = new THREE.SphereGeometry(0.45, 48, 32)
  g.scale(1.2, 0.95, 1)
  const pos = g.attributes.position as THREE.BufferAttribute
  const colors: number[] = []
  const dark = new THREE.Color('#1f4524')
  const light = new THREE.Color('#7fa75a')
  const v = new THREE.Vector3()
  const cc = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const a = Math.atan2(v.z, v.y)
    const stripe = 0.5 + 0.5 * Math.sin(a * 9 + 1.2 * noise3(v.x * 4, v.y * 4, v.z * 4))
    cc.copy(light).lerp(dark, Math.pow(stripe, 0.6))
    colors.push(cc.r, cc.g, cc.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const stalk = tube([V(-0.54, 0, 0), V(-0.62, 0.05, 0), V(-0.68, 0.14, 0.02)], () => 0.018, 6, 6)
  return [
    { geo: g, mat: glossy(col('#ffffff', c, 0.05), { vertexColors: true, roughness: 0.3, clearcoat: 0.6 }) },
    { geo: merge([stalk]), mat: plant('#6b8a40') },
  ]
}

function herb(c: string): Parts {
  const stem = [V(0, -0.8, 0), V(0.02, -0.2, 0), V(0, 0.45, 0)]
  const leaves: THREE.BufferGeometry[] = []
  const axis = new THREE.CatmullRomCurve3(stem)
  const p = new THREE.Vector3()
  for (let k = 0; k < 5; k++) {
    axis.getPointAt(0.25 + k * 0.17, p)
    for (const side of [-1, 1]) {
      const a = k * 1.57 + (side > 0 ? 0 : Math.PI)
      const out = V(Math.cos(a), 0.35, Math.sin(a)).normalize()
      const L = 0.26 - k * 0.03
      leaves.push(ribbon([p, p.clone().addScaledVector(out, L * 0.5).add(V(0, 0.03, 0)), p.clone().addScaledVector(out, L)], leafW(0.08 - k * 0.008, 0.6), V(-out.z, 0, out.x), 0.45, 14))
    }
  }
  return [
    { geo: merge(leaves), mat: plant(col('#3f8a4a', c, 0.12), { roughness: 0.35, sheen: 0.6, clearcoat: 0.3 }) },
    { geo: merge([tube(stem, () => 0.012, 6, 10)]), mat: plant('#4f7a3a') },
  ]
}

function tuft(id: string, c: string, r: () => number): Parts {
  const blades: THREE.BufferGeometry[] = []
  const nB = id === 'grassley' ? 26 : 16
  for (let k = 0; k < nB; k++) {
    const a = r() * Math.PI * 2
    const out = V(Math.cos(a), 0, Math.sin(a))
    const h = 0.6 + 0.5 * r()
    const base = out.clone().multiplyScalar(0.05 * r())
    blades.push(ribbon([base, base.clone().addScaledVector(out, 0.08).add(V(0, h * 0.5, 0)), base.clone().addScaledVector(out, 0.25 + 0.15 * r()).add(V(0, h, 0))], leafW(0.014, 0.4), V(-out.z, 0, out.x), 0.35, 14, 0.4))
  }
  const parts: Parts = [{ geo: merge(blades), mat: plant('#6b9a45', { roughness: 0.5 }) }]
  if (id !== 'grassley') {
    // clover: trifoliate leaves on stalks and round flower heads
    const tri: THREE.BufferGeometry[] = []
    const heads: THREE.BufferGeometry[] = []
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + 0.3
      const top = V(Math.cos(a) * 0.22, 0.25 + 0.15 * r(), Math.sin(a) * 0.22)
      tri.push(tube([V(0, 0, 0), top.clone().multiplyScalar(0.5).add(V(0, 0.05, 0)), top], () => 0.006, 3, 6))
      for (let l = 0; l < 3; l++) {
        const b = a + (l - 1) * 2.1
        const d = V(Math.cos(b), 0.15, Math.sin(b)).normalize()
        tri.push(ribbon([top, top.clone().addScaledVector(d, 0.05), top.clone().addScaledVector(d, 0.09)], leafW(0.035, 0.5), V(-d.z, 0, d.x), 0.15, 8))
      }
    }
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1
      const top = V(Math.cos(a) * 0.12, 0.62 + 0.12 * r(), Math.sin(a) * 0.12)
      tri.push(tube([V(0, 0, 0), top], () => 0.006, 3, 4))
      heads.push(at(lump(0.06, 0.055, 0.06, 0.25, 7, k, 3), place(top, new THREE.Euler())))
    }
    parts.push({ geo: merge(tri), mat: plant('#4f8a3c') }, { geo: merge(heads), mat: plant(col('#e7a6c0', c, 0.15), { roughness: 0.7, sheen: 0.9 }) })
  }
  return parts
}

/** A clod of the field: crumbly, cracked where it dried, paler on its dry top than in the damp underneath; crumbs
 * broken off round it, and the stubble of the last crop. */
function clod(r: () => number): Parts {
  const mid = new THREE.Color('#6a5039')
  const dryTop = new THREE.Color('#9b7d59')
  const damp = new THREE.Color('#2c2018')
  const soil = skin(lump(0.42, 0.24, 0.36, 0.28, 2.2, 7, 26), (p, _n, c) => {
    const big = noise3(p.x * 5, p.y * 5, p.z * 5)
    const fine = noise3(p.x * 28, p.y * 28, p.z * 28)
    const crack = 1 - ss(0, 0.05, Math.abs(noise3(p.x * 8 + 3, p.y * 8, p.z * 8) - 0.5))
    c.copy(mid).lerp(dryTop, ss(-0.02, 0.2, p.y) * (0.35 + 0.5 * big)).lerp(damp, Math.max(crack * 0.85, ss(-0.05, -0.22, p.y) * 0.6)).multiplyScalar(0.8 + 0.4 * fine)
    return (big - 0.5) * 0.05 + (fine - 0.5) * 0.024 - crack * 0.022
  })
  const crumbs: THREE.BufferGeometry[] = []
  for (let k = 0; k < 16; k++) {
    const a = r() * Math.PI * 2
    const d = 0.4 + 0.26 * r()
    const s = 0.018 + 0.035 * r()
    crumbs.push(at(lump(s, s * 0.75, s * 0.9, 0.3, 2.5, k * 1.7, 2), place(V(Math.cos(a) * d, -0.2 + s * 0.4, Math.sin(a) * d * 0.85), new THREE.Euler(r() * 3, r() * 3, 0))))
  }
  const stubble: THREE.BufferGeometry[] = []
  for (let k = 0; k < 10; k++) {
    const a = r() * Math.PI * 2
    const base = V(Math.cos(a) * 0.2 * r(), 0.17, Math.sin(a) * 0.17 * r())
    stubble.push(tube([base, base.clone().add(V(0.05 * (r() - 0.5), 0.1 + 0.1 * r(), 0.05 * (r() - 0.5)))], (u) => 0.009 - 0.002 * u, 6, 3))
  }
  return [
    { geo: merge([soil]), mat: painted({ roughness: 0.96, sheen: 0.15 }) },
    { geo: merge(crumbs), mat: plant('#5a4434', { roughness: 0.95, sheen: 0.2 }) },
    { geo: merge(stubble), mat: plant('#c9a96a', { roughness: 0.6 }) },
  ]
}

/** three copies of a single-stem specimen, fanned from a shared foot, a little different in size and turn */
function sheaf(make: () => Parts, r: () => number, spread = 0.26): Parts {
  const copies = [make(), make(), make()]
  const poses = [
    place(V(0, 0, 0), new THREE.Euler(0, 0.2, 0), 1),
    place(V(-0.05, -0.06, 0.08), new THREE.Euler(0.05, -0.5 + r() * 0.2, spread), 0.9),
    place(V(0.05, -0.08, -0.08), new THREE.Euler(-0.05, 0.9 + r() * 0.2, -spread * 0.85), 0.94),
  ]
  return copies[0].map((part, i) => {
    const geo = merge(copies.map((c, k) => c[i].geo.clone().applyMatrix4(poses[k])))
    for (let k = 1; k < copies.length; k++) copies[k][i].mat.dispose()
    return { geo, mat: part.mat }
  })
}

// ---------- skins: bodies and blades with their own surface detail ----------
//
// The second generation of specimens - the greenhouse crops, and the field crops that read as a generic shape - is
// built from parametric surfaces rather than primitives: bodies round a bent axis whose radius varies with the angle
// (lobes, ribs, warts, seed pits, a peanut's net), rounded solids pushed out by a function of direction (seeds, beans),
// and leaf blades with a cupped section, a waved edge and painted veins. Normals come from the surface function itself
// (no seams, no faceting); colour is painted per vertex (ripeness, stripes, speckles, a black eye).

const TAU = Math.PI * 2
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const C = (c: THREE.ColorRepresentation) => new THREE.Color(c)
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.min(1, Math.max(0, t)))

/** a parametric surface, u 0…1 along, v 0…1 across (wrapping round when `wrap`); normals = dP/du × dP/dv */
function surf(nu: number, nv: number, P: (u: number, v: number) => THREE.Vector3, o: { wrap?: boolean; color?: (u: number, v: number) => THREE.Color } = {}) {
  const wrap = o.wrap ?? true
  const pos: number[] = []
  const nor: number[] = []
  const cols: number[] = []
  const idx: number[] = []
  const e = 1e-3
  const du = new THREE.Vector3()
  const dv = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i <= nu; i++) {
    const u = i / nu
    const ud = Math.min(0.996, Math.max(0.004, u)) // off the poles, where dP/dv vanishes
    for (let j = 0; j <= nv; j++) {
      const v = j / nv
      const p = P(u, v)
      pos.push(p.x, p.y, p.z)
      du.copy(P(Math.min(1, ud + e), v)).sub(P(Math.max(0, ud - e), v))
      dv.copy(P(ud, wrap ? v + e : Math.min(1, v + e))).sub(P(ud, wrap ? v - e : Math.max(0, v - e)))
      n.crossVectors(du, dv)
      if (n.lengthSq() < 1e-24) n.set(0, 1, 0)
      n.normalize()
      nor.push(n.x, n.y, n.z)
      if (o.color) {
        const c = o.color(u, v)
        cols.push(c.r, c.g, c.b)
      }
      if (i < nu && j < nv) {
        const a = i * (nv + 1) + j
        const b = a + nv + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  g.setIndex(idx)
  return g
}

type AxisFn = (u: number) => THREE.Vector3
/** the frame of an axis at u: its tangent and two normals, the first as close to `ref` as the tangent allows */
function axisFrame(A: AxisFn, ref: THREE.Vector3, u: number) {
  const e = 1e-3
  const T = A(Math.min(1, u + e)).sub(A(Math.max(0, u - e))).normalize()
  const N1 = ref.clone().addScaledVector(T, -ref.dot(T)).normalize()
  const N2 = new THREE.Vector3().crossVectors(N1, T)
  return { T, N1, N2 }
}
const refOf = (A: AxisFn) => (Math.abs(A(1).sub(A(0)).normalize().y) > 0.7 ? V(1, 0, 0) : V(0, 1, 0))

/** a body round a bent axis A(u): its radius r(u, a) at each point and angle; `arc` opens it (a split pod, a shell) */
function axial(nu: number, nv: number, A: AxisFn, r: (u: number, a: number) => number, o: { arc?: [number, number]; squash?: number; color?: (u: number, a: number) => THREE.Color } = {}) {
  const ref = refOf(A)
  const [a0, a1] = o.arc ?? [0, TAU]
  const sq = o.squash ?? 1
  const P = (u: number, v: number) => {
    const a = a0 + v * (a1 - a0)
    const { N1, N2 } = axisFrame(A, ref, u)
    const rr = r(u, a)
    return A(u).addScaledVector(N1, Math.cos(a) * rr).addScaledVector(N2, Math.sin(a) * rr * sq)
  }
  return surf(nu, nv, P, { wrap: !o.arc, color: o.color ? (u, v) => o.color!(u, a0 + v * (a1 - a0)) : undefined })
}
/** the flat cut end of an axial body at u (its rim follows r): s runs 0 at the centre … 1 at the rim */
function axialCap(nv: number, A: AxisFn, r: (u: number, a: number) => number, u: number, color: (s: number, a: number) => THREE.Color, o: { squash?: number } = {}) {
  const ref = refOf(A)
  const { N1, N2 } = axisFrame(A, ref, u)
  const c = A(u)
  const sq = o.squash ?? 1
  const dir = u < 0.5 ? 1 : -1 // the cap faces out of the body at either end
  const P = (s: number, v: number) => {
    const a = dir * v * TAU
    const rr = r(u, a) * s
    return c.clone().addScaledVector(N1, Math.cos(a) * rr).addScaledVector(N2, Math.sin(a) * rr * sq)
  }
  return surf(8, nv, P, { color: (s, v) => color(s, dir * v * TAU) })
}
/** a rounded solid: each direction of the unit sphere pushed out to rad(dir), then moved by `post` (a bend) */
function blob(nu: number, nv: number, rad: (d: THREE.Vector3) => number, o: { post?: (p: THREE.Vector3) => THREE.Vector3; color?: (d: THREE.Vector3) => THREE.Color } = {}) {
  const dirOf = (u: number, v: number) => {
    const th = Math.PI * u
    const a = TAU * v
    return V(Math.sin(th) * Math.cos(a), -Math.cos(th), Math.sin(th) * Math.sin(a))
  }
  const P = (u: number, v: number) => {
    const d = dirOf(u, v)
    const p = d.multiplyScalar(rad(d.clone()))
    return o.post ? o.post(p) : p
  }
  return surf(nu, nv, P, { color: o.color ? (u, v) => o.color!(dirOf(u, v)) : undefined })
}
const ellR = (a: number, b: number, c: number) => (d: THREE.Vector3) => 1 / Math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / c) ** 2)
const n3 = (d: THREE.Vector3, f: number, s = 0) => noise3(d.x * f + s, d.y * f, d.z * f)

/** a leaf blade along `pts`: u from the base to the tip, s across (−1 … 1, the midrib at 0); cupped, waved, puckered */
function blade(
  pts: THREE.Vector3[],
  width: (u: number) => number,
  side: THREE.Vector3,
  o: { cup?: number; wave?: number; freq?: number; twist?: number; bump?: (u: number, s: number) => number; color?: (u: number, s: number) => THREE.Color; nu?: number; nv?: number } = {},
) {
  const curve = new THREE.CatmullRomCurve3(pts)
  const p = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const sd = new THREE.Vector3()
  const nn = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const cup = o.cup ?? 0.25
  const wave = o.wave ?? 0
  const freq = o.freq ?? 4
  const P = (u: number, v: number) => {
    const t = Math.min(1, Math.max(0, u))
    curve.getPointAt(t, p)
    curve.getTangentAt(t, tan)
    sd.copy(side).addScaledVector(tan, -side.dot(tan)).normalize()
    if (o.twist) sd.applyQuaternion(q.setFromAxisAngle(tan, o.twist * t))
    nn.crossVectors(tan, sd).normalize()
    const x = v * 2 - 1
    const w = width(t)
    const lift = w * (cup * x * x + wave * Math.sin(freq * TAU * t + x * 1.7) * x * x + (o.bump ? o.bump(t, x) : 0))
    return p.clone().addScaledVector(sd, w * x).addScaledVector(nn, lift)
  }
  return surf(o.nu ?? 26, o.nv ?? 12, P, { wrap: false, color: o.color ? (u, v) => o.color!(u, v * 2 - 1) : undefined })
}
/** a leaf's paint: the blade's green, a pale midrib and pale lateral veins running out toward the tip */
const veined = (leaf: string, rib: string, veins = 7, pale = 0.4, edge?: string) => {
  const L = C(leaf)
  const R = C(rib)
  const E = edge ? C(edge) : null
  return (u: number, s: number) => {
    const a = Math.abs(s)
    const mid = Math.exp(-a * a * 220)
    const vein = Math.pow(Math.max(0, Math.cos((u * veins - a * 0.85) * TAU)), 30) * (1 - a) * sstep(0.05, 0.22, a) * sstep(0.02, 0.15, u)
    const c = mix(L, R, mid + vein * pale)
    return E ? mix(c, E, sstep(0.75, 1, a) * 0.45) : c
  }
}
/** a painted surface: the colour lives in the vertices */
const painted = (o: THREE.MeshPhysicalMaterialParameters = {}) => new THREE.MeshPhysicalMaterial({ ...UNI, color: 0xffffff, vertexColors: true, roughness: 0.5, ...o })
const leafSkin = (sheen = '#d8e8b0', o: THREE.MeshPhysicalMaterialParameters = {}) => painted({ roughness: 0.5, sheen: 0.55, sheenRoughness: 0.55, sheenColor: C(sheen), ...o })
const xf = (g: THREE.BufferGeometry, pos: THREE.Vector3, rot: THREE.Euler, s: number | THREE.Vector3 = 1) => at(g, place(pos, rot, s))



// ----- cucumber: a long dark fruit, faintly ribbed and warted, pale stripes at the blossom end where the flower has
// shrivelled; the stalk, a coiled tendril and a leaf behind
function cucumber(): Parts {
  const L = 1.0
  const R = 0.1
  const A: AxisFn = (u) => V(L * (u - 0.5), -0.07 * Math.sin(Math.PI * u), 0.02 * Math.sin(TAU * u))
  const wart = (u: number, a: number) => sstep(0.7, 0.88, noise3(u * 52, Math.cos(a) * 4.5 + 7, Math.sin(a) * 4.5))
  const r = (u: number, a: number) => {
    const env = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 5)), 0.5) * (0.72 + 0.28 * sstep(0, 0.35, u))
    return R * env * (1 + 0.03 * Math.cos(8 * a) + 0.075 * wart(u, a) * sstep(0.02, 0.1, u) * sstep(0.98, 0.9, u))
  }
  const dark = C('#1f3f15')
  const light = C('#86a856')
  const tipC = C('#b4c27a')
  const color = (u: number, a: number) => {
    const stripe = sstep(0.1, 0.95, Math.cos(8 * a + 1.6 * noise3(u * 6, Math.cos(a), Math.sin(a)))) * sstep(0.45, 1, u) * 0.7
    return mix(mix(mix(dark, light, stripe), tipC, wart(u, a) * 0.22), C('#3f5c26'), 0.3 * sstep(0.2, 0, u))
  }
  const body = axial(130, 44, A, r, { color })
  const stalk = tube([V(-0.49, 0, 0), V(-0.58, 0.015, 0), V(-0.65, 0.07, 0.01)], (t) => 0.018 * (1.25 - 0.4 * t), 7, 10)
  const coil: THREE.Vector3[] = []
  for (let k = 0; k <= 30; k++) {
    const t = k / 30
    const rr = 0.04 * (1 - 0.55 * t)
    coil.push(V(-0.64 - 0.02 * t + rr * Math.cos(t * 5.5 * Math.PI), 0.09 + 0.3 * t, rr * Math.sin(t * 5.5 * Math.PI)))
  }
  const tendril = tube(coil, () => 0.0045, 5, 90)
  const flowerEnd = xf(flower(5, 0.06, 0.024, 0.3), V(0.5, -0.004, 0), new THREE.Euler(0, 0, -Math.PI / 2))
  return [
    { geo: body, mat: painted({ roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.3 }) },
    { geo: merge([stalk, tendril]), mat: plant('#5e8a38') },
    { geo: merge([flowerEnd]), mat: plant('#c9a23e', { roughness: 0.8 }) },
  ]
}

// ----- courgette: a straight, faintly five-sided fruit flecked pale, its yellow flower still open at the end
function courgette(): Parts {
  const L = 0.85
  const R = 0.1
  const A: AxisFn = (u) => V(L * (u - 0.5), 0.015 * Math.sin(Math.PI * u), 0)
  const r = (u: number, a: number) => {
    const env = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 6)), 0.45) * (0.6 + 0.4 * sstep(0, 0.4, u))
    return R * env * (1 + 0.045 * Math.pow(0.5 + 0.5 * Math.cos(5 * a), 3))
  }
  const deep = C('#1d3a16')
  const midC = C('#3d6a2a')
  const fleck = C('#bcd290')
  const color = (u: number, a: number) => {
    const f = sstep(0.74, 0.8, noise3(u * 120, Math.cos(a) * 9 + 3, Math.sin(a) * 9))
    const band = 0.5 + 0.5 * Math.cos(5 * a)
    return mix(mix(deep, midC, band * 0.5 + 0.2 * sstep(0.5, 1, u)), fleck, f * 0.32)
  }
  const body = axial(110, 44, A, r, { color })
  const SA: AxisFn = (u) => V(-L * 0.5 + 0.02 - 0.12 * u, 0.04 * u * u, 0)
  const sr = (u: number, a: number) => 0.03 * (1 + 0.6 * sstep(0.35, 0, u)) * (1 + 0.14 * Math.cos(5 * a))
  const stalk = axial(18, 20, SA, sr)
  const stalkEnd = axialCap(20, SA, sr, 1, (s) => mix(C('#c9d79a'), C('#6f8a48'), s))
  // the flower: a trumpet flaring into five pointed lobes, green at its base, deepening to orange in the throat
  const FA: AxisFn = (u) => V(L * 0.5 - 0.02 + 0.2 * u, 0.015 + 0.02 * u * u, 0)
  const bloom = axial(40, 60, FA, (u, a) => (0.026 + 0.03 * u + 0.16 * sstep(0.4, 1, u) ** 1.4) * (1 + 0.3 * Math.pow(0.5 + 0.5 * Math.cos(5 * a), 2) * sstep(0.6, 1, u)), {
    color: (u, a) => mix(mix(C('#7d9a3e'), C('#e08a1c'), sstep(0.05, 0.3, u)), C('#f6b324'), sstep(0.45, 0.95, u) * (0.75 + 0.25 * Math.cos(5 * a))),
  })
  return [
    { geo: body, mat: painted({ roughness: 0.36, clearcoat: 0.45, clearcoatRoughness: 0.3 }) },
    { geo: merge([stalk, stalkEnd]), mat: plant('#6f8a48') },
    { geo: bloom, mat: painted({ roughness: 0.6, sheen: 0.7, sheenColor: C('#ffe6a8') }) },
  ]
}

// ----- bell pepper: four lobes, four feet round a dimple, shoulders folding into the stalk; red in front, yellow behind
function bellPepper(): Parts {
  const H = 0.5
  const R = 0.24
  const one = (body: string, groove: string, light: string) => {
    const r = (u: number, a: number) => {
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.33) * (0.86 + 0.14 * u)
      return R * env * (1 + 0.09 * Math.cos(4 * a) * (0.55 + 0.45 * (1 - u)))
    }
    const P = (u: number, v: number) => {
      const a = v * TAU
      const lobe = Math.cos(4 * a)
      const rr = r(u, a)
      let y = H * (u - 0.5)
      y -= 0.05 * Math.pow(0.5 + 0.5 * lobe, 2) * sstep(0.32, 0.04, u) // four feet
      y += 0.05 * sstep(0.12, 0, u) // the dimple between them
      y -= 0.1 * sstep(0.8, 1, u) // shoulders fold into the stalk pit
      return V(Math.cos(a) * rr, y, Math.sin(a) * rr)
    }
    const B = C(body)
    const G = C(groove)
    const Lc = C(light)
    return surf(70, 64, P, { color: (u, v) => mix(mix(G, B, 0.5 + 0.5 * Math.cos(4 * v * TAU)), Lc, 0.25 * sstep(0.5, 0.9, u) * (0.5 + 0.5 * Math.cos(4 * v * TAU))) })
  }
  const red = one('#a80f0a', '#5c0705', '#d0261a')
  const yellow = xf(one('#e09a0e', '#9a5a06', '#f2c040'), V(-0.3, -0.03, -0.3), new THREE.Euler(0.12, 0.9, 0.12), 0.86)
  const stalkOf = (pos: THREE.Vector3, rot: THREE.Euler, s: number) => [
    xf(tube([V(0, 0.12, 0), V(0.01, 0.22, 0), V(0.05, 0.3, 0.01)], (t) => 0.028 * (1 - 0.25 * t), 8, 10), pos, rot, s),
    xf(flower(6, 0.085, 0.04, -0.08), pos.clone().add(V(0, 0.135 * s, 0)), rot, s),
    xf(ellipsoid(0.022, 0.006, 0.022), pos.clone().add(V(0.05, 0.3, 0.01).multiplyScalar(s)), rot, s),
  ]
  return [
    { geo: merge([red, yellow]), mat: painted({ roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 }) },
    { geo: merge([...stalkOf(V(0, 0, 0), new THREE.Euler(), 1), ...stalkOf(V(-0.3, -0.03, -0.3), new THREE.Euler(0.12, 0.9, 0.12), 0.86)]), mat: plant('#55803a', { roughness: 0.5 }) },
  ]
}

// ----- aubergine: a glossy near-black club, pale under the calyx, whose spiky sepals lie down over the shoulder
function aubergine(): Parts {
  const H = 0.78
  const R = 0.2
  const A: AxisFn = (u) => V(0.05 * Math.sin(Math.PI * u * 0.9), H * u, 0)
  const prof = (u: number) => {
    const bottom = u < 0.36 ? Math.sqrt(Math.max(0, 1 - ((0.36 - u) / 0.36) ** 2)) : 1
    const neck = 1 - 0.58 * sstep(0.3, 1, u)
    const top = u > 0.93 ? Math.sqrt(Math.max(0, 1 - ((u - 0.93) / 0.07) ** 2)) : 1
    return R * bottom * neck * top
  }
  const r = (u: number, a: number) => prof(u) * (1 + 0.018 * Math.cos(3 * a + u * 4))
  const dark = C('#1a0820')
  const purple = C('#4d1a58')
  const pale = C('#c4cc9c')
  const color = (u: number, a: number) => mix(mix(dark, purple, 0.4 * sstep(0.55, 0, u) + 0.2 * noise3(u * 7, Math.cos(a) * 2, Math.sin(a) * 2)), pale, sstep(0.86, 0.96, u) * 0.75)
  const body = axial(90, 44, A, r, { color })
  const on = (u: number, a: number, lift: number) => {
    const c = A(u)
    const rr = r(u, a) + lift
    return c.add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr))
  }
  const green: THREE.BufferGeometry[] = []
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3
    const pts = [on(0.985, a, 0.004), on(0.94, a, 0.012), on(0.87, a + 0.05, 0.014), on(0.79, a + 0.1, 0.01)]
    green.push(blade(pts, (t) => 0.07 * Math.pow(1 - t, 0.85) * Math.min(1, 0.35 + t * 5), V(-Math.sin(a), 0, Math.cos(a)), { cup: 0.18, nu: 16, nv: 8 }))
  }
  const top = A(0.99)
  green.push(tube([top, top.clone().add(V(-0.01, 0.08, 0)), top.clone().add(V(0.03, 0.15, 0.01))], (t) => 0.032 * (1 - 0.25 * t), 8, 10))
  green.push(xf(ellipsoid(0.026, 0.006, 0.026), top.clone().add(V(0.03, 0.15, 0.01)), new THREE.Euler(0, 0, -0.35)))
  return [
    { geo: body, mat: painted({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 }) },
    { geo: merge(green), mat: plant('#5c7a3a', { roughness: 0.55 }) },
  ]
}

// ----- strawberry: a heart-shaped berry, its seeds sunk in pits on two Fibonacci spirals, the calyx flared on top
function strawberry(): Parts {
  const H = 0.34
  const R = 0.155
  const m1 = 8
  const m2 = 13
  const s1 = 30
  const s2 = 46
  const prof = (u: number) => R * Math.pow(Math.min(1, u / 0.78), 0.6) * (u > 0.78 ? Math.sqrt(Math.max(0, 1 - ((u - 0.78) / 0.22) ** 2)) : 1)
  const pit = (u: number, a: number) => Math.pow(0.5 + 0.5 * Math.cos(m1 * a + s1 * u), 5) * Math.pow(0.5 + 0.5 * Math.cos(m2 * a - s2 * u), 5)
  const fade = (u: number) => sstep(0.03, 0.14, u) * sstep(0.95, 0.82, u)
  const r = (u: number, a: number) => prof(u) * (1 - 0.07 * pit(u, a) * fade(u))
  const A: AxisFn = (u) => V(0, H * (u - 0.5), 0)
  const deep = C('#8e0912')
  const bright = C('#cf1d26')
  const shoulder = C('#e8a088')
  const fruits: THREE.BufferGeometry[] = []
  const seeds: THREE.BufferGeometry[] = []
  const greens: THREE.BufferGeometry[] = []
  const poses = [
    { pos: V(0, 0, 0), rot: new THREE.Euler(0.15, 0.4, 0.28), s: 1 },
    { pos: V(0.3, -0.04, -0.2), rot: new THREE.Euler(-0.1, 2.0, -0.35), s: 0.82 },
  ]
  for (const pose of poses) {
    const m = place(pose.pos, pose.rot, pose.s)
    fruits.push(axial(70, 56, A, r, { color: (u, a) => mix(mix(deep, bright, 0.55 + 0.45 * noise3(u * 5, Math.cos(a) * 1.5, Math.sin(a) * 1.5) - 0.35 * pit(u, a)), shoulder, sstep(0.9, 1, u) * 0.5) }).applyMatrix4(m))
    // the seeds: where both spirals peak
    const D = m1 * s2 + s1 * m2
    for (let i = 0; i < m1; i++) {
      for (let j = -40; j <= 40; j++) {
        const u = (TAU * (m2 * i - m1 * j)) / D
        if (u < 0.06 || u > 0.88) continue
        const a = (TAU * (i * s2 + j * s1)) / D
        const rr = r(u, a) + 0.003
        seeds.push(at(ellipsoid(0.0065, 0.01, 0.0065, 6, 5), place(V(Math.cos(a) * rr, A(u).y, Math.sin(a) * rr), new THREE.Euler(0, 0, 0))).applyMatrix4(m))
      }
    }
    const top = A(1).y - 0.01
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.2
      const out = V(Math.cos(a), 0, Math.sin(a))
      greens.push(blade([V(0, top, 0), out.clone().multiplyScalar(0.06).add(V(0, top + 0.012, 0)), out.clone().multiplyScalar(0.125).add(V(0, top + 0.04, 0))], (t) => 0.03 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.94)), 0.7) * (1 - 0.35 * t), V(-out.z, 0, out.x), { cup: 0.15, nu: 12, nv: 6 }).applyMatrix4(m))
    }
    greens.push(tube([V(0, top, 0), V(0.01, top + 0.06, 0), V(0.04, top + 0.11, 0.02)], () => 0.009, 6, 10).applyMatrix4(m))
  }
  return [
    { geo: merge(fruits), mat: painted({ roughness: 0.24, clearcoat: 0.85, clearcoatRoughness: 0.15 }) },
    { geo: merge(seeds), mat: plant('#e0c65a', { roughness: 0.5 }) },
    { geo: merge(greens), mat: plant('#4a8434', { roughness: 0.5 }) },
  ]
}

// ----- tomato truss: ribbed shoulders, a star of long curling sepals on each fruit, ripening along the truss
function tomatoTruss(id: string, r: () => number): Parts {
  const cherry = id === 'cherry'
  const n = cherry ? 9 : 5
  const R0 = cherry ? 0.07 : 0.15
  const red = C('#b0150c')
  const orange = C('#d6561a')
  const green = C('#7c9c38')
  const fruits: THREE.BufferGeometry[] = []
  const greens: THREE.BufferGeometry[] = []
  const spinePts = cherry
    ? [V(-0.55, 0.38, 0), V(-0.25, 0.3, 0.02), V(0.05, 0.2, -0.02), V(0.3, 0.06, 0.02), V(0.5, -0.12, 0)]
    : [V(-0.5, 0.38, 0), V(-0.18, 0.34, 0.02), V(0.1, 0.24, 0), V(0.36, 0.08, 0.02), V(0.5, -0.04, 0)]
  const spine = new THREE.CatmullRomCurve3(spinePts)
  greens.push(tube(spinePts, (t) => (cherry ? 0.011 : 0.016) * (1 - 0.35 * t), 7, 30))
  const p = new THREE.Vector3()
  for (let k = 0; k < n; k++) {
    const ripe = cherry ? 1 - (k / (n - 1)) * 0.85 : [1, 1, 0.82, 0.55, 0.3][k]
    const R = R0 * (cherry ? 1 - k * 0.03 : [1, 0.97, 0.92, 0.85, 0.74][k])
    spine.getPointAt(0.1 + (k / n) * 0.86, p)
    const side = k % 2 ? 1 : -1
    const centre = p.clone().add(V((r() - 0.5) * 0.04, -R * 1.25 - 0.04, side * R * 0.55))
    const H = R * 1.7
    const seed = r() * 6
    const body = (u: number, v: number) => {
      const a = v * TAU
      const rr = R * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.62) * (1 + 0.05 * Math.cos(6 * a + seed) * sstep(0.45, 0.95, u))
      const y = 0.86 * R * (2 * u - 1) - 0.14 * R * sstep(0.84, 1, u) + 0.06 * R * sstep(0.12, 0, u)
      return V(Math.cos(a) * rr, y, Math.sin(a) * rr)
    }
    const base = mix(mix(green, orange, sstep(0, 0.6, ripe)), red, sstep(0.5, 1, ripe))
    const shoulderC = C('#8aa040')
    fruits.push(at(surf(48, 48, body, { color: (u, v) => mix(mix(base, red.clone().multiplyScalar(0.78), 0.25 * noise3(u * 4, Math.cos(v * TAU), Math.sin(v * TAU) + seed)), shoulderC, (1 - ripe) * sstep(0.55, 0.95, u) * 0.7) }), place(centre, new THREE.Euler(0, r() * 3, (r() - 0.5) * 0.3))))
    const top = centre.clone().add(V(0, 0.86 * R - 0.12 * R, 0))
    // the pedicel with its knuckle, up to the truss
    greens.push(tube([p, p.clone().lerp(top, 0.45).add(V(0, 0.02, 0)), top.clone().add(V(0, R * 0.12, 0)), top], (t) => (cherry ? 0.005 : 0.007) * (1 + 0.6 * Math.exp(-(((t - 0.45) / 0.08) ** 2))), 6, 12))
    // the calyx: five or six long narrow sepals, out flat and curling down at the tips
    const ns = 6
    for (let s = 0; s < ns; s++) {
      const a = (s / ns) * TAU + seed
      const out = V(Math.cos(a), 0, Math.sin(a))
      const L = R * (cherry ? 0.85 : 0.72)
      greens.push(blade([top.clone(), top.clone().addScaledVector(out, L * 0.45).add(V(0, L * 0.12, 0)), top.clone().addScaledVector(out, L * 0.85).add(V(0, L * 0.02, 0)), top.clone().addScaledVector(out, L).add(V(0, -L * 0.22, 0))], (t) => L * 0.14 * Math.pow(1 - t, 0.7) * Math.min(1, 0.4 + t * 6), V(-out.z, 0, out.x), { cup: 0.25, nu: 12, nv: 5, twist: 0.4 }))
    }
  }
  return [
    { geo: merge(fruits), mat: painted({ roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.1 }) },
    { geo: merge(greens), mat: plant('#4f8a36', { roughness: 0.5, sheen: 0.8, sheenColor: C('#d9ecb0') }) },
  ]
}

// ----- lettuce: a loose butterhead rosette - pale cupped heart leaves, broad ruffled outer leaves with pale ribs
function lettuce(r: () => number): Parts {
  const rings = [
    { n: 5, len: 0.22, w: 0.16, rise: 0.85, open: 0.15, wave: 0.06, col: '#d6e49c', rib: '#f0f4d2' },
    { n: 7, len: 0.34, w: 0.25, rise: 0.6, open: 0.5, wave: 0.16, col: '#a6cf5e', rib: '#e2ecbc' },
    { n: 9, len: 0.46, w: 0.31, rise: 0.28, open: 0.95, wave: 0.28, col: '#6aa63a', rib: '#d2e4a4' },
  ]
  const leaves: THREE.BufferGeometry[] = []
  rings.forEach((g, ri) => {
    for (let k = 0; k < g.n; k++) {
      const a = (k / g.n) * TAU + ri * 0.45 + r() * 0.25
      const out = V(Math.cos(a), 0, Math.sin(a))
      const base = out.clone().multiplyScalar(0.02 * ri)
      const L = g.len * (0.9 + 0.2 * r())
      const p1 = base.clone().addScaledVector(out, L * 0.22 * (0.4 + g.open)).add(V(0, L * (0.1 + g.rise * 0.85), 0))
      const p2 = base.clone().addScaledVector(out, L * (0.35 + 0.6 * g.open)).add(V(0, L * (g.rise * 0.85 + 0.2 - g.open * 0.38), 0))
      leaves.push(blade([base, p1, p2], (t) => g.w * Math.min(Math.pow(Math.min(1, 0.12 + t * 1.6), 0.8), Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.45) / 0.55, 2)))), V(-out.z, 0, out.x), { cup: -0.6, wave: g.wave * 0.5, freq: 1.5 + ri, color: veined(g.col, g.rib, 6, 0.45), nu: 34, nv: 18 }))
    }
  })
  leaves.push(lump(0.08, 0.05, 0.08, 0.1, 3, 2, 3))
  return [{ geo: merge(leaves), mat: leafSkin('#eef6cc', { roughness: 0.42 }) }]
}

// ----- basil: a sprig - glossy, spoon-cupped, puckered leaves in opposite pairs, each pair turned a quarter, a young tip
function basil(): Parts {
  const stemPts = [V(0, -0.42, 0), V(0.012, -0.15, 0), V(-0.01, 0.12, 0), V(0, 0.34, 0)]
  const axis = new THREE.CatmullRomCurve3(stemPts)
  const leaves: THREE.BufferGeometry[] = []
  const stems: THREE.BufferGeometry[] = [tube(stemPts, (t) => 0.014 * (1 - 0.45 * t), 6, 16)]
  const nodes = [0.16, 0.4, 0.62, 0.8, 0.93]
  const sizes = [0.46, 0.42, 0.34, 0.24, 0.13]
  const p = new THREE.Vector3()
  nodes.forEach((t, k) => {
    axis.getPointAt(t, p)
    for (const side of [1, -1]) {
      const a = k * (Math.PI / 2) + (side > 0 ? 0 : Math.PI) + 0.25
      const out = V(Math.cos(a), 0, Math.sin(a))
      const b = p.clone().addScaledVector(out, 0.035).add(V(0, 0.015, 0))
      stems.push(tube([p.clone(), b], () => 0.006, 5, 3))
      const L = sizes[k]
      const droop = k < 3 ? -0.06 : 0.05
      leaves.push(blade([b, b.clone().addScaledVector(out, L * 0.45).add(V(0, L * 0.2, 0)), b.clone().addScaledVector(out, L * 0.95).add(V(0, L * 0.12 + droop, 0))], (u) => L * 0.4 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + u)), 0.55) * (1 - 0.25 * u), V(-out.z, 0, out.x), {
        cup: 0.5,
        wave: 0.04,
        freq: 2,
        bump: (u, s) => 0.07 * (noise3(u * 9 + k, s * 3, side) - 0.5) * (1 - Math.abs(s)),
        color: veined('#2c7a2e', '#79b062', 5, 0.4),
        nu: 22,
        nv: 14,
      }))
    }
  })
  return [
    { geo: merge(leaves), mat: leafSkin('#9fd08a', { roughness: 0.3, sheen: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.3 }) },
    { geo: merge(stems), mat: plant('#5b8a3e') },
  ]
}

// ----- tobacco: a stalk of broad, drooping, pale-ribbed leaves spiralling up to a head of pink trumpet flowers
function tobacco(): Parts {
  const stalkPts = [V(0, -0.72, 0), V(0.02, 0, 0), V(0, 0.62, 0)]
  const stalk = new THREE.CatmullRomCurve3(stalkPts)
  const leaves: THREE.BufferGeometry[] = []
  const p = new THREE.Vector3()
  for (let k = 0; k < 7; k++) {
    stalk.getPointAt(0.06 + k * 0.12, p)
    const a = k * 2.4 + 0.5
    const out = V(Math.cos(a), 0, Math.sin(a))
    const L = 0.78 * (1 - k * 0.085)
    const W = 0.3 * (1 - k * 0.07)
    leaves.push(blade([p.clone(), p.clone().addScaledVector(out, L * 0.32).add(V(0, L * 0.3, 0)), p.clone().addScaledVector(out, L * 0.72).add(V(0, L * 0.26, 0)), p.clone().addScaledVector(out, L).add(V(0, -L * 0.02, 0))], (t) => W * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.97)), 0.8) * (1 - 0.15 * t), V(-out.z, 0, out.x), { cup: -0.14, wave: 0.07, freq: 2.5, color: veined('#7a9c44', '#d8dda4', 9, 0.5, '#9fb05a'), nu: 30, nv: 14 }))
  }
  const top = V(0, 0.62, 0)
  const flowers: THREE.BufferGeometry[] = []
  const pedicels: THREE.BufferGeometry[] = []
  const tubeC = C('#eadfce')
  const pink = C('#d8668c')
  for (let k = 0; k < 7; k++) {
    const b = k * 0.9
    const d = V(Math.cos(b) * (k ? 0.6 : 0.1), 1, Math.sin(b) * (k ? 0.6 : 0.1)).normalize()
    const s0 = top.clone().addScaledVector(d, 0.05 + (k ? 0.03 : 0))
    pedicels.push(tube([top.clone(), s0], () => 0.006, 5, 3))
    const len = 0.17
    const FA: AxisFn = (u) => s0.clone().addScaledVector(d, len * u)
    flowers.push(axial(26, 30, FA, (u, a) => (0.011 + 0.012 * u + 0.05 * sstep(0.7, 1, u)) * (1 + 0.32 * Math.cos(5 * a) * sstep(0.82, 1, u)), { color: (u) => mix(mix(C('#9fb070'), tubeC, sstep(0, 0.2, u)), pink, sstep(0.62, 0.95, u)) }))
  }
  return [
    { geo: merge(leaves), mat: leafSkin('#e4ecbc', { roughness: 0.55, sheen: 0.75 }) },
    { geo: merge([tube(stalkPts, (t) => 0.028 * (1 - 0.5 * t), 7, 14), ...pedicels]), mat: plant('#8aa055', { sheen: 0.9 }) },
    { geo: merge(flowers), mat: painted({ roughness: 0.55, sheen: 0.6, sheenColor: C('#ffe4ee') }) },
  ]
}

// ----- yam: a long club of rough, furrowed bark-brown skin with root hairs; a cut piece in front shows the white flesh
function yam(r: () => number): Parts {
  const bark = (u: number, a: number) =>
    0.13 * (noise3(u * 13, Math.cos(a) * 2.2, Math.sin(a) * 2.2) - 0.5) +
    0.05 * Math.abs(Math.sin(7 * a + 3 * noise3(u * 3, Math.cos(a), Math.sin(a)))) +
    0.035 * (noise3(u * 42, Math.cos(a) * 6, Math.sin(a) * 6) - 0.5)
  const skinC = (u: number, a: number) => mix(mix(C('#3d281b'), C('#7a573a'), sstep(0.45, 0.8, noise3(u * 18, Math.cos(a) * 3, Math.sin(a) * 3))), C('#24170f'), sstep(0.62, 0.8, noise3(u * 7 + 9, Math.cos(a) * 2, Math.sin(a) * 2)) * 0.6)
  const L = 1.15
  const A: AxisFn = (u) => V(L * (u - 0.5), 0.05 * Math.sin(Math.PI * u), 0.035 * Math.sin(TAU * u * 0.7))
  const prof = (u: number) => 0.16 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.02 + u * 0.98)), 0.45) * (0.55 + 0.45 * sstep(0, 0.65, u))
  const rr = (u: number, a: number) => prof(u) * (1 + bark(u, a))
  const tuber = axial(110, 48, A, rr, { color: skinC })
  const hairs: THREE.BufferGeometry[] = []
  const ref = refOf(A)
  for (let k = 0; k < 60; k++) {
    const u = 0.08 + r() * 0.86
    const a = r() * TAU
    const { N1, N2 } = axisFrame(A, ref, u)
    const dir = N1.clone().multiplyScalar(Math.cos(a)).addScaledVector(N2, Math.sin(a))
    const s = A(u).addScaledVector(dir, rr(u, a) * 0.97)
    const l = 0.03 + 0.05 * r()
    hairs.push(tube([s, s.clone().addScaledVector(dir, l * 0.5).add(V((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.02)), s.clone().addScaledVector(dir, l).add(V((r() - 0.5) * 0.04, -0.01, (r() - 0.5) * 0.04))], () => 0.0028, 3, 5))
  }
  // the cut piece: a short length lying in front, its cut face to the light
  const B: AxisFn = (u) => V(0.42 * u, 0.012 * Math.sin(Math.PI * u), 0)
  const bp = (u: number, a: number) => 0.13 * (u > 0.75 ? Math.sqrt(Math.max(0, 1 - ((u - 0.75) / 0.25) ** 2)) : 1) * (1 + bark(u + 0.4, a))
  const piece = axial(44, 48, B, bp, { color: (u, a) => skinC(u + 0.4, a) })
  const flesh = axialCap(48, B, bp, 0, (s, a) => mix(mix(mix(C('#f1e8d2'), C('#e8dcc0'), noise3(s * 6, Math.cos(a) * 3, Math.sin(a) * 3)), C('#b99a7a'), sstep(0.86, 0.93, s)), C('#3d281b'), sstep(0.95, 1, s)))
  const m = place(V(0.12, -0.14, 0.34), new THREE.Euler(0.05, 0.75, 0.02))
  return [
    { geo: merge([tuber, piece.applyMatrix4(m)]), mat: painted({ roughness: 0.92, sheen: 0.25, sheenColor: C('#b09070') }) },
    { geo: flesh.applyMatrix4(m), mat: painted({ roughness: 0.7, clearcoat: 0.25, clearcoatRoughness: 0.5 }) },
    { geo: merge(hairs), mat: plant('#6a4d36', { roughness: 0.9 }) },
  ]
}

// ----- the pulses that a generic open pod cannot tell apart: each is shown by its own pod and its own seed
/** a heap: seeds dropped round a centre, a little stacked */
function heap(make: (i: number) => THREE.BufferGeometry, n: number, r: () => number, centre: THREE.Vector3, spread: number, size: number) {
  const out: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + r() * 0.6
    const d = spread * Math.sqrt((i + 0.5) / n)
    const pos = centre.clone().add(V(Math.cos(a) * d, (i % 3 === 2 ? size * 0.9 : 0) + r() * size * 0.15, Math.sin(a) * d))
    out.push(at(make(i), place(pos, new THREE.Euler(r() * 0.6, r() * TAU, r() * 0.6))))
  }
  return out
}
function pulse(id: string, r: () => number): Parts {
  const out: Parts = []
  const podMat = (sheen: string) => painted({ roughness: 0.7, sheen: 0.8, sheenRoughness: 0.5, sheenColor: C(sheen) })
  const seedMat = (o: THREE.MeshPhysicalMaterialParameters = {}) => painted({ roughness: 0.35, clearcoat: 0.45, clearcoatRoughness: 0.3, ...o })
  if (id === 'chickpea') {
    // the "ram's head": round, wrinkled, with a pointed beak
    const beak = V(0.75, 0.55, 0.2).normalize()
    const seed = () =>
      blob(26, 30, (d) => 0.075 * (1 + 0.34 * Math.pow(Math.max(0, d.dot(beak)), 6) + 0.07 * (n3(d, 3.5) - 0.5) + 0.03 * Math.abs(Math.sin(d.x * 9 + d.z * 4))), {
        color: (d) => mix(mix(C('#dcbe8c'), C('#c49a62'), 0.5 * n3(d, 5)), C('#9c7448'), sstep(0.7, 0.95, d.dot(beak))),
      })
    const pod = (open: boolean) => {
      const A: AxisFn = (u) => V(0.34 * (u - 0.5), 0.02 * Math.sin(Math.PI * u), 0)
      return axial(36, 30, A, (u, a) => 0.115 * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.7) * (1 + 0.08 * Math.cos(2 * a)), { arc: open ? [0.5, TAU * 0.78] : undefined, squash: 0.82, color: (u, a) => mix(C('#c7bf86'), C('#9c9a5c'), 0.4 * noise3(u * 9, Math.cos(a) * 2, Math.sin(a) * 2)) })
    }
    out.push({ geo: merge([xf(pod(false), V(-0.3, 0.06, -0.22), new THREE.Euler(0.2, 0.6, 0.3)), xf(pod(true), V(-0.02, 0, 0), new THREE.Euler(0, -0.3, 0.05))]), mat: podMat('#f4f0d6') })
    out.push({ geo: merge([xf(seed(), V(-0.02, -0.01, 0.0), new THREE.Euler()), ...heap(() => seed(), 6, r, V(0.32, -0.06, 0.22), 0.2, 0.12)]), mat: seedMat({ roughness: 0.6, clearcoat: 0.15 }) })
  } else if (id === 'groundnut') {
    // the waisted, net-veined shell; one cracked open on two red-skinned kernels
    const net = (u: number, a: number) => Math.max(Math.pow(Math.abs(Math.cos(5 * a + 0.4 * Math.sin(u * 9))), 14), Math.pow(Math.abs(Math.cos(u * Math.PI * 11 + 0.5 * Math.sin(3 * a))), 14))
    const A: AxisFn = (u) => V(0.56 * (u - 0.5), 0.03 * Math.sin(Math.PI * u), 0)
    const sr = (u: number, a: number) => 0.12 * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.5) * (1 - 0.22 * Math.exp(-(((u - 0.5) / 0.08) ** 2))) * (1 + 0.05 * net(u, a))
    const sc = (u: number, a: number) => mix(C('#8e6a40'), C('#d2ac74'), 0.35 + 0.65 * net(u, a))
    const whole = axial(70, 44, A, sr, { color: sc })
    const half = axial(70, 30, A, sr, { arc: [Math.PI * 0.95, TAU * 1.02], color: sc })
    out.push({ geo: merge([xf(whole, V(-0.12, 0.05, -0.2), new THREE.Euler(0.1, 0.5, 0.15)), xf(half, V(0.08, 0, 0.12), new THREE.Euler(0, -0.25, 0))]), mat: painted({ roughness: 0.88, sheen: 0.3, sheenColor: C('#f2dcb0') }) })
    const kernel = (skin: boolean) => blob(24, 28, ellR(0.085, 0.058, 0.06), { post: (p) => p.setY(p.y - 1.2 * p.x * p.x), color: (d) => (skin ? mix(C('#8a3622'), C('#b05a3c'), 0.6 * n3(d, 6)) : mix(C('#eedcb4'), C('#d9c08e'), n3(d, 4))) })
    out.push({ geo: merge([xf(kernel(true), V(-0.03, 0.03, 0.12), new THREE.Euler(0, -0.25, 0)), xf(kernel(true), V(0.19, 0.03, 0.12), new THREE.Euler(0, -0.25, 0.1)), xf(kernel(true), V(0.3, -0.06, 0.38), new THREE.Euler(0.2, 1.1, 0)), xf(kernel(false), V(0.08, -0.07, 0.42), new THREE.Euler(-0.3, 0.4, 0.2))]), mat: seedMat({ roughness: 0.42, clearcoat: 0.3 }) })
  } else if (id === 'bambara') {
    // round, wrinkled one-seeded pods, and smooth round seeds - cream speckled maroon, and a dark red one
    const pod = () => blob(30, 36, (d) => 0.13 * (1 + 0.09 * Math.pow(1 - Math.abs(2 * n3(d, 4.2) - 1), 3) - 0.04 * n3(d, 9, 3)), { color: (d) => mix(C('#6f5234'), C('#b8966a'), Math.pow(1 - Math.abs(2 * n3(d, 4.2) - 1), 2)) })
    out.push({ geo: merge([xf(pod(), V(-0.22, 0.05, -0.18), new THREE.Euler(0.3, 0.2, 0)), xf(pod(), V(0.06, 0.02, -0.32), new THREE.Euler(1, 0.5, 0.4), 0.9)]), mat: painted({ roughness: 0.85, sheen: 0.3, sheenColor: C('#e8d4b0') }) })
    const seed = (i: number) =>
      blob(20, 24, ellR(0.068, 0.058, 0.062), {
        color: (d) => {
          const spot = sstep(0.66, 0.74, n3(d, 7, i * 3))
          const eye = sstep(0.82, 0.9, d.dot(V(0, 0, 1)))
          return i % 3 === 2 ? mix(C('#5a1c18'), C('#c7a487'), spot * 0.6) : mix(mix(C('#ead9b6'), C('#6e2620'), spot), C('#2a1410'), eye)
        },
      })
    out.push({ geo: merge(heap(seed, 7, r, V(0.24, -0.07, 0.18), 0.22, 0.1)), mat: seedMat() })
  } else if (id === 'cowpea') {
    // long slender pods beaded by their seeds, and the black-eyed peas themselves
    const pod = (len: number, bend: number) => {
      const A: AxisFn = (u) => V(len * (u - 0.5), bend * Math.sin(Math.PI * u * 1.2), 0.05 * Math.sin(TAU * u))
      return axial(120, 18, A, (u) => 0.033 * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.35) * (1 + 0.16 * Math.pow(0.5 + 0.5 * Math.cos(TAU * u * 10), 2)) * (u > 0.88 ? 1 - 0.6 * ((u - 0.88) / 0.12) : 1), { color: (u) => mix(C('#d1ba82'), C('#7c6038'), sstep(0.88, 1, u) + 0.1 * noise3(u * 30, 1, 2)) })
    }
    out.push({ geo: merge([xf(pod(1.35, 0.1), V(-0.05, 0.12, -0.25), new THREE.Euler(0, 0.25, 0.1)), xf(pod(1.15, -0.12), V(0.05, 0.05, -0.1), new THREE.Euler(0.2, -0.2, -0.12))]), mat: podMat('#f2e6c4') })
    const eye = V(0.15, 1, 0.3).normalize()
    const pea = () =>
      blob(22, 26, ellR(0.072, 0.05, 0.047), {
        post: (p) => p.setZ(p.z + 1.6 * p.x * p.x),
        color: (d) => {
          const e = d.dot(eye)
          return mix(mix(C('#efe5cc'), C('#141110'), sstep(0.6, 0.67, e)), C('#e9dfc6'), sstep(0.93, 0.97, e) * sstep(0.3, 0.1, Math.abs(d.x)))
        },
      })
    out.push({ geo: merge(heap(pea, 8, r, V(0.12, -0.08, 0.3), 0.26, 0.08)), mat: seedMat({ roughness: 0.4 }) })
  } else if (id === 'drybean') {
    // a heap of glossy, dark-red kidney beans, the dry pod behind
    const bean = (i: number) =>
      blob(22, 26, ellR(0.1, 0.055, 0.046), {
        post: (p) => p.setY(p.y - 2.2 * p.x * p.x),
        color: (d) => mix(mix(C('#5a0b12'), C('#8c1c24'), 0.55 * n3(d, 5, i)), C('#efe2c8'), sstep(0.93, 0.97, -d.y) * sstep(0.25, 0.1, Math.abs(d.x))),
      })
    out.push({ geo: merge(heap(bean, 9, r, V(0.12, -0.06, 0.18), 0.28, 0.09)), mat: seedMat({ roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.1 }) })
    const A: AxisFn = (u) => V(0.7 * (u - 0.5), 0.06 * Math.sin(Math.PI * u), 0.03 * Math.sin(TAU * u))
    const half = (s: number) => axial(60, 20, A, (u) => 0.05 * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.4), { arc: s > 0 ? [0, Math.PI * 1.05] : [Math.PI * 0.95, TAU], squash: 0.6, color: (u, a) => mix(C('#cdb684'), C('#8e7448'), 0.3 * noise3(u * 14, Math.cos(a), Math.sin(a)) + sstep(0.9, 1, u) * 0.5) })
    out.push({ geo: merge([xf(half(1), V(-0.12, 0.02, -0.22), new THREE.Euler(0.4, 0.3, 0.05)), xf(half(-1), V(-0.08, -0.02, -0.3), new THREE.Euler(-0.5, 0.25, -0.1))]), mat: podMat('#efe2c0') })
  } else {
    // pigeonpea: flat, pointed pods pinched between the seeds and streaked maroon, and the small round seeds
    const pod = () => {
      const A: AxisFn = (u) => V(0.64 * (u - 0.5), 0.04 * Math.sin(Math.PI * u), 0)
      return axial(110, 30, A, (u) => 0.062 * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.45) * (0.68 + 0.32 * Math.pow(Math.abs(Math.sin(Math.PI * (u * 5 - 0.1))), 0.6)) * (u > 0.86 ? 1 - 0.7 * ((u - 0.86) / 0.14) : 1), {
        squash: 0.55,
        color: (u, a) => mix(C('#6f8c3a'), C('#5a2236'), sstep(0.5, 0.8, Math.sin(3 * a + u * 36 + 2.2 * noise3(u * 5, Math.cos(a), Math.sin(a)))) * 0.85),
      })
    }
    out.push({ geo: merge([xf(pod(), V(-0.1, 0.08, -0.15), new THREE.Euler(0.5, 0.35, 0.2)), xf(pod(), V(0.02, 0.0, 0.02), new THREE.Euler(-0.3, -0.25, -0.1), 0.92)]), mat: podMat('#e8f0c8') })
    const seed = (i: number) => blob(18, 20, ellR(0.048, 0.042, 0.045), { color: (d) => mix(C('#d9be86'), C('#7a4a2a'), sstep(0.62, 0.72, n3(d, 8, i))) })
    out.push({ geo: merge(heap(seed, 9, r, V(0.24, -0.08, 0.26), 0.2, 0.07)), mat: seedMat({ roughness: 0.45 }) })
  }
  return out
}

// ---------- seven crops that were still sketches (a ball on a stick, a smooth cone): each built as the thing it is ----------

/** a flat face across an axis at `c`, its rim rad(a), painted by colour(s 0…1 from the centre, a) - finer than axialCap */
function face(c: THREE.Vector3, N1: THREE.Vector3, N2: THREE.Vector3, rad: (a: number) => number, color: (s: number, a: number) => THREE.Color, rings = 26, nv = 72) {
  return surf(rings, nv, (s, v) => c.clone().addScaledVector(N1, Math.cos(v * TAU) * rad(v * TAU) * s).addScaledVector(N2, Math.sin(v * TAU) * rad(v * TAU) * s), { color: (s, v) => color(s, v * TAU) })
}
const frac = (x: number) => x - Math.floor(x)

// ----- chilli: three pods lying together - long, pointed, three-sided, wrinkling toward the tip, lacquer red; one
// still turning from green; each under its toothed green cap on a bent stalk
function chilli(): Parts {
  const pods: THREE.BufferGeometry[] = []
  const green: THREE.BufferGeometry[] = []
  const one = (L: number, R: number, curl: number, turning: boolean, seed: number, pos: THREE.Vector3, yaw: number) => {
    const prof = (u: number) => R * Math.min(1, 0.6 + 7 * u) * Math.pow(Math.max(0, 1 - u), 0.6) + 0.004
    const groove = (u: number, a: number) => Math.cos(3 * a + 2.4 * u + seed)
    const rr = (u: number, a: number) => prof(u) * (1 + 0.075 * groove(u, a) * sstep(0.04, 0.3, u) + 0.09 * (noise3(u * 24 + seed, Math.cos(a) * 2.2, Math.sin(a) * 2.2) - 0.5) * sstep(0.3, 0.95, u))
    // it rests on the table along its whole length: the axis sits one radius up, and curls in the table's plane
    const A: AxisFn = (u) => V(L * u, prof(u), L * curl * Math.pow(u, 2.3))
    const deep = C('#5a0504')
    const red = C('#b2110a')
    const bright = C('#d6301c')
    const grn = C('#3c6a21')
    const color = (u: number, a: number) => {
      const body = mix(mix(deep, red, 0.5 + 0.5 * groove(u, a)), bright, 0.3 * noise3(u * 9 + seed, Math.cos(a) * 1.5, Math.sin(a) * 1.5))
      if (!turning) return body
      // ripening runs from the tip back to the stalk, in blotches
      return mix(grn, body, sstep(0.3, 0.62, u + 0.3 * (noise3(u * 7 + seed, Math.cos(a) * 1.8, Math.sin(a) * 1.8) - 0.5)))
    }
    const m = place(pos, new THREE.Euler(0, yaw, 0))
    pods.push(axial(110, 30, A, rr, { color }).applyMatrix4(m))
    const top = A(0)
    const stalkEnd = top.clone().add(V(-0.17 * L, 0.11 * L, 0.03 * L * Math.sign(curl || 1)))
    green.push(
      xf(ellipsoid(R * 0.7, R * 0.42, R * 0.7, 16, 10), top.clone().add(V(-0.012, 0, 0)), new THREE.Euler(0, 0, Math.PI / 2)).applyMatrix4(m),
      xf(flower(5, R * 1.35, R * 0.6, -0.5), top.clone().add(V(-0.016, 0, 0)), new THREE.Euler(0, 0, Math.PI / 2)).applyMatrix4(m),
      tube([top.clone().add(V(-0.01, 0, 0)), top.clone().add(V(-0.08 * L, 0.02 * L, 0.004)), stalkEnd], (t) => R * (0.3 + 0.12 * sstep(0.7, 1, t)), 7, 12).applyMatrix4(m),
      xf(ellipsoid(R * 0.42, R * 0.1, R * 0.42, 10, 6), stalkEnd, new THREE.Euler(0, 0, 0.9)).applyMatrix4(m),
    )
  }
  one(0.92, 0.062, 0.2, false, 1.3, V(-0.42, 0, 0.02), 0.08)
  one(0.78, 0.055, -0.16, false, 4.1, V(-0.33, 0, -0.2), 0.3)
  one(0.7, 0.05, 0.26, true, 7.7, V(-0.36, 0, 0.21), -0.24)
  return [
    { geo: merge(pods), mat: painted({ roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.07 }) },
    { geo: merge(green), mat: plant('#4f7a30', { roughness: 0.5 }) },
  ]
}

// ----- okra: five-ridged, downy pods tapering to a point under a thick collar and stalk; two slices in front show
// the five chambers and their round white seeds
function okra(): Parts {
  const pods: THREE.BufferGeometry[] = []
  const stalks: THREE.BufferGeometry[] = []
  const ridge = (a: number) => Math.pow(0.5 + 0.5 * Math.cos(5 * a), 1.6)
  const skinC = (u: number, a: number, seed = 0) => mix(mix(mix(C('#4f7a2b'), C('#a6c76c'), ridge(a) * 0.85), C('#d0dca4'), sstep(0.8, 1, u) * 0.45), C('#3f6524'), 0.25 * noise3(u * 14 + seed, Math.cos(a) * 2, Math.sin(a) * 2))
  const one = (L: number, R: number, bend: number, seed: number, pos: THREE.Vector3, yaw: number) => {
    const prof = (u: number) => R * Math.min(1, 0.82 + 3 * u) * Math.pow(Math.max(0, 1 - Math.pow(u, 1.7)), 0.85) + 0.003
    const rr = (u: number, a: number) => prof(u) * (0.84 + 0.22 * ridge(a))
    const A: AxisFn = (u) => V(L * u, prof(u) * 1.04, L * bend * u * u)
    const m = place(pos, new THREE.Euler(0, yaw, 0))
    pods.push(axial(100, 50, A, rr, { color: (u, a) => skinC(u, a, seed) }).applyMatrix4(m))
    // the collar the pod sits in, and the stalk - five-sided too, cut clean
    const top = A(0)
    const CA: AxisFn = (u) => top.clone().add(V(-0.07 * L * (1 - u) + 0.012 * u, 0, 0))
    const cr = (u: number, a: number) => R * (0.5 + 0.56 * sstep(0, 0.75, u)) * (0.9 + 0.12 * ridge(a))
    const SA: AxisFn = (u) => top.clone().add(V(-0.07 * L - 0.13 * L * u, 0.035 * L * u * u, 0))
    const sr = (u: number, a: number) => R * (0.5 - 0.1 * u) * (0.9 + 0.12 * ridge(a))
    stalks.push(
      axial(14, 40, CA, cr, { color: (u, a) => mix(C('#547c30'), C('#8fb05a'), ridge(a) * 0.6) }).applyMatrix4(m),
      axial(16, 40, SA, sr, { color: (u, a) => mix(C('#4d742c'), C('#86a655'), ridge(a) * 0.5) }).applyMatrix4(m),
      axialCap(40, SA, sr, 1, (s) => mix(C('#dfe6b8'), C('#7f9a52'), sstep(0.6, 1, s))).applyMatrix4(m),
    )
  }
  one(0.86, 0.075, 0.1, 1, V(-0.4, 0, -0.12), 0.1)
  one(0.74, 0.068, -0.08, 5, V(-0.34, 0, 0.1), -0.16)
  one(0.62, 0.06, 0.12, 9, V(-0.22, 0, -0.33), 0.34)
  // the slices: a star of five chambers round a pale core, a seed in each
  const slices: THREE.BufferGeometry[] = []
  const seeds: THREE.BufferGeometry[] = []
  const slice = (R: number, pos: THREE.Vector3, turn: number, tilt: number) => {
    const h = 0.034
    const rad = (a: number) => R * (0.84 + 0.22 * ridge(a))
    const SA: AxisFn = (u) => V(0, h * u, 0)
    const m = place(pos, new THREE.Euler(tilt, turn, 0))
    slices.push(
      axial(4, 60, SA, (u, a) => rad(a), { color: (u, a) => skinC(0.3, a) }).applyMatrix4(m),
      face(V(0, h, 0), V(1, 0, 0), V(0, 0, 1), rad, (s, a) => {
        const k = Math.cos(5 * a)
        const flesh = mix(C('#eef2d6'), C('#dfe8bc'), noise3(s * 5, Math.cos(a) * 3, Math.sin(a) * 3))
        const chamber = sstep(0.1, 0.7, k) * sstep(0.26, 0.4, s) * sstep(0.84, 0.7, s)
        return mix(mix(flesh, C('#b4c486'), chamber * 0.85), C('#6f9a3e'), sstep(0.9, 0.97, s))
      }).applyMatrix4(m),
    )
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU
      seeds.push(xf(ellipsoid(R * 0.13, R * 0.1, R * 0.13, 10, 8), V(Math.cos(a) * rad(a) * 0.56, h + R * 0.02, Math.sin(a) * rad(a) * 0.56), new THREE.Euler()).applyMatrix4(m))
    }
  }
  slice(0.078, V(0.3, 0, 0.36), 0.4, 0)
  slice(0.07, V(0.12, 0.012, 0.44), 1.3, -0.18)
  return [
    { geo: merge([...pods, ...stalks]), mat: painted({ roughness: 0.62, sheen: 0.9, sheenRoughness: 0.4, sheenColor: C('#eef6cc') }) },
    { geo: merge(slices), mat: painted({ roughness: 0.55, sheen: 0.4, sheenColor: C('#f4f8e0') }) },
    { geo: merge(seeds), mat: plant('#f1eedc', { roughness: 0.4 }) },
  ]
}

// ----- cabbage: a tight head - leaf wrapped over leaf, each with its white midrib and veins, their edges showing as
// lines over the crown - in a rosette of open, blue-green, wavy wrapper leaves
function cabbage(r: () => number): Parts {
  const R = 0.34
  const SQ = 0.88
  const leaf = (o: { R: number; az: number; top: number; half: number; open: number; wave: number; col: string; rib: string; edge?: string; veins?: number; curl?: number }) => {
    // a cabbage leaf's veins: a broad white midrib, widest at the stem, and thick side veins fanning off it
    const Lc = C(o.col)
    const Rc = C(o.rib)
    const Ec = o.edge ? C(o.edge) : null
    const paint = (u: number, s: number) => {
      const a = Math.abs(s)
      const mid = Math.exp(-(a * a) / (0.0016 + 0.012 * (1 - u) ** 2))
      // thin and straight, leaving the midrib at a steep angle and thinning toward the margin
      const fan = Math.pow(Math.max(0, Math.cos((u * (o.veins ?? 7) - a * 3.4 + 0.1) * TAU)), 12) * (1 - 0.7 * a) * sstep(0.02, 0.1, a) * sstep(0.02, 0.1, u)
      const c = mix(Lc, Rc, Math.min(1, mid * 0.9 + fan * 0.42))
      // the margin a shade off the blade: where one leaf lies over the next, that line is the cabbage
      return Ec ? mix(c, Ec, Math.max(sstep(0.82, 1, a), sstep(0.9, 1, u)) * 0.7) : c
    }
    const P = (u: number, v: number) => {
      const s = v * 2 - 1
      const th = 0.05 + u * (o.top - 0.05) // from the stem (0) up over the head toward the crown (π)
      // broad from low down and round at the top (a cabbage leaf is a spoon, not a petal)
      const ph = o.az + s * o.half * Math.min(Math.pow(Math.min(1, 0.1 + u * 1.5), 0.7), Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, u - 0.5) / 0.5, 2.4))))
      const flare = 1 + o.open * Math.pow(u, 1.7) + (o.curl ?? 0) * sstep(0.72, 1, u)
      const ruff = o.wave * Math.sin(u * 10 + s * 4.3 + o.az * 3) * s * s * sstep(0.2, 1, u)
      const rib = 0.02 * Math.exp(-s * s * 55) * (1 - 0.75 * u) // the midrib stands proud toward the stem
      const rad = o.R * (flare + ruff + rib)
      return V(rad * Math.sin(th) * Math.cos(ph), -rad * Math.cos(th) * SQ, rad * Math.sin(th) * Math.sin(ph))
    }
    return surf(72, 46, P, { wrap: false, color: (u, v) => paint(u, v * 2 - 1) })
  }
  const head: THREE.BufferGeometry[] = [
    blob(36, 44, ellR(R * 0.985, R * 0.985 * SQ, R * 0.985), { color: (d) => mix(C('#cfe2a2'), C('#b6d384'), n3(d, 4)) }),
  ]
  // wrapped tight: each a little larger than the one under it, so its edge lies over its neighbour
  for (let k = 0; k < 6; k++) head.push(leaf({ R: R * (1.0 + k * 0.007), az: k * 2.513 + 0.4 + r() * 0.3, top: Math.PI * (1.04 - k * 0.035), half: 1.15 + r() * 0.15, open: 0, wave: 0.006, col: k < 3 ? '#c4dc92' : '#a9cb78', rib: '#f0f5dc', edge: '#86ad5c' }))
  for (let k = 0; k < 4; k++) head.push(leaf({ R: R * (1.06 + k * 0.012), az: k * 1.571 + 1.1 + r() * 0.3, top: Math.PI * (0.74 - k * 0.04), half: 1.0, open: 0.07 + k * 0.03, curl: 0.05, wave: 0.03, col: '#86b268', rib: '#e6f0cc', edge: '#5f9050' }))
  // the wrapper leaves: low round the head, crinkled, their tips turned out and down
  const wrap: THREE.BufferGeometry[] = []
  for (let k = 0; k < 6; k++) wrap.push(leaf({ R: R * 1.12, az: k * 1.047 + 0.5 + r() * 0.3, top: Math.PI * (0.4 + 0.12 * r()), half: 0.8, open: 0.1 + 0.16 * r(), curl: 0.14 + 0.2 * r(), wave: 0.16, col: '#2f6a4c', rib: '#c6dab8', edge: '#24523c', veins: 6 }))
  const stub = xf(new THREE.CylinderGeometry(0.06, 0.065, 0.06, 20), V(0, -R * SQ - 0.005, 0), new THREE.Euler())
  return [
    { geo: merge(head), mat: leafSkin('#eef6d4', { roughness: 0.5, sheen: 0.35 }) },
    { geo: merge(wrap), mat: leafSkin('#cfe4d4', { roughness: 0.55, sheen: 0.5 }) },
    { geo: stub, mat: plant('#dfe4bc', { roughness: 0.7 }) },
  ]
}

// ----- taro: the corm - ringed with old leaf scars, hairy with rootlets, two cormels budding from it - and its
// "elephant ear": a heart-shaped blade held by its middle on a long stalk, the veins running out from that point
function taro(r: () => number): Parts {
  const CY = -0.78
  const ring = (d: THREE.Vector3) => Math.sin(d.y * 30 + 2.6 * n3(d, 2.1))
  const cormC = (d: THREE.Vector3) => mix(mix(C('#4c3625'), C('#83603f'), sstep(0.35, 0.75, n3(d, 9))), C('#2a1c13'), sstep(0.2, 1, ring(d)) * 0.55)
  const corm = xf(blob(64, 72, (d) => ellR(0.23, 0.25, 0.22)(d) * (1 + 0.035 * ring(d) + 0.1 * (n3(d, 3.3, 5) - 0.5)), { color: cormC }), V(0, CY, 0), new THREE.Euler())
  const cormel = (rad: number, pos: THREE.Vector3, rot: THREE.Euler, seed: number) =>
    xf(blob(30, 34, (d) => ellR(rad, rad * 1.45, rad)(d) * (1 + 0.05 * Math.sin(d.y * 24 + seed) + 0.1 * (n3(d, 4, seed) - 0.5)), { color: cormC }), pos, rot)
  const browns = [corm, cormel(0.085, V(0.24, CY - 0.06, 0.1), new THREE.Euler(0.2, 0, -1.1), 3), cormel(0.07, V(-0.2, CY - 0.1, 0.16), new THREE.Euler(0.5, 0, 0.9), 8)]
  const hairs: THREE.BufferGeometry[] = []
  for (let k = 0; k < 70; k++) {
    const a = r() * TAU
    const lat = -0.15 - r() * 0.75 // the lower half
    const d = V(Math.cos(a) * Math.sqrt(1 - lat * lat), lat, Math.sin(a) * Math.sqrt(1 - lat * lat))
    const s = d.clone().multiply(V(0.23, 0.25, 0.22)).add(V(0, CY, 0))
    const l = 0.05 + 0.1 * r()
    hairs.push(tube([s, s.clone().addScaledVector(d, l * 0.5).add(V(0, -l * 0.2, 0)), s.clone().addScaledVector(d, l * 0.8).add(V((r() - 0.5) * 0.05, -l * 0.7, (r() - 0.5) * 0.05))], () => 0.0032, 3, 5))
  }
  // the blade: round its stalk in every direction (φ = 0 toward the tip), the notch between the two back lobes
  // stopping short of the stalk
  const blades: THREE.BufferGeometry[] = []
  const stalks: THREE.BufferGeometry[] = []
  const heart = (Lf: number, centre: THREE.Vector3, normal: THREE.Vector3, tipDir: THREE.Vector3, seed: number) => {
    const n = normal.clone().normalize()
    const tip = tipDir.clone().addScaledVector(n, -tipDir.dot(n)).normalize()
    const side = new THREE.Vector3().crossVectors(n, tip)
    const rho = (ph: number) => Lf * Math.max(0.2, Math.pow((1 + Math.cos(ph)) / 2, 0.42) * (1 + 0.45 * Math.exp(-(ph * ph) / 0.16)) * (1 + 0.12 * Math.exp(-((Math.abs(ph) - 2.3) ** 2) / 0.1)))
    const MAIN = [0, 2.3, -2.3]
    const vein = (t: number, ph: number) => {
      let m = 0
      const w = Math.max(0.05, t) * 1.0
      for (const p of MAIN) m = Math.max(m, Math.exp(-(((ph - p) * w) ** 2) / 0.0009))
      // the side veins leave the midrib in pairs and run out to the margin
      const x = Math.cos(ph) * t
      const y = Math.abs(Math.sin(ph)) * t
      const lat = Math.pow(Math.max(0, Math.cos((x * 3.6 + y * 2.3 + 0.2) * TAU)), 9) * sstep(0.03, 0.14, y) * sstep(2.1, 1.7, Math.abs(ph)) * (1 - 0.45 * t)
      return Math.max(m, lat * 0.5)
    }
    const P = (t: number, v: number) => {
      const ph = (v - 0.5) * TAU
      const rad = rho(ph) * t
      const lift = Lf * (0.2 * t * t - 0.32 * t * t * Math.max(0, Math.cos(ph)) ** 2 + 0.03 * Math.sin(ph * 7 + seed) * t * t * t - 0.012 * vein(t, ph))
      return centre.clone().addScaledVector(tip, Math.cos(ph) * rad).addScaledVector(side, Math.sin(ph) * rad).addScaledVector(n, lift)
    }
    const deep = C('#24592b')
    const mid = C('#3f8238')
    const pale = C('#c4d894')
    blades.push(surf(70, 200, P, { color: (t, v) => {
      const ph = (v - 0.5) * TAU
      return mix(mix(mix(mid, deep, 0.55 * t + 0.25 * noise3(t * 6 + seed, Math.cos(ph) * 2, Math.sin(ph) * 2)), pale, vein(t, ph) * 0.7), C('#6f9a4a'), sstep(0.93, 1, t) * 0.5)
    } }))
  }
  const c1 = V(0.2, 0.5, 0.24)
  const n1 = V(0.1, 0.34, 0.93)
  heart(0.58, c1, n1, V(0.1, -1, 0.2), 1)
  const c2 = V(-0.56, 0.1, -0.1)
  const n2 = V(-0.5, 0.5, 0.7)
  heart(0.38, c2, n2, V(-0.5, -0.85, 0.1), 5)
  stalks.push(
    tube([V(0.03, CY + 0.2, 0), V(0.02, -0.25, -0.07), V(0.1, 0.2, -0.02), c1.clone().addScaledVector(n1.clone().normalize(), -0.012)], (t) => 0.05 * (1 - 0.66 * t), 9, 30),
    tube([V(-0.05, CY + 0.2, 0.02), V(-0.16, -0.3, -0.06), V(-0.36, -0.05, -0.14), c2.clone().addScaledVector(n2.clone().normalize(), -0.01)], (t) => 0.04 * (1 - 0.66 * t), 9, 26),
  )
  // an older leaf, cut: its stump on the corm, pale and pink inside
  const SA: AxisFn = (u) => V(0.1 + 0.05 * u, CY + 0.2 + 0.12 * u, 0.08 + 0.03 * u)
  const sr = () => 0.042
  const stump = axial(8, 24, SA, sr, { color: () => C('#8fa26a') })
  const cut = axialCap(24, SA, sr, 1, (s) => mix(C('#f1dfd6'), C('#b9c48c'), sstep(0.6, 1, s)))
  return [
    { geo: merge(browns), mat: painted({ roughness: 0.95, sheen: 0.25, sheenColor: C('#b09070') }) },
    { geo: merge(hairs), mat: plant('#6b4c34', { roughness: 0.9 }) },
    { geo: merge(blades), mat: leafSkin('#cfe6b0', { roughness: 0.36, sheen: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 }) },
    { geo: merge(stalks), mat: plant('#8aa465', { roughness: 0.45 }) },
    { geo: merge([stump, cut]), mat: painted({ roughness: 0.6 }) },
  ]
}

// ----- jute: the golden fibre - a hank of retted strands, twisted, bound near its head, its tail loose on the table -
// and behind it a stem of the plant: toothed lance leaves, small yellow flowers, round ribbed capsules
function jute(r: () => number): Parts {
  const L = 1.3
  const pinch = (u: number) => Math.exp(-((u - 0.15) ** 2) / 0.0022)
  const girth = (u: number) => 0.115 * (1 - 0.5 * pinch(u)) * (0.75 + 0.25 * sstep(0, 0.08, u)) * (1 + 0.35 * sstep(0.62, 1, u))
  const A: AxisFn = (u) => V(L * (u - 0.5), girth(u) * 0.8, 0.13 * Math.sin(TAU * (u * 0.55 + 0.1)))
  const ref = V(0, 1, 0)
  const strands: THREE.BufferGeometry[] = []
  const N = 240
  for (let i = 0; i < N; i++) {
    const a0 = r() * TAU
    const rho = Math.sqrt(r())
    const u0 = 0.05 * r()
    const u1 = 0.84 + 0.16 * r()
    const drift = V((r() - 0.5) * 0.14, 0, (r() - 0.5) * 0.22)
    const wob = r() * TAU
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 26; k++) {
      const u = u0 + ((u1 - u0) * k) / 26
      const { N1, N2 } = axisFrame(A, ref, u)
      const loose = Math.pow(sstep(0.6, 1, u), 1.5) + Math.pow(sstep(0.09, 0, u), 1.5) * 0.5
      const a = a0 + 6.2 * u * (1 - 0.6 * sstep(0.55, 1, u))
      const p = A(u)
        .addScaledVector(N1, Math.cos(a) * girth(u) * rho * 0.8)
        .addScaledVector(N2, Math.sin(a) * girth(u) * rho)
        .addScaledVector(drift, loose)
        .add(V(0, 0, 0.007 * Math.sin(u * 46 + wob)))
      p.y = Math.max(0.004, p.y - 0.035 * loose) // the loose ends lie down on the table
      pts.push(p)
    }
    strands.push(tinted(tube(pts, () => 0.004, 3, 32), mix(mix(C('#9c7026'), C('#d9b45e'), r()), C('#f2deaa'), Math.pow(r(), 3))))
  }
  // the binding: a few turns of the same fibre round the hank's neck
  const tie: THREE.BufferGeometry[] = []
  for (let k = 0; k < 6; k++) {
    const u = 0.135 + k * 0.006
    const { N1, N2 } = axisFrame(A, ref, u)
    const loop: THREE.Vector3[] = []
    for (let j = 0; j <= 20; j++) {
      const a = (j / 20) * TAU
      loop.push(A(u).addScaledVector(N1, Math.cos(a) * girth(u) * 0.92).addScaledVector(N2, Math.sin(a) * girth(u) * 1.12))
    }
    tie.push(tinted(tube(loop, () => 0.0048, 4, 40), k % 2 ? '#9a7434' : '#b58c44'))
  }
  // the plant: a slender stem laid behind the hank
  const stemPts = [V(-0.62, 0.03, -0.3), V(-0.2, 0.14, -0.4), V(0.25, 0.2, -0.36), V(0.62, 0.36, -0.26)]
  const stem = new THREE.CatmullRomCurve3(stemPts)
  const leaves: THREE.BufferGeometry[] = []
  const twigs: THREE.BufferGeometry[] = [tube(stemPts, (t) => 0.014 * (1 - 0.5 * t), 7, 30)]
  const blooms: THREE.BufferGeometry[] = []
  const pods: THREE.BufferGeometry[] = []
  const p = new THREE.Vector3()
  const tan = new THREE.Vector3()
  for (let k = 0; k < 8; k++) {
    const t = 0.1 + k * 0.115
    stem.getPointAt(t, p)
    stem.getTangentAt(t, tan)
    const sgn = k % 2 ? 1 : -1
    const out = tan.clone().multiplyScalar(0.62).add(V(0, 0.45 + 0.2 * r(), sgn * 0.7)).normalize()
    const Lf = 0.46 * (1 - k * 0.05)
    const b = p.clone().addScaledVector(out, 0.035)
    twigs.push(tube([p.clone(), b], () => 0.005, 5, 3))
    leaves.push(
      blade(
        [b, b.clone().addScaledVector(out, Lf * 0.5).add(V(0, Lf * 0.1, 0)), b.clone().addScaledVector(out, Lf).add(V(0, -Lf * 0.12, 0))],
        (u) => Lf * 0.2 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + u * 0.94)), 0.75) * (1 - 0.5 * u) * (1 + 0.12 * frac(u * 15) * sstep(0.04, 0.12, u)),
        new THREE.Vector3().crossVectors(V(0, 1, 0), out).normalize(),
        { cup: 0.22, wave: 0.05, freq: 3, color: veined('#5c9a3c', '#cfe0a0', 8, 0.5, '#7fb04c'), nu: 46, nv: 12 },
      ),
    )
    if (k > 1 && k % 2 === 0) blooms.push(xf(flower(5, 0.05, 0.02, 0.55), p.clone().add(V(0, 0.04, sgn * -0.02)), new THREE.Euler(0.4 * sgn, 0, 0)))
    if (k > 2 && k % 2 === 1)
      pods.push(xf(blob(18, 22, (d) => 0.026 * (1 + 0.1 * Math.cos(10 * Math.atan2(d.z, d.x)) * (1 - d.y * d.y)), { color: (d) => mix(C('#6f8a3a'), C('#8a6a38'), 0.5 + 0.5 * d.y) }), p.clone().add(V(0.01, 0.035, sgn * -0.02)), new THREE.Euler()))
  }
  return [
    { geo: merge([...strands, ...tie]), mat: painted({ roughness: 0.4, sheen: 1, sheenRoughness: 0.3, sheenColor: C('#fff1c4') }) },
    { geo: merge(leaves), mat: leafSkin('#dcebb0', { roughness: 0.5 }) },
    { geo: merge(twigs), mat: plant('#7a9a48') },
    { geo: merge(blooms.length ? blooms : [new THREE.BufferGeometry()]), mat: plant('#e9c63a', { roughness: 0.6 }) },
    { geo: merge(pods.length ? pods : [new THREE.BufferGeometry()]), mat: painted({ roughness: 0.7 }) },
  ]
}

// ----- cassava: the roots as they are lifted - long, tapered, joined at the foot of the woody stem, their bark
// ringed and flaking; one cut through: white flesh, a pink rind, a thread of fibre at its heart
function cassava(r: () => number): Parts {
  const barkR = (u: number, a: number, s: number) =>
    0.035 * Math.abs(Math.sin(u * 74 + 4 * noise3(u * 5 + s, Math.cos(a), Math.sin(a)))) + 0.1 * (noise3(u * 9 + s, Math.cos(a) * 2.4, Math.sin(a) * 2.4) - 0.5) + 0.03 * (noise3(u * 50, Math.cos(a) * 7 + s, Math.sin(a) * 7) - 0.5)
  const barkC = (u: number, a: number, s: number) => {
    const ringed = Math.abs(Math.sin(u * 74 + 4 * noise3(u * 5 + s, Math.cos(a), Math.sin(a))))
    const flaked = sstep(0.56, 0.68, noise3(u * 7 + s * 3, Math.cos(a) * 1.6, Math.sin(a) * 1.6))
    return mix(mix(mix(C('#47301f'), C('#77563a'), ringed * 0.6 + 0.4 * noise3(u * 30 + s, Math.cos(a) * 4, Math.sin(a) * 4)), C('#a98670'), flaked * 0.7), C('#2a1a12'), 0.4 * sstep(0.7, 1, noise3(u * 20 + s, Math.cos(a) * 3, Math.sin(a) * 3)))
  }
  const bark: THREE.BufferGeometry[] = []
  const flesh: THREE.BufferGeometry[] = []
  const CROWN = 0.13 // the height of the joint above the table
  const one = (L: number, R: number, yaw: number, seed: number, cutAt = 1) => {
    const prof = (u: number) => R * (0.3 + 0.7 * sstep(0, 0.22, u)) * (1 - 0.94 * Math.pow(sstep(0.4, 1, u), 1.3)) + 0.005
    const A0: AxisFn = (u) => V(0.05 + L * u, prof(u) * 0.96 + CROWN * Math.pow(1 - u, 3), 0.05 * L * Math.sin(TAU * (u * 0.6) + seed))
    const A: AxisFn = (u) => A0(u * cutAt)
    const rr = (u: number, a: number) => prof(u * cutAt) * (1 + barkR(u * cutAt, a, seed))
    const m = place(V(0, 0, 0), new THREE.Euler(0, yaw, 0))
    bark.push(axial(Math.round(150 * cutAt), 36, A, rr, { color: (u, a) => barkC(u * cutAt, a, seed) }).applyMatrix4(m))
    if (cutAt < 1) {
      const { N1, N2 } = axisFrame(A, refOf(A), 1)
      flesh.push(
        face(A(1), N1, N2, (a) => rr(1, a), (s, a) => {
          const white = mix(C('#f8f4ea'), C('#efe7d4'), noise3(s * 7, Math.cos(a) * 3, Math.sin(a) * 3) * 0.7 + 0.25 * Math.pow(Math.max(0, Math.cos(a * 13)), 8) * s)
          return mix(mix(mix(white, C('#d9cba0'), sstep(0.07, 0.02, s)), C('#e0ad9d'), sstep(0.86, 0.9, s)), C('#3a241a'), sstep(0.95, 0.985, s))
        }).applyMatrix4(m),
      )
    }
  }
  one(0.95, 0.105, 0.12, 1)
  one(0.8, 0.095, -0.62, 4)
  one(0.5, 0.11, -1.42, 7, 0.52) // toward the reader, cut: its face to the light
  one(0.85, 0.1, -2.5, 11)
  one(0.9, 0.09, 3.05, 15)
  // the foot of the stem the roots hang from: woody, knuckled with leaf scars, cut off above
  const SA: AxisFn = (u) => V(0.02 + 0.05 * u, CROWN - 0.02 + 0.5 * u, -0.02 * u)
  const knob = (u: number, a: number) => Math.exp(-((frac(u * 4.5 - a / TAU) - 0.5) ** 2) / 0.006) * Math.exp(-((frac(u * 9) - 0.5) ** 2) / 0.05)
  const sr = (u: number, a: number) => 0.062 * (1 - 0.25 * u) * (1 + 0.28 * knob(u, a) + 0.05 * (noise3(u * 16, Math.cos(a) * 2, Math.sin(a) * 2) - 0.5)) * (1 + 0.5 * sstep(0.2, 0, u))
  const wood = axial(50, 40, SA, sr, { color: (u, a) => mix(mix(C('#8a7a62'), C('#5a4a3a'), noise3(u * 12, Math.cos(a) * 2, Math.sin(a) * 2)), C('#c2b08e'), knob(u, a) * 0.5) })
  const woodCut = axialCap(40, SA, sr, 1, (s) => mix(mix(C('#e8dcc0'), C('#cdbb96'), sstep(0.2, 0.9, s)), C('#5a4a3a'), sstep(0.9, 1, s)))
  const crown = xf(blob(30, 34, (d) => ellR(0.15, 0.1, 0.15)(d) * (1 + 0.2 * (n3(d, 3.5) - 0.5)), { color: (d) => barkC(0.1 + 0.2 * d.x, Math.atan2(d.z, d.x), 2) }), V(0.02, CROWN, 0), new THREE.Euler())
  return [
    { geo: merge([...bark, wood, crown]), mat: painted({ roughness: 0.95, sheen: 0.22, sheenColor: C('#b09070') }) },
    { geo: merge([...flesh, woodCut]), mat: painted({ roughness: 0.72, sheen: 0.3, sheenColor: C('#ffffff') }) },
  ]
}

// ----- castor: a stalk gone red, a hand-shaped leaf of eight toothed lobes held out on a long stalk of its own,
// a cluster of soft-spined capsules turning from green to red - and at its foot the beans: glossy, marbled
function castor(r: () => number): Parts {
  const leaves: THREE.BufferGeometry[] = []
  const reds: THREE.BufferGeometry[] = []
  const FOOT = -0.95
  reds.push(tube([V(0.04, FOOT, 0), V(0, -0.3, 0.02), V(-0.03, 0.3, 0), V(0, 0.82, 0.02)], (t) => 0.034 * (1 - 0.5 * t), 9, 30))
  // the joints of the stalk
  for (const y of [-0.62, -0.22, 0.18]) reds.push(xf(new THREE.TorusGeometry(0.03, 0.006, 6, 18), V(0, y, 0.01), new THREE.Euler(Math.PI / 2, 0, 0)))
  const palm = (S: number, centre: THREE.Vector3, normal: THREE.Vector3, up: THREE.Vector3, from: THREE.Vector3, seed: number) => {
    const n = normal.clone().normalize()
    const u0 = up.clone().addScaledVector(n, -up.dot(n)).normalize()
    const side = new THREE.Vector3().crossVectors(n, u0)
    const paint = veined('#35652f', '#cfd896', 9, 0.5, '#4f8040')
    const LOBES = 8
    for (let k = 0; k < LOBES; k++) {
      const ang = (k - (LOBES - 1) / 2) * 0.74
      const len = S * (1 - 0.105 * Math.abs(k - (LOBES - 1) / 2)) * (0.94 + 0.12 * r())
      const dir = u0.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang))
      leaves.push(
        blade(
          [centre.clone(), centre.clone().addScaledVector(dir, len * 0.5).addScaledVector(n, len * 0.05), centre.clone().addScaledVector(dir, len).addScaledVector(n, -len * 0.08)],
          (u) => len * 0.23 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.8)), 0.85) * (1 - 0.3 * u) * (1 + 0.13 * frac(u * 12) * sstep(0.15, 0.3, u)),
          new THREE.Vector3().crossVectors(n, dir).normalize(),
          { cup: 0.2, wave: 0.04, freq: 2.5, color: paint, nu: 44, nv: 12 },
        ),
      )
    }
    // the web the lobes share round the stalk
    leaves.push(
      surf(8, 64, (t, v) => {
        const ph = (v - 0.5) * TAU
        const rad = S * (0.2 + 0.035 * Math.cos((ph / 0.74 + 0.5) * TAU)) * t * sstep(Math.PI, 2.6, Math.abs(ph))
        return centre.clone().addScaledVector(u0, Math.cos(ph) * rad).addScaledVector(side, Math.sin(ph) * rad).addScaledVector(n, 0.012 * S * t * t)
      }, { color: (t) => mix(C('#cfd896'), C('#35652f'), sstep(0, 0.5, t)) }),
    )
    reds.push(tube([from, from.clone().lerp(centre, 0.5).add(V(0, 0.07 * S, -0.05 * S)), centre.clone().addScaledVector(n, -0.01)], (t) => 0.016 * (1 - 0.35 * t), 7, 18))
  }
  palm(0.56, V(0.42, 0.2, 0.26), V(0.1, 0.34, 0.93), V(0.25, 1, 0), V(0, -0.22, 0.01), 1)
  palm(0.36, V(-0.42, -0.2, 0.14), V(-0.45, 0.4, 0.8), V(-0.5, 0.86, 0), V(0, -0.62, 0.01), 5)
  // the capsules: three-lobed, soft-spined, the lower ones already red
  const caps: THREE.BufferGeometry[] = []
  const capsule = (pos: THREE.Vector3, rad: number, red: number, seed: number) => {
    const body = C('#6f9a48').lerp(C('#a23b3a'), red)
    const tipC = C('#a9c878').lerp(C('#d98a78'), red)
    caps.push(xf(blob(24, 28, (d) => rad * (1 + 0.07 * Math.cos(3 * Math.atan2(d.z, d.x)) * (1 - d.y * d.y)), { color: (d) => mix(body, C('#3f5a2a').lerp(C('#6a2323'), red), 0.5 - 0.5 * Math.cos(3 * Math.atan2(d.z, d.x))) }), pos, new THREE.Euler(r() * 0.5, r() * TAU, r() * 0.5)))
    for (let i = 0; i < 44; i++) {
      const y = 1 - ((i + 0.5) / 44) * 2
      const a = i * 2.39996 + seed
      const d = V(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y))
      const len = rad * (0.5 + 0.25 * r())
      const cone = new THREE.ConeGeometry(rad * 0.11, len, 5, 1)
      cone.translate(0, len / 2, 0)
      // (painted from its foot to its point)
      const cp = cone.attributes.position as THREE.BufferAttribute
      const paint = new Float32Array(cp.count * 3)
      for (let j = 0; j < cp.count; j++) {
        const c = mix(body, tipC, cp.getY(j) / len)
        paint.set([c.r, c.g, c.b], j * 3)
      }
      cone.setAttribute('color', new THREE.BufferAttribute(paint, 3))
      caps.push(at(cone, place(pos.clone().addScaledVector(d, rad * 0.96), aim(d))))
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = k * 2.2 + 0.6
    const y = 0.3 + k * 0.066
    const out = 0.085 - k * 0.003
    const pos = V(Math.cos(a) * out, y, 0.02 + Math.sin(a) * out)
    reds.push(tube([V(0, y - 0.02, 0.02), pos], () => 0.006, 5, 3))
    capsule(pos, 0.066 - k * 0.002, sstep(5.5, 1, k), k)
  }
  // the beans: an oval, flattened a little, marbled brown on grey, with the pale knob (the caruncle) at one end
  const beans: THREE.BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const a = i * 2.4 + 0.5
    const dd = 0.11 * Math.sqrt(i + 0.6)
    const pos = V(0.38 + Math.cos(a) * dd, FOOT + 0.03, 0.42 + Math.sin(a) * dd * 0.8)
    const rot = new THREE.Euler(0.1 * (r() - 0.5), r() * TAU, 0)
    beans.push(
      xf(blob(26, 30, ellR(0.062, 0.03, 0.04), { color: (d) => {
        const marble = sstep(0.44, 0.54, 0.6 * n3(d, 5.5, i * 7) + 0.4 * n3(d, 13, i))
        return mix(mix(C('#cdbfa6'), C('#3b2217'), marble), C('#1f120c'), 0.5 * sstep(0.6, 0.75, n3(d, 24, i)))
      } }), pos, rot),
      tinted(xf(ellipsoid(0.014, 0.012, 0.016, 10, 8), V(0.06, 0.002, 0), new THREE.Euler()).applyMatrix4(place(pos, rot)), '#e8dcc0'),
    )
  }
  return [
    { geo: merge(leaves), mat: leafSkin('#cfe0a8', { roughness: 0.45, sheen: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 }) },
    { geo: merge(reds), mat: plant('#8c3a3c', { roughness: 0.45 }) },
    { geo: merge(caps), mat: painted({ roughness: 0.6, sheen: 0.6, sheenColor: C('#ffe0d8') }) },
    { geo: merge(beans), mat: painted({ roughness: 0.16, clearcoat: 0.95, clearcoatRoughness: 0.1 }) },
  ]
}

/** crops with their own builder, ahead of the archetypes */
const SPECIAL: Record<string, (c: SpecimenCrop, r: () => number) => { parts: Parts; lean: number; spin: number }> = {
  chilli: () => ({ parts: chilli(), lean: 0, spin: 0.4 }),
  okra: () => ({ parts: okra(), lean: 0, spin: 0.4 }),
  cabbage: (c, r) => ({ parts: cabbage(r), lean: 0, spin: 0.3 }),
  taro: (c, r) => ({ parts: taro(r), lean: 0, spin: 0.25 }),
  jute: (c, r) => ({ parts: jute(r), lean: 0, spin: 0.3 }),
  cassava: (c, r) => ({ parts: cassava(r), lean: 0, spin: 0.25 }),
  castor: (c, r) => ({ parts: castor(r), lean: 0, spin: 0.3 }),
  cucumber: () => ({ parts: cucumber(), lean: 0.42, spin: 0.35 }),
  courgette: () => ({ parts: courgette(), lean: 0.4, spin: 0.4 }),
  pepper: () => ({ parts: bellPepper(), lean: 0, spin: 0.5 }),
  eggplant: () => ({ parts: aubergine(), lean: -1.0, spin: 0.4 }),
  strawberry: () => ({ parts: strawberry(), lean: 0, spin: 0.2 }),
  tomato: (c, r) => ({ parts: tomatoTruss('tomato', r), lean: -0.1, spin: 0.35 }),
  cherry: (c, r) => ({ parts: tomatoTruss('cherry', r), lean: -0.1, spin: 0.35 }),
  lettuce: (c, r) => ({ parts: lettuce(r), lean: 0, spin: 0.3 }),
  basil: () => ({ parts: basil(), lean: -0.08, spin: 0.3 }),
  tobacco: () => ({ parts: tobacco(), lean: -0.05, spin: 0.35 }),
  yam: (c, r) => ({ parts: yam(r), lean: 0.12, spin: 0.35 }),
  chickpea: (c, r) => ({ parts: pulse('chickpea', r), lean: 0, spin: 0.3 }),
  groundnut: (c, r) => ({ parts: pulse('groundnut', r), lean: 0, spin: 0.3 }),
  bambara: (c, r) => ({ parts: pulse('bambara', r), lean: 0, spin: 0.3 }),
  cowpea: (c, r) => ({ parts: pulse('cowpea', r), lean: 0.05, spin: 0.3 }),
  drybean: (c, r) => ({ parts: pulse('drybean', r), lean: 0, spin: 0.3 }),
  pigeonpea: (c, r) => ({ parts: pulse('pigeonpea', r), lean: 0, spin: 0.3 }),
}

function build(c: SpecimenCrop): { parts: Parts; lean: number; spin: number } {
  const id = c.id ?? ''
  const r = rng(hashStr(id || c.name))
  if (SPECIAL[id]) return SPECIAL[id](c, r)
  const k = KIND[id] ?? 'herb'
  switch (k) {
    case 'ear': return { parts: sheaf(() => ear(id, c.color, r), r), lean: -0.42, spin: 0.35 }
    case 'panicle': return { parts: sheaf(() => panicle(id, c.color, r), r, 0.3), lean: -0.18, spin: 0.35 }
    case 'spike': return { parts: spike(id, c.color, r), lean: -0.3, spin: 0.3 }
    case 'cob': return { parts: cob(c.color, r), lean: -0.85, spin: 0.6 }
    case 'raceme': return { parts: raceme(id, c.color, r), lean: -0.2, spin: 0.3 }
    case 'sunflower': return { parts: sunflower(c.color, r), lean: 0.15, spin: -0.55 }
    case 'thistle': return { parts: thistle(c.color, r), lean: -0.25, spin: 0.3 }
    case 'pod': return { parts: pod(id, c.color, r), lean: 0.42, spin: 0.55 }
    // (tubers lie on the table: leaned, the ones at the far side of the group hung in the air over their shadows)
    case 'tuber': return { parts: tuber(id, c.color, r), lean: id === 'cassava' ? 0.6 : 0, spin: 0.4 }
    case 'taproot': return { parts: taproot(c.color), lean: -0.45, spin: 0.3 }
    case 'bulb': return { parts: bulb(c.color, r), lean: -0.2, spin: 0.3 }
    case 'boll': return { parts: boll(r), lean: -0.2, spin: 0.4 }
    case 'cane': return { parts: cane(id, c.color, r), lean: -0.4, spin: 0.3 }
    case 'broadleaf': return { parts: broadleaf(id, c.color, r), lean: id === 'castor' ? 0 : -0.2, spin: 0.35 }
    case 'head': return { parts: head(id, c.color, r), lean: 0, spin: 0.3 }
    case 'truss': return { parts: truss(id, c.color, r), lean: id === 'strawberry' ? 0 : -0.15, spin: 0.35 }
    case 'longfruit': return { parts: longfruit(id, c.color), lean: id === 'pepper' ? 0 : 0.55, spin: 0.45 }
    case 'melon': return { parts: melon(c.color), lean: 0.1, spin: 0.5 }
    case 'tuft': return { parts: tuft(id, c.color, r), lean: 0, spin: 0.3 }
    case 'clod': return { parts: clod(r), lean: 0, spin: 0.6 }
    default: return { parts: herb(c.color), lean: -0.1, spin: 0.3 }
  }
}

// ---------- the studio ----------

type Studio = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  key: THREE.DirectionalLight
  floor: THREE.Mesh
  out: HTMLCanvasElement
}
let studio: Studio | null | undefined

function getStudio(): Studio | null {
  if (studio !== undefined) return studio
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(1)
    renderer.setSize(SIZE, SIZE, false)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.VSMShadowMap
    const scene = new THREE.Scene()
    // a studio environment for the sheen and the gloss, kept low so the lamps do the lighting
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.32
    pmrem.dispose()
    // two temperatures: a warm low key from the front left, a cool slate fill and sky, a warm rim from behind
    scene.add(new THREE.HemisphereLight(0x7d8ea8, 0x14161c, 0.55))
    const key = new THREE.DirectionalLight(0xffcf98, 3.1)
    key.position.set(-1.7, 3.0, 2.0)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.radius = 9
    key.shadow.blurSamples = 16
    key.shadow.bias = -0.0005
    const sc = key.shadow.camera as THREE.OrthographicCamera
    sc.left = -1.6
    sc.right = 1.6
    sc.top = 1.6
    sc.bottom = -1.6
    sc.near = 0.1
    sc.far = 10
    scene.add(key)
    scene.add(key.target)
    const fill = new THREE.DirectionalLight(0x8aa0c0, 0.9)
    fill.position.set(2.4, 0.4, 1.2)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffb565, 3.4)
    rim.position.set(1.6, 1.4, -2.6)
    scene.add(rim)
    // an invisible floor that only takes the shadow: the specimen lies on the card, not in a void
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: 0x05070c, opacity: 0.42 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 50)
    const out = document.createElement('canvas')
    out.width = SIZE
    out.height = SIZE
    studio = { renderer, scene, camera, key, floor, out }
  } catch {
    studio = null
  }
  return studio
}

// ---------- things: the greenhouse's own objects, drawn in the same studio ----------
//
// The covers as material samples (a glazed Venlo pane, twin-wall polycarbonate with its flutes open to the light, an
// inflated double film, a film tunnel on its hoops), the kit as small machines (pipe-rail heating, an LED top-light,
// a pleated energy screen, a CO₂ cylinder, a gas engine), and a seedling in its rockwool cube for the planting month.

export type ThingId = 'glass' | 'poly' | 'film2' | 'film' | 'heat' | 'led' | 'screen' | 'co2' | 'chp' | 'seedling' | MethodThing
/** the Method page's objects, one to a chapter */
export type MethodThing = 'satellite' | 'layers' | 'rule' | 'balance' | 'spike' | 'spade'
type Built = { parts: Parts; lean: number; spin: number; tilt?: number }

const steel = (o: THREE.MeshPhysicalMaterialParameters = {}) => new THREE.MeshPhysicalMaterial({ ...UNI, color: '#b9bec4', metalness: 0.85, roughness: 0.3, ...o })
const clearMat = (c: string, opacity: number, o: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ ...UNI, color: c, transparent: true, opacity, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.4, side: THREE.DoubleSide, depthWrite: false, ...o })
const boxAt = (w: number, h: number, d: number, pos: THREE.Vector3, rot = new THREE.Euler()) => xf(new THREE.BoxGeometry(w, h, d), pos, rot)
const cylAt = (r: number, h: number, pos: THREE.Vector3, rot = new THREE.Euler(), seg = 24) => xf(new THREE.CylinderGeometry(r, r, h, seg), pos, rot)
/** a few soft streaks of reflected sky across a clear surface: what makes glass read as glass at a glance */
function glints(w: number, h: number, z: number, n = 3) {
  const out: THREE.BufferGeometry[] = []
  for (let k = 0; k < n; k++) out.push(xf(new THREE.PlaneGeometry(0.04 + 0.05 * (k % 2), h * 0.62), V(-w * 0.28 + k * w * 0.2, 0.02 * k, z), new THREE.Euler(0, 0, 0.6)))
  return out
}
const glintMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })

const brass = (o: THREE.MeshPhysicalMaterialParameters = {}) => steel({ color: '#c9a24a', metalness: 0.9, roughness: 0.3, ...o })

/** one colour over a whole shape (so it can be merged into a painted mesh) */
function tinted(g: THREE.BufferGeometry, hex: THREE.ColorRepresentation) {
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const paint = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) paint.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(paint, 3))
  return g
}

/** The Method page's objects: what each chapter is about, as a thing on the table. */
function buildMethodThing(id: MethodThing): Built {
  switch (id) {
    case 'satellite': {
      // How it works - "from the satellite down": an Earth-observing satellite as a desk model on its stand. The bus
      // wrapped in crinkled gold foil with a white radiator on its face, two solar wings on their yokes turned to the
      // sun, the telescope looking down past its sunshade, a dish with its feed, star trackers, thrusters, a mast.
      const tilt = new THREE.Euler(0.5, 0, 0)
      let box: THREE.BufferGeometry = new THREE.BoxGeometry(0.4, 0.46, 0.4, 14, 16, 14)
      box.deleteAttribute('normal')
      box.deleteAttribute('uv')
      box = mergeVertices(box, 1e-4)
      box.computeVertexNormals()
      const gold = new THREE.Color('#e6b450')
      const deep = new THREE.Color('#8a6420')
      const bus = skin(box, (p, _n, c) => {
        const k = noise3(p.x * 15 + 3, p.y * 15, p.z * 15)
        const f = noise3(p.x * 44, p.y * 44 + 3, p.z * 44)
        c.copy(deep).lerp(gold, 0.3 + 0.7 * k).multiplyScalar(0.82 + 0.42 * f)
        return (k - 0.5) * 0.022 + (f - 0.5) * 0.009
      })
      const cells: THREE.BufferGeometry[] = []
      const frames: THREE.BufferGeometry[] = []
      for (const s of [-1, 1]) {
        frames.push(cylAt(0.014, 0.2, V(s * 0.3, 0.06, 0), new THREE.Euler(0, 0, Math.PI / 2), 10))
        // the yoke: two struts from the boom to the wing's near corners
        for (const e of [-1, 1]) frames.push(tube([V(s * 0.36, 0.06, 0), V(s * 0.42, 0.06 + e * 0.165 * Math.sin(0.5) * -1, e * 0.165 * Math.cos(0.5))], () => 0.006, 5, 2))
        cells.push(boxAt(0.9, 0.012, 0.38, V(s * 0.87, 0.06, 0), tilt))
        for (let k = 0; k <= 9; k++) frames.push(boxAt(0.005, 0.016, 0.384, V(s * (0.42 + k * 0.1), 0.06, 0), tilt))
        for (const e of [-1, -1 / 3, 1 / 3, 1]) frames.push(boxAt(0.905, 0.016, 0.005, V(s * 0.87, 0.06 + e * 0.19 * Math.sin(0.5) * -1, e * 0.19 * Math.cos(0.5)), tilt))
      }
      const louvers: THREE.BufferGeometry[] = []
      for (let k = 0; k < 7; k++) louvers.push(boxAt(0.27, 0.006, 0.006, V(0, -0.15 + k * 0.05, 0.224)))
      const nozzles: THREE.BufferGeometry[] = []
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) nozzles.push(lathe([[0.008, 0], [0.012, -0.02], [0.03, -0.06], [0.027, -0.06], [0.008, -0.018]], 14).translate(x * 0.16, -0.245, z * 0.16))
      const dishAt = place(V(-0.1, 0.27, -0.06), new THREE.Euler(0.5, 0, 0.35))
      const feed: THREE.BufferGeometry[] = [at(cylAt(0.016, 0.04, V(0, 0.2, 0), new THREE.Euler(), 10), dishAt.clone())]
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2
        feed.push(at(tube([V(Math.cos(a) * 0.19, 0.105, Math.sin(a) * 0.19), V(0, 0.2, 0)], () => 0.004, 4, 2), dishAt.clone()))
      }
      const stand = merge([cylAt(0.012, 0.62, V(0, -0.56, 0), new THREE.Euler(), 12), lathe([[0.001, -0.92], [0.2, -0.92], [0.2, -0.905], [0.16, -0.882], [0.03, -0.87], [0.001, -0.87]], 40)])
      return {
        parts: [
          { geo: merge([bus]), mat: painted({ metalness: 0.7, roughness: 0.3 }) },
          { geo: merge([boxAt(0.44, 0.03, 0.44, V(0, 0.245, 0)), boxAt(0.44, 0.03, 0.44, V(0, -0.245, 0)), ...nozzles]), mat: steel({ color: '#2a2c30', metalness: 0.5, roughness: 0.5 }) },
          { geo: merge(cells), mat: steel({ color: '#14244c', metalness: 0.7, roughness: 0.18 }) },
          { geo: merge(frames), mat: steel() },
          { geo: merge([boxAt(0.3, 0.36, 0.012, V(0, 0, 0.214)), cylAt(0.1, 0.2, V(0.08, -0.35, 0.08)), lathe([[0.1, -0.45], [0.125, -0.52], [0.119, -0.52], [0.094, -0.45]], 30).translate(0.08, 0, 0.08)]), mat: steel({ color: '#e4e6e8', metalness: 0.25, roughness: 0.45 }) },
          { geo: merge([...louvers, cylAt(0.088, 0.012, V(0.08, -0.452, 0.08)), cylAt(0.028, 0.07, V(-0.12, 0.28, 0.14), new THREE.Euler(0.5, 0, -0.4), 12), cylAt(0.028, 0.07, V(0.02, 0.28, 0.16), new THREE.Euler(0.7, 0, 0.2), 12)]), mat: steel({ color: '#17181b', metalness: 0.6, roughness: 0.25 }) },
          { geo: at(lathe([[0.001, 0], [0.06, 0.008], [0.12, 0.03], [0.17, 0.07], [0.2, 0.115]], 40), dishAt.clone()), mat: steel({ color: '#eceae4', metalness: 0.15, roughness: 0.5 }) },
          { geo: merge([...feed, cylAt(0.007, 0.34, V(0.14, 0.43, 0.12), new THREE.Euler(), 8), xf(new THREE.SphereGeometry(0.02, 12, 8), V(0.14, 0.61, 0.12), new THREE.Euler())]), mat: steel() },
          { geo: stand, mat: steel({ color: '#2a2c30', metalness: 0.6, roughness: 0.4 }) },
        ],
        lean: 0,
        spin: 0.62,
        tilt: 0.06,
      }
    }
    case 'layers': {
      // Data - one field as the stack of what is known about it, each plate saying what it is: the sky with its
      // clouds, the weather record as warming stripes, the crop as a patchwork of parcels, the relief in contour
      // steps, the soil in its horizons - on four pins.
      const W = 0.86
      const pin = (a: number, b: number) => merge([cylAt(0.011, 0.92, V(a * (W / 2 - 0.045), 0.03, b * (W / 2 - 0.045)), new THREE.Euler(), 10), xf(new THREE.SphereGeometry(0.02, 12, 8), V(a * (W / 2 - 0.045), 0.5, b * (W / 2 - 0.045)), new THREE.Euler())])
      const r = rng(23)
      const clouds: THREE.BufferGeometry[] = []
      for (let k = 0; k < 6; k++) {
        const cx = (r() - 0.5) * 0.6
        const cz = (r() - 0.5) * 0.6
        for (let j = 0; j < 4; j++) clouds.push(at(lump(0.05 + 0.03 * r(), 0.028, 0.045 + 0.02 * r(), 0.18, 3, k * 5 + j, 3), place(V(cx + (j - 1.5) * 0.045, 0.415 + 0.006 * (j % 2), cz + (r() - 0.5) * 0.04), new THREE.Euler())))
      }
      // the weather plate: a stripe a year, blue to red
      const stripes: THREE.BufferGeometry[] = []
      const cold = new THREE.Color('#2f5f9e')
      const mild = new THREE.Color('#e8e0cc')
      const hot = new THREE.Color('#c2412a')
      const NS = 18
      for (let k = 0; k < NS; k++) {
        const t = Math.min(1, Math.max(0, k / (NS - 1) + (r() - 0.5) * 0.28))
        const c = t < 0.5 ? cold.clone().lerp(mild, t * 2) : mild.clone().lerp(hot, (t - 0.5) * 2)
        stripes.push(tinted(boxAt((W - 0.1) / NS - 0.004, 0.008, W - 0.12, V(-(W - 0.1) / 2 + (k + 0.5) * ((W - 0.1) / NS), 0.236, 0)), c))
      }
      // the crop plate: parcels, some in rows
      const parcels: THREE.BufferGeometry[] = []
      const fields: [number, number, number, number, string, boolean][] = [
        [-0.4, -0.4, 0.42, 0.34, '#4f7a35', true], [0.04, -0.4, 0.36, 0.2, '#b9a55a', false], [0.04, -0.18, 0.36, 0.12, '#6f9443', true],
        [-0.4, -0.04, 0.24, 0.44, '#8aa24e', false], [-0.14, -0.04, 0.3, 0.2, '#c8b56a', true], [-0.14, 0.18, 0.54, 0.22, '#3f6a30', true], [0.18, -0.04, 0.22, 0.2, '#557f3a', false],
      ]
      for (const [x, z, w, d, hex, rows] of fields) {
        parcels.push(tinted(boxAt(w - 0.012, 0.012, d - 0.012, V(x + w / 2, 0.076, z + d / 2)), hex))
        if (rows) for (let k = 1; k < d / 0.028; k++) parcels.push(tinted(boxAt(w - 0.03, 0.006, 0.008, V(x + w / 2, 0.085, z + k * 0.028)), new THREE.Color(hex).multiplyScalar(1.45)))
      }
      // the relief plate: a hill in contour steps, a valley beside it
      const steps: THREE.BufferGeometry[] = []
      for (let k = 0; k < 7; k++) steps.push(tinted(xf(new THREE.CylinderGeometry(0.3 - k * 0.04, 0.32 - k * 0.04, 0.016, 48), V(0.1 - k * 0.012, -0.086 + k * 0.016, -0.06 + k * 0.014), new THREE.Euler(0, k * 0.3, 0), V(1.12, 1, 0.84)), new THREE.Color('#8f8873').lerp(new THREE.Color('#d6cfb8'), k / 6)))
      for (let k = 0; k < 4; k++) steps.push(tinted(xf(new THREE.CylinderGeometry(0.12 - k * 0.026, 0.135 - k * 0.026, 0.016, 32), V(-0.26, -0.086 + k * 0.016, 0.24), new THREE.Euler(), V(1, 1, 1.2)), new THREE.Color('#8f8873').lerp(new THREE.Color('#c4bda6'), k / 3)))
      // the soil: a block in its horizons, stones in the lowest
      const stones: THREE.BufferGeometry[] = []
      for (let k = 0; k < 26; k++) {
        const side = k % 2
        const u = (r() - 0.5) * (W - 0.06)
        stones.push(at(lump(0.012 + 0.012 * r(), 0.009 + 0.006 * r(), 0.012, 0.25, 3, k, 2), place(side ? V(W / 2, -0.4 + 0.05 * r(), u) : V(u, -0.4 + 0.05 * r(), W / 2), new THREE.Euler(r() * 3, r() * 3, 0))))
      }
      return {
        parts: [
          { geo: boxAt(W, 0.022, W, V(0, 0.39, 0)), mat: clearMat('#8fb9e8', 0.3) },
          { geo: merge(clouds), mat: plant('#f1f3f5', { roughness: 0.9, sheen: 0.8 }) },
          { geo: boxAt(W, 0.022, W, V(0, 0.22, 0)), mat: clearMat('#e9e2d0', 0.3) },
          { geo: merge([...stripes, ...parcels, ...steps]), mat: painted({ roughness: 0.62 }) },
          { geo: boxAt(W, 0.03, W, V(0, 0.055, 0)), mat: plant('#2f3a26', { roughness: 0.7 }) },
          { geo: boxAt(W, 0.03, W, V(0, -0.11, 0)), mat: plant('#7d7765', { roughness: 0.75 }) },
          { geo: boxAt(W, 0.045, W, V(0, -0.262, 0)), mat: plant('#2e2118', { roughness: 0.92 }) },
          { geo: boxAt(W, 0.07, W, V(0, -0.32, 0)), mat: plant('#6a4f35', { roughness: 0.92 }) },
          { geo: boxAt(W, 0.075, W, V(0, -0.3925, 0)), mat: plant('#a58d68', { roughness: 0.92 }) },
          { geo: merge(stones), mat: plant('#cfc5ad', { roughness: 0.8 }) },
          { geo: merge([pin(-1, -1), pin(1, -1), pin(-1, 1), pin(1, 1)]), mat: brass() },
        ],
        lean: 0,
        spin: 0.72,
        tilt: 0.1,
      }
    }
    case 'rule': {
      // Limits - a folding rule, half opened and stood on its edge: yellow leaves on brass hinges, the marks to the
      // eye, every tenth in red, brass caps on its two ends. A measure has an end.
      const L = 0.36
      const H = 0.1
      const leaves: THREE.BufferGeometry[] = []
      const ticks: THREE.BufferGeometry[] = []
      const reds: THREE.BufferGeometry[] = []
      const metal: THREE.BufferGeometry[] = []
      const p = V(-0.5, 0, 0.2)
      const angles = [0.8, -0.95, 0.85, -0.9, 0.75]
      angles.forEach((a, k) => {
        const dir = V(Math.cos(a), 0, Math.sin(a))
        const rot = new THREE.Euler(0, -a, 0)
        const n = V(-dir.z, 0, dir.x)
        metal.push(k === 0 ? boxAt(0.016, H + 0.004, 0.016, V(p.x + dir.x * 0.006, 0, p.z + dir.z * 0.006), rot) : cylAt(0.015, H + 0.014, V(p.x, 0, p.z), new THREE.Euler(), 14))
        leaves.push(boxAt(L, H, 0.012, V(p.x + (dir.x * L) / 2, 0, p.z + (dir.z * L) / 2), rot))
        for (let j = 1; j < 20; j++) {
          const ten = j % 10 === 0
          const h = ten ? 0.058 : j % 5 === 0 ? 0.042 : 0.024
          for (const s of [-1, 1]) (ten ? reds : ticks).push(boxAt(ten ? 0.006 : 0.004, h, 0.002, V(p.x + dir.x * L * (j / 20) + n.x * s * 0.0065, H / 2 - h / 2, p.z + dir.z * L * (j / 20) + n.z * s * 0.0065), rot))
        }
        p.add(dir.multiplyScalar(L))
        if (k === angles.length - 1) metal.push(boxAt(0.016, H + 0.004, 0.016, V(p.x - Math.cos(a) * 0.006, 0, p.z - Math.sin(a) * 0.006), rot))
      })
      return {
        parts: [
          { geo: merge(leaves), mat: plant('#dcb23a', { roughness: 0.42, clearcoat: 0.55 }) },
          { geo: merge(ticks), mat: plant('#17181a', { roughness: 0.5 }) },
          { geo: merge(reds), mat: plant('#b3261c', { roughness: 0.5 }) },
          { geo: merge(metal), mat: brass() },
        ],
        lean: 0,
        spin: 0.3,
        tilt: 0.3,
      }
    }
    case 'balance': {
      // Validation - a beam balance: the model's answer in one pan, what farms really grow in the other; the
      // pointer under the beam says how far apart they are
      const b = 0.11
      const beamY = 0.74
      const end = (s: number) => V(s * 0.46 * Math.cos(b), beamY + s * 0.46 * Math.sin(b), 0)
      const wires: THREE.BufferGeometry[] = []
      const pans: THREE.BufferGeometry[] = []
      const panY = (s: number) => end(s).y - 0.44
      for (const s of [-1, 1]) {
        const e = end(s)
        pans.push(xf(lathe([[0.001, 0], [0.1, 0.004], [0.15, 0.018], [0.165, 0.04], [0.16, 0.044], [0.145, 0.026], [0.1, 0.012], [0.001, 0.008]], 40), V(e.x, panY(s), 0), new THREE.Euler()))
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.5
          wires.push(tube([e.clone(), V(e.x + Math.cos(a) * 0.155, panY(s) + 0.04, Math.sin(a) * 0.155)], () => 0.0035, 5, 2))
        }
        wires.push(xf(new THREE.SphereGeometry(0.016, 12, 8), e, new THREE.Euler()))
      }
      const grain: THREE.BufferGeometry[] = []
      const r = rng(31)
      for (let k = 0; k < 34; k++) {
        const a = r() * Math.PI * 2
        const d = Math.sqrt(r()) * 0.1
        grain.push(xf(new THREE.SphereGeometry(0.016, 8, 6), V(end(-1).x + Math.cos(a) * d, panY(-1) + 0.026 + (0.1 - d) * 0.6 * r(), Math.sin(a) * d), new THREE.Euler(r() * 3, r() * 3, 0), V(1, 0.7, 1.5)))
      }
      const weights = merge([
        lathe([[0.001, 0], [0.04, 0], [0.04, 0.05], [0.03, 0.06], [0.012, 0.064], [0.012, 0.078], [0.02, 0.084], [0.001, 0.09]], 24).translate(end(1).x - 0.04, panY(1) + 0.012, 0.02),
        lathe([[0.001, 0], [0.028, 0], [0.028, 0.036], [0.02, 0.044], [0.009, 0.047], [0.009, 0.057], [0.014, 0.062], [0.001, 0.066]], 24).translate(end(1).x + 0.05, panY(1) + 0.012, -0.03),
      ])
      // the pointer hangs from the beam's middle, square to it
      const pointer = xf(new THREE.ConeGeometry(0.009, 0.24, 8), V(Math.sin(b) * 0.12, beamY - Math.cos(b) * 0.12, 0.02), new THREE.Euler(0, 0, b + Math.PI))
      return {
        parts: [
          { geo: lathe([[0.001, 0], [0.25, 0], [0.25, 0.02], [0.21, 0.046], [0.05, 0.062], [0.03, 0.08], [0.001, 0.08]], 48), mat: plant('#1b1c1f', { roughness: 0.35, clearcoat: 0.7 }) },
          { geo: merge([cylAt(0.016, 0.68, V(0, 0.42, 0), new THREE.Euler(), 16), xf(new THREE.SphereGeometry(0.03, 16, 12), V(0, 0.79, 0), new THREE.Euler()), boxAt(0.94, 0.02, 0.02, V(0, beamY, 0), new THREE.Euler(0, 0, b)), lathe([[0.02, 0.085], [0.034, 0.1], [0.022, 0.13], [0.016, 0.16]], 20)]), mat: brass() },
          { geo: merge(pans), mat: brass({ roughness: 0.24 }) },
          { geo: merge(wires), mat: brass() },
          { geo: merge(grain), mat: plant('#d6b469', { roughness: 0.55 }) },
          { geo: merge([weights, pointer]), mat: brass({ color: '#b58a3a' }) },
        ],
        lean: 0,
        spin: 0.42,
        tilt: 0.08,
      }
    }
    case 'spike': {
      // Every number - "every number has a receipt": a bill spike, the slips on it curling, each with its printed
      // lines and a total at the foot
      const r = rng(11)
      const slips: THREE.BufferGeometry[] = []
      const papers = ['#f1eee6', '#ece6d6', '#e9dfc2', '#f0e9dc', '#e6e0d0']
      const ink = new THREE.Color('#3a3c42')
      for (let k = 0; k < 6; k++) {
        const w = 0.2
        const l = 0.36 + 0.12 * r()
        const g = new THREE.PlaneGeometry(w, l, 12, 56)
        g.rotateX(-Math.PI / 2)
        const pos = g.attributes.position as THREE.BufferAttribute
        const paint = new Float32Array(pos.count * 3)
        const paper = new THREE.Color(papers[k % papers.length])
        const curl = 0.3 + r() * 0.7
        const side = k % 2 ? -1 : 1
        const c = new THREE.Color()
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i)
          const z = pos.getZ(i)
          pos.setY(i, curl * (z * z * (z * side > 0 ? 1.7 : 0.45)) + 0.6 * x * x)
          // print: a short heading, then rows of figures, a heavier total near the foot
          const row = Math.floor((z / l + 0.5) * 28)
          const inMargin = Math.abs(x) < w * 0.36
          const printed = inMargin && row > 2 && row < 25 && row % 2 === 0 && (row === 22 || x < w * (0.1 + 0.22 * h3(row, k, 1)) || x > w * 0.22)
          c.copy(paper)
          if (printed) c.lerp(ink, row === 22 ? 0.85 : 0.6)
          paint.set([c.r, c.g, c.b], i * 3)
        }
        g.setAttribute('color', new THREE.BufferAttribute(paint, 3))
        g.computeVertexNormals()
        slips.push(xf(g, V((r() - 0.5) * 0.02, 0.1 + k * 0.062, (r() - 0.5) * 0.02), new THREE.Euler((r() - 0.5) * 0.08, k * 1.05 + 0.4 * r(), (r() - 0.5) * 0.08)))
      }
      return {
        parts: [
          { geo: lathe([[0.001, 0], [0.19, 0], [0.19, 0.02], [0.16, 0.042], [0.04, 0.058], [0.001, 0.058]], 44), mat: steel({ color: '#26282c', metalness: 0.7, roughness: 0.38 }) },
          { geo: lathe([[0.001, 0.05], [0.01, 0.05], [0.0075, 0.66], [0.001, 0.86]], 14), mat: steel() },
          { geo: merge(slips), mat: painted({ roughness: 0.86, sheen: 0.2 }) },
        ],
        lean: 0,
        spin: 0.5,
        tilt: 0.16,
      }
    }
    case 'spade': {
      // Farmers - the hand the advice is for: a spade stood in a clod of the field. A dished blade with its rib and
      // treads, worn bright along the edge and still carrying soil; the socket strapped up an ash shaft; a D grip.
      let blade: THREE.BufferGeometry = new THREE.BoxGeometry(0.24, 0.36, 0.012, 14, 20, 1)
      blade.deleteAttribute('normal')
      blade.deleteAttribute('uv')
      blade = mergeVertices(blade, 1e-4)
      const bp = blade.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i)
        const y = bp.getY(i)
        const t = Math.max(0, -y / 0.18)
        const nx = x * (1 - 0.5 * t * t)
        // dished across its width, a rib down the middle fading toward the point
        bp.setXYZ(i, nx, y, bp.getZ(i) + 1.5 * nx * nx - 0.02 + 0.012 * Math.exp(-((nx / 0.022) ** 2)) * ss(-0.16, 0.1, y))
      }
      blade.computeVertexNormals()
      const steelC = new THREE.Color('#8f959b')
      const bright = new THREE.Color('#d9dde0')
      const soilC = new THREE.Color('#4a3828')
      skin(blade, (p, _n, c) => {
        const edge = ss(-0.1, -0.18, p.y) + ss(0.085, 0.118, Math.abs(p.x) / (1 - 0.5 * Math.max(0, -p.y / 0.18) ** 2 + 1e-3))
        const dirt = ss(0.42, 0.7, noise3(p.x * 14, p.y * 14, 3)) * ss(0.12, -0.12, p.y)
        c.copy(steelC).multiplyScalar(0.85 + 0.3 * noise3(p.x * 60, p.y * 6, 1)).lerp(bright, Math.min(1, edge) * 0.7).lerp(soilC, dirt * 0.85)
        return 0
      })
      blade.translate(0, 0.36, 0)
      const treads = merge([boxAt(0.1, 0.016, 0.03, V(-0.068, 0.545, 0.008)), boxAt(0.1, 0.016, 0.03, V(0.068, 0.545, 0.008))])
      const socket = merge([lathe([[0.03, 0.5], [0.024, 0.6], [0.022, 0.72], [0.02, 0.72], [0.02, 0.5]], 16), boxAt(0.012, 0.2, 0.05, V(0, 0.46, 0.012))])
      const shaft = lathe([[0.001, 0.56], [0.0205, 0.56], [0.019, 0.9], [0.021, 1.16], [0.001, 1.16]], 16)
      // the D: a fork of two straps up to a turned wooden grip
      const fork = merge([-1, 1].map((s) => tube([V(0, 1.12, 0), V(s * 0.03, 1.2, 0), V(s * 0.058, 1.27, 0), V(s * 0.06, 1.33, 0)], () => 0.0085, 6, 10)))
      const grip = xf(lathe([[0.001, -0.075], [0.017, -0.075], [0.02, -0.03], [0.022, 0], [0.02, 0.03], [0.017, 0.075], [0.001, 0.075]], 16), V(0, 1.33, 0), new THREE.Euler(0, 0, Math.PI / 2))
      const ground = clod(rng(5))
      for (const part of ground) part.geo.scale(0.72, 0.6, 0.72)
      return {
        parts: [
          ...ground,
          { geo: merge([blade]), mat: painted({ metalness: 0.75, roughness: 0.34 }) },
          { geo: merge([treads, socket, fork]), mat: steel({ color: '#7d8389', metalness: 0.8, roughness: 0.4 }) },
          { geo: shaft, mat: plant('#b89262', { roughness: 0.55, clearcoat: 0.2 }) },
          { geo: grip, mat: plant('#a37d50', { roughness: 0.5, clearcoat: 0.25 }) },
        ],
        lean: -0.14,
        spin: 0.55,
        tilt: 0.04,
      }
    }
  }
}

function buildThing(id: ThingId): Built {
  switch (id) {
    case 'satellite':
    case 'layers':
    case 'rule':
    case 'balance':
    case 'spike':
    case 'spade':
      return buildMethodThing(id)
    case 'glass': {
      const W = 1.1
      const H = 0.82
      const frame = merge([boxAt(W + 0.08, 0.045, 0.06, V(0, H / 2 + 0.02, 0)), boxAt(W + 0.08, 0.045, 0.06, V(0, -H / 2 - 0.02, 0)), boxAt(0.045, H, 0.06, V(-W / 2 - 0.02, 0, 0)), boxAt(0.045, H, 0.06, V(W / 2 + 0.02, 0, 0)), boxAt(0.03, H, 0.05, V(0, 0, 0))])
      return {
        parts: [
          { geo: merge([boxAt(W, H, 0.012, V(0, 0, 0))]), mat: clearMat('#cfe6e2', 0.2), noShadow: true },
          { geo: merge(glints(W, H, 0.012)), mat: glintMat(), noShadow: true },
          { geo: frame, mat: steel() },
        ],
        lean: 0,
        spin: 0.62,
      }
    }
    case 'poly': {
      // twin-wall polycarbonate: two skins and the webs between them, the flutes open at the cut end
      const W = 1.05
      const H = 0.72
      const T = 0.085
      const webs: THREE.BufferGeometry[] = []
      for (let k = 0; k <= 12; k++) webs.push(boxAt(W, 0.006, T, V(0, -H / 2 + (k * H) / 12, 0)))
      return {
        parts: [
          { geo: merge([boxAt(W, H, 0.007, V(0, 0, T / 2)), boxAt(W, H, 0.007, V(0, 0, -T / 2))]), mat: clearMat('#e6ecef', 0.34, { roughness: 0.3 }), noShadow: true },
          { geo: merge(webs), mat: clearMat('#f4f6f7', 0.42, { roughness: 0.25 }), noShadow: true },
          { geo: merge(glints(W, H, T / 2 + 0.006, 2)), mat: glintMat(), noShadow: true },
          { geo: merge([boxAt(0.04, H + 0.04, T + 0.03, V(-W / 2 - 0.02, 0, 0))]), mat: steel() },
        ],
        lean: 0,
        spin: -0.75,
      }
    }
    case 'film2': {
      // two films blown apart into a pillow between aluminium clamp profiles
      const sheet = (s: number) =>
        surf(36, 30, (u, v) => {
          const b = 0.1 * Math.sin(Math.PI * u) * Math.pow(Math.sin(Math.PI * v), 0.7)
          const crinkle = 0.007 * (noise3(u * 16, v * 16, s * 5) - 0.5)
          return V((u - 0.5) * 1.1, (v - 0.5) * 0.8, s * (b + crinkle))
        }, { wrap: false })
      return {
        parts: [
          { geo: merge([sheet(1), sheet(-1)]), mat: clearMat('#eef2ef', 0.26, { roughness: 0.14 }), noShadow: true },
          { geo: merge(glints(1.1, 0.8, 0.11, 2)), mat: glintMat(), noShadow: true },
          { geo: merge([boxAt(1.16, 0.05, 0.06, V(0, 0.42, 0)), boxAt(1.16, 0.05, 0.06, V(0, -0.42, 0))]), mat: steel() },
        ],
        lean: 0,
        spin: 0.55,
        tilt: -0.55,
      }
    }
    case 'film': {
      // a film tunnel: steel hoops, the film sagging between them, a row of young plants under it on its bed
      const R = 0.42
      const hoops = [-0.45, 0, 0.45].map((z) => {
        const pts: THREE.Vector3[] = []
        for (let k = 0; k <= 18; k++) pts.push(V(R * Math.cos((Math.PI * k) / 18), R * Math.sin((Math.PI * k) / 18), z))
        return tube(pts, () => 0.012, 6, 40)
      })
      const film = surf(40, 30, (u, v) => {
        const z = (u - 0.5) * 1.1
        const a = Math.PI * v
        const rr = R + 0.014 - 0.016 * Math.abs(Math.sin((Math.PI * z) / 0.45)) + 0.006 * (noise3(u * 12, v * 9, 2) - 0.5)
        return V(rr * Math.cos(a), rr * Math.sin(a), z)
      }, { wrap: false })
      const plants: THREE.BufferGeometry[] = []
      for (let k = 0; k < 5; k++) plants.push(xf(lump(0.06, 0.05, 0.06, 0.3, 4, k, 3), V(0, 0.05, -0.4 + k * 0.2), new THREE.Euler()))
      return {
        parts: [
          { geo: film, mat: clearMat('#f1f3ee', 0.3, { roughness: 0.18 }), noShadow: true },
          { geo: merge(hoops), mat: steel() },
          { geo: merge(plants), mat: plant('#5d9a3c') },
          { geo: merge([boxAt(0.95, 0.03, 1.2, V(0, -0.0, 0))]), mat: plant('#3b2f26', { roughness: 0.95, sheen: 0.1 }) },
        ],
        lean: 0,
        spin: 0.75,
      }
    }
    case 'heat': {
      // pipe-rail heating: a loop of steel pipe on its stands, warm to the touch
      const loop = tube([V(-0.42, 0, -0.13), V(0.22, 0, -0.13), V(0.38, 0, -0.1), V(0.44, 0, 0), V(0.38, 0, 0.1), V(0.22, 0, 0.13), V(-0.42, 0, 0.13)], () => 0.04, 12, 140)
      const stands = [-0.25, 0.18].flatMap((x) => [boxAt(0.03, 0.22, 0.03, V(x, -0.13, -0.12)), boxAt(0.03, 0.22, 0.03, V(x, -0.13, 0.12)), boxAt(0.03, 0.03, 0.32, V(x, -0.03, 0))])
      return {
        parts: [
          { geo: loop, mat: steel({ color: '#c3c5c7', roughness: 0.22 }) },
          { geo: merge(stands), mat: steel({ color: '#7d848a', roughness: 0.5, metalness: 0.6 }) },
        ],
        lean: 0,
        spin: 0.5,
      }
    }
    case 'led': {
      // an LED top-light: a slim finned housing, its diodes burning on the underside
      const fins: THREE.BufferGeometry[] = []
      for (let k = 0; k < 11; k++) fins.push(boxAt(0.012, 0.05, 0.15, V(-0.33 + k * 0.066, 0.06, 0)))
      const emitter = boxAt(0.66, 0.008, 0.11, V(0, -0.038, 0))
      const brackets = [tube([V(-0.26, 0.04, 0), V(-0.26, 0.26, 0)], () => 0.008, 6, 3), tube([V(0.26, 0.04, 0), V(0.26, 0.26, 0)], () => 0.008, 6, 3)]
      return {
        parts: [
          { geo: merge([boxAt(0.74, 0.07, 0.16, V(0, 0, 0)), ...fins]), mat: steel({ color: '#3a3f45', metalness: 0.6, roughness: 0.42 }) },
          { geo: emitter, mat: steel({ color: '#000000', metalness: 0, emissive: C('#ffd2a6'), emissiveIntensity: 4 }) },
          { geo: merge(brackets), mat: steel() },
        ],
        lean: 0.05,
        spin: 0.35,
        tilt: -0.95,
      }
    }
    case 'screen': {
      // an energy screen: aluminised and white strips, pleated, open on one side and gathered on the other
      const W = 1.1
      const H = 0.78
      const sheet = surf(140, 20, (u, v) => {
        const x = -W / 2 + W * 0.9 * Math.pow(u, 0.65)
        const amp = 0.01 + 0.06 * u * u
        return V(x, (v - 0.5) * H - 0.03 * Math.sin(Math.PI * u) * (1 - v), amp * Math.sin(u * Math.PI * 46))
      }, { wrap: false, color: (u) => mix(C('#c9ced3'), C('#f2f1ec'), 0.5 + 0.5 * Math.cos(u * Math.PI * 46)) })
      return {
        parts: [
          { geo: sheet, mat: painted({ metalness: 0.45, roughness: 0.32 }) },
          { geo: merge([boxAt(W + 0.12, 0.035, 0.05, V(0, H / 2 + 0.02, 0))]), mat: steel() },
        ],
        lean: 0,
        spin: 0.5,
      }
    }
    case 'co2': {
      // a CO₂ cylinder: shoulder band, valve and handwheel, the hose running off along the floor
      const body = lathe([[0.001, -0.45], [0.12, -0.45], [0.13, -0.42], [0.13, 0.24], [0.11, 0.33], [0.06, 0.38], [0.035, 0.4], [0.035, 0.45], [0.001, 0.45]], 44)
      const band = lathe([[0.1335, 0.14], [0.1335, 0.24], [0.1135, 0.33], [0.112, 0.33]], 44)
      const valve = merge([cylAt(0.03, 0.08, V(0, 0.49, 0)), xf(new THREE.TorusGeometry(0.055, 0.009, 8, 28), V(0, 0.54, 0), new THREE.Euler(Math.PI / 2, 0, 0)), cylAt(0.016, 0.07, V(0.05, 0.48, 0), new THREE.Euler(0, 0, Math.PI / 2), 12)])
      const hose = tube([V(0.08, 0.48, 0), V(0.22, 0.42, 0.05), V(0.3, 0.0, 0.1), V(0.36, -0.42, 0.14), V(0.6, -0.43, 0.2), V(0.95, -0.43, 0.18)], () => 0.016, 8, 60)
      return {
        parts: [
          { geo: body, mat: steel({ color: '#6f777e', metalness: 0.35, roughness: 0.42 }) },
          { geo: band, mat: steel({ color: '#d9dcdf', metalness: 0.2, roughness: 0.4 }) },
          { geo: valve, mat: steel() },
          { geo: hose, mat: plant('#26292d', { roughness: 0.6, sheen: 0.2 }) },
        ],
        lean: 0,
        spin: 0.4,
      }
    }
    case 'chp': {
      // a gas engine on its skid: the block with its row of heads, the generator, the radiator, the exhaust stack
      const heads: THREE.BufferGeometry[] = []
      for (let k = 0; k < 6; k++) heads.push(boxAt(0.075, 0.06, 0.15, V(-0.36 + k * 0.088, 0.36, 0)))
      const grille: THREE.BufferGeometry[] = []
      for (let k = 0; k < 9; k++) grille.push(boxAt(0.01, 0.34, 0.36, V(0.46 + k * 0.022, 0.25, 0)))
      return {
        parts: [
          { geo: merge([boxAt(1.4, 0.06, 0.5, V(0, -0.03, 0))]), mat: steel({ color: '#2a2f34', metalness: 0.5, roughness: 0.6 }) },
          { geo: merge([boxAt(0.6, 0.28, 0.26, V(-0.14, 0.18, 0)), ...heads]), mat: steel({ color: '#5b646c', metalness: 0.55, roughness: 0.45 }) },
          { geo: merge([cylAt(0.17, 0.38, V(-0.64, 0.19, 0), new THREE.Euler(0, 0, Math.PI / 2), 32), boxAt(0.12, 0.42, 0.42, V(0.54, 0.24, 0)), ...grille]), mat: steel({ color: '#31373d', metalness: 0.5, roughness: 0.5 }) },
          { geo: merge([tube([V(-0.1, 0.4, 0.06), V(-0.05, 0.5, 0.1), V(0.12, 0.56, 0.1), V(0.18, 0.75, 0.1), V(0.18, 0.95, 0.1)], () => 0.035, 10, 30), cylAt(0.05, 0.03, V(0.18, 0.96, 0.1))]), mat: steel({ color: '#c7c3bc', roughness: 0.35 }) },
        ],
        lean: 0,
        spin: 0.55,
      }
    }
    case 'seedling': {
      // a young plant in its rockwool cube: two seed leaves, two true leaves
      const cube = blob(24, 28, (d) => 0.13 / Math.pow(Math.abs(d.x) ** 8 + Math.abs(d.y) ** 8 + Math.abs(d.z) ** 8, 1 / 8), { color: (d) => mix(C('#9a9479'), C('#5f5b4a'), 0.75 * noise3(d.x * 4, d.y * 34, d.z * 4)) })
      const stem = tube([V(0, 0.12, 0), V(0.01, 0.22, 0), V(-0.01, 0.32, 0)], (t) => 0.013 * (1 - 0.3 * t), 6, 10)
      const leaves: THREE.BufferGeometry[] = []
      const leafAt = (base: THREE.Vector3, a: number, L: number, w: number, up: number) => {
        const out = V(Math.cos(a), 0, Math.sin(a))
        return blade([base, base.clone().addScaledVector(out, L * 0.5).add(V(0, up, 0)), base.clone().addScaledVector(out, L).add(V(0, up * 0.6, 0))], (t) => w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.96)), 0.7), V(-out.z, 0, out.x), { cup: 0.3, color: veined('#5f9a3c', '#a9cf7c', 4, 0.4), nu: 16, nv: 8 })
      }
      leaves.push(leafAt(V(0, 0.24, 0), 0.4, 0.17, 0.055, 0.03), leafAt(V(0, 0.24, 0), 0.4 + Math.PI, 0.17, 0.055, 0.03))
      leaves.push(leafAt(V(-0.01, 0.32, 0), 2.0, 0.26, 0.095, 0.06), leafAt(V(-0.01, 0.32, 0), 2.0 + Math.PI, 0.22, 0.085, 0.07))
      return {
        parts: [
          { geo: cube, mat: painted({ roughness: 0.95, sheen: 0.4, sheenColor: C('#e8e2c8') }) },
          { geo: merge([stem]), mat: plant('#6f9a44') },
          { geo: merge(leaves), mat: leafSkin('#d4ecb0') },
        ],
        lean: 0,
        spin: 0.4,
      }
    }
  }
}

/**
 * A drawing's turns in the page's queue for heavy work (lib/calm): after the scenes' own, once the page has stood for
 * over half a second (a pause between two flicks of the wheel is not one). A drawing takes two: the plant is built in
 * one, drawn and read back in the next.
 */
const PAINT = { rank: RANK.paint, still: 600, patience: 6000 }

function renderOne(c: SpecimenCrop, px = SIZE): Promise<string | null> {
  return renderBuilt(build(c), px)
}

async function renderBuilt(b: Built, px = SIZE): Promise<string | null> {
  const st = getStudio()
  if (!st) return null
  const { renderer, scene, camera, floor } = st
  // the studio is one renderer for every size: a card's 320 px, or the plan's plate, where the plant stands a screen
  // high (the drawings queue one at a time, so the size is this drawing's own)
  if (renderer.domElement.width !== px) {
    renderer.setSize(px, px, false)
    st.out.width = px
    st.out.height = px
  }
  const { parts, lean, spin } = b
  const group = new THREE.Group()
  const inner = new THREE.Group()
  inner.rotation.x = b.tilt ?? 0
  group.add(inner)
  for (const p of parts) {
    if (!p.geo.attributes.position || p.geo.attributes.position.count === 0) continue
    const m = new THREE.Mesh(p.geo, p.mat)
    m.castShadow = !p.noShadow
    inner.add(m)
  }
  // the pose: leaned into the frame's diagonal, turned three-quarters to the light
  group.rotation.set(0.12, spin, lean)
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const s = 2.0 / Math.max(size.x, size.y, size.z * 0.8)
  group.scale.setScalar(s)
  group.position.copy(centre).multiplyScalar(-s)
  scene.add(group)
  group.updateMatrixWorld(true)
  const box2 = new THREE.Box3().setFromObject(group)
  // A low thing (tubers on the table, a pod, a folding rule) is set down where a tall one stands: centred in the frame
  // it lay in mid-air above the pool of light every card and vitrine puts under its specimen.
  const drop = Math.max(0, 0.64 - (box2.max.y - box2.min.y) / 2)
  group.position.y -= drop
  floor.position.y = box2.min.y - drop - 0.02
  // a camera a little above, the specimen filling the frame with a margin for its shadow
  camera.position.set(0, 0.95, 6.2)
  camera.lookAt(0, -0.06, 0)
  // any program not yet built compiles in the background (KHR_parallel_shader_compile), not in a long task
  await renderer.compileAsync(scene, camera)
  // (the draw and the read back - a wait on the GPU - in a turn of their own: the build took the last one, and the
  // programs came back whenever they did)
  await calm.turn(PAINT)
  renderer.render(scene, camera)
  const ctx = st.out.getContext('2d')
  scene.remove(group)
  // geometry goes; materials stay alive, so their compiled shader programs are reused by the next specimen (a
  // disposed material frees its program, and recompiling three or four programs per card was most of the cost)
  for (const p of parts) p.geo.dispose()
  if (!ctx) return null
  ctx.clearRect(0, 0, px, px)
  ctx.drawImage(renderer.domElement, 0, 0)
  return new Promise((resolve) => st.out.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png'))
}

// ---------- the queue and the cache ----------

const cache = new Map<string, Promise<string | null>>()
const queue: (() => Promise<void>)[] = []
let pumping = false
function pump() {
  if (pumping) return
  pumping = true
  const step = () => {
    // A drawing is a long task - the plant is built, then drawn; a tenth of a second, a third for a plate's large
    // one - so it waits for a turn in the page's queue for heavy work (lib/calm), after the scenes' own. A card met
    // before its turn shows the crop's symbol meanwhile.
    void calm.turn(PAINT).then(() => {
      const job = queue.shift()
      if (!job) {
        pumping = false
        return
      }
      // one specimen at a time (they share the studio), the next a frame later: a page of cards fills in without
      // one long task
      job().finally(() => requestAnimationFrame(() => setTimeout(step, 0)))
    })
  }
  requestAnimationFrame(step)
}
/** queue a drawing; whatever goes wrong in it, the queue goes on and the card falls back to its symbol */
function enqueue(draw: () => Promise<string | null>, first = false): Promise<string | null> {
  return new Promise((resolve) => {
    queue[first ? 'unshift' : 'push'](async () => {
      try {
        resolve(await draw())
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[specimen] a drawing failed:', e)
        resolve(null)
      }
    })
    pump()
  })
}

export const specimenKey = (c: SpecimenCrop) => c.id ?? c.name

/**
 * The specimen image of a crop (an object URL), drawn once and cached; null where WebGL is unavailable.
 * `px`: the drawing's side - a card's by default, larger for the plate that shows the plant alone.
 */
export function specimenFor(c: SpecimenCrop, px = SIZE): Promise<string | null> {
  const key = px === SIZE ? specimenKey(c) : `${specimenKey(c)}@${px}`
  const hit = cache.get(key)
  if (hit) return hit
  // (a plate's own large drawing goes first: it is what the reader is looking at)
  const p = enqueue(() => renderOne(c, px), px !== SIZE)
  cache.set(key, p)
  return p
}

/** the image of one of the page's objects (a cover sample, a piece of kit, a seedling, a Method chapter's object),
 * drawn once and cached; `px`: larger than a card's, for a plate that shows the object alone */
export function thingFor(id: ThingId, px = SIZE): Promise<string | null> {
  const key = px === SIZE ? `thing:${id}` : `thing:${id}@${px}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = enqueue(() => (id === 'spade' ? foundSpade(px) : renderBuilt(buildThing(id), px)), px !== SIZE)
  cache.set(key, p)
  return p
}

/**
 * The Farmers chapter's spade is a real one where its file can be had: a scan (lib/objects/cc0 - Poly Haven, CC0) of
 * a spade that has been left out - rust on the blade, a shaft gone grey - stood in the same clod of the field. The
 * modelled spade stays as the stand-in (no network on a first visit, an old browser).
 */
async function foundSpade(px: number): Promise<string | null> {
  try {
    const { loadProp } = await import('./objects/cc0')
    const scan = await loadProp('rusted_spade_01', { envMapIntensity: 2.4 })
    // it comes lying along y about its middle: stood on its blade, a little larger than life, sunk into the clod
    const S = 1.22
    scan.geometry.scale(S, S, S).translate(-(scan.min.x + scan.size.x / 2) * S, -scan.min.y * S + 0.1, -(scan.min.z + scan.size.z / 2) * S)
    const ground = clod(rng(5))
    for (const part of ground) part.geo.scale(0.72, 0.6, 0.72)
    const m = scan.material
    try {
      return await renderBuilt({ parts: [...ground, { geo: scan.geometry, mat: m }], lean: -0.14, spin: 0.55, tilt: 0.04 }, px)
    } finally {
      // (the drawing is kept as a picture; the scan's maps are not needed again)
      for (const t of [m.map, m.normalMap, m.aoMap]) t?.dispose()
      m.dispose()
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[specimen] the scanned spade could not be had, the modelled one stands in:', e)
    return renderBuilt(buildThing('spade'), px)
  }
}
