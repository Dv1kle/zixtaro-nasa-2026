// H2 - the field standing. The crop that grew here last, as a real field at the golden hour: drill rows and tramlines
// running toward a low sun, thousands of instanced plants of that crop's own build (jointed straw and spikelet ears,
// maize with tassels and cobs, rapeseed in flower, sunflower heads, legume bushes, beet rosettes on their ridges),
// a hedgerow and a far field in the haze, a cool sky warming only toward the sun. Gusts roll across the crop; chaff,
// midges and a pair of swallows catch the light. The camera comes down with the scroll from above the canopy into a
// tramline until the ears stand overhead against the sky, the focus pulling from the far field to the near ears.
// Lazy (three.js loads only when the crossing comes near).
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { DepthOfFieldEffect, EffectComposer } from 'postprocessing'
import { buildLens, devLensOff } from '../../lib/objects/lens'
import { CROP_BY_ID, isCropId } from '../../lib/crops'
import { lean, lookAround } from '../../lib/objects/lookAround'
import { createStage } from '../../lib/objects/stage'
import { C, rng, sstep, V } from './canopy/geo'
import { fieldSpec, treeGeo, wildflower, type FieldSpec } from './canopy/plants'
import { fieldUniforms, groundMaterial, moteMaterial, noiseTexture, plantMaterial, skyMaterial } from './canopy/fieldShading'
import type { CanopyFieldProps } from './types'

const TAU = Math.PI * 2

type Shot = { start: THREE.Vector3; end: THREE.Vector3; startLook: THREE.Vector3; endLook: THREE.Vector3 }

/** the shot: where the camera starts (above the canopy, the horizon in frame) and where it ends (down a tramline) */
function shot(spec: FieldSpec): Shot {
  const H = spec.H
  const endX = 1.8
  const low = spec.kind === 'cereal' || spec.kind === 'brassica' || spec.kind === 'tall' || spec.kind === 'sunflower'
  const endY = low ? H * (spec.kind === 'tall' ? 0.6 : spec.kind === 'sunflower' ? 0.62 : 0.76) : Math.max(0.3, H * 0.62)
  return {
    start: V(0.55, H + (spec.kind === 'tall' ? 1.5 : 1.45), 3.6),
    end: V(endX, endY, -2.3),
    startLook: V(6.5, H * 0.4, -42),
    endLook: V(endX + 2.4, low ? H * 1.04 + 0.3 : H + 0.15, -10.5),
  }
}

/** the camera at scroll progress p: an eased glide down and in, a slight arc and bank, a hand-held breath */
function camAt(s: Shot, p: number, time: number) {
  const k = sstep(0, 0.94, p)
  const e = k * k * k * (k * (k * 6 - 15) + 10)
  const ey = Math.pow(sstep(0.02, 0.97, p), 1.25)
  const pos = s.start.clone().lerp(s.end, e)
  pos.y = s.start.y + (s.end.y - s.start.y) * (ey * ey * (3 - 2 * ey))
  pos.x += Math.sin(Math.PI * e) * 0.45
  const look = s.startLook.clone().lerp(s.endLook, sstep(0.05, 1, p))
  const roll = Math.sin(Math.PI * e) * 0.035 + (Math.sin(time * 0.53) * 0.6 + Math.sin(time * 1.31 + 2) * 0.4) * 0.004
  look.x += (Math.sin(time * 0.37) + 0.5 * Math.sin(time * 0.91 + 1)) * 0.05
  look.y += (Math.sin(time * 0.47 + 1.3) + 0.5 * Math.sin(time * 1.13)) * 0.035
  pos.y += Math.sin(time * 0.61 + 0.4) * 0.006
  return { pos, look, roll }
}

/** low-frequency patchiness across the field: ripeness, vigour, the odd wet hollow */
const patch = (x: number, z: number) => 0.5 + 0.28 * Math.sin(x * 0.29 + Math.sin(z * 0.17) * 2.1) * Math.cos(z * 0.21 - x * 0.07) + 0.2 * Math.sin(x * 0.83 + z * 0.61)

