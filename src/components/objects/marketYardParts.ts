// The market yard's parts (components/objects/MarketYard): the helpers every part is cut with, the tipper - built
// piece by piece, because the scene ends on it in profile - and the yard's painted surfaces.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { calm, RANK } from '../../lib/calm'
import { APRON, paintApron, paintCorrugated, rng, type Canvas } from './marketPaint'
import type { PaintAsk, PaintRequest } from './marketPaint.worker'

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
export { APRON, rng }
export const box = (w: number, h: number, d: number, x: number, y: number, z: number, rot?: THREE.Euler) => {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot))
  return g.translate(x, y, z)
}
export const rbox = (w: number, h: number, d: number, r: number, x: number, y: number, z: number, rot?: THREE.Euler) => {
  const g: THREE.BufferGeometry = new RoundedBoxGeometry(w, h, d, 3, r)
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot))
  return g.translate(x, y, z)
}
export const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 16, rot?: THREE.Euler) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg)
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot))
  return g.translate(x, y, z)
}
/** a rod between two points */
export const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6) => {
  const d = b.clone().sub(a)
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()))
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
}
export const lathe = (pts: [number, number][], seg = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)
/** one geometry from many (position, normal, uv), the pieces let go */
export const merged = (list: THREE.BufferGeometry[]) => {
  const ready = list.map((x) => {
    const n = x.index ? x.toNonIndexed() : x
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k)
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2))
    return n
  })
  const g = mergeGeometries(ready, false)!
  for (const x of list) x.dispose()
  return g
}
const Z90 = new THREE.Euler(0, 0, Math.PI / 2)
const X90 = new THREE.Euler(Math.PI / 2, 0, 0)

// ---------------------------------------------------------------------------------------------------------------------
// the tipper
// ---------------------------------------------------------------------------------------------------------------------

export type TruckMats = {
  paint: THREE.Material
  body: THREE.Material
  dark: THREE.Material
  steel: THREE.Material
  chrome: THREE.Material
  tyre: THREE.Material
  rim: THREE.Material
  glass: THREE.Material
  head: THREE.Material
  amber: THREE.Material
  red: THREE.Material
  plate: THREE.Material
  tarp: THREE.Material
}
export type Truck = {
  group: THREE.Group
  /** raise the body (0 down … 1 right up): the body turns on its tail hinge, the tailgate swings, the ram runs out */
  tip: (k: number) => void
  /** where the load leaves the body, in the group's own space: the tail's lip */
  lip: THREE.Vector3
}

/**
 * A three-axle tipper, nose toward +z, its tail hinge over the origin's z = -1. Cab with doors, glass, mirrors, a
 * grille and lamps; frame rails, tanks, steps, an exhaust stack; wheels with rims; a ribbed body with a headboard and
 * cab protector, a top-hung tailgate, a telescopic ram under its front; marker lamps all round.
 * `load`: what the body carries (null: empty). `tarp`: sheeted over, as it arrives.
 */
