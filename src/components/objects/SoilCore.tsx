// H1 - the signature object: a two-metre core of this very field, drawn out of its ground in a split steel coring
// tube, a wedge cut away so its horizons, stones, roots and water face the reader (lib/objects/soilCore). Posed only by
// the crossing's scroll progress: the camera starts just over the stubble at the tube's rim, the core rises out of
// the field, turns like a museum turntable, the roots grow down to their depth, rain runs down through the soil
// within their reach, and the camera pushes in and follows the roots down to the reach mark.
//
// It stands in a place, not on a page: the harvested field it came out of (lib/objects/soilField) under a cool
// blue-hour sky, lit by one low warm lamp raking in from the left - the cut faces catch it at a grazing angle, every
// crumb, ped, clod and stalk throws a real shadow, the core's long shadow runs away across the stubble - with a cool
// fill from the right and a cool rim from behind (the page's two temperatures). The lens: 4x multisampling, a depth
// of field focused on the cut face with a focus pull as the camera moves in, a restrained bloom (the reach mark, the
// wet glints), ACES, a vignette and grain, a few motes of dust in the lamp's beam.
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { DepthOfFieldEffect, EffectComposer } from 'postprocessing'
import { buildLens } from '../../lib/objects/lens'
import { lean, lookAround } from '../../lib/objects/lookAround'
import { loadSky } from '../../lib/objects/cc0'
import { roomEnvironment } from '../../lib/objects/roomEnv'
import { createStage, type Stage } from '../../lib/objects/stage'
import { CORE_R, HOLE_R, buildSoilCore, cameraPose, type SoilCoreObject } from '../../lib/objects/soilCore'
import { buildField, type Field } from '../../lib/objects/soilField'
import { horizonColor } from '../../lib/objects/soilProfile'
import type { SoilCoreProps } from './types'

/** toward the lamp: low, from the left and a little in front */
const KEY = new THREE.Vector3(-0.86, 0.36, 0.36).normalize()
// the found sky (evening_field): turned so its sun stands behind the lamp, and how much of it the scene takes
const SKY_TURN = -2.09
const SKY_GAIN = 0.2
const FILL = new THREE.Vector3(0.75, 0.35, 0.55).normalize()
const RIM = new THREE.Vector3(0.35, 0.55, -0.76).normalize()
/** reduced motion: one still, the whole core with everything in place */
const STILL_CAM = 0.42

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
// blue-hour graphite, the horizon a little lighter, a low warm glow toward the lamp
const SKY_FRAG = /* glsl */ `
uniform vec3 uKey;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(vec3(0.03, 0.037, 0.05), vec3(0.008, 0.0095, 0.013), smoothstep(-0.02, 0.5, h));
  col = mix(col, vec3(0.012, 0.014, 0.018), smoothstep(0.0, -0.06, h));
  float g = max(dot(d, normalize(vec3(uKey.x, 0.04, uKey.z))), 0.0);
  col += vec3(0.11, 0.062, 0.028) * pow(g, 8.0) * smoothstep(-0.06, 0.06, h) * smoothstep(0.45, 0.0, h);
  gl_FragColor = vec4(col, 1.0);
}
`