type Inst = { m: THREE.Matrix4; c: THREE.Color }

/** where the plants stand: drill rows in a wedge widening toward the sun; full detail around the lens, clumps beyond */
function layout(spec: FieldSpec, s: Shot) {
  const r = rng(4049)
  const E = s.end
  const zMax = 2.2
  const zFar = spec.kind === 'tall' || spec.kind === 'sunflower' ? -30 : -36
  const cx = (z: number) => E.x + Math.max(0, s.start.z - z) * 0.24
  const hw = (z: number) => 2.4 + Math.max(0, s.start.z - z) * 0.98
  const inside = (x: number, z: number) => z < zMax && z > zFar && Math.abs(x - cx(z)) < hw(z)
  const track = (x: number) => {
    if (!spec.tramline) return false
    const t = Math.abs(Math.abs(((((x - (E.x - 0.9) + 12) % 24) + 24) % 24) - 12) - 0.9)
    return t < 0.25
  }
  // the camera's own way down stays clear: nothing stands within a lens' reach of the path once it is in the crop
  const clear = spec.kind === 'tall' ? 0.85 : spec.kind === 'sunflower' ? 0.75 : spec.kind === 'cereal' || spec.kind === 'brassica' ? 0.2 : 0.32
  const pathPts: THREE.Vector3[] = []
  for (let k = 0; k <= 20; k++) pathPts.push(camAt(s, 0.45 + (0.55 * k) / 20, 0).pos)
  const nearPath = (x: number, z: number) => pathPts.some((p) => Math.hypot(p.x - x, p.z - z) < clear && p.y < spec.H * 1.3)
  const lods: Inst[][] = [[], [], []]
  const R1 = spec.r0 * 2.6
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const rowOff = spec.tramline ? 0 : 0.5
  const grid = (row: number, step: number, lod: number) => {
    const x0 = E.x - Math.ceil(70 / row) * row + rowOff * row
    for (let x = x0; x < E.x + 70; x += row) {
      if (track(x)) continue
      for (let z = zMax; z > zFar; z -= step) {
        const px = x + (r() - 0.5) * row * (lod ? 0.6 : 0.35)
        const pz = z + (r() - 0.5) * step * 0.8
        if (!inside(px, pz)) continue
        const d = Math.hypot(px - E.x, pz - E.z) + (r() - 0.5) * 1.6
        const want = d < spec.r0 ? 0 : d < R1 ? 1 : 2
        if (want !== lod) continue
        if (nearPath(px, pz) || track(px)) continue
        const pt = patch(px, pz)
        const sc = (0.88 + 0.22 * r()) * (0.93 + 0.1 * pt)
        const spread = lod === 2 ? 1.7 : 1
        e.set((r() - 0.5) * 0.08, spec.yaw ? r() * spec.yaw : 0, (r() - 0.5) * 0.08)
        q.setFromEuler(e)
        const m = new THREE.Matrix4().compose(V(px, 0, pz), q, V(sc * spread, sc * (0.95 + 0.1 * r()), sc * spread))
        const v = (0.86 + 0.24 * r()) * (0.9 + 0.2 * pt)
        lods[lod].push({ m, c: new THREE.Color(v, v * (0.98 + 0.05 * (1 - pt)), v * 0.97) })
      }
    }
  }
  grid(spec.row, spec.step, 0)
  grid(spec.row1, spec.step1, 1)
  grid(spec.row1 * 2, spec.step1 * 1.8, 2)
  return { lods, inside, cx, hw, zFar, track }
}

