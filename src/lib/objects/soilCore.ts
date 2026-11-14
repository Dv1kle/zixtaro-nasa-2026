// The soil monolith: a two-metre core of this field, drawn out of its ground in a steel coring tube split open down
// the front, with a wedge cut so its horizons, stones, roots and water face the reader. Everything here is built once
// from the field's data and then only posed by the crossing's scroll progress:
//  - the horizons (lib/objects/soilProfile): colour, structure and water strength from SoilGrids sand/silt/clay,
//    organic carbon and plant-available water, baked into an atlas with a normal map; the geometry is displaced by the
//    same relief, so the cut face crumbles in the raking light;
//  - the stones: each horizon's coarse fragments (cfvo), faceted, half sunk in the faces;
//  - the roots: the pick's root system, grown to exactly its rooting depth along both cut faces - fibrous for
//    cereals, a taproot with laterals otherwise, a storage root for beet, nodules on legumes - tapering, branching,
//    with root hairs behind the tips;
//  - the water: within the roots' reach the soil darkens and its pores catch cool light as a wetting front runs down
//    (fastest down burrows and cracks), as strong as each horizon's plant-available water; beads stand on the face,
//    as many as the water within reach. Below the reach the soil is dimmer: that water is out of the plant's reach;
//  - the depth scale engraved on the tube, and the root-reach mark, lit when the roots arrive.
import * as THREE from 'three'
import type { SoilLayer } from '../soil'
import { ATLAS_H, ATLAS_W, FACE_COLS, horizonColor, makeNoise, rng, sstep, type StoneSpot } from './soilProfile'
import { calm, RANK } from '../calm'
import { profileTextures, surfaceTextures } from './soilTextures'

export const CORE_H = 2 // m - the core's height; roots are clamped to it
export const CORE_R = 0.36 // m
/** the wedge removed from the cylinder, centred on +z (toward the camera at yaw 0) */
const OPEN_DEG = 100
const A0 = rad(90 + OPEN_DEG / 2) // face A; the solid arc runs from A0 round to A1
const A1 = rad(90 - OPEN_DEG / 2 + 360) // face B
const ARC = (A1 - A0) * CORE_R
/** the steel tube: a split liner hugging the back of the core */
const TUBE_IN = CORE_R + 0.004
const TUBE_OUT = CORE_R + 0.011
const TUBE_A0 = A0 + rad(24)
const TUBE_A1 = A1 - rad(24)
export const HOLE_R = TUBE_OUT + 0.008

function rad(d: number) {
  return (d * Math.PI) / 180
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => sstep(0, 1, x)

/** the two cut faces: a direction along the face from the axis, and the face's normal into the open wedge */
const FACE = [
  { dir: new THREE.Vector3(Math.cos(A0), 0, Math.sin(A0)), n: new THREE.Vector3(Math.cos(A0 - Math.PI / 2), 0, Math.sin(A0 - Math.PI / 2)) },
  { dir: new THREE.Vector3(Math.cos(A1), 0, Math.sin(A1)), n: new THREE.Vector3(Math.cos(A1 + Math.PI / 2), 0, Math.sin(A1 + Math.PI / 2)) },
]
const onFace = (face: number, s: number, d: number, off: number, out = new THREE.Vector3()) =>
  out.copy(FACE[face].dir).multiplyScalar(s).addScaledVector(FACE[face].n, off).setY(-d)

function layersOrDefault(layers: SoilLayer[]): SoilLayer[] {
  const ok = layers.filter((l) => Number.isFinite(l.top) && Number.isFinite(l.bottom)).slice(0, 8)
  if (ok.length) return ok
  return [{ top: 0, bottom: 200, sand: 40, silt: 40, clay: 20, soc: 8, ph: 6.5, bd: 1.4, cfvo: 3, fc: 0.3, wp: 0.15, paw: 0.15 }]
}

// ---------- the core's geometry, mapped into the atlas ----------

/** the atlas column → where it sits on the core */
function atlasColumn(i: number): { x: number; z: number; s: number; region: 0 | 1 | 2; width: number } {
  if (i < 2 * FACE_COLS) {
    const face = i < FACE_COLS ? 0 : 1
    const s = (((i % FACE_COLS) + 0.5) / FACE_COLS) * CORE_R
    const p = onFace(face, s, 0, 0)
    return { x: p.x, z: p.z, s, region: face, width: CORE_R }
  }
  const f = (i - 2 * FACE_COLS + 0.5) / (ATLAS_W - 2 * FACE_COLS)
  const a = A0 + (A1 - A0) * f
  return { x: CORE_R * Math.cos(a), z: CORE_R * Math.sin(a), s: f * ARC, region: 2, width: ARC }
}
const uFace = (face: number, s: number) => (face * FACE_COLS + clamp01(s / CORE_R) * (FACE_COLS - 1) + 0.5) / ATLAS_W
const uSkin = (f: number) => (2 * FACE_COLS + clamp01(f) * (ATLAS_W - 2 * FACE_COLS - 1) + 0.5) / ATLAS_W
const vDepth = (d: number) => 1 - clamp01(d / CORE_H) * (1 - 1 / ATLAS_H) - 0.5 / ATLAS_H

/** the core minus its wedge: displaced skin, two displaced cut faces and the bottom, all mapped into the atlas */
function coreGeometry(heightAt: (u: number, v: number) => number): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  /** a (cols+1)×(rows+1) grid; `flip` reverses the winding so the face looks along its normal */
  const grid = (cols: number, rows: number, flip: boolean, at: (i: number, j: number) => void) => {
    const base = pos.length / 3
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) at(i, j)
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const a = base + i * (rows + 1) + j
        const b = a + rows + 1
        if (flip) idx.push(a, b, a + 1, b, b + 1, a + 1)
        else idx.push(a, a + 1, b, b, a + 1, b + 1)
      }
  }
  const NY = 200
  // the skin: the tube smeared it smooth; a few millimetres of relief, none at the edges where it meets the faces
  const NA = 120
  grid(NA, NY, true, (i, j) => {
    const f = i / NA
    const a = A0 + (A1 - A0) * f
    const d = (CORE_H * j) / NY
    const u = uSkin(f)
    const v = vDepth(d)
    const edge = Math.min(sstep(0, 0.02, f), sstep(0, 0.02, 1 - f), sstep(0, 0.01, d), sstep(0, 0.01, CORE_H - d))
    const r = CORE_R + heightAt(u, v) * 1.0 * edge
    pos.push(r * Math.cos(a), -d, r * Math.sin(a))
    nor.push(Math.cos(a), 0, Math.sin(a))
    uv.push(u, v)
  })
  // the cut faces: the prepared face's crumble in the geometry itself
  const NR = 52
  for (const face of [0, 1]) {
    grid(NR, NY, face === 0, (i, j) => {
      const s = (CORE_R * i) / NR + (i === NR ? 0.0008 : 0)
      const d = (CORE_H * j) / NY
      const u = uFace(face, s)
      const v = vDepth(d)
      const edge = Math.min(sstep(0, 0.012, s), sstep(0, 0.012, CORE_R - s), sstep(0, 0.01, d), sstep(0, 0.01, CORE_H - d))
      const p = onFace(face, s, d, heightAt(u, v) * 0.9 * edge)
      pos.push(p.x, p.y, p.z)
      nor.push(FACE[face].n.x, 0, FACE[face].n.z)
      uv.push(u, v)
    })
  }
  // the bottom
  const bBase = pos.length / 3
  pos.push(0, -CORE_H, 0)
  nor.push(0, -1, 0)
  uv.push(uFace(0, 0.01), vDepth(CORE_H))
  for (let i = 0; i <= 48; i++) {
    const a = A0 + ((A1 - A0) * i) / 48
    pos.push(CORE_R * Math.cos(a), -CORE_H, CORE_R * Math.sin(a))
    nor.push(0, -1, 0)
    uv.push(uSkin(i / 48), vDepth(CORE_H))
  }
  for (let i = 0; i < 48; i++) idx.push(bBase, bBase + 1 + i, bBase + 2 + i)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** the core's top: the field's surface, crumbly, lifted a little toward the plant's crown */