// dust in the lamp's beam: a few motes, dark against the dark, lit where they stand in the light
const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform vec3 uCenter;
attribute float aSeed;
varying float vSeed;
varying float vNear;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.13 + aSeed * 31.0) * 0.14;
  p.y += mod(uTime * (0.008 + aSeed * 0.012) + aSeed * 3.0, 2.4) - 1.2;
  p.z += cos(uTime * 0.11 + aSeed * 19.0) * 0.14;
  vec4 mv = viewMatrix * vec4(p + uCenter, 1.0);
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uScale * (0.4 + aSeed * 0.6) / -mv.z, uScale * 0.35);
  vNear = smoothstep(0.9, 2.2, -mv.z);
}
`
const DUST_FRAG = /* glsl */ `
varying float vSeed;
varying float vNear;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  gl_FragColor = vec4(vec3(1.0, 0.76, 0.5) * 0.5 * exp(-r * 14.0) * (0.3 + 0.7 * vSeed) * vNear, 1.0);
}
`

export default function SoilCore({ progress, reduce, layers, rootDepthM, crop, pawMm }: SoilCoreProps) {
  const ref = useRef<HTMLDivElement>(null)
  // the slot can't pass the reader's motion preference, so the object asks for it itself
  const reduceMotion = useReducedMotion()
  reduce = reduce || !!reduceMotion
  const { name, color, family } = crop
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let object: SoilCoreObject | null = null
    let field: Field | null = null
    let composer: EffectComposer | null = null
    let dof: DepthOfFieldEffect | null = null
    let dust: THREE.ShaderMaterial | null = null
    let stage: Stage | null = null
    const focus = new THREE.Vector3()
    const toCam = new THREE.Vector3()
    const reach = Math.min(2, Math.max(0.2, Number.isFinite(rootDepthM) ? rootDepthM : 1))
    let lastOffset = NaN
    /** the core's pose the shadow maps were last drawn at */
    let shadowYaw = NaN
    let shadowRise = NaN
    const look = lookAround()
    stage = createStage(el, {
      label: 'soil',
      fov: 28,
      animate: !reduce,
      onResize: (_w, h) => {
        if (dust) dust.uniforms.uScale.value = h * 0.02
      },
      onFrame: ({ time, dt }) => {
        if (!stage) return
        const { camera } = stage
        // pinned on a desktop the scene fills the screen and the sentence stands left of the core; in the flow (phones,
        // reduced motion) the sentence is above and the core stands in the middle, played by its own place on screen
        const vh = window.innerHeight
        const flow = el.clientHeight < vh * 0.9
        let p = progress.get()
        if (flow && !reduce) {
          const r = el.getBoundingClientRect()
          p = Math.min(1, Math.max(0, ((vh - r.top) / (vh + r.height) - 0.12) / 0.7))
        }
        const pc = reduce ? STILL_CAM : p
        const cam = cameraPose(pc, reach, camera.aspect)
        if (!reduce) {
          // a hand-held breath
          cam.pos.x += Math.sin(time * 0.37) * 0.01
          cam.pos.y += Math.sin(time * 0.29 + 1.3) * 0.007
        }
        camera.position.copy(cam.pos)
        camera.lookAt(cam.look)
        // the reader's hand: the camera leans round the core with the pointer
        if (!reduce) lean(camera, look(dt), 0.02, 0.02, 0.1)
        // the core right of the sentence: shift the frame, not the scene (keeps the perspective of a centred lens)
        const shift = flow ? 0 : 0.3
        const offset = -shift * 35 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
        if (offset !== lastOffset) {
          camera.filmOffset = offset
          camera.updateProjectionMatrix()
          lastOffset = offset
        }
        if (object) {
          const pose = object.update(reduce ? STILL_CAM : p, time, camera, reduce)
          // the core turns and rises with the scroll, and its stones and its plant cast the lamp's shadows: those are
          // redrawn when it has moved (the plant's sway is in its own shader, not in the shadow's)
          if (pose.yaw !== shadowYaw || pose.rise !== shadowRise) {
            shadowYaw = pose.yaw
            shadowRise = pose.rise
            stage.shadowsDirty()
          }
        }
        // focus on the cut face just in front of the axis, where the roots are
        toCam.subVectors(cam.pos, cam.look).normalize()
        focus.copy(cam.look).addScaledVector(toCam, CORE_R * 0.45)
        if (dof) {
          dof.bokehScale = cam.bokeh
          dof.cocMaterial.focusRange = 0.9 + 0.25 * toCam.length()
        }
        if (dust) {
          dust.uniforms.uTime.value = time
          ;(dust.uniforms.uCenter.value as THREE.Vector3).set(cam.look.x - 0.3, cam.look.y + 0.1, 0.2)
        }
      },
    })
    if (!stage) return
    const { scene, renderer, camera } = stage
    renderer.setClearColor(0x0a0b0e, 1)
    // (the shared canvas's renderer casts shadows already - lib/objects/world - and redraws them when asked)
    scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.012, 0.014, 0.018), 0.075)

    scene.environment = roomEnvironment(renderer)
    scene.environmentIntensity = 0.22

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uKey: { value: KEY } }, side: THREE.BackSide, depthWrite: false, fog: false }),
    )
    sky.renderOrder = -1
    scene.add(sky)

    // the lamp: warm, low, raking; it alone casts shadows
    const key = new THREE.DirectionalLight(new THREE.Color('#ffc58a'), 3.6)
    key.target.position.set(1.4, 0.4, -0.7)
    key.position.copy(key.target.position).addScaledVector(KEY, 10)
    key.castShadow = true
    key.shadow.mapSize.setScalar(stage.quality().shadowSize)
    const sc = key.shadow.camera
    sc.left = -3.4
    sc.right = 3.4
    sc.top = 2.8
    sc.bottom = -2.8
    sc.near = 2
    sc.far = 22
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.012
    key.shadow.radius = 2.5
    scene.add(key, key.target)
    const fill = new THREE.DirectionalLight(new THREE.Color('#7f97b8'), 0.5)
    fill.position.copy(FILL).multiplyScalar(10)
    const rim = new THREE.DirectionalLight(new THREE.Color('#a3b8d4'), 1.7)
    rim.position.copy(RIM).multiplyScalar(10)
    scene.add(fill, rim, new THREE.HemisphereLight(new THREE.Color('#47566d'), new THREE.Color('#120f0c'), 0.3))

    // dust
    const N = 90
    const r = (() => {
      let s = 1234567
      return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
    })()
    const pos = new Float32Array(N * 3)
    const seed = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (r() - 0.5) * 2.6
      pos[i * 3 + 1] = (r() - 0.5) * 2.2
      pos[i * 3 + 2] = (r() - 0.5) * 2.4
      seed[i] = r()
    }
    const dustGeo = new THREE.BufferGeometry()
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    dust = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 16 }, uCenter: { value: new THREE.Vector3() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    const dustMesh = new THREE.Points(dustGeo, dust)
    dustMesh.frustumCulled = false
    scene.add(dustMesh)

    // the lens (lib/objects/lens)
    const built = buildLens(renderer, scene, camera, {
      focus: { focusDistance: 4, focusRange: 1.2, bokehScale: 1.2, resolutionScale: 0.5 },
      bloom: { luminanceThreshold: 1.0, luminanceSmoothing: 0.3, intensity: 0.5, mipmapBlur: true, radius: 0.55 },
      vignette: { offset: 0.3, darkness: 0.55 },
      grain: 0.1,
    }, stage.quality().lens)
    composer = built.composer
    dof = built.dof
    if (dof) dof.target = focus
    const size = new THREE.Vector2()
    renderer.getSize(size)
    stage.setComposer(composer)
    if (size.x && size.y) dust.uniforms.uScale.value = size.y * 0.02

    // Build the core (the profile bake yields between row bands) and the field, then have every program the first
    // frame needs linked in the background; the stage draws nothing until all of it is in. The scene is compiled
    // whole, for the buffers it is really drawn into - compiled for the canvas, as it once was, none of those
    // programs were the ones the composer's frame used, and the first frame linked them all again, on the spot.
    const t0 = performance.now()
    stage.hold(
      (async () => {
        // the core and the field it stands in, side by side: their textures are baked in a worker
        const [obj, f] = await Promise.all([
          buildSoilCore({ layers, rootDepthM, crop: { name, color, family }, pawMm }, () => cancelled),
          buildField({ seed: 17, topsoil: horizonColor(layers[0] ?? { top: 0, bottom: 30, sand: 40, silt: 40, clay: 20, soc: 8, ph: 6.5, bd: 1.4, cfvo: 3, fc: 0.3, wp: 0.15, paw: 0.15 }), holeR: HOLE_R }),
        ])
        if (!obj || cancelled || !stage) {
          obj?.dispose()
          f.dispose()
          return
        }
        const tBuilt = performance.now()
        scene.add(obj.group, f.group)
        object = obj
        field = f
        await stage.compile(composer)
        if (import.meta.env.DEV) console.info(`[soil] built ${Math.round(tBuilt - t0)} ms, compiled ${Math.round(performance.now() - tBuilt)} ms, ${obj.stats.triangles} tris, ${obj.stats.drawCalls} draws`)
      })(),
    )

    // A found evening sky (lib/objects/cc0) takes the studio's place in what the steel and the wet clods reflect,
    // once its file is in: its low sun turned to where this scene's lamp stands.
    void loadSky(renderer, 'evening_field')
      .then((env) => {
        if (cancelled || !stage) return
        scene.environment = env
        scene.environmentRotation.set(0, SKY_TURN, 0)
        scene.environmentIntensity = SKY_GAIN
        stage.invalidate()
        if (import.meta.env.DEV) (window as unknown as { __soil?: unknown }).__soil = { scene, stage }
      })
      .catch(() => {})

    const off = progress.on('change', () => stage?.invalidate())
    const onScroll = () => stage?.invalidate()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelled = true
      off()
      window.removeEventListener('scroll', onScroll)
      composer?.dispose()
      composer = null
      stage?.dispose() // disposes everything in the scene (the core's and the field's meshes too)
      stage = null
      object?.dispose()
      field?.dispose()
    }
  }, [progress, reduce, layers, rootDepthM, name, color, family, pawMm])
  // (drawn on the canvas the scenes share - lib/objects/world; this block only says where)
  return <div ref={ref} aria-hidden className="block h-full w-full" />
}
