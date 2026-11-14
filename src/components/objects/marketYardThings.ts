// What is left about a working yard, as scans (lib/objects/cc0 - Poly Haven, CC0): paper sacks on their pallets, drums
// and crates by the intake's post, fuel cans at the control cabinet, old tyres stacked, concrete barriers along the lane.
// They stand where the camera ends its run - east of the pit, between the reader and the tipper - so the last frame
// has a foreground that was found, not modelled.
import * as THREE from 'three'
import { hung, loadProp, scatter, seat } from '../../lib/objects/cc0'

/** the apron's surface */
const G = 0.02

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

export async function yardThings(wood: THREE.Material): Promise<THREE.Object3D[]> {
  const [bag, drum, tyre, crate, can, barrier] = await Promise.all([
    loadProp('cement_bag'),
    loadProp('Barrel_01'),
    loadProp('old_tyre'),
    loadProp('wooden_crate_02'),
    loadProp('metal_jerrycan'),
    loadProp('concrete_road_barrier'),
  ])
  const r = rng(77)
  const j = (a: number) => (r() - 0.5) * 2 * a
  const out: THREE.Object3D[] = []

  // ---- sacks on pallets: two to a layer, each layer laid across the one under it ----
  const bags: THREE.Matrix4[] = []
  const boards: THREE.BufferGeometry[] = []
  const pallet = (x: number, z: number, turn: number, layers: number, extra: boolean) => {
    const P = new THREE.Matrix4().makeRotationY(turn).setPosition(x, G, z)
    // the pallet: three bearers, seven boards
    for (const bz of [-0.44, 0, 0.44]) boards.push(new THREE.BoxGeometry(1.2, 0.1, 0.1).translate(0, 0.05, bz).applyMatrix4(P))
    for (let k = 0; k < 7; k++) boards.push(new THREE.BoxGeometry(0.1, 0.022, 1.0).translate(-0.55 + k * 0.183, 0.111, 0).applyMatrix4(P))
    const H = bag.size.y * 0.94
    for (let k = 0; k < layers; k++) {
      const y = 0.122 + k * H
      const across = k % 2 === 1
      for (const s of [-1, 1]) {
        const m = across ? seat(bag, j(0.02), y, s * 0.235 + j(0.015), Math.PI / 2 + j(0.05)) : seat(bag, s * 0.235 + j(0.015), y, j(0.02), j(0.05))
        bags.push(m.premultiply(P))
      }
    }
    // one more thrown on top, askew
    if (extra) bags.push(seat(bag, 0.06, 0.122 + layers * H, -0.04, 0.55, 0.04, 0.03).premultiply(P))
  }
  pallet(8.9, 0.95, 0.08, 5, true)
  pallet(9.15, -0.75, -0.12, 3, false)
  // one sack slid off, leaning on the second pallet
  bags.push(hung(bag, 9.95, G + 0.3, -0.62, new THREE.Euler(0.1, 0.3, -1.05)))
  out.push(scatter(bag, bags))
  const boardsMesh = new THREE.Mesh(mergeBoxes(boards), wood)
  boardsMesh.castShadow = true
  boardsMesh.receiveShadow = true
  out.push(boardsMesh)

  // ---- drums by the intake's east post ----
  out.push(scatter(drum, [seat(drum, 8.2, G, -2.3, 0.4), seat(drum, 8.86, G, -2.52, 2.1), seat(drum, 8.46, G, -3.02, 4.0), seat(drum, 9.7, G, -2.9, 1.2, 0, 0, 0.96)]))

  // ---- crates: one on another, a third beside them ----
  out.push(scatter(crate, [seat(crate, 10.35, G, -0.5, 0.3), seat(crate, 10.3, G + crate.size.y * 0.98, -0.46, 0.5), seat(crate, 10.9, G, -1.5, 1.75)]))

  // ---- fuel cans: two at the control cabinet, one by the sacks ----
  out.push(scatter(can, [seat(can, 7.36, G, -0.5, 0.5), seat(can, 7.72, G, -0.78, -0.25), seat(can, 9.85, G, 1.95, 1.9)]))

  // ---- old tyres: three stacked flat, one leaning on the stack ----
  const flat = (x: number, y: number, z: number, turn: number) => hung(tyre, x, y, z, new THREE.Euler(Math.PI / 2, 0, turn))
  const T = tyre.size.z
  out.push(
    scatter(tyre, [
      flat(10.9, G + T * 0.5, 2.4, 0.3),
      flat(10.93, G + T * 1.48, 2.37, 1.9),
      flat(10.88, G + T * 2.46, 2.43, 3.6),
      hung(tyre, 11.42, G + tyre.size.y * 0.47, 2.62, new THREE.Euler(0, 1.25, 0.3, 'YXZ')),
    ]),
  )

  // ---- barriers along the lane's east edge: end to end, none quite in line ----
  out.push(scatter(barrier, [7.4, 9.02, 10.66].map((z, k) => seat(barrier, 10.2 + j(0.05), G, z, Math.PI / 2 + j(0.04) + (k === 2 ? 0.1 : 0)))))
  return out
}

/** boxes into one geometry (they share one material: one draw) */
function mergeBoxes(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  let base = 0
  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute
    const n = g.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nor.push(n.getX(i), n.getY(i), n.getZ(i))
    }
    const ix = g.index!
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i))
    base += p.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setIndex(idx)
  return out
}