export function buildTruck(m: TruckMats, load: THREE.Material | null, opts: { tarp?: boolean } = {}): Truck {
  const group = new THREE.Group()
  const B: Record<keyof TruckMats, THREE.BufferGeometry[]> = { paint: [], body: [], dark: [], steel: [], chrome: [], tyre: [], rim: [], glass: [], head: [], amber: [], red: [], plate: [], tarp: [] }
  const flush = (parent: THREE.Object3D, set: Record<keyof TruckMats, THREE.BufferGeometry[]>) => {
    for (const k of Object.keys(set) as (keyof TruckMats)[]) {
      if (!set[k].length) continue
      const mesh = new THREE.Mesh(merged(set[k]), m[k])
      const lit = k === 'head' || k === 'amber' || k === 'red'
      mesh.castShadow = !lit
      mesh.receiveShadow = !lit
      parent.add(mesh)
      set[k] = []
    }
  }

  // ---- frame ----
  for (const x of [-0.43, 0.43]) B.dark.push(box(0.09, 0.26, 9.3, x, 0.93, 3.35))
  for (let z = -0.6; z < 8; z += 1.25) B.dark.push(box(0.86, 0.1, 0.1, 0, 0.9, z))
  B.dark.push(box(2.3, 0.12, 0.1, 0, 0.56, -1.12), box(0.08, 0.4, 0.08, -0.8, 0.74, -1.1), box(0.08, 0.4, 0.08, 0.8, 0.74, -1.1)) // the underrun bar
  B.red.push(box(0.26, 0.12, 0.05, -0.95, 0.98, -1.16), box(0.26, 0.12, 0.05, 0.95, 0.98, -1.16))
  B.amber.push(box(0.1, 0.12, 0.05, -0.74, 0.98, -1.16), box(0.1, 0.12, 0.05, 0.74, 0.98, -1.16))
  B.plate.push(box(0.5, 0.12, 0.02, 0, 0.74, -1.18))

  // ---- wheels: a front axle, a tandem on twins ----
  const tyre = () => lathe([[0.3, -0.15], [0.46, -0.16], [0.52, -0.115], [0.54, -0.04], [0.54, 0.04], [0.52, 0.115], [0.46, 0.16], [0.3, 0.15]], 30).rotateZ(Math.PI / 2)
  const wheel = (x: number, z: number, twin: boolean) => {
    const s = Math.sign(x)
    B.tyre.push(tyre().translate(x, 0.54, z))
    if (twin) B.tyre.push(tyre().translate(x - s * 0.35, 0.54, z))
    // the rim: a dished disc, the hub and its ring of nuts
    B.rim.push(lathe([[0.001, 0.0], [0.11, 0.0], [0.13, -0.05], [0.27, -0.06], [0.3, 0.06], [0.305, 0.14]], 24).rotateZ(-s * Math.PI / 2).translate(x + s * 0.02, 0.54, z))
    B.dark.push(cyl(0.085, 0.1, x + s * 0.06, 0.54, z, 12, Z90))
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      B.chrome.push(cyl(0.014, 0.03, x + s * 0.035, 0.54 + Math.sin(a) * 0.17, z + Math.cos(a) * 0.17, 6, Z90))
    }
  }
  for (const x of [-1.05, 1.05]) wheel(x, 7.3, false)
  for (const z of [1.65, 0.3]) for (const x of [-1.12, 1.12]) wheel(x, z, true)
  B.dark.push(cyl(0.07, 2.1, 0, 0.54, 7.3, 8, Z90), cyl(0.09, 1.9, 0, 0.54, 1.65, 8, Z90), cyl(0.09, 1.9, 0, 0.54, 0.3, 8, Z90))
  // mudguards over the tandem, flaps behind it
  for (const s of [-1, 1]) {
    B.dark.push(box(0.66, 0.04, 3.0, s * 0.98, 1.17, 0.97), box(0.66, 0.2, 0.04, s * 0.98, 1.08, 2.47), box(0.66, 0.2, 0.04, s * 0.98, 1.08, -0.53))
    B.dark.push(box(0.6, 0.5, 0.02, s * 0.98, 0.72, -0.6))
    B.plate.push(box(0.4, 0.05, 0.022, s * 0.98, 0.6, -0.612))
  }

  // ---- between the axles: tank, air reservoirs, battery box, steps, the exhaust stack ----
  B.steel.push(cyl(0.31, 1.25, 1.02, 0.86, 4.55, 20, X90))
  for (const z of [4.15, 4.95]) B.dark.push(new THREE.TorusGeometry(0.32, 0.018, 6, 20).rotateY(0).translate(1.02, 0.86, z))
  B.chrome.push(cyl(0.05, 0.05, 1.02, 1.18, 4.9, 10))
  B.dark.push(cyl(0.12, 0.7, 1.0, 0.72, 3.35, 12, X90), cyl(0.12, 0.7, 1.0, 0.98, 3.35, 12, X90))
  B.dark.push(rbox(0.5, 0.48, 0.62, 0.04, -1.02, 0.84, 4.6), rbox(0.5, 0.42, 0.55, 0.04, -1.02, 0.82, 3.6))
  for (const s of [-1, 1]) for (const y of [0.55, 0.92]) B.steel.push(box(0.3, 0.04, 0.5, s * 1.13, y, 6.35))
  B.steel.push(cyl(0.065, 2.45, 1.02, 2.5, 5.78, 10), cyl(0.085, 0.9, 1.02, 2.2, 5.78, 10))
  B.dark.push(cyl(0.1, 0.6, 1.02, 3.2, 5.78, 10), box(0.5, 0.05, 0.05, 0.8, 1.35, 5.78))

  // ---- the cab ----
  B.paint.push(rbox(2.45, 2.25, 2.25, 0.16, 0, 2.32, 7.0), rbox(2.45, 0.95, 0.75, 0.1, 0, 1.6, 8.14), box(2.5, 0.1, 2.3, 0, 3.47, 7.0))
  // wheel arches
  for (const s of [-1, 1]) B.paint.push(rbox(0.36, 0.36, 1.5, 0.1, s * 1.1, 1.2, 7.3))
  // the glass: a raked screen, the door lights, a slot in the back wall
  B.glass.push(box(2.14, 0.98, 0.06, 0, 2.84, 8.1, new THREE.Euler(-0.14, 0, 0)))
  for (const s of [-1, 1]) B.glass.push(box(0.05, 0.82, 1.15, s * 1.232, 2.8, 7.25), box(0.05, 0.4, 0.42, s * 1.232, 2.6, 6.28))
  // doors: their seams, handles, the step-well
  for (const s of [-1, 1]) {
    B.dark.push(box(0.012, 1.95, 0.02, s * 1.232, 2.25, 6.55), box(0.012, 1.95, 0.02, s * 1.232, 2.25, 7.92), box(0.012, 0.02, 1.37, s * 1.232, 1.28, 7.235), box(0.012, 0.02, 1.37, s * 1.232, 2.36, 7.235))
    B.chrome.push(box(0.03, 0.04, 0.16, s * 1.245, 2.2, 6.7))
    // mirrors on their arms
    B.dark.push(rod(V(s * 1.23, 3.15, 8.0), V(s * 1.62, 3.05, 8.12), 0.016), rod(V(s * 1.23, 2.3, 8.0), V(s * 1.62, 2.5, 8.12), 0.016), rbox(0.08, 0.5, 0.26, 0.03, s * 1.64, 2.78, 8.12))
    B.amber.push(box(0.03, 0.06, 0.1, s * 1.24, 1.9, 8.25))
  }
  // the visor and its row of marker lamps, horns, a beacon
  B.dark.push(box(2.36, 0.07, 0.42, 0, 3.4, 8.2, new THREE.Euler(0.3, 0, 0)))
  for (let k = -2; k <= 2; k++) B.amber.push(box(0.09, 0.045, 0.04, k * 0.46, 3.56, 8.06))
  B.chrome.push(cyl(0.035, 0.5, -0.5, 3.58, 7.3, 8, X90), cyl(0.035, 0.4, -0.38, 3.58, 7.35, 8, X90))
  B.amber.push(cyl(0.07, 0.1, 0.6, 3.58, 6.6, 12))
  // the face: grille, lamps in their rims, the bumper with its plate
  B.dark.push(box(1.5, 0.66, 0.05, 0, 1.63, 8.53))
  for (let k = 0; k < 7; k++) B.chrome.push(box(1.44, 0.028, 0.03, 0, 1.36 + k * 0.09, 8.56))
  B.chrome.push(box(1.56, 0.04, 0.04, 0, 1.98, 8.55), box(0.3, 0.1, 0.03, 0, 2.08, 8.53))
  for (const s of [-1, 1]) {
    B.chrome.push(new THREE.TorusGeometry(0.12, 0.022, 6, 18).translate(s * 0.95, 1.36, 8.53))
    B.head.push(cyl(0.105, 0.04, s * 0.95, 1.36, 8.53, 16, X90))
    B.amber.push(box(0.16, 0.08, 0.04, s * 0.95, 1.6, 8.53))
  }
  B.dark.push(rbox(2.5, 0.3, 0.22, 0.05, 0, 0.92, 8.52), box(0.5, 0.26, 0.2, -0.75, 0.6, 8.3), box(0.5, 0.26, 0.2, 0.75, 0.6, 8.3))
  B.plate.push(box(0.52, 0.13, 0.02, 0, 0.92, 8.64))
  B.head.push(box(0.16, 0.07, 0.03, -0.8, 0.92, 8.64), box(0.16, 0.07, 0.03, 0.8, 0.92, 8.64))
  // wipers
  B.dark.push(rod(V(-0.5, 2.38, 8.16), V(-0.05, 2.75, 8.11), 0.012), rod(V(0.4, 2.38, 8.16), V(0.85, 2.75, 8.11), 0.012))
  flush(group, B)

  // ---- the body: on its tail hinge ----
  const bed = new THREE.Group()
  bed.position.set(0, 1.22, -1.0)
  group.add(bed)
  const W = 2.5
  const L = 6.3
  const H = 1.5
  B.body.push(box(W, 0.1, L, 0, 0.05, L / 2), box(0.09, H, L, -W / 2, H / 2 + 0.08, L / 2), box(0.09, H, L, W / 2, H / 2 + 0.08, L / 2))
  // the headboard, taller than the sides, and the protector over the cab
  B.body.push(box(W, H + 0.45, 0.1, 0, (H + 0.45) / 2 + 0.08, L), box(W, 0.09, 1.15, 0, H + 0.5, L + 0.55), box(0.09, 0.3, 1.15, -W / 2, H + 0.34, L + 0.55), box(0.09, 0.3, 1.15, W / 2, H + 0.34, L + 0.55))
  // ribs, top and bottom rails, the bearers under the floor
  for (let z = 0.45; z < L; z += 0.62) for (const x of [-W / 2 - 0.07, W / 2 + 0.07]) B.body.push(box(0.07, H, 0.09, x, H / 2 + 0.08, z))
  for (const x of [-W / 2 - 0.05, W / 2 + 0.05]) B.body.push(box(0.16, 0.12, L + 0.1, x, H + 0.1, L / 2), box(0.12, 0.14, L, x, 0.1, L / 2))
  for (const x of [-0.5, 0.5]) B.dark.push(box(0.14, 0.2, L - 0.3, x, -0.1, L / 2))
  for (let z = 0.5; z < L; z += 0.9) B.dark.push(box(W - 0.1, 0.1, 0.09, 0, -0.06, z))
  for (let k = 0; k < 4; k++) B.amber.push(box(0.03, 0.05, 0.12, W / 2 + 0.11, 0.2, 0.8 + k * 1.55), box(0.03, 0.05, 0.12, -W / 2 - 0.11, 0.2, 0.8 + k * 1.55))
  // a ladder on the headboard's corner, the rolled sheet along one side
  for (let k = 0; k < 5; k++) B.steel.push(box(0.34, 0.025, 0.025, W / 2 + 0.12, 0.3 + k * 0.3, L - 0.3))
  B.steel.push(box(0.025, 1.5, 0.025, W / 2 + 0.12, 0.85, L - 0.47), box(0.025, 1.5, 0.025, W / 2 + 0.12, 0.85, L - 0.13))
  if (opts.tarp) B.tarp.push(rbox(W + 0.12, 0.5, L + 0.1, 0.2, 0, H + 0.24, L / 2))
  else B.tarp.push(cyl(0.11, L - 0.2, -W / 2 - 0.02, H + 0.26, L / 2, 10, X90))
  flush(bed, B)
  if (load && !opts.tarp) {
    // what is still in it: a bank against the headboard, running down toward the tail
    const heap = new THREE.BufferGeometry()
    const y0 = 0.1
    const pts = [
      [-W / 2 + 0.05, y0, 0.4], [W / 2 - 0.05, y0, 0.4], [-W / 2 + 0.05, y0, L - 0.05], [W / 2 - 0.05, y0, L - 0.05],
      [-W / 2 + 0.05, 0.5, 0.9], [W / 2 - 0.05, 0.5, 0.9], [-W / 2 + 0.05, H - 0.1, L - 0.05], [W / 2 - 0.05, H - 0.1, L - 0.05], [0, 0.85, 1.2], [0, H + 0.25, L - 0.6],
    ]
    heap.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3))
    // each face turned to look up: a face listed twice, once each way round, left a corner with no normal at all -
    // and one pixel without a normal is a NaN, which the bloom spreads over the whole frame
    const faces = [[0, 1, 5], [0, 5, 4], [4, 5, 8], [4, 8, 6], [6, 8, 9], [8, 5, 9], [9, 5, 7], [6, 9, 7]]
    const P3 = (i: number) => new THREE.Vector3(pts[i][0], pts[i][1], pts[i][2])
    heap.setIndex(faces.flatMap(([a, b, c]) => (P3(b).sub(P3(a)).cross(P3(c).sub(P3(a))).y >= 0 ? [a, b, c] : [a, c, b])))
    heap.computeVertexNormals()
    const mesh = new THREE.Mesh(heap, load)
    mesh.castShadow = true
    bed.add(mesh)
  }
  // the tailgate hangs from the top of the tail
  const gate = new THREE.Group()
  gate.position.set(0, H + 0.1, 0)
  bed.add(gate)
  B.body.push(box(W, H, 0.08, 0, -H / 2, 0), box(W + 0.1, 0.1, 0.12, 0, -0.02, 0))
  for (const x of [-0.8, 0, 0.8]) B.body.push(box(0.07, H - 0.1, 0.06, x, -H / 2, -0.07))
  B.red.push(box(0.2, 0.1, 0.03, -1.0, -H + 0.2, -0.06), box(0.2, 0.1, 0.03, 1.0, -H + 0.2, -0.06))
  B.plate.push(box(1.6, 0.06, 0.02, 0, -H + 0.08, -0.06))
  flush(gate, B)

  // ---- the ram: three stages from the frame up to the body's front ----
  const pivot = V(0, 0.98, 3.3)
  const stage = (r: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12).translate(0, 0.5, 0), mat)
    mesh.position.copy(pivot)
    mesh.castShadow = true
    group.add(mesh)
    return mesh
  }
  const stages = [stage(0.1, m.dark), stage(0.075, m.chrome), stage(0.052, m.chrome)]
  const up = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3()
  const tip = (k: number) => {
    const a = 0.72 * Math.min(1, Math.max(0, k))
    bed.rotation.x = -a
    // the gate stays hanging as the body rises, and the load pushes it out a little
    gate.rotation.x = a + 0.32 * Math.min(1, k * 2.5)
    // the body's front, where the ram bears: (0, -0.05, 4.4) in the body's own space
    dir.set(0, bed.position.y + (-0.05 * Math.cos(a) + 4.4 * Math.sin(a)), bed.position.z + (0.05 * Math.sin(a) + 4.4 * Math.cos(a))).sub(pivot)
    const len = dir.length()
    dir.normalize()
    stages.forEach((s, i) => {
      s.quaternion.setFromUnitVectors(up, dir)
      s.scale.y = i === 0 ? Math.min(len, 1.25) : i === 1 ? Math.min(len, 2.3) : len
    })
  }
  tip(0)
  return { group, tip, lip: V(0, bed.position.y + 0.12, bed.position.z + 0.05) }
}

