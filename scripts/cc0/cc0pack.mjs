// Pack the downloaded Poly Haven props for the site: one quantized mesh file (.zxm) and three 512 px WebP maps each.
// node cc0pack.mjs <raw dir> <out dir>
//   mesh: every primitive of the glTF, its node's transform applied, merged; simplified to the budget below with the
//   project's own meshoptimizer; positions u16 in the bounding box, normals i8, uvs u16, indices u16/u32.
//   maps: diffuse, normal (GL), ARM (ao / roughness / metalness) - resized and re-encoded in the local Chrome.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
// (run from the project root; playwright is taken from wherever PLAYWRIGHT_FROM points - any project that has it)
const APP = join(process.cwd(), 'package.json')
const THREE = createRequire(APP)('three')
const { MeshoptSimplifier } = createRequire(APP)('meshoptimizer')
const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM || APP)('playwright')
const [RAW, OUT] = process.argv.slice(2)
mkdirSync(OUT, { recursive: true })

/** triangles kept (the rest are simplified away); the spade is seen close, the yard's things from metres off */
const BUDGET = { cement_bag: 2000, Barrel_01: 3000, old_tyre: 3000, wooden_crate_02: 4000, metal_jerrycan: 5000, concrete_road_barrier: 5000, rusted_spade_01: 12000 }
const TEX = { cement_bag: 512, Barrel_01: 512, old_tyre: 512, wooden_crate_02: 512, metal_jerrycan: 512, concrete_road_barrier: 512, rusted_spade_01: 1024 }

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
function accessor(g, bin, i) {
  const a = g.accessors[i]
  const bv = g.bufferViews[a.bufferView]
  const T = COMP[a.componentType]
  const n = SIZE[a.type]
  const stride = bv.byteStride || T.BYTES_PER_ELEMENT * n
  const out = new Float64Array(a.count * n)
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0))
  const read = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType]
  const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 0
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const v = dv[read](k * stride + c * T.BYTES_PER_ELEMENT, true)
    out[k * n + c] = norm ? Math.max(-1, v / norm) : v
  }
  return out
}

await MeshoptSimplifier.ready
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.goto('about:blank')
/**
 * The scans come as they were found: a sack that says CEMENT in red, a red drum, a red can. In this world red is kept
 * for risk, and the yard is a grain yard - so the diffuse map is repainted here (the scans are CC0):
 *   kraft: the print softened to smudges, everything taken to the tone of brown paper;
 *   hue:   the reds (and only the reds) turned to another hue, a little duller.
 */
const EDIT = {
  cement_bag: { kraft: true },
  Barrel_01: { hue: 208, sat: 0.6, val: 0.85 },
  metal_jerrycan: { hue: 82, sat: 0.6, val: 0.8 },
}
async function webp(file, px, q, edit) {
  const b64 = readFileSync(file).toString('base64')
  const out = await page.evaluate(async ({ b64, px, q, edit }) => {
    const blob = await (await fetch('data:image/jpeg;base64,' + b64)).blob()
    const bmp = await createImageBitmap(blob, { resizeWidth: px, resizeHeight: px, resizeQuality: 'high' })
    const cv = new OffscreenCanvas(px, px)
    const ctx = cv.getContext('2d')
    if (edit?.kraft) ctx.filter = `blur(${px / 150}px)`
    ctx.drawImage(bmp, 0, 0)
    if (edit) {
      const im = ctx.getImageData(0, 0, px, px)
      const d = im.data
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, bl = d[i + 2] / 255
        if (edit.kraft) {
          const L = 0.3 * r + 0.59 * g + 0.11 * bl
          const k = 0.5 + 0.62 * L
          d[i] = Math.min(255, 255 * (0.15 * r + 0.85 * 0.8 * k))
          d[i + 1] = Math.min(255, 255 * (0.15 * g + 0.85 * 0.7 * k))
          d[i + 2] = Math.min(255, 255 * (0.15 * bl + 0.85 * 0.54 * k))
          continue
        }
        const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), c = mx - mn
        if (c < 0.08) continue
        let h = mx === r ? ((g - bl) / c) % 6 : mx === g ? (bl - r) / c + 2 : (r - g) / c + 4
        h = (h * 60 + 360) % 360
        // how red: full inside 345..20 degrees, fading out by 320 and 40
        const redness = Math.max(0, Math.min(1, h < 180 ? (40 - h) / 20 : (h - 320) / 25)) * Math.min(1, (c / Math.max(1e-3, mx)) / 0.3)
        if (redness <= 0) continue
        const S = (c / mx) * edit.sat, Vv = mx * edit.val
        const C2 = Vv * S, X = C2 * (1 - Math.abs(((edit.hue / 60) % 2) - 1)), m = Vv - C2
        const seg = Math.floor(edit.hue / 60)
        const [r2, g2, b2] = [[C2, X, 0], [X, C2, 0], [0, C2, X], [0, X, C2], [X, 0, C2], [C2, 0, X]][seg]
        d[i] = 255 * (r + (r2 + m - r) * redness)
        d[i + 1] = 255 * (g + (g2 + m - g) * redness)
        d[i + 2] = 255 * (bl + (b2 + m - bl) * redness)
      }
      ctx.putImageData(im, 0, 0)
    }
    const w = await cv.convertToBlob({ type: 'image/webp', quality: q })
    const buf = new Uint8Array(await w.arrayBuffer())
    let s = ''
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(s)
  }, { b64, px, q, edit })
  return Buffer.from(out, 'base64')
}

