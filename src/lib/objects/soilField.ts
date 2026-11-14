// The harvested field the soil core is drawn out of: the dry topsoil of this very field (its colour from the top
// horizon, paler than the moist cut), clods, drill rows of last season's stubble catching the low light, and the
// round hole the coring tube left, its walls falling away into the dark. One radial ground mesh (dense near the core,
// sparse far out where the fog takes it), two instanced meshes, standard materials only.
import * as THREE from 'three'
import { makeNoise, rng, sstep, type RGB } from './soilProfile'
import { surfaceTextures } from './soilTextures'
import { stalkGeometry, stoneGeometry } from './soilCore'

export type Field = { group: THREE.Group; dispose: () => void; heightAt: (x: number, z: number) => number }

const ROW = 0.15 // drill row spacing, m

export async function buildField(o: { seed: number; topsoil: RGB; holeR: number }): Promise<Field> {
  const { holeR } = o
  const { fbm } = makeNoise(o.seed + 101)
  const rnd = rng(o.seed + 202)
  const group = new THREE.Group()
  const disposables: { dispose: () => void }[] = []

  // the relief: a slow swell, clods, the drill rows (fading out where the mesh is too coarse to hold them) and the
  // lip the tube pushed up round the hole. Flat right at the hole, so the core's top sits flush in it.
  const heightAt = (x: number, z: number) => {
    const r = Math.hypot(x, z)
    const near = sstep(holeR + 0.05, holeR + 0.9, r)
    const swell = (fbm(x * 0.35 + 9, z * 0.35, 3) - 0.5) * 0.09 * sstep(0.6, 3, r)
    const clods = (fbm(x * 4.5, z * 4.5, 3) - 0.5) * 0.028
    const rows = 0.006 * Math.cos((x / ROW) * Math.PI * 2) * (1 - sstep(1.4, 2.4, r))
    const lip = 0.016 * Math.exp(-(((r - holeR - 0.05) / 0.05) ** 2))
    return (swell + clods * near + rows * near) + lip
  }

  // ---- ground: rings from the hole's edge out to the fog ----
  const NR = 120
  const NA = 288
  const R1 = 30
  const pos: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= NR; i++) {
    const r = holeR * Math.pow(R1 / holeR, i / NR)
    for (let k = 0; k <= NA; k++) {
      const a = (k / NA) * Math.PI * 2
      const x = r * Math.cos(a)
      const z = r * Math.sin(a)
      const y = i === 0 ? 0 : heightAt(x, z)
      pos.push(x, y, z)
      uv.push(x / 1.6, z / 1.6)
      // macro variation (breaks the tile), darker in the row troughs, darker trodden ground round the hole
      const m = 0.72 + 0.5 * fbm(x * 0.5 + 3, z * 0.5 - 7, 3)
      const trough = 1 - 0.12 * (0.5 - 0.5 * Math.cos((x / ROW) * Math.PI * 2)) * (1 - sstep(1.4, 2.4, r))
      const trod = 1 - 0.25 * Math.exp(-(((r - holeR) / 0.35) ** 2))
      const v = m * trough * trod
      col.push(v, v, v * 1.02)
    }
  }
  for (let i = 0; i < NR; i++)
    for (let k = 0; k < NA; k++) {
      const a = i * (NA + 1) + k
      const b = a + NA + 1
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  const groundGeo = new THREE.BufferGeometry()
  groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  groundGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  groundGeo.setIndex(idx)
  groundGeo.computeVertexNormals()
  const tex = await surfaceTextures(o.seed, o.topsoil, { tile: 1.6, size: 512, dryness: 1.38 })
  const groundMat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normal, normalScale: new THREE.Vector2(1.5, 1.5), vertexColors: true, roughness: 0.97, metalness: 0, envMapIntensity: 0.35 })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.receiveShadow = true
  group.add(ground)
  disposables.push(groundGeo, groundMat, tex.map, tex.normal)

  // ---- the hole: its wall, falling away into the dark ----
  const shaftGeo = new THREE.CylinderGeometry(holeR, holeR, 1.2, 64, 6, true)
  shaftGeo.translate(0, -0.6, 0)
  const shaftMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(o.topsoil[0] * 0.5, o.topsoil[1] * 0.5, o.topsoil[2] * 0.5, THREE.SRGBColorSpace), roughness: 1, metalness: 0, side: THREE.BackSide })
  const shaft = new THREE.Mesh(shaftGeo, shaftMat)
  shaft.receiveShadow = true
  group.add(shaft)
  const floorGeo = new THREE.CircleGeometry(holeR, 32).rotateX(-Math.PI / 2)
  floorGeo.translate(0, -1.2, 0)
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x050506 })
  group.add(new THREE.Mesh(floorGeo, floorMat))
  disposables.push(shaftGeo, shaftMat, floorGeo, floorMat)

  // ---- stubble: last season's stalks in their drill rows, a few knocked over ----
  const stalkGeo = stalkGeometry()
  const strawMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, envMapIntensity: 0.5 })
  const mats: THREE.Matrix4[] = []
  const cols: THREE.Color[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const straw = new THREE.Color('#b9a988')
  const grey = new THREE.Color('#8d877a')
  for (let row = -26; row <= 26; row++) {
    const x0 = row * ROW
    for (let z = 3.6; z > -5.5; z -= 0.04 + rnd() * 0.07) {
      if (rnd() < 0.25) continue // gaps in the row
      const x = x0 + (rnd() - 0.5) * 0.03
      const r = Math.hypot(x, z)
      if (r < holeR + 0.14) continue
      // the stubble thins out toward the far field (the fog has it there anyway)
      if (r > 4 && rnd() < (r - 4) / 3) continue
      const h = 0.035 + 0.05 * rnd()
      const fallen = rnd() < 0.06
      p.set(x, heightAt(x, z) - 0.01, z)
      if (fallen) {
        e.set(Math.PI / 2 - 0.08, rnd() * Math.PI * 2, 0, 'YXZ')
        s.set(0.0021, 0.08 + 0.18 * rnd(), 0.0021)
        p.y += 0.006
      } else {
        e.set((rnd() - 0.5) * 0.35, rnd() * 6.28, (rnd() - 0.5) * 0.35, 'YXZ')
        s.set(0.0021 + 0.0009 * rnd(), h, 0.0021 + 0.0009 * rnd())
      }
      q.setFromEuler(e)
      mats.push(m.compose(p, q, s).clone())
      cols.push(straw.clone().lerp(grey, rnd() * 0.7).multiplyScalar(0.42 + 0.3 * rnd()))
    }
  }
  const stubble = new THREE.InstancedMesh(stalkGeo, strawMat, mats.length)
  mats.forEach((mm, i) => {
    stubble.setMatrixAt(i, mm)
    stubble.setColorAt(i, cols[i])
  })
  stubble.castShadow = true
  stubble.receiveShadow = true
  group.add(stubble)
  disposables.push(stalkGeo, strawMat, stubble)

  // ---- clods: lumps of the dry topsoil, more and smaller toward the hole (crumbs the tube broke off) ----
  const clodGeo = stoneGeometry(o.seed + 3, 1, 0.62)
  const clodMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 })
  const tone = new THREE.Color().setRGB(o.topsoil[0] * 1.32, o.topsoil[1] * 1.3, o.topsoil[2] * 1.28, THREE.SRGBColorSpace)
  const nClod = 900
  const clods = new THREE.InstancedMesh(clodGeo, clodMat, nClod)
  for (let i = 0; i < nClod; i++) {
    const nearHole = i < 140
    const a = rnd() * Math.PI * 2
    const r = nearHole ? holeR + 0.03 + 0.35 * rnd() * rnd() : holeR + 0.2 + 4.2 * Math.pow(rnd(), 1.6)
    const x = r * Math.cos(a)
    const z = r * Math.sin(a) - (nearHole ? 0 : 0.6)
    const size = nearHole ? 0.005 + 0.016 * rnd() : 0.008 + 0.04 * Math.pow(rnd(), 2.2)
    p.set(x, heightAt(x, z) + size * 0.15, z)
    e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)
    q.setFromEuler(e)
    s.set(size * (0.8 + 0.5 * rnd()), size * (0.6 + 0.4 * rnd()), size * (0.8 + 0.5 * rnd()))
    clods.setMatrixAt(i, m.compose(p, q, s))
    clods.setColorAt(i, tone.clone().multiplyScalar(0.62 + 0.45 * rnd()))
  }
  clods.castShadow = true
  clods.receiveShadow = true
  group.add(clods)
  disposables.push(clodGeo, clodMat, clods)

  return { group, heightAt, dispose: () => disposables.forEach((d) => d.dispose()) }
}