// ---------------------------------------------------------------------------------------------------------------------
// painted surfaces
// ---------------------------------------------------------------------------------------------------------------------

// The painting itself is in marketPaint.ts; here it is asked of a worker (marketPaint.worker.ts), which hands back
// finished pictures, and wrapped as textures. Without the worker - a browser with no OffscreenCanvas, or the worker
// failed - each picture is painted on this thread in a turn of its own (lib/calm), in a pause of the scrolling.

type Pictures = Record<string, ImageBitmap>
let painter: Worker | null | undefined
let asked = 0
const answers = new Map<number, { resolve: (p: Pictures) => void; reject: (e: Error) => void }>()

function worker(): Worker | null {
  if (painter !== undefined) return painter
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('no OffscreenCanvas')
    const w = new Worker(new URL('./marketPaint.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; pictures?: Pictures; error?: string }>) => {
      const a = answers.get(e.data.id)
      answers.delete(e.data.id)
      if (e.data.pictures) a?.resolve(e.data.pictures)
      else a?.reject(new Error(e.data.error ?? 'market paint failed'))
    }
    w.onerror = () => {
      // the worker did not load or threw outside a request: everyone waiting paints here, and so does everyone after
      painter = null
      for (const a of answers.values()) a.reject(new Error('market paint worker failed'))
      answers.clear()
    }
    painter = w
  } catch {
    painter = null
  }
  return painter
}

