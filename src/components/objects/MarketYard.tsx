// The market's scene: where the harvest goes. A country elevator at dusk, after rain - a row of corrugated bins in
// their stiffeners under a catwalk, the leg tower with its platforms and spouts, a dryer, the intake shed on its
// trusses over the pit, and a tipper at that pit with its body up and the crop running out of it (grain as a stream
// and a cone; roots and tubers as a tumbling pile). A second lorry stands sheeted on the weighbridge by the office;
// poles carry the line in along the road. The sky still holds the last of the day behind the bins; the yard is lit
// by its own sodium lamps, and the pools on the concrete throw them back - the page's two temperatures.
//
// Posed by the crossing's scroll: the camera comes in along the road from above the field's side, down to the pit,
// and the tipper's body rises as it arrives. A layer of the canvas the descent's scenes share (lib/objects/world).
// The parts it is built from - the tipper above all - are in ./marketYardParts.
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { DepthOfFieldEffect, EffectComposer } from 'postprocessing'
import { buildLens } from '../../lib/objects/lens'
import { CROP_BY_ID, isCropId } from '../../lib/crops'
import { lean, lookAround } from '../../lib/objects/lookAround'
import { loadSky } from '../../lib/objects/cc0'
import { roomEnvironment } from '../../lib/objects/roomEnv'
import { calm } from '../../lib/calm'
import { createStage } from '../../lib/objects/stage'
import { APRON, V, apronTextures, box, buildTruck, corrugated, cyl, lathe, lightCone, merged, rbox, rng, rod, signTexture, type Truck, type TruckMats } from './marketYardParts'
import { yardThings } from './marketYardThings'
import type { MarketYardProps } from './types'

// What the load looks like. A crop's own `color` is its colour in the charts (potato is lilac there), not the colour
// of what comes off the field - so the produce is named here, by crop where it is distinctive, else by its group.
const PRODUCE: Record<string, string> = {
  maize: '#e0b23f', silagemaize: '#e0b23f', sorghum: '#b5663c', foragesorghum: '#b5663c', rice: '#e3d7b2', rapeseed: '#3b302a', sunflower: '#4b4742', soybean: '#d8c787', pea: '#b8b468',
  potato: '#b99666', sugarbeet: '#cfc4a6', sweetpotato: '#a8553d', cassava: '#7d573a', yam: '#6a4a33', cotton: '#eceae4', linseed: '#8a5a32', buckwheat: '#7a5a3e', quinoa: '#d9cba6',
}
const PRODUCE_BY_GROUP: Record<string, string> = { 'small-grain': '#d8b468', 'c4-cereal': '#dcae4a', rice: '#e3d7b2', 'pseudo-cereal': '#c9b48a', legume: '#cdb98a', oilseed: '#5a4a3a', root: '#b0916a', fibre: '#eceae4', forage: '#9aa05e', cover: '#9aa05e' }

/** dev only: ?marketcrop=<crop id> tips another crop at the pit (design review) */
const DEV_CROP = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('marketcrop') : null

const SODIUM = new THREE.Color(1.0, 0.62, 0.3)
const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
}
`
// the found sky (industrial_sunset_puresky): how far it is turned so its sun stands in this scene's west, and how
// much of it the scene takes - it is a sunset, an hour brighter than the blue hour here
const SKY_TURN = 2.21
const SKY_GAIN = 0.18
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  // the west is behind the bins: the last ember low on that horizon, the blue hour over it
  float west = clamp(0.5 - 0.5 * d.z, 0.0, 1.0);
  vec3 zen = vec3(0.004, 0.008, 0.024);
  vec3 hor = mix(vec3(0.012, 0.02, 0.045), vec3(0.03, 0.045, 0.09), west);
  vec3 col = mix(hor, zen, 1.0 - exp(-up * 3.4));
  col += vec3(0.3, 0.1, 0.028) * pow(west, 7.0) * exp(-up * 24.0);
  col += vec3(0.05, 0.03, 0.03) * pow(west, 3.0) * exp(-up * 8.0);
  // long bars of cloud low in the west, their undersides still lit
  float ang = atan(d.x, -d.z + 1e-5);
  float band = vnoise(vec2(ang * 3.0, d.y * 46.0)) * 0.6 + vnoise(vec2(ang * 9.0 + 4.0, d.y * 110.0)) * 0.4;
  float cl = smoothstep(0.52, 0.72, band) * smoothstep(0.015, 0.06, d.y) * exp(-d.y * 7.0) * west;
  col = mix(col, mix(vec3(0.014, 0.02, 0.04), vec3(0.34, 0.12, 0.04), exp(-d.y * 16.0)), cl * 0.7);
  vec2 g = floor(d.xz / max(d.y, 0.06) * 110.0);
  col += vec3(0.5, 0.55, 0.66) * step(0.9972, hash(g)) * smoothstep(0.18, 0.55, d.y) * (0.35 + 0.65 * hash(g + 5.0)) * (1.0 - cl);
  gl_FragColor = vec4(col, 1.0);
}
`

// the crop running out of the tipper: pieces falling from the tail's lip to the pit, again and again
const POUR_VERT = /* glsl */ `
uniform float uTime;
uniform float uFlow;
uniform float uScale;
uniform vec3 uFrom;
uniform float uDrop;
attribute vec4 aSeed;
varying float vLife;
void main() {
  float t = fract(uTime * (0.55 + 0.3 * aSeed.x) + aSeed.y);
  vec3 p = uFrom;
  p.x += (aSeed.z - 0.5) * 2.1;
  // off the tail, back toward the pit
  p.z -= t * (0.7 + 0.5 * aSeed.w) + (aSeed.w - 0.5) * 0.2;
  p.y -= t * t * uDrop;
  vLife = t;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uFlow * uScale * (0.6 + 0.8 * aSeed.x) / -mv.z;
}
`
const POUR_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vLife;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(uColor * (0.75 + 0.5 * (1.0 - vLife)), 1.0);
}
`
const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec4 aSeed;
varying float vA;
void main() {
  vec3 p = position;
  float t = fract(uTime * (0.03 + 0.04 * aSeed.x) + aSeed.y);
  p.y += t * (1.5 + 2.5 * aSeed.z);
  p.x += sin(uTime * 0.2 + aSeed.w * 30.0) * 0.5 + t * 1.2;
  vA = sin(t * 3.14159) * (0.4 + 0.6 * aSeed.w);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (1.5 + 3.5 * aSeed.x) / -mv.z;
}
`
const DUST_FRAG = /* glsl */ `
uniform float uFlow;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * 0.2 * vA * (0.25 + 0.75 * uFlow) * exp(-r * 10.0), 1.0);
}
`

