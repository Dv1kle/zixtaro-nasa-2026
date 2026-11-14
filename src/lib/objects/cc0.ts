// Things and skies that were found, not built: scans and HDR skies from Poly Haven (polyhaven.com), all CC0 -
// src/assets/cc0, see its README for what each is and how it was packed.
//
// A scan carries what a procedural box cannot: the dents in a drum, the nap of a paper sack, rust where rain stands.
// A real evening sky is what the wet concrete and the steel reflect - the scenes drew their reflections from a
// photographer's studio before.
//
// The files are fetched once and kept as they came (bytes and blobs); each scene makes its own geometry and textures
// from them, so a scene's dispose frees only what is its own.
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { calm } from '../calm'
import { IDLE } from '../prewarm'

const FILES = import.meta.glob('../../assets/cc0/*.{zxm,webp,hdr}', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const url = (name: string) => {
  const u = FILES[`../../assets/cc0/${name}`]
  if (!u) throw new Error(`cc0: no file ${name}`)
  return u
}

export type PropId = 'cement_bag' | 'Barrel_01' | 'old_tyre' | 'wooden_crate_02' | 'metal_jerrycan' | 'concrete_road_barrier' | 'rusted_spade_01'
/** whose metalness is in the map (the others are not metal anywhere: the scan's factor is 0) */
const METAL: Partial<Record<PropId, true>> = { Barrel_01: true, wooden_crate_02: true, metal_jerrycan: true, rusted_spade_01: true }

type Raw = { mesh: ArrayBuffer; diff: Blob; nor: Blob; arm: Blob }
const raws = new Map<PropId, Promise<Raw>>()
const get = (name: string) =>
  fetch(url(name)).then((r) => {
    if (!r.ok) throw new Error(`cc0: ${name} ${r.status}`)
    return r
  })
function raw(id: PropId): Promise<Raw> {
  let p = raws.get(id)
  if (!p) {
    // (nothing here is waited for: the last turn in the queue - lib/prewarm IDLE)
    p = calm.turn(IDLE)
      .then(() => Promise.all([get(`${id}.zxm`).then((r) => r.arrayBuffer()), get(`${id}_diff.webp`).then((r) => r.blob()), get(`${id}_nor.webp`).then((r) => r.blob()), get(`${id}_arm.webp`).then((r) => r.blob())]))
      .then(([mesh, diff, nor, arm]) => ({ mesh, diff, nor, arm }))
    // (a failed fetch is not kept: the next scene asks again)
    p.catch(() => raws.delete(id))
    raws.set(id, p)
  }
  return p
}

/**
 * The packed mesh (scripts in the README): 'ZXM1', vertex and index counts, the bounding box and the uv box; then
 * positions as u16 inside the box, normals as i8, uvs as u16 inside theirs, the triangle list.
 */
function geometryOf(buf: ArrayBuffer): { geometry: THREE.BufferGeometry; min: THREE.Vector3; size: THREE.Vector3 } {
  const dv = new DataView(buf)
  if (dv.getUint32(0, true) !== 0x314d585a) throw new Error('cc0: not a packed mesh')
  const vc = dv.getUint32(4, true)
  const ic = dv.getUint32(8, true)
  const big = (dv.getUint32(12, true) & 1) === 1
  const f = (o: number) => dv.getFloat32(o, true)
  const min = new THREE.Vector3(f(16), f(20), f(24))
  const size = new THREE.Vector3(f(28), f(32), f(36))
  const oP = 56
  const oN = oP + vc * 6 + ((vc * 6) % 4 ? 4 - ((vc * 6) % 4) : 0)
  const oU = oN + vc * 4
  const oI = oU + vc * 4
  const qp = new Uint16Array(buf, oP, vc * 3)
  const qn = new Int8Array(buf, oN, vc * 4)
  const qu = new Uint16Array(buf, oU, vc * 2)
  const pos = new Float32Array(vc * 3)
  const nor = new Int8Array(vc * 3)
  const uv = new Float32Array(vc * 2)
  const lo = [min.x, min.y, min.z]
  const sz = [size.x, size.y, size.z]
  const ulo = [f(40), f(44)]
  const usz = [f(48), f(52)]
  for (let i = 0; i < vc; i++) {
    for (let c = 0; c < 3; c++) {
      pos[i * 3 + c] = lo[c] + (qp[i * 3 + c] / 65535) * sz[c]
      nor[i * 3 + c] = qn[i * 4 + c]
    }
    for (let c = 0; c < 2; c++) uv[i * 2 + c] = ulo[c] + (qu[i * 2 + c] / 65535) * usz[c]
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(new THREE.BufferAttribute(big ? new Uint32Array(buf.slice(oI, oI + ic * 4)) : new Uint16Array(buf.slice(oI, oI + ic * 2)), 1))
  geometry.computeBoundingSphere()
  return { geometry, min, size }
}

async function mapOf(blob: Blob, srgb: boolean): Promise<THREE.Texture> {
  // decoded off the main thread; laid out as the scan's uvs expect (glTF's way up: not flipped)
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none' })
  const t = new THREE.Texture(bmp)
  t.flipY = false
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** a thing's shape and where it stands in its own space (metres): its lowest corner and how large it is */
export type Shape = { geometry: THREE.BufferGeometry; min: THREE.Vector3; size: THREE.Vector3 }
export type Prop = Shape & { material: THREE.MeshStandardMaterial }
/** a scan for a scene that lights things its own way: the shape, its colour, and its ARM map (the shade in its creases is the red) */
export type Scan = Shape & { map: THREE.Texture; arm: THREE.Texture }

/** A scanned thing without a material (for a scene with its own shaders). The caller owns the geometry and the maps. */
export async function loadScan(id: PropId): Promise<Scan> {
  const r = await raw(id)
  const [map, arm] = await Promise.all([mapOf(r.diff, true), mapOf(r.arm, false)])
  return { ...geometryOf(r.mesh), map, arm }
}

/** A scanned thing, ready to be placed: its geometry and its material (its three maps). The caller owns both. */
export async function loadProp(id: PropId, o: THREE.MeshStandardMaterialParameters = {}): Promise<Prop> {
  const r = await raw(id)
  const [map, normalMap, arm] = await Promise.all([mapOf(r.diff, true), mapOf(r.nor, false), mapOf(r.arm, false)])
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    // one map: ambient occlusion in red, roughness in green, metalness in blue
    aoMap: arm,
    roughnessMap: arm,
    roughness: 1,
    ...(METAL[id] ? { metalnessMap: arm, metalness: 1 } : { metalness: 0 }),
    ...o,
  })
  return { ...geometryOf(r.mesh), material }
}

/** Many of one thing: `at` gives each its place (position, turn, size). They cast and take shadows. */
export function scatter(p: Shape & { material: THREE.Material }, at: THREE.Matrix4[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(p.geometry, p.material, at.length)
  at.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.computeBoundingSphere()
  return mesh
}

export type SkyId = 'industrial_sunset_puresky' | 'evening_field'
const skies = new WeakMap<THREE.WebGLRenderer, Map<SkyId, Promise<THREE.Texture>>>()
/**
 * The brightest a sky's pixel may be. The sun's disc is hundreds of times the sky round it: filtered for a rough
 * surface, that one spot spread into white rims round every puddle and a glare on every roof. The scenes have their
 * own sun or lamps; from the sky they take its colour and its horizon, so its sun is brought down to the glow about it.
 */
const SUN_CAP: Record<SkyId, number> = { industrial_sunset_puresky: 3.2, evening_field: 5 }
function tame(hdr: THREE.DataTexture, cap: number) {
  const d = hdr.image.data as Uint16Array | Float32Array
  if (d instanceof Float32Array) {
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2])
      if (m > cap) {
        const k = cap / m
        d[i] *= k
        d[i + 1] *= k
        d[i + 2] *= k
      }
    }
    return
  }
  // half floats: a positive one's bits grow with its value, so most pixels are passed with three comparisons
  const bits = THREE.DataUtils.toHalfFloat(cap)
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] <= bits && d[i + 1] <= bits && d[i + 2] <= bits) continue
    const r = THREE.DataUtils.fromHalfFloat(d[i])
    const g = THREE.DataUtils.fromHalfFloat(d[i + 1])
    const b = THREE.DataUtils.fromHalfFloat(d[i + 2])
    const k = cap / Math.max(r, g, b)
    d[i] = THREE.DataUtils.toHalfFloat(r * k)
    d[i + 1] = THREE.DataUtils.toHalfFloat(g * k)
    d[i + 2] = THREE.DataUtils.toHalfFloat(b * k)
  }
}