/** the ground: soil in the wedge where the plants stand, rising to the canopy's top outside it, the far fields */
function groundGeo(spec: FieldSpec, L: ReturnType<typeof layout>, E: THREE.Vector3) {
  const axis = (c: number, lo: number, hi: number) => {
    const out: number[] = [c]
    for (let x = c; x > lo; ) out.unshift((x -= 0.3 + 0.045 * Math.abs(x - c)))
    for (let x = c; x < hi; ) out.push((x += 0.3 + 0.045 * Math.abs(x - c)))
    return out
  }
  const xs = axis(E.x, -175, 175)
  const zs = axis(E.z, -240, 14)
  const nx = xs.length
  const pos: number[] = []
  const col: number[] = []
  const wnd: number[] = []
  const soilUnder = spec.soil.clone().multiplyScalar(0.62)
  const neighbour = C('#5c5a34').multiplyScalar(0.55)
  const pasture = C('#3c5230').multiplyScalar(0.6)
  for (const z of zs) {
    for (const x of xs) {
      // signed distance into the planted wedge (positive inside)
      const dIn = Math.min(L.hw(z) - Math.abs(x - L.cx(z)), 2.2 - z, z - L.zFar)
      let can = 1 - sstep(-0.4, 1.6, dIn)
      if (spec.kind === 'rosette' || spec.kind === 'cover') can *= 0.85
      // beyond the hedgerow and off to the left, other fields: a stubble, a pasture
      const beyond = sstep(-136, -144, z)
      const left = sstep(-34, -42, x) * (1 - beyond)
      const c = spec.soil.clone().lerp(soilUnder, 1 - can).lerp(spec.canopy, can)
      c.lerp(neighbour, beyond).lerp(pasture, left)
      const y = can * spec.H * 0.86 * (1 - beyond) * (1 - left) + left * 0.08
      pos.push(x, y, z)
      col.push(c.r, c.g, c.b)
      wnd.push(0, 0, Math.max(can * (1 - beyond) * (1 - left), 0.35 * (beyond + left)) * 0.6)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wnd, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** a swallow at silhouette scale (it is seen against the sky): a slim body with a forked tail, scythe wings */
function swallowGeo() {
  const body = new THREE.BufferGeometry()
  body.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0.09, -0.014, 0.004, 0, 0.014, 0.004, 0, 0, 0, 0.09, 0.014, 0.004, 0, 0, -0.008, -0.05, 0, 0, 0.09, 0, -0.008, -0.05, -0.014, 0.004, 0,
        -0.014, 0.004, 0, 0.014, 0.004, 0, 0, -0.008, -0.05,
        // the forked tail
        0, 0, -0.05, -0.022, 0, -0.13, -0.004, 0, -0.07, 0, 0, -0.05, 0.022, 0, -0.13, 0.004, 0, -0.07,
      ],
      3,
    ),
  )
  const wing = new THREE.BufferGeometry()
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, -0.17, 0, -0.06, 0, 0, -0.02, 0, 0, 0.03, -0.1, 0, 0.0, -0.17, 0, -0.06], 3))
  return { body, wing }
}

/** dev only: ?canopycrop=<crop id> shows another crop's field (design review) */
const DEV_CROP = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('canopycrop') : null