export default function MarketYard({ progress, reduce, crop }: MarketYardProps) {
  const ref = useRef<HTMLDivElement>(null)
  // the slot can't pass the reader's motion preference, so the object asks for it itself
  const reduceMotion = useReducedMotion()
  reduce = reduce || !!reduceMotion
  const { id, group, name } = DEV_CROP && isCropId(DEV_CROP) ? CROP_BY_ID[DEV_CROP] : crop
  const color = PRODUCE[id] ?? PRODUCE_BY_GROUP[group] ?? '#d8b468'
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let composer: EffectComposer | null = null
    let dof: DepthOfFieldEffect | null = null
    const look = lookAround()
    const kept: { dispose: () => void }[] = []
    const keep = <T extends { dispose: () => void }>(x: T) => {
      kept.push(x)
      return x
    }
    const lumps = group === 'root'
    // what comes out of the tipper, in its own colour (roots with a little of the field still on them)
    const load = new THREE.Color(color).lerp(new THREE.Color('#6a5038'), lumps ? 0.18 : 0)
    const TRUCK = V(3.1, 0, 5.2)
    const pourU = { uTime: { value: 0 }, uFlow: { value: 0 }, uScale: { value: 16 }, uFrom: { value: new THREE.Vector3() }, uDrop: { value: 1.22 }, uColor: { value: load.clone().multiplyScalar(1.5) } }
    const dustU = { uTime: pourU.uTime, uScale: { value: 16 }, uFlow: pourU.uFlow }
    const camPos = new THREE.Vector3()
    const camLook = new THREE.Vector3()
    const focus = new THREE.Vector3()
    let truck: Truck | null = null
    let heap: THREE.Object3D | null = null
    let curtain: THREE.Mesh | null = null
    /** the scroll the shadow maps were last drawn at */
    let shadowP = NaN

    const stage = createStage(el, {
      label: 'market',
      fov: 38,
      animate: !reduce,
      onResize: (w, h) => {
        pourU.uScale.value = h * (lumps ? 0.05 : 0.026)
        dustU.uScale.value = h * 0.05
        stage!.camera.fov = w < h ? 54 : 38
        stage!.camera.updateProjectionMatrix()
      },
      onFrame: ({ time, dt }) => {
        const p = reduce ? 0.86 : THREE.MathUtils.clamp(progress.get(), 0, 1)
        const camera = stage!.camera
        // in along the road from above, down beside the tipper: it ends in profile, the stream off its tail
        const k = ss(0, 1, p)
        camPos.set(15 + 1.9 * k, 16 - 12.7 * k + 2.2 * Math.sin(k * Math.PI) * (1 - k), 52 - 47 * k)
        camLook.set(-2 + 4 * k, 6.5 - 3.5 * k, -6 + 11.9 * k)
        if (!reduce) {
          camPos.x += Math.sin(time * 0.23) * 0.06
          camPos.y += Math.sin(time * 0.31 + 1.1) * 0.04
        }
        camera.position.copy(camPos)
        camera.lookAt(camLook)
        if (!reduce) lean(camera, look(dt), 0.05, 0.03, 0.5)
        // the body goes up as the camera arrives, and the load runs; the tipper and the heap cast the dusk's shadows,
        // so those are redrawn when they move - with the scroll, not with the clock
        if (p !== shadowP) {
          shadowP = p
          stage!.shadowsDirty()
        }
        truck?.tip(ss(0.3, 0.62, p))
        const flow = ss(0.42, 0.66, p)
        pourU.uFlow.value = flow
        pourU.uTime.value = reduce ? 3.3 : time
        if (curtain) {
          curtain.visible = flow > 0.02
          ;(curtain.material as THREE.MeshStandardMaterial).opacity = flow
        }
        if (heap) heap.scale.setScalar(0.35 + 0.65 * ss(0.45, 1, p))
        if (dof) {
          focus.copy(camLook)
          dof.target = focus
          dof.cocMaterial.focusRange = THREE.MathUtils.lerp(26, 5.5, k)
          dof.bokehScale = THREE.MathUtils.lerp(0.5, 1.4, k)
        }
      },
    })
    if (!stage) return
    const { scene, renderer, camera } = stage
    // The yard is built in steps (lib/calm): its painted surfaces in a worker (marketPaint), from the start; the rest
    // part by part, each part in a turn of the page's queue for heavy work, in the pauses of the scrolling. Built in
    // one go it was a quarter of a second of the page's thread, met by the reader's next scroll. The stage draws
    // nothing until all of it is in.
    let gone = false
    /** between two parts: on at once while this turn lasts, else in the next; false: the scene was taken down meanwhile */
    const onward = async () => {
      await calm.breathe()
      return !gone
    }
    const painted = Promise.all([corrugated('#8d9399', 3), corrugated('#4a5057', 7), apronTextures()]).then((ps) => {
      // (taken down before they came: nobody else will let them go)
      if (gone) for (const p of ps) for (const t of Object.values(p)) t.dispose()
      return ps
    })
    const build = async () => {
      await calm.turn()
      if (gone) return
      camera.near = 0.2
      camera.far = 400
      camera.updateProjectionMatrix()
      scene.fog = new THREE.FogExp2(new THREE.Color(0.012, 0.018, 0.032), 0.011)
      scene.environment = roomEnvironment(renderer)
      scene.environmentIntensity = 0.1

      const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }))
      sky.renderOrder = -1
      sky.frustumCulled = false
      scene.add(sky)

      if (!(await onward())) return
      // ---- light: the blue hour from above and behind (it casts the shadows), the yard's own lamps ----
      const dusk = new THREE.DirectionalLight(new THREE.Color('#8fa6d6'), 0.42)
      dusk.position.set(-18, 34, -30)
      dusk.castShadow = true
      dusk.shadow.mapSize.setScalar(stage.quality().shadowSize)
      const sc = dusk.shadow.camera
      sc.left = -36
      sc.right = 36
      sc.top = 32
      sc.bottom = -32
      sc.near = 5
      sc.far = 110
      dusk.shadow.bias = -0.0005
      dusk.shadow.normalBias = 0.05
      dusk.shadow.radius = 3
      scene.add(dusk, dusk.target, new THREE.HemisphereLight(new THREE.Color('#33415f'), new THREE.Color('#0d0b0a'), 0.2))
      const ember = new THREE.DirectionalLight(new THREE.Color('#ff9a5a'), 0.22)
      ember.position.set(10, 5, -60)
      scene.add(ember)
      // masts: [x, height, z]; then the shed's own lamps and one on the road's side behind the reader
      const masts: [number, number, number][] = [[13, 11, -3], [-9, 11, 3], [-17, 12, -15], [-20, 9, 17]]
      for (const [x, y, z] of masts) {
        const l = new THREE.PointLight(SODIUM, 520, 60, 2)
        l.position.set(x - 1.1 * Math.sign(x), y - 0.5, z)
        scene.add(l)
      }
      for (const [x, y, z, power] of [[2.9, 5.5, 2.0, 320], [15, 7, 10, 340], [-19, 2, 11.5, 130]]) {
        const l = new THREE.PointLight(SODIUM, power, 40, 2)
        l.position.set(x, y, z)
        scene.add(l)
      }

      // ---- materials ----
      const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)
      const [metal, clad, tex] = await painted
      if (gone) return
      metal.map.repeat.set(5, 2.4)
      metal.bumpMap.repeat.set(5, 2.4)
      const binMat = std({ map: keep(metal.map), bumpMap: keep(metal.bumpMap), bumpScale: 1.4, metalness: 0.75, roughness: 0.42 })
      clad.map.rotation = clad.bumpMap.rotation = Math.PI / 2
      clad.map.repeat.set(2, 1)
      clad.bumpMap.repeat.set(2, 1)
      const cladMat = std({ map: keep(clad.map), bumpMap: keep(clad.bumpMap), bumpScale: 1.2, metalness: 0.5, roughness: 0.55 })
      const steel = std({ color: '#8a9096', metalness: 0.8, roughness: 0.4 })
      const dark = std({ color: '#16181b', metalness: 0.4, roughness: 0.6 })
      const concrete = std({ color: '#6f6e69', roughness: 0.92 })
      const yellow = std({ color: '#c79a1e', roughness: 0.6 })
      const white = std({ color: '#d8d5cb', roughness: 0.85 })
      const wood = std({ color: '#4a3a2a', roughness: 0.9 })
      const orange = std({ color: '#c8521c', roughness: 0.6 })
      const lampMat = new THREE.MeshBasicMaterial({ color: SODIUM.clone().multiplyScalar(7) })
      const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.74, 0.44).multiplyScalar(2.2) })
      const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true) => {
        const mesh = new THREE.Mesh(g, m)
        mesh.castShadow = cast
        mesh.receiveShadow = receive
        scene.add(mesh)
        return mesh
      }
      /** a piece made at a radius from the y axis, turned to its place round a centre */
      const round = (g: THREE.BufferGeometry, a: number, cx: number, cz: number) => g.rotateY(a).translate(cx, 0, cz)
      const steelParts: THREE.BufferGeometry[] = []
      const darkParts: THREE.BufferGeometry[] = []
      const concreteParts: THREE.BufferGeometry[] = []
      const yellowParts: THREE.BufferGeometry[] = []
      const lampParts: THREE.BufferGeometry[] = []
      const cladParts: THREE.BufferGeometry[] = []

      if (!(await onward())) return
      // ---- the ground: rough land, the road in, and the apron - wet concrete in its slabs ----
      const land = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), std({ color: '#12130f', roughness: 0.98 }))
      land.rotation.x = -Math.PI / 2
      land.receiveShadow = true
      scene.add(land)
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(APRON.w, APRON.d), std({ map: keep(tex.map), roughnessMap: keep(tex.roughnessMap), bumpMap: keep(tex.bumpMap), bumpScale: 0.8, metalness: 0.0, roughness: 1 }))
      apron.rotation.x = -Math.PI / 2
      apron.position.set(APRON.x0 + APRON.w / 2, 0.02, APRON.z0 + APRON.d / 2)
      apron.receiveShadow = true
      scene.add(apron)
      add(box(7.6, 0.03, 110, 3.1, 0.012, 75), std({ color: '#1a1a1b', roughness: 0.7 }), false)
      const dashes: THREE.BufferGeometry[] = []
      for (let z = 23; z < 128; z += 7) dashes.push(box(0.14, 0.01, 2.6, 3.1, 0.035, z))
      for (const x of [-0.5, 6.7]) dashes.push(box(0.12, 0.01, 108, x, 0.035, 75))
      add(merged(dashes), std({ color: '#8f8a7a', roughness: 0.8 }), false)

      if (!(await onward())) return
      // ---- the bins: four in a row - shells in their stiffeners, ribbed roofs with vents, ladders in cages, fans ----
      const R = 4.3
      const BH = 13.5
      const binsX = [-15.5, -6, 3.5, 13]
      const BZ = -11
      const shells: THREE.BufferGeometry[] = []
      for (const x of binsX) {
        shells.push(new THREE.CylinderGeometry(R, R, BH, 64, 1, true).translate(x, BH / 2 + 0.5, BZ))
        shells.push(new THREE.ConeGeometry(R * 1.03, 2.5, 64, 1, true).translate(x, BH + 0.5 + 1.25, BZ))
        for (let k = 0; k < 22; k++) steelParts.push(round(box(0.12, BH - 0.2, 0.07, R + 0.05, BH / 2 + 0.5, 0), (k / 22) * Math.PI * 2, x, BZ))
        for (let k = 0; k < 28; k++) steelParts.push(round(rod(V(R * 1.03, BH + 0.56, 0), V(0.5, BH + 3.02, 0), 0.03), (k / 28) * Math.PI * 2, x, BZ))
        for (let k = 0; k < 6; k++) steelParts.push(round(rbox(0.55, 0.34, 0.45, 0.05, R * 0.62, BH + 1.72, 0), (k / 6) * Math.PI * 2 + 0.3, x, BZ))
        steelParts.push(cyl(0.5, 0.5, x, BH + 3.2, BZ, 16), new THREE.TorusGeometry(R * 1.03, 0.07, 6, 64).rotateX(Math.PI / 2).translate(x, BH + 0.5, BZ))
        for (let y = 3.4; y < BH; y += 3.3) steelParts.push(new THREE.TorusGeometry(R + 0.04, 0.05, 6, 64).rotateX(Math.PI / 2).translate(x, y, BZ))
        concreteParts.push(cyl(R + 0.3, 0.5, x, 0.25, BZ, 48))
        // the ladder up the front, in its cage hoops, a rest platform half way
        const lz = BZ + R + 0.14
        for (const dx of [-0.25, 0.25]) steelParts.push(box(0.05, BH + 0.6, 0.05, x + 1.6 + dx, BH / 2 + 0.8, lz))
        for (let y = 1; y < BH + 0.8; y += 0.4) steelParts.push(box(0.5, 0.03, 0.03, x + 1.6, y, lz))
        for (let y = 3; y < BH; y += 1.0) steelParts.push(new THREE.TorusGeometry(0.42, 0.02, 4, 14, Math.PI).rotateX(Math.PI / 2).translate(x + 1.6, y, lz + 0.02))
        for (const dx of [-0.36, 0, 0.36]) steelParts.push(box(0.03, BH - 3, 0.03, x + 1.6 + dx, BH / 2 + 2, lz + 0.42 * Math.cos(Math.asin(dx / 0.42))))
        steelParts.push(box(1.4, 0.06, 0.9, x + 1.6, 7.2, lz + 0.45), box(1.4, 0.04, 0.04, x + 1.6, 8.2, lz + 0.9))
        // the manway, the aeration fan and its duct
        steelParts.push(rbox(0.95, 1.9, 0.1, 0.04, x - 1.2, 1.5, BZ + R * 0.985), box(0.1, 0.5, 0.06, x - 0.85, 1.5, BZ + R + 0.06))
        darkParts.push(rbox(1.0, 1.0, 0.8, 0.06, x - 2.9, 0.9, BZ + R + 0.2), cyl(0.36, 0.1, x - 2.9, 0.9, BZ + R + 0.64, 16, new THREE.Euler(Math.PI / 2, 0, 0)))
        steelParts.push(cyl(0.3, 0.9, x - 2.9, 0.9, BZ + R - 0.25, 12, new THREE.Euler(Math.PI / 2, 0, 0)))
        concreteParts.push(box(1.3, 0.2, 1.1, x - 2.9, 0.3, BZ + R + 0.2))
      }
      // the catwalk over the peaks, on its frames
      const CY = BH + 3.4
      const span = binsX[3] - binsX[0] + 2
      const cx = (binsX[0] + binsX[3]) / 2
      darkParts.push(box(span, 0.1, 1.2, cx, CY, BZ))
      for (const dz of [-0.6, 0.6]) {
        steelParts.push(box(span, 0.05, 0.05, cx, CY + 1.05, BZ + dz), box(span, 0.04, 0.04, cx, CY + 0.55, BZ + dz), box(span, 0.14, 0.03, cx, CY + 0.1, BZ + dz))
        for (let x = binsX[0] - 1; x <= binsX[3] + 1; x += 1.6) steelParts.push(box(0.05, 1.05, 0.05, x, CY + 0.52, BZ + dz))
      }
      for (const x of binsX) for (const s of [-1, 1]) steelParts.push(rod(V(x + s * 1.2, BH + 2.3, BZ), V(x + s * 0.4, CY, BZ), 0.05), rod(V(x, BH + 3.0, BZ + s * 0.9), V(x, CY, BZ + s * 0.5), 0.04))
      for (let i = 0; i < 3; i++) for (const dz of [-0.6, 0.6]) steelParts.push(rod(V(binsX[i] + 2, CY - 0.05, BZ + dz), V((binsX[i] + binsX[i + 1]) / 2, CY - 0.9, BZ + dz), 0.035), rod(V(binsX[i + 1] - 2, CY - 0.05, BZ + dz), V((binsX[i] + binsX[i + 1]) / 2, CY - 0.9, BZ + dz), 0.035))
      add(merged(shells), binMat)

      if (!(await onward())) return
      // ---- the leg: a braced tower with platforms and a ladder, the head house, spouts down to the bins ----
      const LX = -1.3
      const LZ = -4.6
      const LH = 24
      for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) steelParts.push(box(0.14, LH, 0.14, LX + dx, LH / 2, LZ + dz))
      for (let y = 0; y < LH - 2; y += 3) {
        for (const s of [-1, 1]) {
          steelParts.push(rod(V(LX - 0.9, y, LZ + s * 0.9), V(LX + 0.9, y + 3, LZ + s * 0.9), 0.04), rod(V(LX + s * 0.9, y, LZ - 0.9), V(LX + s * 0.9, y + 3, LZ + 0.9), 0.04))
          steelParts.push(box(1.8, 0.07, 0.07, LX, y + 3, LZ + s * 0.9), box(0.07, 0.07, 1.8, LX + s * 0.9, y + 3, LZ))
        }
      }
      cladParts.push(box(0.7, LH - 1, 0.5, LX - 0.2, (LH - 1) / 2, LZ), box(0.4, LH - 5, 0.3, LX + 0.45, (LH - 5) / 2 + 4, LZ))
      for (const y of [9, 17, LH - 0.9]) {
        darkParts.push(box(3.0, 0.08, 3.0, LX, y, LZ))
        for (const s of [-1, 1]) {
          steelParts.push(box(3.0, 0.04, 0.04, LX, y + 1.05, LZ + s * 1.5), box(0.04, 0.04, 3.0, LX + s * 1.5, y + 1.05, LZ), box(3.0, 0.03, 0.03, LX, y + 0.55, LZ + s * 1.5), box(0.03, 0.03, 3.0, LX + s * 1.5, y + 0.55, LZ))
          for (const t of [-1.5, 0, 1.5]) steelParts.push(box(0.04, 1.05, 0.04, LX + t, y + 0.52, LZ + s * 1.5), box(0.04, 1.05, 0.04, LX + s * 1.5, y + 0.52, LZ + t))
        }
      }
      for (const dz of [-0.22, 0.22]) steelParts.push(box(0.04, LH - 1, 0.04, LX + 1.05, (LH - 1) / 2, LZ + dz))
      for (let y = 0.6; y < LH - 1; y += 0.4) steelParts.push(box(0.03, 0.03, 0.44, LX + 1.05, y, LZ))
      for (let y = 3; y < LH - 1; y += 1.1) steelParts.push(new THREE.TorusGeometry(0.4, 0.018, 4, 12, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(LX + 1.07, y, LZ))
      for (const x of [binsX[1], binsX[2]]) steelParts.push(rod(V(LX, LH - 0.6, LZ), V(x, BH + 3.3, BZ), 0.22, 10))
      steelParts.push(rod(V(LX, LH - 1.4, LZ), V(binsX[0] + 2, BH + 3.3, BZ), 0.2, 10), rod(V(LX, LH - 1.4, LZ), V(binsX[3] - 2, BH + 3.3, BZ), 0.2, 10))
      for (const x of [binsX[0] + 2, binsX[3] - 2]) steelParts.push(rod(V(LX, LH + 1.5, LZ), V((LX + x) / 2, (LH + BH) / 2 + 1.4, (LZ + BZ) / 2), 0.02))
      cladParts.push(box(3.2, 2.6, 3, LX, LH + 0.6, LZ))
      darkParts.push(box(3.6, 0.2, 3.4, LX, LH + 2, LZ), box(0.9, 1.7, 0.06, LX + 0.4, LH + 0.3, LZ + 1.52))
      steelParts.push(box(0.12, 0.12, 2.2, LX - 1.0, LH + 2.3, LZ + 1.6), box(0.6, 0.3, 0.4, LX, LH + 2.3, LZ))
      lampParts.push(box(0.16, 0.16, 0.16, LX, LH + 2.7, LZ))

      if (!(await onward())) return
      // ---- the dryer at the row's end: a louvred tower, its fan house and stack, a duct across to the leg ----
      const DX = -27
      const DZ = -7
      cladParts.push(box(4.4, 15, 4.4, DX, 7.5, DZ), box(5, 1.2, 5, DX, 15.6, DZ), box(3, 2.6, 3.4, DX + 3.6, 1.3, DZ))
      for (let y = 2; y < 14; y += 0.9) darkParts.push(box(3.6, 0.5, 0.08, DX, y, DZ + 2.22), box(0.08, 0.5, 3.6, DX + 2.22, y + 0.2, DZ))
      steelParts.push(cyl(0.55, 6, DX - 1, 19.2, DZ - 1, 14), new THREE.TorusGeometry(0.6, 0.06, 6, 16).rotateX(Math.PI / 2).translate(DX - 1, 22.2, DZ - 1), rod(V(DX + 1, 16.3, DZ), V(LX - 1, LH - 2, LZ), 0.24, 10), rod(V(DX + 2.2, 2, DZ + 1), V(binsX[0] - 2, 1.2, BZ + R + 1), 0.2, 8))
      for (const [dx, dz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) steelParts.push(box(0.16, 16.2, 0.16, DX + dx, 8.1, DZ + dz))
      // two hopper bins on legs at the other end
      for (const hx of [21.5, 26.5]) {
        add(merged([new THREE.CylinderGeometry(2.1, 2.1, 5.4, 36, 1, true).translate(hx, 7.2, -12), new THREE.ConeGeometry(2.16, 1.3, 36, 1, true).translate(hx, 10.55, -12), new THREE.ConeGeometry(2.1, 2.6, 36, 1, true).rotateX(Math.PI).translate(hx, 3.2, -12)]), binMat)
        for (let k = 0; k < 6; k++) steelParts.push(round(box(0.14, 4.6, 0.14, 2.0, 2.3, 0), (k / 6) * Math.PI * 2, hx, -12), round(rod(V(2.0, 0.4, 0), V(1.0, 4.4, 1.73), 0.03), (k / 6) * Math.PI * 2, hx, -12))
        steelParts.push(new THREE.TorusGeometry(2.14, 0.06, 6, 36).rotateX(Math.PI / 2).translate(hx, 4.55, -12), cyl(0.25, 0.9, hx, 1.6, -12, 10))
      }

      if (!(await onward())) return
      // ---- the intake: a shed on trusses over the pit, its lamps, the sign of what is being taken in ----
      for (const [x, z] of [[-1.6, -2.6], [7.4, -2.6], [-1.6, 4.4]]) steelParts.push(box(0.24, 6.2, 0.24, x, 3.1, z), box(0.5, 0.06, 0.5, x, 0.05, z))
      for (const x of [-1.6, 2.9, 7.4]) {
        // a truss across the bay: chords, posts, diagonals
        steelParts.push(box(0.12, 0.12, 7.4, x, 6.15, 0.9), box(0.12, 0.12, 7.5, x, 6.95, 0.9, new THREE.Euler(0.05, 0, 0)))
        for (let k = 0; k <= 6; k++) {
          const z = -2.6 + (k * 7) / 6
          steelParts.push(box(0.07, 0.8, 0.07, x, 6.55, z))
          if (k < 6) steelParts.push(rod(V(x, 6.2, z), V(x, 6.92, z + 7 / 6), 0.03))
        }
      }
      for (let z = -2.4; z <= 4.4; z += 1.36) steelParts.push(box(9.4, 0.1, 0.08, 2.9, 7.06 - (z - 0.9) * 0.05, z))
      steelParts.push(rod(V(7.4, 6.2, 4.4), V(7.4, 4.6, -2.4), 0.07), box(9.6, 0.14, 0.2, 2.9, 6.72, 4.75), box(0.12, 6.4, 0.12, -1.75, 3.3, 4.75))
      cladParts.push(box(9.8, 0.08, 7.9, 2.9, 7.16, 0.9, new THREE.Euler(0.05, 0, 0)))
      // lamps under the roof: shades, bulbs, and the lit air under them
      for (const z of [0.2, 3.2]) {
        darkParts.push(lathe([[0.05, 0.14], [0.12, 0.1], [0.34, -0.08], [0.36, -0.1]], 18).translate(2.9, 5.95, z), cyl(0.012, 0.45, 2.9, 6.3, z, 4))
        lampParts.push(cyl(0.16, 0.03, 2.9, 5.86, z, 14))
        const cone = lightCone(5.8, 3.4, SODIUM)
        cone.position.set(2.9, 2.95, z)
        scene.add(cone)
      }
      // the bay's sign, toward the road and toward the reader's side
      const sign = keep(signTexture(name.toUpperCase(), 'INTAKE 1  ·  WEIGHBRIDGE'))
      const signMat = new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(1.5, 1.4, 1.2) })
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.06), signMat)
      s1.position.set(2.9, 6.05, 4.86)
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.94), signMat)
      s2.position.set(7.55, 5.5, 2.5)
      s2.rotation.y = Math.PI / 2
      scene.add(s1, s2)
      darkParts.push(box(3.6, 1.2, 0.08, 2.9, 6.05, 4.8), box(0.08, 1.08, 3.2, 7.48, 5.5, 2.5))
      // the pit: a kerb, the grate's bars over the dark, bollards at its corners; the conveyor up into the leg
      concreteParts.push(box(5.4, 0.16, 0.2, 3.1, 0.08, 1.35), box(5.4, 0.16, 0.2, 3.1, 0.08, 4.65), box(0.2, 0.16, 3.5, 0.45, 0.08, 3.0), box(0.2, 0.16, 3.5, 5.75, 0.08, 3.0))
      darkParts.push(box(5.1, 0.04, 3.1, 3.1, 0.03, 3.0))
      for (let x = 0.7; x <= 5.55; x += 0.2) steelParts.push(box(0.045, 0.06, 3.1, x, 0.1, 3.0))
      for (const z of [2.0, 3.0, 4.0]) steelParts.push(box(5.1, 0.07, 0.07, 3.1, 0.09, z))
      for (const [x, z] of [[0.1, 1.0], [6.1, 1.0], [6.1, 5.0], [0.1, 5.0]]) {
        yellowParts.push(cyl(0.09, 1.05, x, 0.52, z, 12))
        darkParts.push(cyl(0.094, 0.14, x, 0.62, z, 12), cyl(0.094, 0.14, x, 0.9, z, 12))
      }
      cladParts.push(rod(V(3.1, -0.5, 1.7), V(LX - 0.2, 4.2, LZ + 0.5), 0.34, 10))
      steelParts.push(rod(V(1.4, 0, -0.2), V(1.2, 2.1, -1.3), 0.05), rod(V(0.2, 0, -1.6), V(0.4, 3.0, -2.4), 0.05))
      // the control cabinet on its post, pilot lamps on its door
      steelParts.push(rbox(0.7, 1.1, 0.32, 0.03, 6.9, 1.5, -1.2), box(0.08, 1.0, 0.08, 6.9, 0.5, -1.2))
      lampParts.push(box(0.05, 0.05, 0.02, 6.75, 1.8, -1.03))

      if (!(await onward())) return
      // ---- the weighbridge: its deck let into the apron between kerbs, a signal, the office - someone still in it ----
      darkParts.push(box(3.5, 0.1, 17, -14, 0.05, 9))
      for (const s of [-1, 1]) {
        yellowParts.push(box(0.16, 0.16, 17, -14 + s * 1.85, 0.1, 9))
        for (let z = 1; z <= 17; z += 4) steelParts.push(box(0.1, 0.02, 3.5, -14, 0.105, z))
      }
      steelParts.push(cyl(0.06, 3.2, -11.6, 1.6, 0.6, 8))
      darkParts.push(rbox(0.3, 0.7, 0.26, 0.04, -11.6, 3.0, 0.6))
      cladParts.push(box(6, 3.1, 4.2, -21, 1.55, 8))
      darkParts.push(box(6.5, 0.18, 4.8, -21, 3.2, 8), box(0.95, 2.05, 0.06, -23.2, 1.05, 10.13), box(0.4, 0.5, 0.5, -18.7, 2.7, 6.2))
      steelParts.push(box(0.05, 3.3, 0.05, -18.1, 1.65, 10.2), rod(V(-18.1, 3.3, 10.2), V(-18.1, 4.6, 10.2), 0.02))
      add(merged([box(1.6, 1.0, 0.06, -19.6, 1.9, 10.12), box(1.6, 1.0, 0.06, -21.5, 1.9, 10.12), box(0.06, 1.0, 1.6, -17.98, 1.9, 8.4)]), windowMat, false, false)
      add(merged([box(0.1, 0.1, 0.05, -11.6, 3.18, 0.74)]), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.04).multiplyScalar(3) }), false, false)

      if (!(await onward())) return
      // ---- the yard's lamps on their masts, the lit air under each ----
      for (const [x, y, z] of masts) {
        const s = -Math.sign(x)
        steelParts.push(lathe([[0.001, 0], [0.13, 0], [0.07, y], [0.001, y]], 10).translate(x, 0, z), rod(V(x, y - 0.1, z), V(x + s * 1.2, y + 0.25, z), 0.045), box(0.5, 0.3, 0.5, x, 0.15, z))
        darkParts.push(rbox(0.7, 0.14, 0.32, 0.05, x + s * 1.35, y + 0.22, z))
        lampParts.push(box(0.5, 0.04, 0.22, x + s * 1.35, y + 0.14, z))
      }

      if (!(await onward())) return
      // ---- things left about the yard: sacks on pallets, cones, a fence, the line in along the road ----
      {
        const r = rng(13)
        const sacks: THREE.BufferGeometry[] = []
        const pallets: THREE.BufferGeometry[] = []
        for (const [x, z, n] of [[-25, 2, 2], [-23.6, 2.2, 2], [-25.1, 0.6, 1], [-23.5, 0.7, 2], [22, 6, 2], [23.4, 6.2, 1]]) {
          pallets.push(box(1.2, 0.14, 1.2, x, 0.09, z))
          for (let k = 0; k < n; k++) {
            sacks.push(rbox(1.0, 0.98, 1.0, 0.16, x + (r() - 0.5) * 0.08, 0.66 + k * 0.98, z + (r() - 0.5) * 0.08, new THREE.Euler(0, (r() - 0.5) * 0.3, 0)))
            for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) sacks.push(new THREE.TorusGeometry(0.09, 0.015, 4, 8).translate(x + dx, 1.2 + k * 0.98, z + dz))
          }
        }
        add(merged(sacks), white)
        add(merged(pallets), wood)
        const cones: THREE.BufferGeometry[] = []
        for (const [x, z] of [[7.4, 7.2], [7.6, 10.4], [-1.2, 7.6], [-1.3, 10.8]]) cones.push(lathe([[0.2, 0], [0.2, 0.03], [0.14, 0.03], [0.03, 0.62], [0.001, 0.62]], 12).translate(x, 0.02, z))
        add(merged(cones), orange)
        for (let x = -30; x <= -3; x += 3) steelParts.push(cyl(0.035, 1.7, x, 0.85, 19.6, 6))
        for (const y of [0.5, 1.0, 1.55]) steelParts.push(rod(V(-30, y, 19.6), V(-3, y, 19.6), 0.012, 4))
        for (let x = 10; x <= 30; x += 3) steelParts.push(cyl(0.035, 1.7, x, 0.85, 19.6, 6))
        for (const y of [0.5, 1.0, 1.55]) steelParts.push(rod(V(10, y, 19.6), V(30, y, 19.6), 0.012, 4))
        // poles and their wires, away down the road
        const PZ = [24, 42, 60, 78, 96]
        for (const z of PZ) darkParts.push(lathe([[0.001, 0], [0.14, 0], [0.09, 9.4], [0.001, 9.4]], 8).translate(-3.2, 0, z), box(1.9, 0.1, 0.1, -3.2, 8.9, z), box(1.3, 0.08, 0.08, -3.2, 8.2, z))
        for (let i = 0; i < PZ.length - 1; i++) {
          for (const dx of [-0.85, 0, 0.85]) {
            const a = V(-3.2 + dx, 8.98, PZ[i])
            const b = V(-3.2 + dx, 8.98, PZ[i + 1])
            const mid = a.clone().lerp(b, 0.5)
            mid.y -= 0.7
            const qa = a.clone().lerp(mid, 0.5).add(V(0, -0.18, 0))
            const qb = b.clone().lerp(mid, 0.5).add(V(0, -0.18, 0))
            darkParts.push(rod(a, qa, 0.012, 3), rod(qa, mid, 0.012, 3), rod(mid, qb, 0.012, 3), rod(qb, b, 0.012, 3))
          }
        }
        darkParts.push(rod(V(-3.2, 8.2, 24), V(-18.1, 4.6, 10.2), 0.012, 3))
      }
      add(merged(steelParts), steel)
      add(merged(darkParts), dark)
      add(merged(concreteParts), concrete)
      add(merged(yellowParts), yellow)
      add(merged(cladParts), cladMat)
      add(merged(lampParts), lampMat, false, false)

      if (!(await onward())) return
      // ---- the tippers: one at the pit, its body going up; one sheeted on the weighbridge, just in ----
      const lit = (c: THREE.Color, k: number) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(k) })
      const shared = {
        dark,
        steel,
        chrome: std({ color: '#c9ced3', metalness: 1, roughness: 0.22 }),
        tyre: std({ color: '#0e0f11', roughness: 0.9 }),
        rim: std({ color: '#b9bcbf', metalness: 0.6, roughness: 0.4 }),
        glass: std({ color: '#0b0d10', metalness: 0.8, roughness: 0.08 }),
        head: lit(new THREE.Color(1, 0.86, 0.66), 2.4),
        amber: lit(new THREE.Color(1, 0.5, 0.1), 1.3),
        red: lit(new THREE.Color(1, 0.08, 0.03), 2.2),
        plate: std({ color: '#cfcfc6', roughness: 0.6 }),
      }
      const mats: TruckMats = { ...shared, paint: std({ color: '#7d2a20', metalness: 0.35, roughness: 0.4 }), body: std({ color: '#566068', metalness: 0.55, roughness: 0.5 }), tarp: std({ color: '#26302a', roughness: 0.8 }) }
      truck = buildTruck(mats, std({ color: load, roughness: 0.9 }))
      truck.group.position.copy(TRUCK)
      scene.add(truck.group)
      pourU.uFrom.value.copy(TRUCK).add(truck.lip)
      const waiting = buildTruck({ ...shared, paint: std({ color: '#2c4a5e', metalness: 0.35, roughness: 0.4 }), body: std({ color: '#4d5257', metalness: 0.55, roughness: 0.5 }), tarp: std({ color: '#31402f', roughness: 0.85 }) }, null, { tarp: true })
      waiting.group.position.set(-14, 0.1, 13.6)
      waiting.group.rotation.y = Math.PI
      scene.add(waiting.group)

      if (!(await onward())) return
      // ---- the load on the ground: a cone of grain, or a tumbled pile of roots ----
      if (lumps) {
        const r = rng(41)
        const N = 820
        const big = id === 'sugarbeet' || id === 'cassava' || id === 'yam' ? 1.5 : 1
        const pile = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std({ roughness: 0.85 }), N)
        const m = new THREE.Matrix4()
        const q = new THREE.Quaternion()
        const c = new THREE.Color()
        for (let i = 0; i < N; i++) {
          const a = r() * Math.PI * 2
          const d = Math.sqrt(r()) * 2.1
          const h = Math.max(0, 1.2 * (1 - d / 2.1)) * r()
          const s = (0.055 + 0.04 * r()) * big
          q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3))
          pile.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * d, h + s * 0.6, Math.sin(a) * d * 0.8), q, new THREE.Vector3(s * (1 + 0.5 * r()), s * 0.82, s)))
          pile.setColorAt(i, c.copy(load).multiplyScalar(0.7 + 0.6 * r()))
        }
        pile.castShadow = true
        pile.receiveShadow = true
        pile.frustumCulled = false
        heap = pile
      } else {
        const mesh = new THREE.Mesh(lathe([[0.001, 1.25], [0.5, 1.02], [1.2, 0.6], [1.9, 0.22], [2.5, 0.03], [2.7, 0]], 48), std({ color: load, roughness: 0.82 }))
        mesh.scale.z = 0.85
        mesh.castShadow = true
        mesh.receiveShadow = true
        heap = mesh
      }
      heap.position.set(3.1, 0.1, 3.3)
      scene.add(heap)

      if (!(await onward())) return
      // ---- the stream, the dust in the lamps ----
      if (!lumps) {
        // the grain runs off the tail as a body and thins as it falls; the single grains are drawn over it
        const from = pourU.uFrom.value
        const fall = new THREE.CatmullRomCurve3([0, 0.25, 0.5, 0.75, 1].map((v) => new THREE.Vector3(0, from.y - v * v * 1.22, from.z - v * 0.95)))
        curtain = new THREE.Mesh(new THREE.TubeGeometry(fall, 16, 0.13, 10).scale(8, 1, 1).translate(from.x, 0, 0), std({ color: load, roughness: 0.85, emissive: load.clone().multiplyScalar(0.18), transparent: true, opacity: 0 }))
        curtain.visible = false
        scene.add(curtain)
      }
      {
        const N = lumps ? 160 : 1100
        const seed = new Float32Array(N * 4)
        const r = rng(5)
        for (let i = 0; i < N * 4; i++) seed[i] = r()
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
        g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
        const pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: POUR_VERT, fragmentShader: POUR_FRAG, uniforms: pourU }))
        pts.frustumCulled = false
        scene.add(pts)
        const M = 320
        const dp = new Float32Array(M * 3)
        const ds = new Float32Array(M * 4)
        for (let i = 0; i < M; i++) {
          dp.set([3.1 + (r() - 0.5) * 7, 0.3 + r() * 4, 3 + (r() - 0.5) * 6], i * 3)
          ds.set([r(), r(), r(), r()], i * 4)
        }
        const dg = new THREE.BufferGeometry()
        dg.setAttribute('position', new THREE.BufferAttribute(dp, 3))
        dg.setAttribute('aSeed', new THREE.BufferAttribute(ds, 4))
        const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
        dust.frustumCulled = false
        scene.add(dust)
      }

      if (!(await onward())) return
      // ---- the far side: a windbreak as soft masses against the sky, a farm's few lights beyond ----
      {
        const r = rng(77)
        const trees: THREE.BufferGeometry[] = []
        for (let x = -220; x < 220; x += 2.5 + r() * 4) {
          const h = 6 + r() * 8
          const w = 3 + r() * 4
          for (let k = 0; k < 3; k++) trees.push(new THREE.IcosahedronGeometry(1, 1).scale(w * (0.6 + 0.5 * r()), h * (0.4 + 0.3 * r()), 2).translate(x + (r() - 0.5) * 3, h * (0.35 + 0.3 * k * r()), -128 - r() * 16))
        }
        add(merged(trees), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.004, 0.006, 0.011), fog: false }), false, false)
        const far: THREE.BufferGeometry[] = []
        for (let k = 0; k < 9; k++) far.push(box(0.5, 0.3, 0.2, -90 + r() * 200, 1.5 + r() * 5, -118 - r() * 6))
        add(merged(far), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.7, 0.4).multiplyScalar(1.6), fog: false }), false, false)
      }

      if (!(await onward())) return
      // ---- the lens (lib/objects/lens) ----
      // dev only: ?mknofx draws the scene without the blurs (a NaN pixel then shows where it is, instead of blacking the frame)
      const nofx = import.meta.env.DEV && location.search.includes('mknofx')
      const built = buildLens(
        renderer,
        scene,
        camera,
        {
          focus: { focusDistance: 30, focusRange: 26, bokehScale: 0.5, resolutionScale: 0.5 },
          bloom: { luminanceThreshold: 1.0, luminanceSmoothing: 0.3, intensity: 0.7, mipmapBlur: true, radius: 0.7 },
          vignette: { offset: 0.3, darkness: 0.6 },
          grain: 0.1,
        },
        stage.quality().lens,
        nofx ? ['dof', 'bloom'] : [],
      )
      composer = built.composer
      dof = built.dof
      if (dof) dof.target = focus
      stage.setComposer(composer)
      const size = new THREE.Vector2()
      renderer.getSize(size)
      if (size.x && size.y) {
        pourU.uScale.value = size.y * (lumps ? 0.05 : 0.026)
        dustU.uScale.value = size.y * 0.05
      }
      // nothing is drawn until the driver has linked every program in the background (lib/objects/precompile)
      stage.hold(stage.compile(composer))

      // ---- what was found, not built (lib/objects/cc0): the things left about the yard, and the sky over it ----
      // Both arrive when their files do. The things' programs are linked the same way before they are drawn (the scene
      // holds its last frame meanwhile); the sky replaces the studio the steel and the wet concrete were reflecting.
      void yardThings(wood)
        .then((things) => {
          if (gone || !composer) {
            for (const t of things) (t as THREE.Mesh).geometry?.dispose()
            return
          }
          for (const t of things) scene.add(t)
          // (the boards and the bags cast the dusk's shadows too)
          stage.shadowsDirty()
          stage.hold(stage.compile(composer))
        })
        .catch(() => {})
      void loadSky(renderer, 'industrial_sunset_puresky')
        .then((env) => {
          if (gone) return
          scene.environment = env
          // its sun, a few degrees up, turned to the west behind the bins - where this sky's own ember is
          scene.environmentRotation.set(0, SKY_TURN, 0)
          scene.environmentIntensity = SKY_GAIN
          stage.invalidate()
          // dev: the scene in reach of the console and the QA scripts (to try a turn or a gain without a rebuild)
          if (import.meta.env.DEV) (window as unknown as { __yard?: unknown }).__yard = { scene, stage }
        })
        .catch(() => {})

    }
    stage.hold(build())

    const off = progress.on('change', () => stage.invalidate())
    return () => {
      gone = true
      off()
      composer?.dispose()
      composer = null
      stage.dispose()
      for (const k of kept) k.dispose()
    }
  }, [progress, reduce, color, group, id, name])
  // (drawn on the canvas the scenes share - lib/objects/world; this block only says where)
  return <div ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
}