// ---- reading a sky: in a worker (objects/hdr.worker), on the page's thread only where there is none ----
let reader: Worker | null | undefined
let asks = 0
const waiting = new Map<number, { resolve: (t: THREE.DataTexture) => void; reject: (e: unknown) => void }>()
function skyReader(): Worker | null {
  if (reader !== undefined) return reader
  try {
    const w = new Worker(new URL('./hdr.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; width?: number; height?: number; data?: Uint16Array; error?: string }>) => {
      const ask = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (!ask) return
      const { width, height, data } = e.data
      if (!data || !width || !height) return ask.reject(new Error(e.data.error ?? 'no sky'))
      // as three's own loader leaves it: linear light in half floats, the file's first row at the top
      const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType)
      t.colorSpace = THREE.LinearSRGBColorSpace
      t.minFilter = t.magFilter = THREE.LinearFilter
      t.generateMipmaps = false
      t.flipY = true
      t.needsUpdate = true
      ask.resolve(t)
    }
    w.onerror = () => {
      // it could not start (or died): whatever was asked of it is read here instead
      reader = null
      for (const ask of waiting.values()) ask.reject(new Error('no worker'))
      waiting.clear()
    }
    reader = w
  } catch {
    reader = null
  }
  return reader
}
/** the sky's file as a texture of linear light, its sun's disc already brought down */
function readSky(id: SkyId): Promise<THREE.DataTexture> {
  const href = new URL(url(`${id}_1k.hdr`), location.href).href
  const here = () =>
    new HDRLoader().loadAsync(href).then((hdr) => {
      tame(hdr, SUN_CAP[id])
      return hdr
    })
  const w = skyReader()
  if (!w) return here()
  return new Promise<THREE.DataTexture>((resolve, reject) => {
    const n = ++asks
    waiting.set(n, { resolve, reject })
    w.postMessage({ id: n, url: href, cap: SUN_CAP[id] })
  }).catch(here)
}