function topGeometry(seed: number): THREE.BufferGeometry {
  const { fbm } = makeNoise(seed + 11)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const NRr = 18
  const NAa = 96
  for (let i = 0; i <= NRr; i++) {
    const r = (CORE_R * i) / NRr
    for (let k = 0; k <= NAa; k++) {
      const a = A0 + ((A1 - A0) * k) / NAa
      const x = r * Math.cos(a)
      const z = r * Math.sin(a)
      const edge = sstep(CORE_R, CORE_R * 0.82, r)
      const y = edge * ((fbm(x * 18 + 3, z * 18, 3) - 0.5) * 0.022 + 0.008 * Math.exp(-(r * r) / 0.004))
      pos.push(x, y, z)
      uv.push(x / 0.5, z / 0.5)
    }
  }
  for (let i = 0; i < NRr; i++)
    for (let k = 0; k < NAa; k++) {
      const a = i * (NAa + 1) + k
      const b = a + NAa + 1
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** a stone or a clod: an icosphere with its vertices pushed about (facets catch the light) */
export function stoneGeometry(seed: number, detail = 1, flat = 0.8): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const r = rng(seed)
  const p = g.attributes.position as THREE.BufferAttribute
  // non-indexed: move every copy of a vertex the same way (keyed by position)
  const moved = new Map<string, number>()
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    let k = moved.get(key)
    if (k === undefined) {
      k = 0.72 + 0.4 * r()
      moved.set(key, k)
    }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * flat, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

/** a straw stalk: an open cylinder of unit radius and height, cut on a slant at the top */
export function stalkGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)
  g.translate(0, 0.5, 0)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.5) p.setY(i, 1 + p.getX(i) * 0.05)
  g.computeVertexNormals()
  return g
}

// ---------- roots ----------

type RootPath = { pts: THREE.Vector3[]; r0: number; r1: number; t0: number; t1: number; len: number; order: number; radAt?: (d: number) => number }
type RootKind = 'fibrous' | 'dense' | 'tap' | 'legume' | 'storage'

export function rootKind(crop: { name: string; family: string }): RootKind {
  const n = crop.name.toLowerCase()
  if (crop.family === 'poaceae') return /maize|corn|sorghum|millet|sugar ?cane/.test(n) ? 'dense' : 'fibrous'
  if (crop.family === 'mixed' || crop.family === 'none') return 'fibrous'
  if (crop.family === 'fabaceae') return /clover|ley/.test(n) ? 'fibrous' : 'legume'
  if (crop.family === 'amaranthaceae') return 'storage'
  return 'tap'
}

function pathLength(pts: THREE.Vector3[]) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += pts[i].distanceTo(pts[i - 1])
  return s
}

const faceS = (face: number, q: THREE.Vector3) => q.x * FACE[face].dir.x + q.z * FACE[face].dir.z

/**
 * march a root across a cut face: (s, d) in the face's plane, θ from straight down (positive toward the rim); it bends
 * back down (gravitropism), wanders, keeps inside the face and stops at `stop` depth. It lies on the face, half sunk,
 * and now and then loops a few millimetres free of it (a root picked out of a prepared face).
 */
function march(face: number, s: number, d: number, theta: number, length: number, o: { grav: number; wob: number; stop: number; step: number; lift: number }, rnd: () => number) {
  const pts: THREE.Vector3[] = []
  let walked = 0
  let loop = 0
  let loopV = 0
  for (;;) {
    pts.push(onFace(face, s, d, o.lift + loop))
    if (walked >= length || d >= o.stop) break
    theta += (rnd() - 0.5) * o.wob - theta * o.grav
    const step = Math.min(o.step, length - walked)
    s += Math.sin(theta) * step
    d += Math.cos(theta) * step
    if (s < 0.004) {
      s = 0.004
      theta = Math.abs(theta)
    }
    if (s > CORE_R - 0.012) {
      s = CORE_R - 0.012
      theta = -Math.abs(theta)
    }
    if (d < 0.004) d = 0.004
    if (d > o.stop) d = o.stop
    loopV += (rnd() - 0.52) * 0.0009 - loop * 0.08
    loop = Math.max(0, Math.min(0.006, loop + loopV))
    walked += step
  }
  return pts
}