/** the worker's pictures, or null: then the caller paints them here */
async function paintOff<T extends Pictures>(req: PaintAsk): Promise<T | null> {
  const w = worker()
  if (!w) return null
  try {
    return await new Promise<T>((resolve, reject) => {
      const id = ++asked
      answers.set(id, { resolve: (p) => resolve(p as T), reject })
      w.postMessage({ ...req, id } satisfies PaintRequest)
    })
  } catch {
    return null
  }
}

const mkCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** a picture as a texture: a worker's bitmap (painted the right way up already) or a canvas painted here */
function texture(src: ImageBitmap | Canvas, srgb: boolean, anisotropy: number): THREE.Texture {
  let t: THREE.Texture
  if (src instanceof ImageBitmap) {
    t = new THREE.Texture(src)
    // (a bitmap is not flipped on upload; the worker made it upside down for that)
    t.flipY = false
    t.addEventListener('dispose', () => src.close())
    t.needsUpdate = true
  } else t = new THREE.CanvasTexture(src as HTMLCanvasElement)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = anisotropy
  return t
}

/** corrugated sheet: ridges for the bump, and the streaks rain leaves down them for the colour (marketPaint) */
export async function corrugated(base: string, seed: number, ridges = 16) {
  let pics: { col: ImageBitmap | Canvas; bump: ImageBitmap | Canvas } | null = await paintOff<{ col: ImageBitmap; bump: ImageBitmap }>({ kind: 'corrugated', base, seed, ridges })
  if (!pics) {
    await calm.turn({ rank: RANK.build })
    pics = paintCorrugated(mkCanvas, base, seed, ridges)
  }
  const map = texture(pics.col, true, 8)
  const bumpMap = texture(pics.bump, false, 8)
  for (const t of [map, bumpMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return { map, bumpMap }
}

/**
 * The concrete apron, from above (marketPaint): its colour, and the roughness map that makes the standing water
 * mirrors for the lamps, and its bump.
 */
export async function apronTextures(seed = 9) {
  let pics: { col: ImageBitmap | Canvas; rough: ImageBitmap | Canvas; bump: ImageBitmap | Canvas } | null = await paintOff<{ col: ImageBitmap; rough: ImageBitmap; bump: ImageBitmap }>({ kind: 'apron', seed })
  if (!pics) {
    await calm.turn({ rank: RANK.build })
    pics = paintApron(mkCanvas, seed)
  }
  return { map: texture(pics.col, true, 8), roughnessMap: texture(pics.rough, false, 8), bumpMap: texture(pics.bump, false, 8) }
}

/** a lit sign: a name in capitals over a small second line, light on dark */
export function signTexture(title: string, sub: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const g = c.getContext('2d')!
  g.fillStyle = '#10141b'
  g.fillRect(0, 0, 512, 160)
  g.strokeStyle = 'rgb(236 232 224 / 0.5)'
  g.lineWidth = 3
  g.strokeRect(8, 8, 496, 144)
  g.fillStyle = '#f1ead8'
  g.textAlign = 'center'
  let size = 66
  g.font = `700 ${size}px sans-serif`
  while (g.measureText(title).width > 460 && size > 24) g.font = `700 ${(size -= 4)}px sans-serif`
  g.fillText(title, 256, 84)
  g.font = '500 24px monospace'
  g.fillStyle = 'rgb(241 234 216 / 0.7)'
  g.fillText(sub, 256, 126)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** a cone of lit air under a lamp: bright at the head, gone at the ground and at its edge */
export function lightCone(height: number, radius: number, color: THREE.Color) {
  const g = new THREE.ConeGeometry(radius, height, 28, 6, true)
  const pos = g.attributes.position as THREE.BufferAttribute
  const paint = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    // (clamped: a hair under zero at the cone's foot is NaN out of pow(), and a NaN in an additive layer is a black
    // frame once the bloom has spread it)
    const t = Math.min(1, Math.max(0, (pos.getY(i) + height / 2) / height))
    const k = Math.pow(t, 2.4)
    paint.set([color.r * k, color.g * k, color.b * k], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(paint, 3))
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }))
}
