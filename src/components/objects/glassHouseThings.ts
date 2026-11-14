// What stands about a nursery's yard, as scans (lib/objects/cc0 - Poly Haven, CC0): sacks of substrate on their
// pallets by the gable door, crates waiting for the pick, drums and fuel cans, tyres by a lamp post, concrete barriers
// at the apron's edge. The house's scene lights everything with its own shaders and casts no shadows, so each thing
// comes with the material the scene makes for it (`skin`) and a soft dark patch on the ground under it.
import * as THREE from 'three'
import { hung, loadScan, scatter, seat, type Scan, type Shape } from '../../lib/objects/cc0'

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

/** the patch a thing darkens under itself: black, fading out from its middle */
function patchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.75)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export async function nurseryThings(skin: (s: Scan) => THREE.Material, board: THREE.Material): Promise<THREE.Object3D[]> {
  const [bag, drum, tyre, crate, can, barrier] = await Promise.all([loadScan('cement_bag'), loadScan('Barrel_01'), loadScan('old_tyre'), loadScan('wooden_crate_02'), loadScan('metal_jerrycan'), loadScan('concrete_road_barrier')])
  const r = rng(31)
  const j = (a: number) => (r() - 0.5) * 2 * a
  const out: THREE.Object3D[] = []
  /** the patches: [x, z, half-width, half-depth, turn] */
  const patches: [number, number, number, number, number][] = []
  const put = (s: Scan, at: THREE.Matrix4[]) => out.push(scatter({ ...(s as Shape), material: skin(s) }, at))

  // ---- substrate on pallets, left of the gable door: two to a layer, each layer across the one under it ----
  const bags: THREE.Matrix4[] = []
  const boards: THREE.BufferGeometry[] = []
  const pallet = (x: number, z: number, turn: number, layers: number, extra: boolean) => {
    const P = new THREE.Matrix4().makeRotationY(turn).setPosition(x, 0, z)
    for (const bz of [-0.44, 0, 0.44]) boards.push(new THREE.BoxGeometry(1.2, 0.1, 0.1).translate(0, 0.05, bz).applyMatrix4(P))
    for (let k = 0; k < 7; k++) boards.push(new THREE.BoxGeometry(0.1, 0.022, 1.0).translate(-0.55 + k * 0.183, 0.111, 0).applyMatrix4(P))
    const H = bag.size.y * 0.94
    for (let k = 0; k < layers; k++) {
      const y = 0.122 + k * H
      for (const s of [-1, 1]) bags.push((k % 2 ? seat(bag, j(0.02), y, s * 0.235 + j(0.015), Math.PI / 2 + j(0.05)) : seat(bag, s * 0.235 + j(0.015), y, j(0.02), j(0.05))).premultiply(P))
    }
    if (extra) bags.push(seat(bag, 0.06, 0.122 + layers * H, -0.04, 0.55, 0.04, 0.03).premultiply(P))
    patches.push([x, z, 1.05, 0.95, turn])
  }
  pallet(-4.7, 2.3, 0.06, 6, true)
  pallet(-6.3, 2.5, -0.1, 4, false)
  pallet(-8.1, 2.2, 0.14, 6, false)
  bags.push(hung(bag, -5.5, 0.3, 3.35, new THREE.Euler(-1.0, 0.2, 0.05)))
  patches.push([-5.5, 3.4, 0.5, 0.45, 0])
  put(bag, bags)
  const boardsGeo = mergeBoxes(boards)
  out.push(new THREE.Mesh(boardsGeo, board))

  // ---- crates, right of the door: stacked for the morning's pick ----
  const crates: THREE.Matrix4[] = []
  const stack = (x: number, z: number, turn: number, n: number) => {
    for (let k = 0; k < n; k++) crates.push(seat(crate, x + j(0.03), k * crate.size.y * 0.98, z + j(0.03), turn + j(0.08)))
    patches.push([x, z, 0.5, 0.8, turn])
  }
  stack(3.7, 1.7, 0.1, 3)
  stack(4.6, 1.75, 0.06, 2)
  stack(5.9, 2.4, 1.5, 1)
  put(crate, crates)

  // ---- drums and cans further along the gable ----
  put(drum, [seat(drum, 8.3, 0, 1.2, 0.4), seat(drum, 9.0, 0, 1.35, 2.1), seat(drum, 8.62, 0, 1.92, 4.0)])
  patches.push([8.64, 1.5, 0.95, 0.85, 0])
  put(can, [seat(can, 2.45, 0, 0.95, 0.5), seat(can, 2.82, 0, 1.2, -0.3), seat(can, 9.75, 0, 1.7, 1.9)])
  patches.push([2.63, 1.08, 0.45, 0.4, 0], [9.75, 1.7, 0.3, 0.3, 0])

  // ---- tyres by the first lamp post: three flat, one leaning ----
  const T = tyre.size.z
  const flat = (x: number, y: number, z: number, turn: number) => hung(tyre, x, y, z, new THREE.Euler(Math.PI / 2, 0, turn))
  put(tyre, [flat(16.1, T * 0.5, 10.7, 0.3), flat(16.13, T * 1.48, 10.67, 1.9), flat(16.08, T * 2.46, 10.73, 3.6), hung(tyre, 16.62, tyre.size.y * 0.47, 10.9, new THREE.Euler(0, 1.25, 0.3, 'YXZ'))])
  patches.push([16.2, 10.75, 0.75, 0.6, 0])

  // ---- barriers: along the apron's left edge, and two turning lorries away from the tank ----
  const rows: [number, number, number][] = [[-19.2, 4.6, Math.PI / 2], [-19.25, 6.24, Math.PI / 2 + 0.04], [-19.15, 7.9, Math.PI / 2 - 0.05], [13.9, 14.2, 0.12], [15.55, 14.05, 0.2]]
  put(barrier, rows.map(([x, z, t]) => seat(barrier, x, 0, z, t)))
  for (const [x, z, t] of rows) patches.push([x, z, 1.0, 0.55, t])

  // ---- the dark each thing lays on the ground ----
  const quads: THREE.BufferGeometry[] = patches.map(([x, z, w, d, t]) => new THREE.PlaneGeometry(w * 2, d * 2).rotateX(-Math.PI / 2).rotateY(t).translate(x, 0.012, z))
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  quads.forEach((q, k) => {
    pos.push(...(q.attributes.position.array as Float32Array))
    uv.push(...(q.attributes.uv.array as Float32Array))
    idx.push(...Array.from(q.index!.array, (i) => i + k * 4))
    q.dispose()
  })
  const shade = new THREE.BufferGeometry()
  shade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  shade.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  shade.setIndex(idx)
  const patch = new THREE.Mesh(shade, new THREE.MeshBasicMaterial({ map: patchTexture(), color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }))
  patch.renderOrder = 0.5
  out.push(patch)
  return out
}

function mergeBoxes(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let base = 0
  for (const g of list) {
    pos.push(...(g.attributes.position.array as Float32Array))
    nor.push(...(g.attributes.normal.array as Float32Array))
    uv.push(...(g.attributes.uv.array as Float32Array))
    idx.push(...Array.from(g.index!.array, (i) => i + base))
    base += g.attributes.position.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  out.setIndex(idx)
  return out
}