/**
 * A real sky as the scene's environment (what its surfaces reflect and are lit by from all round), pre-filtered once
 * per renderer and kept for as long as the renderer is: do not dispose it. Nothing waits for it: its file is asked
 * for in an idle turn of the page's queue (lib/calm, lib/prewarm IDLE), read off the main thread, and filtered - a GPU job on the
 * page's thread - in a turn of its own.
 */
export function loadSky(renderer: THREE.WebGLRenderer, id: SkyId): Promise<THREE.Texture> {
  let mine = skies.get(renderer)
  if (!mine) skies.set(renderer, (mine = new Map()))
  let p = mine.get(id)
  if (!p) {
    p = calm.turn(IDLE)
      .then(() => readSky(id))
      .then((hdr) =>
        calm.turn(IDLE).then(() => {
          hdr.mapping = THREE.EquirectangularReflectionMapping
          const pmrem = new THREE.PMREMGenerator(renderer)
          const env = pmrem.fromEquirectangular(hdr).texture
          pmrem.dispose()
          hdr.dispose()
          return env
        }),
      )
    p.catch(() => mine!.delete(id))
    mine.set(id, p)
  }
  return p
}

/** a place for a thing: the middle of its base at x, y, z; turned by ry, then tipped by rx and rz */
export function seat(p: Shape, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1): THREE.Matrix4 {
  const cx = p.min.x + p.size.x / 2
  const cz = p.min.z + p.size.z / 2
  return new THREE.Matrix4()
    .compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s))
    .multiply(new THREE.Matrix4().makeTranslation(-cx, -p.min.y, -cz))
}
/** the same, about the thing's middle (a tyre on its side, a sack leaning) */
export function hung(p: Shape, x: number, y: number, z: number, e: THREE.Euler): THREE.Matrix4 {
  const c = p.min.clone().addScaledVector(p.size, 0.5)
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))
}