function rootSystem(kind: RootKind, depth: number, rnd: () => number) {
  const paths: RootPath[] = []
  const nodules: { p: THREE.Vector3; r: number; t: number }[] = []
  const add = (pts: THREE.Vector3[], r0: number, r1: number, t0: number, order: number) => {
    const len = pathLength(pts)
    const path: RootPath = { pts, r0, r1, t0, t1: t0 + len, len, order }
    if (pts.length > 1) paths.push(path)
    return path
  }
  const tAt = (path: RootPath, i: number) => path.t0 + pathLength(path.pts.slice(0, i + 1))
  const lift = (r: number) => r * 0.7 + 0.0012
  /** laterals along a parent on a face: spacing widening with depth, alternating sides, shorter deeper down */
  const laterals = (face: number, parent: RootPath, o: { every: number; len: number; r0: number; order: number }) => {
    let next = 0.02 + rnd() * 0.02
    let side = rnd() < 0.5 ? 1 : -1
    let walked = 0
    for (let i = 1; i < parent.pts.length - 2; i++) {
      walked += parent.pts[i].distanceTo(parent.pts[i - 1])
      if (walked < next) continue
      const q = parent.pts[i]
      const d = -q.y
      next = walked + o.every * (0.6 + 0.8 * rnd()) * (1 + 1.2 * (d / depth))
      side = -side
      const s = faceS(face, q)
      const prev = parent.pts[i - 1]
      const pth = Math.atan2(s - faceS(face, prev), d + prev.y)
      const theta = pth + side * rad(50 + 30 * rnd())
      const len = o.len * (0.4 + 0.9 * rnd()) * (1 - 0.65 * (d / depth))
      if (len < 0.008) continue
      const lat = add(march(face, s, d, theta, len, { grav: 0.035, wob: 0.22, stop: depth, step: 0.006, lift: lift(o.r0) }, rnd), o.r0, o.r0 * 0.35, tAt(parent, i), o.order)
      if (o.order === 2 && lat.len > 0.035) {
        const m = 1 + Math.floor(rnd() * 3)
        for (let k = 0; k < m; k++) {
          const at = Math.min(lat.pts.length - 2, 1 + Math.floor(rnd() * (lat.pts.length - 2)))
          const q2 = lat.pts[at]
          add(march(face, faceS(face, q2), -q2.y, (rnd() - 0.5) * 2.4, 0.006 + 0.016 * rnd(), { grav: 0.05, wob: 0.4, stop: depth, step: 0.004, lift: lift(0.0005) }, rnd), 0.0005, 0.0003, tAt(lat, at), 3)
        }
      }
      if (kind === 'legume' && d < 0.35 && rnd() < 0.7) {
        const nn = 1 + Math.floor(rnd() * 3)
        for (let k = 0; k < nn; k++) {
          const at = Math.min(lat.pts.length - 1, Math.floor(rnd() * lat.pts.length))
          nodules.push({ p: lat.pts[at].clone().addScaledVector(FACE[face].n, 0.0012), r: 0.0016 + 0.0016 * rnd(), t: tAt(lat, at) })
        }
      }
    }
  }
  let arrive = 0
  if (kind === 'fibrous' || kind === 'dense') {
    // seminal and nodal roots from the crown, fanning out over both faces; a few go all the way down
    const nm = kind === 'dense' ? 9 : 12
    const r0 = kind === 'dense' ? 0.0021 : 0.0015
    for (const face of [0, 1]) {
      for (let i = 0; i < nm; i++) {
        const theta = rad(6 + 70 * ((i + 0.5 * rnd()) / nm) ** 1.2)
        const deep = i % 3 === 0 || i === 1
        const target = deep ? depth * (0.93 + 0.07 * rnd()) : depth * (0.3 + 0.55 * rnd())
        const pts = march(face, 0.004 + 0.012 * rnd(), 0.006 + 0.025 * rnd(), theta, target * 1.8, { grav: 0.022, wob: 0.07, stop: target, step: 0.008, lift: lift(r0) }, rnd)
        const main = add(pts, r0, r0 * 0.4, 0, 1)
        if (-pts[pts.length - 1].y >= depth - 0.01) arrive = Math.max(arrive, main.t1)
        laterals(face, main, { every: 0.022, len: 0.075, r0: 0.0008, order: 2 })
      }
    }
    // the system reaches exactly its depth: if no main got there, one more does
    if (!arrive) {
      const pts = march(0, 0.03, 0.02, rad(8), depth * 1.8, { grav: 0.03, wob: 0.05, stop: depth, step: 0.008, lift: lift(r0) }, rnd)
      arrive = add(pts, r0, r0 * 0.4, 0, 1).t1
    }
  } else {
    // a taproot down the corner where the faces meet, laterals spreading over both faces
    const r0 = kind === 'storage' ? 0.042 : kind === 'legume' ? 0.0045 : 0.0065
    const radAt = (d: number) => (kind === 'storage' ? 0.042 * Math.exp(-d / 0.11) + 0.004 * (1 - d / depth) + 0.001 : r0 * (1 - 0.85 * (d / depth)) + 0.0009)
    const pts: THREE.Vector3[] = []
    let x = 0
    let z = 0
    for (let d = 0.004; d < depth; d += 0.006) {
      x += (rnd() - 0.5) * 0.0016 - x * 0.05
      z += (rnd() - 0.5) * 0.0016 - z * 0.05
      // in front of the corner, fully in the open: pushed into the wedge by its own radius
      pts.push(new THREE.Vector3(x, -d, z + radAt(d) * 1.05 + 0.001))
    }
    pts.push(new THREE.Vector3(x, -depth, z + radAt(depth) + 0.001))
    const tap = add(pts, r0, 0.0009, 0, 1)
    tap.radAt = radAt
    arrive = tap.t1
    for (const face of [0, 1]) {
      const n = 7 + Math.floor(rnd() * 4)
      for (let i = 0; i < n; i++) {
        const d = depth * (0.03 + 0.62 * Math.pow((i + rnd()) / n, 1.35))
        const len = depth * (0.08 + 0.16 * rnd()) * (1 - 0.5 * (d / depth)) + 0.04
        const theta = rad(48 + 34 * rnd())
        const lat = add(march(face, 0.01 + radAt(d), d, theta, len, { grav: 0.03, wob: 0.16, stop: depth, step: 0.006, lift: lift(0.0016) }, rnd), 0.0016, 0.0006, d, 2)
        laterals(face, lat, { every: 0.018, len: 0.04, r0: 0.0006, order: 3 })
        if (kind === 'legume' && d < 0.35) {
          for (let k = 0; k < 4; k++) {
            const at = Math.floor(rnd() * lat.pts.length)
            nodules.push({ p: lat.pts[at].clone().addScaledVector(FACE[face].n, 0.0014), r: 0.0018 + 0.0018 * rnd(), t: tAt(lat, at) })
          }
        }
      }
    }
  }
  // the growth clock: every tip grows at one speed; the last tip arrives at 1
  const tMax = Math.max(...paths.map((p) => p.t1), 1e-6)
  for (const p of paths) {
    p.t0 /= tMax
    p.t1 /= tMax
  }
  for (const n of nodules) n.t /= tMax
  return { paths, nodules, arrive: arrive / tMax }
}

const C_YOUNG = new THREE.Color('#efe6d2')
const C_OLD = new THREE.Color('#b0946c')
const C_NODULE = new THREE.Color('#b9876f')

/** one indexed geometry for every root and nodule: tubes carrying their centreline and growth time per vertex */
function rootGeometry(paths: RootPath[], nodules: { p: THREE.Vector3; r: number; t: number }[]) {
  const pos: number[] = []
  const nor: number[] = []
  const cen: number[] = []
  const tt: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const tangent = new THREE.Vector3()
  const N = new THREE.Vector3()
  const B = new THREE.Vector3()
  const c = new THREE.Color()
  for (const path of paths) {
    const { pts } = path
    const radial = path.order === 1 ? (path.radAt ? 12 : 6) : path.order === 2 ? 5 : 3
    const base = pos.length / 3
    let walked = 0
    N.set(1, 0, 0)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      if (i > 0) walked += p.distanceTo(pts[i - 1])
      const s = path.len ? walked / path.len : 0
      const t = path.t0 + (path.t1 - path.t0) * s
      const r = path.radAt ? path.radAt(-p.y) : path.r0 + (path.r1 - path.r0) * Math.pow(s, 0.8)
      if (i < pts.length - 1) tangent.subVectors(pts[i + 1], p).normalize()
      else tangent.subVectors(p, pts[i - 1]).normalize()
      N.addScaledVector(tangent, -N.dot(tangent))
      if (N.lengthSq() < 1e-6) N.set(0, 0, 1).cross(tangent)
      N.normalize()
      B.crossVectors(tangent, N).normalize()
      // older parts (nearer the crown) are browner; the young parts toward the tips stay pale
      c.copy(C_OLD).lerp(C_YOUNG, sstep(0.15, 0.8, s) * 0.85 + (path.order === 3 ? 0.15 : 0))
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2
        const ox = N.x * Math.cos(a) + B.x * Math.sin(a)
        const oy = N.y * Math.cos(a) + B.y * Math.sin(a)
        const oz = N.z * Math.cos(a) + B.z * Math.sin(a)
        pos.push(p.x + ox * r, p.y + oy * r, p.z + oz * r)
        nor.push(ox, oy, oz)
        cen.push(p.x, p.y, p.z)
        tt.push(t)
        col.push(c.r, c.g, c.b)
      }
      if (i > 0) {
        const a0 = base + (i - 1) * radial
        const a1 = base + i * radial
        for (let k = 0; k < radial; k++) {
          const k1 = (k + 1) % radial
          idx.push(a0 + k, a0 + k1, a1 + k, a1 + k, a0 + k1, a1 + k1)
        }
      }
    }
  }
  // nodules: little spheres, collapsed onto their centre until the root reaches them
  const sph = new THREE.IcosahedronGeometry(1, 1)
  const sp = sph.attributes.position as THREE.BufferAttribute
  for (const n of nodules) {
    const base = pos.length / 3
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i)
      const y = sp.getY(i)
      const z = sp.getZ(i)
      pos.push(n.p.x + x * n.r, n.p.y + y * n.r * 0.85, n.p.z + z * n.r)
      nor.push(x, y, z)
      cen.push(n.p.x, n.p.y, n.p.z)
      tt.push(n.t)
      col.push(C_NODULE.r, C_NODULE.g, C_NODULE.b)
      idx.push(base + i)
    }
  }
  sph.dispose()
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(cen, 3))
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1))
  g.setIndex(idx)
  return g
}