for (const id of Object.keys(BUDGET)) {
  const dir = join(RAW, id)
  const g = JSON.parse(readFileSync(join(dir, id + '_1k.gltf'), 'utf8'))
  if (g.buffers.length !== 1) throw new Error(id + ': expected one buffer')
  const bin = readFileSync(join(dir, g.buffers[0].uri))
  // world matrices of the scene's nodes
  const world = new Map()
  const walk = (ni, parent) => {
    const n = g.nodes[ni]
    const m = new THREE.Matrix4()
    if (n.matrix) m.fromArray(n.matrix)
    else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])))
    const w = parent.clone().multiply(m)
    world.set(ni, w)
    for (const c of n.children || []) walk(c, w)
  }
  for (const r of g.scenes[g.scene || 0].nodes) walk(r, new THREE.Matrix4())
  const P = [], N = [], U = [], I = []
  const mats = new Set()
  for (const [ni, w] of world) {
    const n = g.nodes[ni]
    if (n.mesh === undefined) continue
    const nm = new THREE.Matrix3().getNormalMatrix(w)
    for (const prim of g.meshes[n.mesh].primitives) {
      mats.add(prim.material)
      const p = accessor(g, bin, prim.attributes.POSITION)
      const nn = accessor(g, bin, prim.attributes.NORMAL)
      const uv = accessor(g, bin, prim.attributes.TEXCOORD_0)
      const base = P.length / 3
      const v = new THREE.Vector3()
      for (let k = 0; k < p.length / 3; k++) {
        v.set(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]).applyMatrix4(w)
        P.push(v.x, v.y, v.z)
        v.set(nn[k * 3], nn[k * 3 + 1], nn[k * 3 + 2]).applyMatrix3(nm).normalize()
        N.push(v.x, v.y, v.z)
        U.push(uv[k * 2], uv[k * 2 + 1])
      }
      const idx = prim.indices !== undefined ? accessor(g, bin, prim.indices) : Float64Array.from({ length: p.length / 3 }, (_, k) => k)
      for (const k of idx) I.push(base + k)
    }
  }
  let idx = Uint32Array.from(I)
  const pos = Float32Array.from(P)
  const tris0 = idx.length / 3
  if (tris0 > BUDGET[id]) {
    const [simp, err] = MeshoptSimplifier.simplify(idx, pos, 3, BUDGET[id] * 3, 0.02)
    idx = simp
    void err
  }
  // only the vertices still used, in the order they are first met
  const remap = new Int32Array(pos.length / 3).fill(-1)
  let vc = 0
  for (let k = 0; k < idx.length; k++) {
    if (remap[idx[k]] < 0) remap[idx[k]] = vc++
    idx[k] = remap[idx[k]]
  }
  const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity], umin = [Infinity, Infinity], umax = [-Infinity, -Infinity]
  for (let o = 0; o < remap.length; o++) {
    if (remap[o] < 0) continue
    for (let c = 0; c < 3; c++) { bmin[c] = Math.min(bmin[c], P[o * 3 + c]); bmax[c] = Math.max(bmax[c], P[o * 3 + c]) }
    for (let c = 0; c < 2; c++) { umin[c] = Math.min(umin[c], U[o * 2 + c]); umax[c] = Math.max(umax[c], U[o * 2 + c]) }
  }
  const bsize = bmax.map((v, c) => Math.max(1e-6, v - bmin[c]))
  const usize = umax.map((v, c) => Math.max(1e-6, v - umin[c]))
  const big = vc > 65535
  const posBytes = vc * 6 + ((vc * 6) % 4 ? 4 - ((vc * 6) % 4) : 0)
  const idxBytes = idx.length * (big ? 4 : 2)
  const buf = Buffer.alloc(56 + posBytes + vc * 4 + vc * 4 + idxBytes + (idxBytes % 4 ? 4 - (idxBytes % 4) : 0))
  buf.write('ZXM1', 0, 'latin1')
  buf.writeUInt32LE(vc, 4)
  buf.writeUInt32LE(idx.length, 8)
  buf.writeUInt32LE(big ? 1 : 0, 12)
  bmin.forEach((v, c) => buf.writeFloatLE(v, 16 + c * 4))
  bsize.forEach((v, c) => buf.writeFloatLE(v, 28 + c * 4))
  umin.forEach((v, c) => buf.writeFloatLE(v, 40 + c * 4))
  usize.forEach((v, c) => buf.writeFloatLE(v, 48 + c * 4))
  const oP = 56, oN = oP + posBytes, oU = oN + vc * 4, oI = oU + vc * 4
  for (let o = 0; o < remap.length; o++) {
    const k = remap[o]
    if (k < 0) continue
    for (let c = 0; c < 3; c++) buf.writeUInt16LE(Math.round(((P[o * 3 + c] - bmin[c]) / bsize[c]) * 65535), oP + k * 6 + c * 2)
    for (let c = 0; c < 3; c++) buf.writeInt8(Math.max(-127, Math.min(127, Math.round(N[o * 3 + c] * 127))), oN + k * 4 + c)
    for (let c = 0; c < 2; c++) buf.writeUInt16LE(Math.round(((U[o * 2 + c] - umin[c]) / usize[c]) * 65535), oU + k * 4 + c * 2)
  }
  for (let k = 0; k < idx.length; k++) big ? buf.writeUInt32LE(idx[k], oI + k * 4) : buf.writeUInt16LE(idx[k], oI + k * 2)
  writeFileSync(join(OUT, id + '.zxm'), buf)
  // the maps the glTF's one material names
  if (mats.size !== 1) throw new Error(id + ': expected one material, got ' + mats.size)
  const m = g.materials[[...mats][0]]
  const src = (t) => join(dir, g.images[g.textures[t.index].source].uri)
  const px = TEX[id]
  const files = { diff: [src(m.pbrMetallicRoughness.baseColorTexture), 0.84], nor: [src(m.normalTexture), 0.9], arm: [src(m.pbrMetallicRoughness.metallicRoughnessTexture), 0.82] }
  let texBytes = 0
  for (const [k, [f, q]] of Object.entries(files)) {
    const w = await webp(f, px, q, k === 'diff' ? EDIT[id] : undefined)
    texBytes += w.length
    writeFileSync(join(OUT, `${id}_${k}.webp`), w)
  }
  console.log(id.padEnd(22), `tris ${tris0} -> ${idx.length / 3}`, `verts ${vc}`, `mesh ${(buf.length / 1024).toFixed(0)} KB`, `maps ${(texBytes / 1024).toFixed(0)} KB`, 'size m', bsize.map((v) => v.toFixed(2)).join(' x '), 'min y', bmin[1].toFixed(3), 'mat', JSON.stringify({ rough: m.pbrMetallicRoughness.roughnessFactor, metal: m.pbrMetallicRoughness.metallicFactor, ao: !!m.occlusionTexture }))
}
await browser.close()