export default function CanopyField({ progress, reduce, crop: given }: CanopyFieldProps) {
  const ref = useRef<HTMLDivElement>(null)
  // The parent hands over a fresh object on every render: the scene is keyed on what is in it, so a re-render of the
  // page does not tear the field down and plant it again.
  const crop = useMemo(() => {
    const c = DEV_CROP && isCropId(DEV_CROP) ? CROP_BY_ID[DEV_CROP] : given
    return { id: c.id, name: c.name, color: c.color, family: c.family }
  }, [given.id, given.name, given.color, given.family])
  // the slot can't pass the reader's motion preference, so the object asks for it itself
  const reduceMotion = useReducedMotion()
  reduce = reduce || !!reduceMotion

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // the low sun, right of the sentence and a few degrees over the horizon - behind the crop, so every blade is
    // backlit; as the camera comes down into the ears it sinks in among them
    const sun = V(0.4, 0.07, -0.91).normalize()
    const sunHd = V(sun.x, 0, sun.z).normalize()
    const spec = fieldSpec(crop, sunHd)
    const s = shot(spec)
    const L = layout(spec, s)
    const noise = noiseTexture()
    const u = fieldUniforms(noise, sun)
    u.uWindAmp.value = spec.wind
    u.uTrack.value.set(s.end.x - 0.9, 1.8, spec.tramline ? 1 : 0)
    u.uRow.value = spec.row
    let p = progress.get()
    let prevP = p
    let scrollWind = 0
    let composer: EffectComposer | null = null
    let dof: DepthOfFieldEffect | null = null
    let motes: THREE.ShaderMaterial | null = null
    let sky: THREE.Mesh | null = null
    const birds: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; ph: number; r: number; h: number; c: THREE.Vector3; sp: number }[] = []
    // a still frame (reduced motion) is posed: the wind mid-gust, the swallows mid-flight
    const STILL_T = 7.3
    const lens = (w: number, h: number) => {
      // a portrait frame (phones) widens the lens a little so the rows still read
      if (!stage) return
      stage.camera.fov = w < h ? 50 : 36
      stage.camera.updateProjectionMatrix()
    }

    const look = lookAround()
    const stage = createStage(el, {
      label: 'canopy',
      fov: 36,
      animate: !reduce,
      onResize: (w, h) => {
        if (motes) motes.uniforms.uScale.value = h * 0.02
        lens(w, h)
      },
      onFrame: ({ time, dt }) => {
        const t = reduce ? STILL_T : time + STILL_T
        // scroll speed is a gust of its own: lean with it, settle back when the reader stops
        const v = dt > 0 ? (p - prevP) / dt : 0
        prevP = p
        scrollWind += (Math.max(-0.6, Math.min(0.6, v * 2.2)) - scrollWind) * Math.min(1, dt * 2)
        u.uTime.value = t
        u.uWindAmp.value = spec.wind * (1 + Math.abs(scrollWind) * 1.6)
        const cam = camAt(s, p, reduce ? 0 : time)
        const camera = stage!.camera
        camera.position.copy(cam.pos)
        camera.up.set(0, 1, 0)
        camera.lookAt(cam.look)
        camera.rotateZ(cam.roll)
        // the reader's hand: a lean toward the pointer, smaller once the lens is down among the ears
        if (!reduce) lean(camera, look(dt), 0.05, 0.028, 0.22 - 0.12 * sstep(0.4, 0.95, p))
        sky?.position.copy(camera.position)
        // the focus pull: the far field while high, the ears in front of the lens once down among them
        if (dof) {
          const f = sstep(0.3, 0.95, p)
          dof.cocMaterial.focusDistance = 16 - f * 14.2
          dof.cocMaterial.focusRange = 9 - f * 7.6
          dof.bokehScale = 0.6 + f * 1.1
        }
        for (const b of birds) {
          const a = t * b.sp + b.ph
          const dir = Math.sign(b.sp)
          b.g.position.set(b.c.x + Math.cos(a) * b.r, b.h + Math.sin(a * 2 + b.ph) * 0.35, b.c.z + Math.sin(a) * b.r * 0.45)
          const dx = -Math.sin(a) * b.r * dir
          const dz = Math.cos(a) * b.r * 0.45 * dir
          b.g.rotation.set(0, Math.atan2(dx, dz), -Math.cos(a) * 0.5 * dir)
          // a few quick beats, then a glide
          const beat = Math.sin(t * 19 + b.ph) * (Math.sin(t * 1.3 + b.ph * 3) > -0.1 ? 0.75 : 0.08)
          b.wl.rotation.z = beat
          b.wr.rotation.z = -beat
        }
      },
    })
    if (!stage) {
      noise.dispose()
      return
    }
    const { scene, renderer, camera } = stage
    renderer.setClearColor(0x0a0b0e, 1)
    camera.near = 0.04
    camera.far = 260
    camera.updateProjectionMatrix()

    // the sky, the low sun in it
    sky = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), skyMaterial(u))
    sky.renderOrder = -1
    sky.frustumCulled = false
    scene.add(sky)

    // the light of the hour: a low warm sun behind the crop, a cool sky over it, a dark warm ground under it
    const sunLight = new THREE.DirectionalLight(new THREE.Color(1.0, 0.74, 0.48), 3.4)
    sunLight.position.copy(sun).multiplyScalar(50)
    scene.add(sunLight)
    scene.add(new THREE.HemisphereLight(new THREE.Color(0.42, 0.52, 0.72), new THREE.Color(0.16, 0.11, 0.07), 1.5))

    const plantMat = plantMaterial(u)
    const add = (geo: THREE.BufferGeometry, list: Inst[]) => {
      if (!list.length) {
        geo.dispose()
        return
      }
      const mesh = new THREE.InstancedMesh(geo, plantMat, list.length)
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m)
        mesh.setColorAt(i, it.c)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.frustumCulled = false
      scene.add(mesh)
    }
    // three variants of the full plant, two of the clump, dealt out at random
    const split = <T,>(list: T[], n: number, seed: number) => {
      const r = rng(seed)
      const out: T[][] = Array.from({ length: n }, () => [])
      for (const it of list) out[Math.floor(r() * n)].push(it)
      return out
    }
    split(L.lods[0], 3, 5).forEach((list, i) => add(spec.lod0(rng(101 + i * 7)), list))
    split([...L.lods[1], ...L.lods[2]], 2, 9).forEach((list, i) => add(spec.lod1(rng(301 + i * 11)), list))

    // poppies and cornflowers in the gaps, mostly where the light is (the right of the frame) and at the tramline
    if (spec.kind === 'cereal' || spec.kind === 'brassica' || (spec.kind === 'cover' && crop.id !== 'fallow')) {
      const r = rng(77)
      const poppies: Inst[] = []
      const corn: Inst[] = []
      for (let i = 0; i < 400 && poppies.length + corn.length < 70; i++) {
        const x = s.end.x - 0.2 + r() * 8
        const z = s.end.z + 1.2 - r() * 11
        if (!L.inside(x, z) || L.track(x)) continue
        if (Math.hypot(x - s.end.x, z - s.end.z) < 0.6) continue
        const nearTrack = L.track(x - 0.32) || L.track(x + 0.32)
        if (!nearTrack && r() > 0.35) continue
        const sc = (spec.H / 0.92) * (0.85 + 0.3 * r())
        const m = new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * TAU, 0)), V(sc, sc, sc))
        ;(r() < 0.6 ? poppies : corn).push({ m, c: new THREE.Color(1, 1, 1) })
      }
      add(wildflower('poppy', spec.H)(rng(5)), poppies)
      add(wildflower('cornflower', spec.H)(rng(6)), corn)
    }

    // the hedgerow at the far end of the field and a few trees standing in the next one
    {
      const r = rng(31)
      const trees: Inst[] = []
      const shrubs: Inst[] = []
      const at = (x: number, z: number, sc: number, sy = sc) =>
        new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * TAU, 0)), V(sc, sy, sc))
      for (let x = -170; x < 170; x += 5 + r() * 9) {
        if (r() < 0.18) continue
        const sc = 0.8 + 0.6 * r()
        trees.push({ m: at(x, -150 - r() * 16, sc, sc * (0.8 + 0.5 * r())), c: new THREE.Color().setScalar(0.8 + 0.3 * r()) })
      }
      for (let x = -170; x < 170; x += 2.2 + r() * 2.5) shrubs.push({ m: at(x, -142 - r() * 4, 0.8 + 0.7 * r()), c: new THREE.Color().setScalar(0.8 + 0.3 * r()) })
      for (let i = 0; i < 5; i++) trees.push({ m: at(-25 + r() * 90, -185 - r() * 30, 1.1 + 0.5 * r()), c: new THREE.Color().setScalar(0.9) })
      const tr = split(trees, 2, 3)
      add(treeGeo(rng(41), false), tr[0])
      add(treeGeo(rng(43), false), tr[1])
      add(treeGeo(rng(47), true), shrubs)
    }

    const ground = new THREE.Mesh(groundGeo(spec, L, s.end), groundMaterial(u))
    ground.frustumCulled = false
    scene.add(ground)

    // chaff and pollen over the crop, a few swarms of midges ahead of the lens
    {
      const r = rng(91)
      const N = 160
      const M = 3 * 22
      const pos = new Float32Array((N + M) * 3)
      const seed = new Float32Array((N + M) * 4)
      for (let i = 0; i < N; i++) {
        pos.set([s.end.x - 4 + r() * 12, spec.H * 0.8 + r() * 1.6, 1.5 - r() * 16], i * 3)
        seed.set([r(), s.end.x - 4, -14.5, 0], i * 4)
      }
      const swarms = [V(s.end.x + 0.8, spec.H + 0.35, s.end.z - 3.2), V(s.end.x + 2.6, spec.H + 0.6, s.end.z - 6.5), V(s.end.x - 0.6, spec.H + 0.5, s.end.z - 9)]
      for (let i = 0; i < M; i++) {
        const c = swarms[i % 3]
        pos.set([c.x + (r() - 0.5) * 0.25, c.y + (r() - 0.5) * 0.2, c.z + (r() - 0.5) * 0.25], (N + i) * 3)
        seed.set([r(), 0, 0, 1], (N + i) * 4)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
      motes = moteMaterial(u)
      const pts = new THREE.Points(g, motes)
      pts.frustumCulled = false
      scene.add(pts)
    }

    // two swallows skimming the crop
    {
      const { body, wing } = swallowGeo()
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.016), side: THREE.DoubleSide })
      for (let i = 0; i < 2; i++) {
        const g = new THREE.Group()
        g.add(new THREE.Mesh(body, mat))
        const wl = new THREE.Mesh(wing, mat)
        const wr = new THREE.Mesh(wing, mat)
        wr.scale.x = -1
        g.add(wl, wr)
        g.scale.setScalar(1.4)
        scene.add(g)
        birds.push({ g, wl, wr, ph: i * 2.6, r: 7 + i * 3, h: spec.H + 1.1 + i * 0.6, c: V(s.end.x + 4 + i * 3, 0, s.end.z - 14 - i * 5), sp: i ? -0.42 : 0.55 })
      }
    }

    // the lens (lib/objects/lens). Thousands of hair-thin stalks shimmer and stair-step without anti-aliasing, hence
    // thinLines. A depth of field with a focus pull, a bloom that lets the backlit tips and the sun burn, a filmic tone
    // map, a vignette and fine grain.
    // dev only: ?nofx=dof,bloom,motes switches parts off to judge each one's share of the frame
    const off_ = devLensOff()
    const built = buildLens(
      renderer,
      scene,
      camera,
      {
        focus: { focusDistance: 16, focusRange: 9, bokehScale: 0.6, resolutionScale: 0.5 },
        bloom: { luminanceThreshold: 0.95, luminanceSmoothing: 0.35, intensity: 0.55, mipmapBlur: true, radius: 0.7 },
        vignette: { offset: 0.3, darkness: 0.6 },
        grain: 0.12,
        thinLines: true,
      },
      stage.quality().lens,
      off_,
    )
    composer = built.composer
    dof = built.dof
    if (off_.includes('motes')) scene.traverse((o) => (o as THREE.Points).isPoints && (o.visible = false))
    const size = new THREE.Vector2()
    renderer.getSize(size)
    stage.setComposer(composer)
    if (size.x && size.y) {
      motes!.uniforms.uScale.value = size.y * 0.02
      lens(size.x, size.y)
    }
    // dev only: a handle for the frame-time probe
    if (import.meta.env.DEV) (window as unknown as { __canopy?: unknown }).__canopy = { renderer, composer, scene, camera, crop: crop.id, kind: spec.kind }
    // nothing is drawn until the driver has linked every program in the background (lib/objects/precompile)
    stage.hold(stage.compile(composer))

    const off = progress.on('change', (v) => {
      p = v
      stage.invalidate()
    })
    return () => {
      off()
      composer?.dispose()
      composer = null
      noise.dispose()
      stage.dispose()
      if (import.meta.env.DEV) delete (window as unknown as { __canopy?: unknown }).__canopy
    }
  }, [crop, progress, reduce])

  // a full-bleed scene: the zenith is a cool dark steel where the crossing's sentence stands
  // (drawn on the canvas the scenes share - lib/objects/world; this block only says where)
  return <div ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
}