/** root hairs: short fine segments round the younger parts of the roots */
function hairGeometry(paths: RootPath[], rnd: () => number) {
  const pos: number[] = []
  const tt: number[] = []
  const v = new THREE.Vector3()
  for (const path of paths) {
    if (path.order === 1 && (path.radAt || rnd() < 0.5)) continue
    const { pts } = path
    for (let i = 1; i < pts.length; i++) {
      const s = i / (pts.length - 1)
      if (s < 0.25 || s > 0.97) continue
      const t = path.t0 + (path.t1 - path.t0) * s
      const n = path.order === 3 ? 2 : 3
      for (let k = 0; k < n; k++) {
        v.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.0012 + 0.0022 * rnd())
        const p = pts[i]
        pos.push(p.x, p.y, p.z, p.x + v.x, p.y + v.y, p.z + v.z)
        tt.push(t, t)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1))
  return g
}

// ---------- the plant on top ----------

/** a leaf blade as a ribbon along a curve: folded at the midrib, tapering, paler toward the tip */
function ribbon(out: { pos: number[]; col: number[]; idx: number[] }, pts: THREE.Vector3[], width: (s: number) => number, side: THREE.Vector3, up: THREE.Vector3, fold: number, c0: THREE.Color, c1: THREE.Color) {
  const base = out.pos.length / 3
  const n = pts.length
  const c = new THREE.Color()
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1)
    const w = width(s)
    const p = pts[i]
    c.copy(c0).lerp(c1, sstep(0.55, 1, s))
    for (const k of [-1, 0, 1]) {
      const lift = k === 0 ? 0 : -fold * w
      const m = k === 0 ? 1.08 : 1
      out.pos.push(p.x + side.x * w * k + up.x * lift, p.y + side.y * w * k + up.y * lift, p.z + side.z * w * k + up.z * lift)
      out.col.push(c.r * m, c.g * m, c.b * m)
    }
    if (i > 0) {
      const a = base + (i - 1) * 3
      const b = base + i * 3
      out.idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2)
    }
  }
}

function plantGeometry(kind: RootKind, cropColor: THREE.Color, rnd: () => number): THREE.BufferGeometry {
  const out = { pos: [] as number[], col: [] as number[], idx: [] as number[] }
  // a muted, autumn-young green, leaning toward the crop's own colour
  const green = new THREE.Color('#5d7843').lerp(cropColor, 0.1)
  const tip = green.clone().lerp(new THREE.Color('#a9a476'), 0.45)
  const up = new THREE.Vector3(0, 1, 0)
  const grass = kind === 'fibrous' || kind === 'dense'
  const nLeaves = kind === 'dense' ? 6 : grass ? 16 : kind === 'legume' ? 10 : 8
  for (let i = 0; i < nLeaves; i++) {
    const az = (i / nLeaves) * Math.PI * 2 + rnd() * 0.7
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az))
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const pts: THREE.Vector3[] = []
    const base = new THREE.Vector3(dir.x * 0.004, 0.002, dir.z * 0.004)
    if (grass) {
      // a tiller's leaf: up from the crown, arching over, the tip drooping
      const len = (kind === 'dense' ? 0.2 : 0.13) * (0.65 + 0.6 * rnd())
      const lean = rad(10 + 38 * rnd())
      const droop = 1.2 + 1.8 * rnd()
      let a = lean
      const p = base.clone()
      for (let k = 0; k <= 12; k++) {
        pts.push(p.clone())
        a += (droop * (k / 12)) / 12
        p.addScaledVector(dir, Math.sin(a) * (len / 12)).addScaledVector(up, Math.cos(a) * (len / 12))
      }
      const w0 = kind === 'dense' ? 0.012 : 0.0045
      const hue = green.clone().multiplyScalar(0.8 + 0.35 * rnd())
      ribbon(out, pts, (s) => w0 * (0.55 + 0.45 * Math.sin(Math.min(1, s * 1.15) * Math.PI * 0.95)) * (1 - s * 0.85), side, up, 0.35, hue, tip)
    } else {
      // a rosette leaf: a short petiole, then a broad spoon of a blade lying out over the soil
      const len = (kind === 'legume' ? 0.05 : 0.11) * (0.7 + 0.5 * rnd())
      const rise = rad(35 + 25 * rnd())
      const p = base.clone()
      for (let k = 0; k <= 10; k++) {
        pts.push(p.clone())
        const a = rise + (k / 10) * rad(35)
        p.addScaledVector(dir, Math.sin(a) * (len / 10)).addScaledVector(up, Math.cos(a) * (len / 10) + (kind === 'legume' ? 0.004 : 0))
      }
      const w0 = kind === 'legume' ? 0.012 : kind === 'storage' ? 0.03 : 0.026
      const hue = green.clone().lerp(new THREE.Color('#6c7b66'), kind === 'tap' ? 0.5 : 0.2).multiplyScalar(0.85 + 0.25 * rnd())
      ribbon(out, pts, (s) => (s < 0.3 ? 0.06 + s * 0.4 : Math.sin(((s - 0.3) / 0.7) * Math.PI) * 0.96 + 0.04) * w0, side, up, -0.25, hue, hue.clone().multiplyScalar(1.12))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3))
  g.setIndex(out.idx)
  g.computeVertexNormals()
  return g
}

// ---------- the steel tube and its engraved scale ----------

function tubeGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const NA = 64
  const top = 0.018
  const bot = -CORE_H - 0.01
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, c, b, d)
  // outer and inner walls (u runs round the tube, v up it)
  for (const [r, outer] of [
    [TUBE_OUT, true],
    [TUBE_IN, false],
  ] as const) {
    const base = pos.length / 3
    for (let i = 0; i <= NA; i++) {
      const f = i / NA
      const a = TUBE_A0 + (TUBE_A1 - TUBE_A0) * f
      for (const y of [top, bot]) {
        pos.push(r * Math.cos(a), y, r * Math.sin(a))
        uv.push(f, (y - bot) / (top - bot))
      }
    }
    for (let i = 0; i < NA; i++) {
      const a = base + i * 2
      if (outer) quad(a, a + 2, a + 1, a + 3)
      else quad(a, a + 1, a + 2, a + 3)
    }
  }
  // the rim at the top and bottom, and the two split edges
  const ring = (y: number, up: boolean) => {
    const base = pos.length / 3
    for (let i = 0; i <= NA; i++) {
      const a = TUBE_A0 + ((TUBE_A1 - TUBE_A0) * i) / NA
      pos.push(TUBE_IN * Math.cos(a), y, TUBE_IN * Math.sin(a), TUBE_OUT * Math.cos(a), y, TUBE_OUT * Math.sin(a))
      uv.push(i / NA, 0.999, i / NA, 0.999)
    }
    for (let i = 0; i < NA; i++) {
      const a = base + i * 2
      if (up) quad(a, a + 2, a + 1, a + 3)
      else quad(a, a + 1, a + 2, a + 3)
    }
  }
  ring(top, true)
  ring(bot, false)
  for (const [a, start] of [
    [TUBE_A0, true],
    [TUBE_A1, false],
  ] as const) {
    const base = pos.length / 3
    for (const r of [TUBE_IN, TUBE_OUT])
      for (const y of [top, bot]) {
        pos.push(r * Math.cos(a), y, r * Math.sin(a))
        uv.push(0.001, 0.5)
      }
    if (start) quad(base, base + 2, base + 1, base + 3)
    else quad(base, base + 1, base + 2, base + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const MONO = '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace'

/** brushed steel with a centimetre scale engraved down the leading edge: colour and roughness canvases */
function tubeTextures(rnd: () => number) {
  const W = 1024
  const H = 2048
  const len = CORE_H + 0.028
  const pxM = H / len // px per metre down the tube
  const pxA = W / ((TUBE_A1 - TUBE_A0) * TUBE_OUT) // px per metre round the tube
  const col = document.createElement('canvas')
  col.width = W
  col.height = H
  const rough = document.createElement('canvas')
  rough.width = W
  rough.height = H
  const c = col.getContext('2d')!
  const r = rough.getContext('2d')!
  c.fillStyle = '#b4b7bb'
  c.fillRect(0, 0, W, H)
  r.fillStyle = '#5c5c5c'
  r.fillRect(0, 0, W, H)
  // the brushing: long vertical strokes
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * W
    const w = 0.5 + rnd() * 2
    const y = rnd() * H
    const h = 200 + rnd() * 1800
    const dark = rnd() < 0.5
    c.fillStyle = dark ? `rgba(80,84,90,${0.04 + 0.08 * rnd()})` : `rgba(235,238,242,${0.04 + 0.07 * rnd()})`
    c.fillRect(x, y - h / 2, w, h)
    r.fillStyle = dark ? `rgba(130,130,130,${0.1 + 0.15 * rnd()})` : `rgba(40,40,40,${0.1 + 0.15 * rnd()})`
    r.fillRect(x, y - h / 2, w, h)
  }
  // the scale: every centimetre a tick, every five and ten longer, numbers every twenty
  const yOf = (d: number) => (0.018 + d) * pxM // canvas y runs down the tube (the texture is flipped)
  const x0 = 0.01 * pxA
  for (let cm = 0; cm <= 200; cm++) {
    const y = yOf(cm / 100)
    const major = cm % 10 === 0
    const mid = cm % 5 === 0
    const l = (major ? 0.03 : mid ? 0.019 : 0.011) * pxA
    const t = major ? 3 : 2
    c.fillStyle = 'rgba(20,22,25,0.95)'
    c.fillRect(x0, y - t / 2, l, t)
    c.fillStyle = 'rgba(255,255,255,0.4)'
    c.fillRect(x0, y + t / 2, l, 1)
    r.fillStyle = '#e8e8e8'
    r.fillRect(x0, y - t / 2, l, t + 1)
  }
  // numbers: the canvas is stretched round the tube, so the type is drawn squeezed to come out true
  const sx = pxA / pxM
  const text = (s: string, y: number, size: number, alpha: number) => {
    for (const [ctx, fill] of [
      [c, `rgba(20,22,25,${alpha})`],
      [r, '#e8e8e8'],
    ] as const) {
      ctx.save()
      ctx.translate(x0 + 0.036 * pxA, y)
      ctx.scale(sx, 1)
      ctx.font = `500 ${Math.round(size * pxM)}px ${MONO}`
      ctx.textBaseline = 'middle'
      ctx.fillStyle = fill
      ctx.fillText(s, 0, 0)
      ctx.restore()
    }
  }
  for (let cm = 0; cm <= 200; cm += 20) text(String(cm), yOf(cm / 100), 0.019, 0.95)
  text('CM', yOf(0.1), 0.012, 0.8)
  const map = new THREE.CanvasTexture(col)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const roughness = new THREE.CanvasTexture(rough)
  roughness.anisotropy = 8
  return { map, roughness }
}

/** the root-reach label: mono caps over a hairline leader, drawn once */
function labelTexture(text: string, sub: string) {
  const cv = document.createElement('canvas')
  cv.width = 1024
  cv.height = 160
  const c = cv.getContext('2d')!
  c.font = `500 44px ${MONO}`
  c.fillStyle = 'rgba(236,232,224,0.96)'
  ;(c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '5px'
  c.fillText(text, 8, 66)
  c.font = `400 30px ${MONO}`
  c.fillStyle = 'rgba(236,232,224,0.62)'
  c.fillText(sub, 8, 128)
  // the leader: under the text, out to the right edge where the core is
  c.fillStyle = 'rgba(214,163,92,0.95)'
  c.fillRect(8, 86, 1016, 3)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

// ---------- the timeline ----------

export type CorePose = {
  /** 0 buried (its top flush with the field) … 1 standing on the field */
  rise: number
  grow: number
  front: number
  mark: number
  yaw: number
}

/** the crossing's timeline. `still` (reduced motion) = one frame with everything in place */
export function corePose(p: number, reach: number, arrive: number, still: boolean): CorePose {
  const k = clamp01((p - 0.04) / 0.3)
  const rise = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
  const grow = still ? 1.06 : smooth((p - 0.2) / 0.48) * 1.06
  const front = still ? reach : reach * smooth((p - 0.34) / 0.36)
  const mark = still ? 1 : smooth((grow - (arrive - 0.03)) / 0.08)
  const yaw = rad(-50 + 70 * smooth((p + 0.05) / 1.05))
  return { rise, grow, front, mark, yaw }
}

type Key = { p: number; pos: [number, number, number]; look: [number, number, number]; bokeh: number }

/**
 * The camera: from just over the stubble, looking at the tube's rim in the field, it rises with the core to take it
 * whole, then pushes in along the cut face and follows the roots down to their reach. Keys are joined by a
 * Catmull-Rom spline (no stops, no straight lines at constant speed).
 */
export function cameraPose(p: number, reach: number, aspect: number) {
  const deep = CORE_H - reach // the reach mark's height once the core stands
  const keys: Key[] = [
    { p: 0.0, pos: [-0.75, 0.34, 3.1], look: [0.0, 0.05, 0], bokeh: 1.2 },
    { p: 0.13, pos: [-1.0, 0.72, 3.7], look: [0, 0.5, 0], bokeh: 1.1 },
    { p: 0.3, pos: [-1.55, 1.95, 5.6], look: [0, 1.05, 0], bokeh: 0.9 },
    { p: 0.46, pos: [-1.05, 2.15, 4.9], look: [0, 1.02, 0], bokeh: 1.0 },
    { p: 0.62, pos: [-0.5, 1.7, 3.4], look: [0, 0.95, 0], bokeh: 1.5 },
    { p: 0.8, pos: [-0.22, deep + 0.75, 2.55], look: [0, deep + 0.32, 0], bokeh: 1.8 },
    { p: 1.0, pos: [-0.06, deep + 0.2, 2.25], look: [0, deep - 0.04, 0], bokeh: 2.0 },
  ]
  let i = 0
  while (i < keys.length - 2 && p > keys[i + 1].p) i++
  const k0 = keys[Math.max(0, i - 1)]
  const k1 = keys[i]
  const k2 = keys[i + 1]
  const k3 = keys[Math.min(keys.length - 1, i + 2)]
  const t = clamp01((p - k1.p) / (k2.p - k1.p))
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)
  const v = (f: (k: Key) => number) => cr(f(k0), f(k1), f(k2), f(k3))
  const pos = new THREE.Vector3(v((k) => k.pos[0]), v((k) => k.pos[1]), v((k) => k.pos[2]))
  const look = new THREE.Vector3(v((k) => k.look[0]), v((k) => k.look[1]), v((k) => k.look[2]))
  // a tall phone frame has the sentence above it: the core stands in the middle, the camera further back
  if (aspect < 1) {
    const f = 1 + 0.95 * (1 - aspect)
    pos.sub(look).multiplyScalar(f).add(look)
  }
  return { pos, look, bokeh: v((k) => k.bokeh) }
}

// ---------- the object ----------

export type SoilCoreInput = {
  layers: SoilLayer[]
  rootDepthM: number
  crop: { name: string; color: string; family: string }
  pawMm: number
}

export type SoilCoreObject = {
  group: THREE.Group
  /** the root reach, m */
  reach: number
  /** pose everything for this scroll progress (0…1) and clock (seconds, frozen under reduced motion) */
  update: (p: number, time: number, camera: THREE.Camera, still: boolean) => CorePose
  stats: { triangles: number; drawCalls: number }
  dispose: () => void
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpS = new THREE.Vector3()
const tmpP = new THREE.Vector3()

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0]

export async function buildSoilCore(input: SoilCoreInput, cancelled: () => boolean): Promise<SoilCoreObject | null> {
  const layers = layersOrDefault(input.layers)
  const reach = Math.min(CORE_H, Math.max(0.2, Number.isFinite(input.rootDepthM) ? input.rootDepthM : 1))
  const paw = Number.isFinite(input.pawMm) ? Math.max(0, input.pawMm) : 100
  const seedStr = `${input.crop.name}|${layers.map((l) => `${l.sand | 0}${l.clay | 0}${l.cfvo | 0}${l.soc | 0}`).join()}`
  let seed = 7
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
  const rnd = rng(seed)
  const group = new THREE.Group()
  const disposables: { dispose: () => void }[] = []
  let triangles = 0
  let drawCalls = 0
  const count = (g: THREE.BufferGeometry, instances = 1) => {
    triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * instances
    drawCalls += 1
  }
  const lift = new THREE.Group() // everything that rises with the core
  group.add(lift)

  // stones first: their spots go into the bake (each sits in a hollow with a contact shadow)
  const stoneRecs: { m: THREE.Matrix4; c: THREE.Color }[] = []
  const spots: StoneSpot[] = []
  const pale = new THREE.Color('#b9b2a4')
  const flint = new THREE.Color('#4a4846')
  const rose = new THREE.Color('#a08a7e')
  for (const l of layers) {
    const thick = Math.max(0, Math.min(CORE_H * 100, l.bottom) - l.top) / 100
    const tone = horizonColor(l)
    const n = Math.min(70, Math.round(clamp01(l.cfvo / 40) * 46 * thick * 2.4))
    for (let i = 0; i < n; i++) {
      const size = 0.006 + 0.026 * Math.pow(rnd(), 2.2)
      const d = l.top / 100 + 0.012 + rnd() * Math.max(0.001, thick - 0.024)
      const face = rnd() < 0.78 ? (rnd() < 0.5 ? 0 : 1) : -1
      if (face >= 0) {
        const s = CORE_R * (0.06 + 0.88 * rnd())
        onFace(face, s, d, -size * 0.2, tmpP)
        spots.push({ face: face as 0 | 1, s, d, size })
      } else {
        const a = A0 + (A1 - A0) * rnd()
        tmpP.set((CORE_R - size * 0.3) * Math.cos(a), -d, (CORE_R - size * 0.3) * Math.sin(a))
      }
      tmpE.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)
      tmpQ.setFromEuler(tmpE)
      tmpS.set(size * (0.8 + 0.5 * rnd()), size * (0.6 + 0.4 * rnd()), size * (0.8 + 0.5 * rnd()))
      const pick = rnd()
      const c = (pick < 0.55 ? pale : pick < 0.8 ? rose : flint).clone().lerp(new THREE.Color().setRGB(tone[0], tone[1], tone[2], THREE.SRGBColorSpace), 0.25 + 0.2 * rnd())
      stoneRecs.push({ m: new THREE.Matrix4().compose(tmpP, tmpQ, tmpS), c })
    }
  }

  // the atlas and the top's own crumb are baked in a worker; both are asked for at once
  const tone0 = horizonColor(layers[0])
  const [bake, topTex] = await Promise.all([
    profileTextures({ layers, seed, coreH: CORE_H, column: atlasColumn, stones: spots, cancelled }),
    surfaceTextures(seed, tone0, { tile: 0.5, size: 256, dryness: 1.12 }),
  ])
  // (the textures are in; what follows - the core's meshes - is a tenth of a second of the page's thread, and the
  // worker's answer came whenever it came: it is built in turns of the page's queue for heavy work (lib/calm), a part
  // at a time, in the pauses of the scrolling - and on regardless once the reader has not paused for a while)
  const PART = { rank: RANK.build, patience: 2500 }
  await calm.turn(PART)
  if (!bake || cancelled()) {
    bake?.dispose()
    topTex.map.dispose()
    topTex.normal.dispose()
    return null
  }
  disposables.push(bake)
  /** between two parts: on at once while this turn lasts, else in the next; false: the scene was taken down meanwhile */
  const onward = async () => {
    await calm.breathe(PART)
    if (!cancelled()) return true
    disposables.forEach((d) => d.dispose())
    return false
  }

  // ---- the core ----
  const uniforms = {
    uData: { value: bake.data },
    uFront: { value: 0 },
    uReach: { value: reach },
    uH: { value: CORE_H },
    uCool: { value: new THREE.Color('#7fb0b6') },
    uWetK: { value: 0.55 + 0.45 * clamp01(paw / 220) },
  }
  const coreMat = new THREE.MeshStandardMaterial({ map: bake.albedo, normalMap: bake.normal, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.9, metalness: 0, envMapIntensity: 0.6 })
  coreMat.onBeforeCompile = (sh: Shader) => {
    Object.assign(sh.uniforms, uniforms)
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uData;
uniform float uFront;
uniform float uReach;
uniform float uH;
uniform vec3 uCool;
uniform float uWetK;
float gWet;
float gPore;
float gQuartz;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec4 sd = texture2D(uData, vMapUv);
  float dep = (1.0 - vMapUv.y) * uH;
  // the wetting front runs ahead down the burrows and cracks
  float fr = uFront * (1.0 + 0.16 * sd.g);
  float behind = smoothstep(fr + 0.015, fr - 0.035, dep) * step(0.001, uFront);
  float inReach = smoothstep(uReach + 0.012, uReach - 0.012, dep);
  gWet = behind * inReach * (0.35 + 0.65 * sd.r) * uWetK;
  gPore = sd.g;
  gQuartz = sd.b;
  // wet soil is darker and a touch cooler; the wetting front itself a thin darker line
  float edge = behind * smoothstep(fr - 0.05, fr - 0.005, dep) * inReach;
  diffuseColor.rgb *= mix(1.0, 0.56, gWet) * (1.0 - 0.18 * edge);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 0.97, 1.04), gWet);
  // below the reach the water is out of the plant's reach: the soil falls dimmer and greyer
  float out_ = 1.0 - inReach;
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.9, 0.95, 1.0), 0.45 * out_) * (1.0 - 0.42 * out_);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.34, gWet);
roughnessFactor = mix(roughnessFactor, 0.3, gQuartz);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
// the pores holding water catch a little cool light
totalEmissiveRadiance += uCool * gWet * gPore * 0.06;`,
      )
  }
  const coreGeo = coreGeometry(bake.heightAt)
  const core = new THREE.Mesh(coreGeo, coreMat)
  core.castShadow = true
  core.receiveShadow = true
  lift.add(core)
  count(coreGeo)
  disposables.push(coreGeo, coreMat)

  // the top: the field's own surface, crumbly, round the plant's crown
  const topMat = new THREE.MeshStandardMaterial({ map: topTex.map, normalMap: topTex.normal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, metalness: 0 })
  const topGeo = topGeometry(seed)
  const topMesh = new THREE.Mesh(topGeo, topMat)
  topMesh.castShadow = true
  topMesh.receiveShadow = true
  lift.add(topMesh)
  count(topGeo)
  disposables.push(topGeo, topMat, topTex.map, topTex.normal)

  if (!(await onward())) return null
  // ---- stones ----
  const stoneGeo = stoneGeometry(seed, 1)
  const stoneMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 })
  if (stoneRecs.length) {
    const inst = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneRecs.length)
    stoneRecs.forEach((s, i) => {
      inst.setMatrixAt(i, s.m)
      inst.setColorAt(i, s.c)
    })
    inst.castShadow = true
    inst.receiveShadow = true
    lift.add(inst)
    count(stoneGeo, stoneRecs.length)
    disposables.push(inst)
  }
  disposables.push(stoneGeo, stoneMat)

  if (!(await onward())) return null
  // ---- roots ----
  const kind = rootKind(input.crop)
  const { paths, nodules, arrive } = rootSystem(kind, reach, rnd)
  const rootGeo = rootGeometry(paths, nodules)
  const growU = { uGrow: { value: 0 } }
  const rootMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0, envMapIntensity: 0.7 })
  rootMat.onBeforeCompile = (sh: Shader) => {
    Object.assign(sh.uniforms, growU)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aCenter;
attribute float aT;
uniform float uGrow;
varying float vTip;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
// beyond the growth front the tube collapses onto its centreline, tapering over the last couple of centimetres
float g = clamp((uGrow - aT) / 0.025, 0.0, 1.0);
transformed = aCenter + (transformed - aCenter) * g;
vTip = 1.0 - clamp((uGrow - aT) / 0.06, 0.0, 1.0);`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTip;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n// a growing tip is fresh and pale, lit a little from within\ntotalEmissiveRadiance += vec3(0.9, 0.85, 0.75) * vTip * 0.12;')
  }
  const roots = new THREE.Mesh(rootGeo, rootMat)
  roots.frustumCulled = false
  roots.receiveShadow = true
  lift.add(roots)
  count(rootGeo)
  disposables.push(rootGeo, rootMat)

  const hairGeo = hairGeometry(paths, rnd)
  const hairMat = new THREE.ShaderMaterial({
    uniforms: { uGrow: growU.uGrow, uColor: { value: new THREE.Color('#e9dfca').multiplyScalar(0.55) } },
    vertexShader: /* glsl */ `
attribute float aT;
uniform float uGrow;
varying float vA;
void main() {
  vA = clamp((uGrow - aT - 0.01) / 0.04, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  if (vA <= 0.0) discard;
  gl_FragColor = vec4(uColor, 0.4 * vA);
}`,
    transparent: true,
    depthWrite: false,
  })
  const hairs = new THREE.LineSegments(hairGeo, hairMat)
  hairs.frustumCulled = false
  lift.add(hairs)
  count(hairGeo)
  disposables.push(hairGeo, hairMat)

  if (!(await onward())) return null
  // ---- the plant and the surface it stands in ----
  const cropCol = new THREE.Color(input.crop.color || '#c9b07a')
  const plantGeo = plantGeometry(kind, cropCol, rnd)
  const sway = { uTime: { value: 0 } }
  const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 })
  plantMat.onBeforeCompile = (sh: Shader) => {
    Object.assign(sh.uniforms, sway)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
float hh = max(transformed.y, 0.0) * 8.0;
transformed.x += sin(uTime * 1.1 + transformed.z * 30.0) * 0.004 * hh * hh;
transformed.z += sin(uTime * 0.83 + transformed.x * 26.0) * 0.003 * hh * hh;`,
    )
  }
  const plant = new THREE.Mesh(plantGeo, plantMat)
  plant.castShadow = true
  plant.receiveShadow = true
  plant.position.set(0, 0.006, kind === 'storage' ? 0.045 : 0.012)
  lift.add(plant)
  count(plantGeo)
  disposables.push(plantGeo, plantMat)

  // last season's stubble and its litter on the core's top
  const stalkGeo = stalkGeometry()
  const strawMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, envMapIntensity: 0.5 })
  const straw = new THREE.Color('#b8a682')
  const nSt = 9
  const nLit = 70
  const litterGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const stub = new THREE.InstancedMesh(stalkGeo, strawMat, nSt)
  const litter = new THREE.InstancedMesh(litterGeo, strawMat, nLit)
  for (let i = 0; i < nSt; i++) {
    const a = A0 + 0.25 + (A1 - A0 - 0.5) * rnd()
    const r = 0.1 + 0.2 * rnd()
    tmpP.set(r * Math.cos(a), -0.004, r * Math.sin(a))
    tmpE.set(rad((rnd() - 0.5) * 24), rnd() * 6.28, rad((rnd() - 0.5) * 24))
    tmpQ.setFromEuler(tmpE)
    tmpS.set(0.0022, 0.06 + 0.07 * rnd(), 0.0022)
    stub.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS))
    stub.setColorAt(i, straw.clone().multiplyScalar(0.75 + 0.35 * rnd()))
  }
  for (let i = 0; i < nLit; i++) {
    const a = A0 + 0.08 + (A1 - A0 - 0.16) * rnd()
    const r = CORE_R * Math.sqrt(rnd()) * 0.95
    tmpP.set(r * Math.cos(a), 0.004 + rnd() * 0.004, r * Math.sin(a))
    tmpE.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5)
    tmpQ.setFromEuler(tmpE)
    const long = rnd() < 0.5
    tmpS.set(long ? 0.004 : 0.008 + 0.01 * rnd(), 1, long ? 0.03 + 0.04 * rnd() : 0.006 + 0.01 * rnd())
    litter.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS))
    litter.setColorAt(i, straw.clone().lerp(new THREE.Color('#5a4a36'), rnd() * 0.7).multiplyScalar(0.7 + 0.3 * rnd()))
  }
  for (const m of [stub, litter]) {
    m.castShadow = true
    m.receiveShadow = true
    lift.add(m)
  }
  count(stalkGeo, nSt)
  count(litterGeo, nLit)
  disposables.push(stalkGeo, litterGeo, strawMat, stub, litter)

  if (!(await onward())) return null
  // ---- water beads on the cut faces within reach: as many as the water there ----
  const beadGeo = new THREE.IcosahedronGeometry(1, 2)
  const beadDepth: number[] = []
  const beadM: THREE.Matrix4[] = []
  const nBeads = Math.round(8 + 40 * clamp01(paw / 240))
  const pawAt = (d: number) => {
    let v = layers[0].paw
    for (const l of layers) if (d * 100 >= l.top) v = l.paw
    return clamp01((Number.isFinite(v) ? v : 0.12) / 0.24)
  }
  for (let tries = 0; beadM.length < nBeads && tries < nBeads * 20; tries++) {
    const d = 0.04 + rnd() * (reach - 0.06)
    if (rnd() > 0.25 + 0.75 * pawAt(d)) continue
    const face = rnd() < 0.62 ? 1 : 0
    const s = CORE_R * (0.08 + 0.84 * rnd())
    const r = 0.0012 + 0.0028 * Math.pow(rnd(), 1.5)
    onFace(face, s, d, r * 0.35 + 0.001, tmpP)
    tmpS.set(r, r * 0.92, r)
    tmpQ.identity()
    beadM.push(new THREE.Matrix4().compose(tmpP, tmpQ, tmpS))
    beadDepth.push(d)
  }
  // one more: the bead that runs (posed every frame)
  beadM.push(new THREE.Matrix4().makeScale(0, 0, 0))
  beadDepth.push(-1)
  beadGeo.setAttribute('aDepth', new THREE.InstancedBufferAttribute(new Float32Array(beadDepth), 1))
  const beadU = { uFront: uniforms.uFront }
  const beadMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d1416'), roughness: 0.05, metalness: 0, envMapIntensity: 2.6, emissive: new THREE.Color('#7fb0b6'), emissiveIntensity: 0.05 })
  beadMat.onBeforeCompile = (sh: Shader) => {
    Object.assign(sh.uniforms, beadU)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDepth;\nuniform float uFront;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
// a bead stands on the face once the wetting front has passed it
transformed *= aDepth < 0.0 ? 1.0 : smoothstep(aDepth - 0.002, aDepth + 0.06, uFront);`,
    )
  }
  const beads = new THREE.InstancedMesh(beadGeo, beadMat, beadM.length)
  beadM.forEach((m, i) => beads.setMatrixAt(i, m))
  beads.frustumCulled = false
  lift.add(beads)
  count(beadGeo, beadM.length)
  disposables.push(beadGeo, beadMat, beads)
  const runner = { face: 1, s: CORE_R * (0.3 + 0.35 * rnd()), d0: 0.12 + 0.2 * rnd() }

  if (!(await onward())) return null
  // ---- the steel tube with its engraved scale ----
  const tubeTex = tubeTextures(rnd)
  const tubeMat = new THREE.MeshStandardMaterial({ map: tubeTex.map, roughnessMap: tubeTex.roughness, roughness: 1, metalness: 1, envMapIntensity: 1.25 })
  const tubeGeo = tubeGeometry()
  const tube = new THREE.Mesh(tubeGeo, tubeMat)
  tube.castShadow = true
  tube.receiveShadow = true
  lift.add(tube)
  count(tubeGeo)
  disposables.push(tubeGeo, tubeMat, tubeTex.map, tubeTex.roughness)

  if (!(await onward())) return null
  // ---- the root-reach mark: a lit line round the core at the depth, and its label ----
  const markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d6a35c').multiplyScalar(2.4), transparent: true, opacity: 0, depthWrite: false })
  const markGeo = new THREE.CylinderGeometry(TUBE_OUT + 0.0015, TUBE_OUT + 0.0015, 0.0028, 96, 1, true, Math.PI / 2 - A1, A1 - A0)
  const ring = new THREE.Mesh(markGeo, markMat)
  ring.position.y = -reach
  lift.add(ring)
  const barGeo = new THREE.BoxGeometry(1, 0.0028, 0.001)
  barGeo.translate(0.5, 0, 0) // grows out from the axis
  const bars = [0, 1].map((face) => {
    const b = new THREE.Mesh(barGeo, markMat)
    b.position.copy(onFace(face, 0, reach, 0.0035))
    b.rotation.y = -Math.atan2(FACE[face].dir.z, FACE[face].dir.x)
    lift.add(b)
    return b
  })
  count(markGeo)
  count(barGeo, 2)
  await document.fonts?.load(`500 44px ${MONO}`).catch(() => undefined)
  if (cancelled()) {
    disposables.forEach((d) => d.dispose())
    return null
  }
  const labelTex = labelTexture(`ROOT REACH  ${reach.toFixed(1)} M`, `${Math.round(paw)} MM WITHIN REACH`)
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, opacity: 0, depthWrite: false })
  const labelGeo = new THREE.PlaneGeometry(0.62, 0.62 * (160 / 1024))
  labelGeo.translate(0.31, 0, 0) // anchored at its left end, where the leader meets the core
  const label = new THREE.Mesh(labelGeo, labelMat)
  label.renderOrder = 3
  group.add(label)
  count(labelGeo)
  disposables.push(markMat, markGeo, barGeo, labelTex, labelMat, labelGeo)

  const camLocal = new THREE.Vector3()
  const update = (p: number, time: number, camera: THREE.Camera, still: boolean): CorePose => {
    const pose = corePose(p, reach, arrive, still)
    group.rotation.y = pose.yaw
    lift.position.y = CORE_H * pose.rise
    growU.uGrow.value = pose.grow
    uniforms.uFront.value = pose.front
    sway.uTime.value = time
    markMat.opacity = pose.mark * 0.95
    ring.visible = pose.mark > 0.01
    for (const b of bars) {
      b.scale.x = CORE_R * Math.max(0.001, pose.mark)
      b.visible = ring.visible
    }
    // the label hangs beside the core at the reach, turned to the camera, upright, to its right as the camera sees it (the sentence is on the left)
    labelMat.opacity = pose.mark * clamp01(pose.rise * 1.2)
    label.visible = labelMat.opacity > 0.01
    if (label.visible) {
      group.updateMatrixWorld()
      camLocal.copy(camera.position)
      group.worldToLocal(camLocal)
      const ang = Math.atan2(camLocal.x, camLocal.z)
      label.position.set(Math.cos(ang) * (TUBE_OUT + 0.03), lift.position.y - reach + 0.012, -Math.sin(ang) * (TUBE_OUT + 0.03))
      label.rotation.set(0, ang, 0)
    }
    // the running bead: down the lit face from where it gathered, in little slips, then gone
    const cyc = (time / 7.5) % 1
    const showRun = !still && pose.front > runner.d0 + 0.12
    const runLen = Math.max(0.05, Math.min(0.5, reach - runner.d0 - 0.03))
    const slip = cyc * 9
    const k = (Math.floor(slip) + smooth((slip % 1) * 1.6)) / 9
    const sc = showRun ? 0.0032 * sstep(0, 0.08, cyc) * sstep(1, 0.85, cyc) : 0
    onFace(runner.face, runner.s + Math.sin(k * 9) * 0.004, runner.d0 + runLen * k, sc * 0.4 + 0.001, tmpP)
    tmpS.set(sc, sc * 1.15, sc)
    tmpQ.identity()
    beads.setMatrixAt(beadM.length - 1, tmpM.compose(tmpP, tmpQ, tmpS))
    beads.instanceMatrix.needsUpdate = true
    return pose
  }

  return {
    group,
    reach,
    update,
    stats: { triangles: Math.round(triangles), drawCalls },
    dispose: () => disposables.forEach((d) => d.dispose()),
  }
}
