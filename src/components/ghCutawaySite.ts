// THE SITE AROUND THE HOUSE - the nursery the glasshouse belongs to, built as a scale model on a landscaped base whose
// sides are sawn clean (the soil shows in section): the yard and the access road, the packing hall with its loading
// dock, the boiler house and its chimney, the heat-buffer tank, a CO₂ tank and a CHP container where the grower's
// house has them, the rainwater tank (cut open to show its level), the windbreak poplars, the hedge and the neighbours'
// field strips. Everything that changes reads the month's own values (lib/ghCutaway via the scene):
//   vapour leaves the chimney only while the boiler works, as strong as the month's heat;
//   the truck backs onto the dock and crates of the crop stand ready only in harvest months;
//   snow lies only under a freezing monthly mean, hoar frost under freezing nights, puddles and a wet sheen in wet
//   months; the verges, hedges, poplars and the neighbours' fields follow the outside temperature through the year;
//   the dock lamp and the hall's windows burn in the dark months.
// Static parts are merged per material (a handful of draw calls); the trees, crates and vapour are instanced.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BASE, BOILER, D, DOCK_X, GH, HALL, ROAD, TANK, W } from './ghCutawayDims'

export type SiteKit = { heated: boolean; co2: boolean; chp: boolean }

export type SiteState = {
  time: number
  dt: number
  snap: boolean
  light: number
  night: number
  snow: number
  wet: number
  green: number
  heat: number
  /** harvest month (the truck at the dock, crates ready), 0-1 eased */
  harvest: boolean
  level: number
  rain: number
  lamps: number
  sunCol: THREE.Color
  fruitCol: THREE.Color
}

export type Site = {
  group: THREE.Group
  update: (s: SiteState) => void
  /** world-space anchor of the gutter's downpipe and the tank's inlet */
  tankTop: THREE.Vector3
  dispose: () => void
}

/** deterministic, so the same site looks the same on every visit */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** a small tileable value-noise texture (two octaves): the one noise source the site's shaders fetch from */
export function noiseTexture(size = 128) {
  const data = new Uint8Array(size * size * 4)
  const r = rng(91)
  const grid = (n: number) => Array.from({ length: n * n }, () => r())
  const g1 = grid(8)
  const g2 = grid(16)
  const g3 = grid(32)
  const sample = (g: number[], n: number, x: number, y: number) => {
    const fx = (x / size) * n
    const fy = (y / size) * n
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const at = (a: number, b: number) => g[((b + n) % n) * n + ((a + n) % n)]
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx
    return a + (b - a) * sy
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = sample(g1, 8, x, y) * 0.55 + sample(g2, 16, x, y) * 0.3 + sample(g3, 32, x, y) * 0.15
      const w = sample(g3, 32, x + 7, y + 3)
      const i = (y * size + x) * 4
      data[i] = Math.round(v * 255)
      data[i + 1] = Math.round(w * 255)
      data[i + 2] = Math.round(sample(g2, 16, y, x) * 255)
      data[i + 3] = 255
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

type SiteUniforms = { uSnow: { value: number }; uWet: { value: number }; uGreen: { value: number }; uNoise: { value: THREE.Texture | null }; uMask: { value: THREE.Texture | null } }

/**
 * Weather on an outdoor surface: snow settles on what faces up (patchy at its edges), rain darkens everything and
 * leaves mirror-smooth puddles in the hollows. With `veg`, the base's own mask turns the grass and the neighbours' crop
 * rows with the season (a dry straw-grey in winter, green in the growing months, bare soil where a field lies fallow).
 */
export function weather(mat: THREE.MeshStandardMaterial, U: SiteUniforms, veg = false) {
  const vert = (sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vWNrm;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
  {
    mat4 wm = modelMatrix;
    #ifdef USE_INSTANCING
    wm = modelMatrix * instanceMatrix;
    #endif
    vWPos = (wm * vec4(transformed, 1.0)).xyz;
    vWNrm = mat3(wm) * objectNormal;
  }`,
    )
  }
  const head = 'uniform float uSnow;\nuniform float uWet;\nuniform sampler2D uNoise;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nfloat gSnow;\nfloat gPud;\n'
  const wx = `
  {
    float nz = texture2D(uNoise, vWPos.xz * 0.045).r;
    float up = smoothstep(0.5, 0.92, normalize(vWNrm).y);
    gSnow = up * smoothstep(0.0, 0.16, uSnow - nz * 0.6 + 0.08) * min(1.0, uSnow * 2.5);
    gPud = up * uWet * smoothstep(0.58, 0.66, nz) * (1.0 - gSnow);
    diffuseColor.rgb *= 1.0 - 0.34 * uWet * (1.0 - gSnow);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.65, 0.7), gSnow);
  }`
  const rough = `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, uWet * (1.0 - gSnow));
  roughnessFactor = mix(roughnessFactor, 0.05, gPud);
  roughnessFactor = mix(roughnessFactor, 0.8, gSnow);`
  if (veg) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U)
      vert(sh)
      sh.fragmentShader = head + 'uniform float uGreen;\nuniform sampler2D uMask;\n' + sh.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  {
    vec4 vm = texture2D(uMask, vMapUv);
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec3 dead = vec3(lum) * vec3(1.02, 0.98, 0.9) * 1.1;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(dead, diffuseColor.rgb, uGreen), vm.r);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.05, 0.046, 0.043), diffuseColor.rgb, smoothstep(0.1, 0.7, uGreen)), vm.g);
  }` + wx,
        )
        .replace('#include <roughnessmap_fragment>', rough)
    }
  } else {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U)
      vert(sh)
      sh.fragmentShader = head + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>' + wx).replace('#include <roughnessmap_fragment>', rough)
    }
  }
  mat.customProgramCacheKey = () => (veg ? 'gh-weather-veg' : 'gh-weather')
  return mat
}

// ---- painted textures -------------------------------------------------------------------------------------------------
const PX = 44 // pixels per metre on the base's ground plan
const GW = Math.round((BASE.x1 - BASE.x0) * PX)
const GD = Math.round((BASE.z1 - BASE.z0) * PX)
const gx = (x: number) => (x - BASE.x0) * PX
const gz = (z: number) => (z - BASE.z0) * PX

/** the fields behind and beside the house: strips of the neighbours' crops, rows running across */
const FIELDS: { x0: number; x1: number; z0: number; z1: number; rows: number; col: string; dir: 'x' | 'z' }[] = [
  { x0: -8.6, x1: -2.6, z0: -21.2, z1: -14.6, rows: 0.75, col: '#4c5e37', dir: 'z' },
  { x0: -8.6, x1: -2.6, z0: -14.0, z1: -8.2, rows: 0.6, col: '#5d6b3a', dir: 'x' },
  { x0: -1.6, x1: 16.6, z0: -21.2, z1: -16.4, rows: 0.6, col: '#56683a', dir: 'x' },
]

function groundTextures() {
  const r = rng(5)
  const c = document.createElement('canvas')
  c.width = GW
  c.height = GD
  const g = c.getContext('2d')!
  const m = document.createElement('canvas')
  m.width = GW
  m.height = GD
  const k = m.getContext('2d')!
  k.fillStyle = '#000'
  k.fillRect(0, 0, GW, GD)
  // grass everywhere first: a fine dappled turf
  g.fillStyle = '#4b5a3c'
  g.fillRect(0, 0, GW, GD)
  for (let i = 0; i < 26000; i++) {
    const v = r()
    g.fillStyle = v < 0.45 ? `rgba(110,128,84,${0.1 + 0.18 * r()})` : v < 0.85 ? `rgba(20,28,18,${0.12 + 0.2 * r()})` : `rgba(140,140,110,${0.1 * r()})`
    g.fillRect(r() * GW, r() * GD, 1 + r() * 3, 1 + r() * 3)
  }
  k.fillStyle = '#f00'
  k.fillRect(0, 0, GW, GD)
  const rect = (ctx: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number) => ctx.fillRect(gx(x0), gz(z0), (x1 - x0) * PX, (z1 - z0) * PX)
  // the fields: bare soil with the crop in rows
  for (const f of FIELDS) {
    g.fillStyle = '#2a2622'
    rect(g, f.x0, f.z0, f.x1, f.z1)
    k.fillStyle = '#000'
    rect(k, f.x0, f.z0, f.x1, f.z1)
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(70,64,58,${0.25 * r()})` : `rgba(0,0,0,${0.3 * r()})`
      g.fillRect(gx(f.x0) + r() * (f.x1 - f.x0) * PX, gz(f.z0) + r() * (f.z1 - f.z0) * PX, 1 + r() * 2, 1 + r() * 2)
    }
    const len = f.dir === 'x' ? f.x1 - f.x0 : f.z1 - f.z0
    const across = f.dir === 'x' ? f.z1 - f.z0 : f.x1 - f.x0
    const n = Math.floor(across / f.rows)
    for (let i = 0; i < n; i++) {
      const a = (f.dir === 'x' ? f.z0 : f.x0) + (i + 0.5) * f.rows
      for (let s = 0; s < len * 6; s++) {
        const b = (f.dir === 'x' ? f.x0 : f.z0) + (s + r()) / 6
        const w = f.rows * (0.32 + 0.14 * r())
        const col = new THREE.Color(f.col).multiplyScalar(0.75 + 0.5 * r())
        g.fillStyle = `#${col.getHexString()}`
        k.fillStyle = '#0f0'
        const [x, z] = f.dir === 'x' ? [b, a] : [a, b]
        const pw = f.dir === 'x' ? 0.24 * PX : w * PX
        const ph = f.dir === 'x' ? w * PX : 0.24 * PX
        g.beginPath()
        g.ellipse(gx(x), gz(z), pw / 1.6, ph / 1.6, r(), 0, Math.PI * 2)
        g.fill()
        k.beginPath()
        k.ellipse(gx(x), gz(z), pw / 1.6, ph / 1.6, 0, 0, Math.PI * 2)
        k.fill()
      }
    }
  }
  // a farm track between the fields
  g.fillStyle = '#4a4741'
  rect(g, -2.6, -22.6, -1.6, -7.6)
  k.fillStyle = '#000'
  rect(k, -2.6, -22.6, -1.6, -7.6)
  // gravel round the house and under the hall's walls
  const gravel = (x0: number, z0: number, x1: number, z1: number) => {
    g.fillStyle = '#5d5c58'
    rect(g, x0, z0, x1, z1)
    k.fillStyle = '#000'
    rect(k, x0, z0, x1, z1)
    const n = Math.round((x1 - x0) * (z1 - z0) * 140)
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(150,148,142,${0.3 * r()})` : `rgba(10,10,10,${0.35 * r()})`
      g.fillRect(gx(x0) + r() * (x1 - x0) * PX, gz(z0) + r() * (z1 - z0) * PX, 1 + r() * 1.5, 1 + r() * 1.5)
    }
  }
  gravel(-1.2, -D - 1.2, W + 1.4, 1.2)
  gravel(HALL.x0 - 0.8, BOILER.z0 - 1, BASE.x1 + 0.2, HALL.z1)
  // the concrete yard: slabs with saw-cut joints, tyre marks toward the dock
  const yard = (x0: number, z0: number, x1: number, z1: number) => {
    g.fillStyle = '#76756f'
    rect(g, x0, z0, x1, z1)
    k.fillStyle = '#000'
    rect(k, x0, z0, x1, z1)
    const n = Math.round((x1 - x0) * (z1 - z0) * 60)
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(160,158,150,${0.12 * r()})` : `rgba(20,20,20,${0.14 * r()})`
      g.fillRect(gx(x0) + r() * (x1 - x0) * PX, gz(z0) + r() * (z1 - z0) * PX, 2 + r() * 6, 2 + r() * 6)
    }
    g.strokeStyle = 'rgba(28,28,28,0.55)'
    g.lineWidth = 1.2
    for (let x = Math.ceil(x0 / 4) * 4; x < x1; x += 4) {
      g.beginPath()
      g.moveTo(gx(x), gz(z0))
      g.lineTo(gx(x), gz(z1))
      g.stroke()
    }
    for (let z = Math.ceil(z0 / 4) * 4; z < z1; z += 4) {
      g.beginPath()
      g.moveTo(gx(x0), gz(z))
      g.lineTo(gx(x1), gz(z))
      g.stroke()
    }
  }
  yard(W + 1.4, HALL.z1, BASE.x1 + 0.2, ROAD.z0)
  yard(-1.2, 1.2, W + 1.4, ROAD.z0)
  // tyre marks: from the road into the dock
  g.strokeStyle = 'rgba(18,18,18,0.22)'
  for (const dx of [-0.95, 0.95]) {
    g.lineWidth = 0.32 * PX
    g.beginPath()
    g.moveTo(gx(DOCK_X + dx), gz(HALL.z1 + 0.3))
    g.bezierCurveTo(gx(DOCK_X + dx), gz(2), gx(DOCK_X + dx - 1), gz(ROAD.z0 + 1.2), gx(DOCK_X + dx - 6), gz(ROAD.z0 + 1.7))
    g.stroke()
  }
  // the access road: asphalt, a worn centre line, kerbs
  g.fillStyle = '#26272a'
  rect(g, BASE.x0 - 1, ROAD.z0, BASE.x1 + 1, ROAD.z1)
  k.fillStyle = '#00f'
  rect(k, BASE.x0 - 1, ROAD.z0, BASE.x1 + 1, ROAD.z1)
  for (let i = 0; i < 16000; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(90,90,92,${0.2 * r()})` : `rgba(0,0,0,${0.3 * r()})`
    g.fillRect(r() * GW, gz(ROAD.z0) + r() * (ROAD.z1 - ROAD.z0) * PX, 1 + r() * 2, 1 + r() * 2)
  }
  g.fillStyle = 'rgba(214,208,196,0.5)'
  const mid = (ROAD.z0 + ROAD.z1) / 2
  for (let x = BASE.x0; x < BASE.x1; x += 4.5) rect(g, x, mid - 0.06, x + 2.4, mid + 0.06)
  g.fillStyle = 'rgba(214,208,196,0.35)'
  rect(g, BASE.x0 - 1, ROAD.z0 + 0.18, BASE.x1 + 1, ROAD.z0 + 0.26)
  rect(g, BASE.x0 - 1, ROAD.z1 - 0.26, BASE.x1 + 1, ROAD.z1 - 0.18)
  g.fillStyle = '#8a8983'
  rect(g, BASE.x0 - 1, ROAD.z1, BASE.x1 + 1, ROAD.z1 + 0.18)
  // shade: a soft darkening at the base's edges (ambient occlusion where the model would sit in its case)
  const albedo = new THREE.CanvasTexture(c)
  albedo.colorSpace = THREE.SRGBColorSpace
  albedo.anisotropy = 8
  const mask = new THREE.CanvasTexture(m)
  mask.anisotropy = 4
  return { albedo, mask }
}

/** the base's cut faces: the soil in horizons, topsoil to subsoil, with stones and roots */
export function strataTexture() {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 160
  const g = c.getContext('2d')!
  const r = rng(7)
  const bands: [number, string][] = [
    [0, '#151615'],
    [0.07, '#1d1b19'],
    [0.3, '#26231f'],
    [0.6, '#2f2c27'],
    [1, '#353330'],
  ]
  for (let x = 0; x < c.width; x += 2) {
    const wob = Math.sin(x * 0.011) * 3 + Math.sin(x * 0.037 + 1.3) * 1.5
    for (let b = 0; b < bands.length - 1; b++) {
      const y0 = bands[b][0] * c.height + (b ? wob : 0)
      const y1 = bands[b + 1][0] * c.height + (b + 1 < bands.length - 1 ? wob : 0)
      g.fillStyle = bands[b][1]
      g.fillRect(x, y0, 2, y1 - y0 + 1)
    }
  }
  for (let i = 0; i < 2200; i++) {
    const y = r() * c.height
    const deep = y / c.height
    g.fillStyle = r() < 0.5 ? `rgba(120,118,112,${0.1 + 0.25 * deep * r()})` : `rgba(6,6,6,${0.25 * r()})`
    g.beginPath()
    g.ellipse(r() * c.width, y, 1 + r() * 3 * (0.4 + deep), 0.8 + r() * 2, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  // roots in the topsoil
  g.strokeStyle = 'rgba(60,58,52,0.5)'
  g.lineWidth = 0.7
  for (let i = 0; i < 260; i++) {
    let x = r() * c.width
    let y = 4 + r() * 10
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 6; s++) {
      x += (r() - 0.5) * 6
      y += 2 + r() * 4
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // the turf's lip and a fine light seam: the cut
  g.fillStyle = '#2c3326'
  g.fillRect(0, 0, c.width, 3)
  g.fillStyle = 'rgba(210,205,195,0.2)'
  g.fillRect(0, 0, c.width, 1)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

/** cladding: vertical ribs of a sandwich panel (or a tank's corrugation, turned) */
function ribTexture(seed: number, base: string, period = 8) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = base
  g.fillRect(0, 0, 256, 64)
  for (let x = 0; x < 256; x += period) {
    g.fillStyle = 'rgba(255,255,255,0.09)'
    g.fillRect(x, 0, 1, 64)
    g.fillStyle = 'rgba(0,0,0,0.22)'
    g.fillRect(x + 2, 0, 2, 64)
  }
  const r = rng(seed)
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 * r()})`
    g.fillRect(r() * 256, r() * 64, 1 + r() * 8, 1 + r() * 20)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

/** a soft round puff for the vapour */
/** A flat roof: a dark membrane laid in strips, gravel on it, dust along the seams and where the water stands. */
function roofTexture() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const r = rng(71)
  g.fillStyle = '#3b3c3f'
  g.fillRect(0, 0, S, S)
  // the gravel: a fine speckle, lighter and darker
  for (let i = 0; i < 26000; i++) {
    const v = 40 + Math.floor(r() * 60)
    g.fillStyle = `rgb(${v + 4} ${v + 3} ${v} / ${0.25 + r() * 0.4})`
    g.fillRect(r() * S, r() * S, 1 + r() * 1.6, 1 + r() * 1.6)
  }
  // where the rain stands a while: darker pools, a pale tide line of dust round each
  for (let i = 0; i < 5; i++) {
    const x = r() * S
    const y = r() * S
    const rad = 40 + r() * 70
    const pool = g.createRadialGradient(x, y, 0, x, y, rad)
    pool.addColorStop(0, 'rgb(22 23 26 / 0.2)')
    pool.addColorStop(0.6, 'rgb(22 23 26 / 0.12)')
    pool.addColorStop(0.86, 'rgb(120 116 104 / 0.1)')
    pool.addColorStop(1, 'rgb(120 116 104 / 0)')
    g.fillStyle = pool
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // the membrane's seams
  g.strokeStyle = 'rgb(96 96 94 / 0.55)'
  g.lineWidth = 1.5
  for (let y = 36; y < S; y += 64) {
    g.beginPath()
    g.moveTo(0, y + (r() - 0.5) * 3)
    g.lineTo(S, y + (r() - 0.5) * 3)
    g.stroke()
  }
  // dust drifted against the parapet
  const edge = g.createLinearGradient(0, 0, S, 0)
  edge.addColorStop(0, 'rgb(118 114 104 / 0.35)')
  edge.addColorStop(0.06, 'rgb(118 114 104 / 0)')
  edge.addColorStop(0.94, 'rgb(118 114 104 / 0)')
  edge.addColorStop(1, 'rgb(118 114 104 / 0.35)')
  g.fillStyle = edge
  g.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function puffTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

const VAPOUR_VERT = /* glsl */ `
attribute vec4 aSeed; // emitter x, z, phase, size
attribute float aBase;
uniform float uTime;
uniform float uScale;
varying float vA;
varying vec2 vUv;
varying float vS;
void main() {
  vUv = uv;
  float age = fract(uTime * 0.07 + aSeed.z);
  vec3 c = vec3(aSeed.x, aBase, aSeed.y);
  c.y += age * 9.0 + age * age * 3.0;
  c.x += age * age * 6.5 + sin(age * 6.0 + aSeed.z * 20.0) * 0.4 * age;
  c.z += age * 1.5 + cos(age * 5.0 + aSeed.z * 13.0) * 0.4 * age;
  float s = (0.6 + age * 3.6) * aSeed.w;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = c + (right * (uv.x - 0.5) + up * (uv.y - 0.5)) * s;
  vA = smoothstep(0.0, 0.08, age) * pow(1.0 - age, 1.6);
  vS = aSeed.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`
const VAPOUR_FRAG = /* glsl */ `
uniform sampler2D uPuff;
uniform sampler2D uNoise;
uniform float uHeat;
uniform vec3 uCol;
varying float vA;
varying vec2 vUv;
varying float vS;
void main() {
  float puff = texture2D(uPuff, vUv).r;
  float n = texture2D(uNoise, vUv * 0.45 + vec2(vS * 3.1, vS * 1.7)).r;
  float a = puff * smoothstep(0.25, 0.75, n + puff * 0.35) * vA * uHeat * 0.42;
  gl_FragColor = vec4(uCol * a, a);
}
`

export function buildSite(kit: SiteKit, U: SiteUniforms, metal: THREE.MeshStandardMaterial): Site {
  const group = new THREE.Group()
  const owned: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(x: T) => {
    owned.push(x)
    return x
  }
  const noise = U.uNoise.value as THREE.Texture

  // ---- merged static parts: geometry collected per material, one mesh each ----
  type Bin = { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }
  const bins = new Map<string, Bin>()
  const put = (key: string, mat: THREE.Material, geo: THREE.BufferGeometry, cast = true, receive = true) => {
    let b = bins.get(key)
    if (!b) bins.set(key, (b = { mat, geos: [], cast, receive }))
    const g = geo.index ? geo.toNonIndexed() : geo
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2))
    b.geos.push(g)
  }
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d)
    if (ry) g.rotateY(ry)
    g.translate(x, y, z)
    return g
  }
  /** a box whose uv runs in metres (for repeating textures) */
  const boxM = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d)
    const uv = g.attributes.uv as THREE.BufferAttribute
    const n = g.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i))
      const ay = Math.abs(n.getY(i))
      const along = ax > 0.5 ? d : ay > 0.5 ? w : w
      const up = ay > 0.5 ? d : h
      uv.setXY(i, uv.getX(i) * along, uv.getY(i) * up)
    }
    g.translate(x, y, z)
    return g
  }
  const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 24, open = false) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open)
    g.translate(x, y + h / 2, z)
    return g
  }

  // ---- materials ----
  const outdoor = (p: THREE.MeshStandardMaterialParameters) => weather(new THREE.MeshStandardMaterial(p), U)
  const { albedo, mask } = groundTextures()
  keep(albedo)
  keep(mask)
  U.uMask.value = mask
  const strata = keep(strataTexture())
  const groundMat = weather(new THREE.MeshStandardMaterial({ map: albedo, roughness: 0.94, metalness: 0 }), U, true)
  const faceMat = new THREE.MeshStandardMaterial({ map: strata, roughness: 0.96 })
  const cladTex = keep(ribTexture(3, '#5b5e62'))
  cladTex.repeat.set(1 / 6, 1 / 6)
  const cladMat = outdoor({ map: cladTex, roughness: 0.62, metalness: 0.35 })
  const darkClad = keep(ribTexture(4, '#34373b', 6))
  darkClad.repeat.set(1 / 8, 1 / 8)
  const darkMat = outdoor({ map: darkClad, roughness: 0.55, metalness: 0.4 })
  // (a flat mid-grey lid was the one large surface on the model with nothing on it)
  const roofMat = outdoor({ map: keep(roofTexture()), roughness: 0.93, metalness: 0.04 })
  const concrete = outdoor({ color: '#8b8a84', roughness: 0.88 })
  const blackMat = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.75 })
  const rubber = new THREE.MeshStandardMaterial({ color: '#111213', roughness: 0.9 })
  const tankTex = keep(ribTexture(9, '#9b9fa3', 5))
  tankTex.repeat.set(4, 1)
  tankTex.rotation = Math.PI / 2
  const corrugated = outdoor({ map: tankTex, roughness: 0.42, metalness: 0.75, side: THREE.DoubleSide })
  const silverTex = keep(ribTexture(10, '#b9bcbf', 16))
  silverTex.repeat.set(5, 1)
  const silver = outdoor({ map: silverTex, roughness: 0.32, metalness: 0.85 })
  const white = outdoor({ color: '#c9cbcc', roughness: 0.4, metalness: 0.1 })
  const windowMat = new THREE.MeshStandardMaterial({ color: '#0d0f12', roughness: 0.15, metalness: 0.6, emissive: new THREE.Color(1.0, 0.62, 0.3), emissiveIntensity: 0 })
  const doorTex = keep(ribTexture(12, '#8a8b8a', 20))
  doorTex.rotation = Math.PI / 2
  doorTex.repeat.set(1, 1.4)
  const doorMat = outdoor({ map: doorTex, roughness: 0.55, metalness: 0.3 })
  const truckWhite = new THREE.MeshStandardMaterial({ color: '#4a555f', roughness: 0.55, metalness: 0.1 })
  const truckGlass = new THREE.MeshStandardMaterial({ color: '#0c0e10', roughness: 0.06, metalness: 0.8 })
  const strawMat = new THREE.MeshStandardMaterial({ color: '#9c8656', roughness: 0.55, metalness: 0.15 })

  // ---- the base: a block of ground, its four sides cut ----
  {
    const w = BASE.x1 - BASE.x0
    const d = BASE.z1 - BASE.z0
    const top = new THREE.PlaneGeometry(w, d, 1, 1)
    top.rotateX(-Math.PI / 2)
    top.translate((BASE.x0 + BASE.x1) / 2, 0, (BASE.z0 + BASE.z1) / 2)
    const topMesh = new THREE.Mesh(top, groundMat)
    topMesh.receiveShadow = true
    group.add(topMesh)
    // the sides: the strata texture repeats along each face
    const side = (len: number, x: number, z: number, ry: number) => {
      const g = new THREE.PlaneGeometry(len, BASE.depth)
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 48))
      g.rotateY(ry)
      g.translate(x, -BASE.depth / 2, z)
      return g
    }
    const faces = mergeGeometries([
      side(w, (BASE.x0 + BASE.x1) / 2, BASE.z1, 0),
      side(w, (BASE.x0 + BASE.x1) / 2, BASE.z0, Math.PI),
      side(d, BASE.x1, (BASE.z0 + BASE.z1) / 2, Math.PI / 2),
      side(d, BASE.x0, (BASE.z0 + BASE.z1) / 2, -Math.PI / 2),
    ])!
    group.add(new THREE.Mesh(faces, faceMat))
    const under = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x060607 }))
    under.rotation.x = Math.PI / 2
    under.position.set((BASE.x0 + BASE.x1) / 2, -BASE.depth, (BASE.z0 + BASE.z1) / 2)
    group.add(under)
    // a plinth line under the block: the model's case
    put('black', blackMat, box(w + 0.3, 0.12, d + 0.3, (BASE.x0 + BASE.x1) / 2, -BASE.depth - 0.06, (BASE.z0 + BASE.z1) / 2), false, false)
    // kerbs along the road
    for (const z of [ROAD.z0 - 0.08, ROAD.z1 + 0.08]) put('concrete', concrete, box(w, 0.12, 0.16, (BASE.x0 + BASE.x1) / 2, 0.06, z), false)
    // the house's concrete footing (a kerb round the glass)
    put('concrete', concrete, box(W + 0.3, 0.22, 0.3, W / 2, 0.11, -D - 0.05), false)
    put('concrete', concrete, box(0.3, 0.22, D, -0.05, 0.11, -D / 2), false)
    put('concrete', concrete, box(0.3, 0.22, D, W + 0.05, 0.11, -D / 2), false)
  }

  // ---- the packing hall, the dock ----
  {
    const { x0, x1, z0, z1, h } = HALL
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    // a plinth of concrete, the clad walls, a flat roof behind a parapet with its coping
    put('concrete', concrete, box(x1 - x0 + 0.1, 0.5, z1 - z0 + 0.1, cx, 0.25, cz))
    put('clad', cladMat, boxM(x1 - x0, h - 0.5, z1 - z0, cx, 0.5 + (h - 0.5) / 2, cz))
    put('roof', roofMat, box(x1 - x0 - 0.3, 0.1, z1 - z0 - 0.3, cx, h + 0.05, cz))
    for (const [w, d, x, z] of [[x1 - x0 + 0.12, 0.14, cx, z1], [x1 - x0 + 0.12, 0.14, cx, z0], [0.14, z1 - z0, x0, cz], [0.14, z1 - z0, x1, cz]] as [number, number, number, number][])
      put('metal', metal, box(w, 0.45, d, x, h + 0.2, z))
    // a row of rooflights over the packing floor (they glow with the windows in the dark months), each on its upstand
    for (let i = 0; i < 4; i++) {
      const sx = x0 + 1.9 + i * 2.0
      put('metal', metal, box(1.34, 0.2, 2.5, sx, h + 0.2, cz + 1.0))
      put('window', windowMat, box(1.14, 0.08, 2.3, sx, h + 0.34, cz + 1.0), false)
    }
    // roof plant: air handlers and a run of ducting
    put('metal', metal, new RoundedBoxGeometry(1.6, 0.8, 1.1, 2, 0.06).translate(x1 - 2, h + 0.5, z0 + 2))
    put('metal', metal, new RoundedBoxGeometry(1.2, 0.6, 0.9, 2, 0.05).translate(x1 - 2, h + 0.4, z0 + 3.8))
    put('black', blackMat, box(4.2, 0.35, 0.35, x1 - 4.4, h + 0.3, z0 + 2))
    // a band of windows (the offices over the packing floor), lit in the dark months
    put('window', windowMat, box(4.6, 0.8, 0.06, x0 + 2.9, h - 1.25, z1 + 0.02), false)
    put('window', windowMat, box(0.06, 0.8, z1 - z0 - 2.4, x1 + 0.02, h - 1.25, cz), false)
    for (let i = 0; i < 5; i++) put('metal', metal, box(0.05, 0.82, 0.08, x0 + 0.7 + i * 1.1, h - 1.25, z1 + 0.05), false)
    // the dock: a sectional door in its black shelter, a canopy, bumpers, the dock apron
    put('door', doorMat, box(2.8, 2.9, 0.08, DOCK_X, 1.2 + 1.45, z1 + 0.04), false)
    put('black', blackMat, box(3.3, 3.5, 0.45, DOCK_X, 1.2 + 1.75, z1 + 0.25))
    for (const s of [-1.25, 1.25]) put('black', blackMat, box(0.25, 0.3, 0.3, DOCK_X + s, 1.05, z1 + 0.2))
    put('roof', roofMat, box(4.4, 0.14, 1.9, DOCK_X, 4.15, z1 + 0.95))
    put('concrete', concrete, box(3.6, 1.2, 0.8, DOCK_X, 0.6, z1 + 0.1))
    put('black', blackMat, box(0.9, 2.1, 0.06, x1 - 0.9, 1.05, z1 + 0.04), false)
    // the glazed link to the house: the corridor along which the crop comes in
    put('glasslink', new THREE.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.1, metalness: 0.7, transparent: true, opacity: 0.55 }), box(x0 - W - 0.15, 2.9, 3.4, (W + x0) / 2, 1.45, -10.6), false)
    put('roof', roofMat, box(x0 - W + 0.1, 0.14, 3.7, (W + x0) / 2, 2.97, -10.6))
  }

  // ---- the boiler house, its chimney and the heat-buffer tank (behind the hall); the CO₂ tank; the CHP ----
  const plumes: THREE.Vector3[] = []
  if (kit.heated) {
    const { x0, x1, z0, z1, h, chx, chz, chH } = BOILER
    put('concrete', concrete, box(x1 - x0 + 0.1, 0.4, z1 - z0 + 0.1, (x0 + x1) / 2, 0.2, (z0 + z1) / 2))
    put('dark', darkMat, boxM(x1 - x0, h - 0.4, z1 - z0, (x0 + x1) / 2, 0.4 + (h - 0.4) / 2, (z0 + z1) / 2))
    put('roof', roofMat, box(x1 - x0 + 0.25, 0.22, z1 - z0 + 0.25, (x0 + x1) / 2, h + 0.11, (z0 + z1) / 2))
    put('door', doorMat, box(2.2, 2.8, 0.06, x0 + 1.5, 1.4, z1 + 0.03), false)
    put('window', windowMat, box(0.05, 0.5, 2.6, x1 + 0.03, h - 0.9, (z0 + z1) / 2), false)
    // the flue: stainless and banded
    put('silver', silver, cyl(0.34, 0.4, chH, chx, 0, chz, 20))
    put('metal', metal, cyl(0.42, 0.42, 0.22, chx, chH - 0.22, chz, 20))
    for (const y of [4.6, 8, 11]) put('metal', metal, cyl(0.42, 0.42, 0.1, chx, y, chz, 20))
    plumes.push(new THREE.Vector3(chx, chH + 0.1, chz))
    // the heat buffer: a tall insulated tank of hot water
    const bx = 25.2
    const bz = -18.6
    put('silver', silver, cyl(1.5, 1.5, 7.4, bx, 0, bz, 36))
    const cap = new THREE.SphereGeometry(1.5, 36, 8, 0, Math.PI * 2, 0, Math.PI / 6)
    cap.scale(1, 1.3, 1)
    cap.translate(bx, 7.4 - 1.5 * 1.3 * Math.cos(Math.PI / 6), bz)
    put('silver', silver, cap)
    for (const y of [0.2, 2.6, 5.0]) put('metal', metal, cyl(1.54, 1.54, 0.09, bx, y, bz, 36))
    put('concrete', concrete, cyl(1.8, 1.9, 0.3, bx, 0, bz, 36))
    // the pipe bridge: boiler house → buffer, and on to the hall
    const pipe = (a: THREE.Vector3, b: THREE.Vector3, r = 0.1) => {
      const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10, 1, true)
      g.translate(0, a.distanceTo(b) / 2, 0)
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
      g.translate(a.x, a.y, a.z)
      put('metal', metal, g)
    }
    for (const dz of [0, 0.3]) {
      pipe(new THREE.Vector3(x0 + 0.6, h - 0.6, z1 - 0.2 + dz), new THREE.Vector3(x0 + 0.6, h - 0.6, HALL.z0 + 0.6 + dz))
      pipe(new THREE.Vector3(x1, 2.4 + dz, (z0 + z1) / 2), new THREE.Vector3(bx - 1.5, 2.4 + dz, (z0 + z1) / 2))
    }
  }
  if (kit.co2) {
    // liquid CO₂ for the crop: a white vessel on legs, its vaporiser fins beside it
    const cx = 27.8
    const cz = -12.4
    put('white', white, cyl(0.5, 0.5, 3.4, cx, 0.6, cz, 24))
    const dome = new THREE.SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    dome.translate(cx, 4.0, cz)
    put('white', white, dome)
    for (const [dx, dz] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) put('metal', metal, box(0.06, 0.65, 0.06, cx + dx, 0.32, cz + dz))
    for (let i = 0; i < 6; i++) put('metal', metal, box(0.05, 1.9, 0.05, cx - 0.2 + (i % 3) * 0.14, 0.95, cz + 1.0 + Math.floor(i / 3) * 0.14))
    put('concrete', concrete, box(1.6, 0.12, 2.6, cx, 0.06, cz + 0.5))
  }
  if (kit.chp) {
    // the CHP: a gas engine in a container, its exhaust stack and coolers on the roof
    put('concrete', concrete, box(2.8, 0.15, 6.4, 27.8, 0.075, -6.4))
    put('dark', darkMat, boxM(2.4, 2.6, 6.0, 27.8, 0.15 + 1.3, -6.4))
    put('metal', metal, box(2.1, 0.45, 2.2, 27.8, 2.98, -5.0))
    put('silver', silver, cyl(0.2, 0.2, 2.6, 27.8, 2.75, -8.6, 14))
    if (kit.heated) plumes.push(new THREE.Vector3(27.8, 5.4, -8.6))
  }

  // ---- the rainwater tank: corrugated steel, cut open toward the viewer to show the water inside ----
  const OPEN_C = Math.atan2(0.55, 1) // the opening faces the camera
  const OPEN = 1.9
  const tStart = OPEN_C + OPEN / 2
  const tLen = Math.PI * 2 - OPEN
  const tankWater = new THREE.Group()
  {
    const { x, z, r, h } = TANK
    const shell = new THREE.CylinderGeometry(r, r, h, 48, 1, true, tStart, tLen)
    shell.translate(x, h / 2 + 0.25, z)
    put('corr', corrugated, shell)
    const rim = new THREE.TorusGeometry(r, 0.045, 6, 48, tLen)
    rim.rotateX(Math.PI / 2)
    rim.rotateY(tStart + tLen - Math.PI / 2)
    rim.translate(x, h + 0.25, z)
    put('metal', metal, rim)
    // the cut edges: the wall's thickness, drawn as thin bright posts
    for (const a of [tStart, tStart + tLen]) put('metal', metal, box(0.07, h, 0.07, x + r * Math.sin(a), 0.25 + h / 2, z + r * Math.cos(a)))
    put('concrete', concrete, cyl(r + 0.25, r + 0.3, 0.25, x, 0, z, 48))
    // the water: a sector of the same cylinder, a flat face along each cut, the surface on top; the group scales to
    // the month's level
    const wr = r - 0.05
    const water = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.03, 0.075, 0.085), roughness: 0.12, metalness: 0, emissive: new THREE.Color('#7fb0b6'), emissiveIntensity: 0.06 })
    const body = new THREE.CylinderGeometry(wr, wr, 1, 48, 1, true, tStart, tLen)
    body.translate(0, 0.5, 0)
    const cut = (a: number) => {
      const g = new THREE.PlaneGeometry(wr, 1)
      g.translate(wr / 2, 0.5, 0)
      g.rotateY(a - Math.PI / 2)
      return g
    }
    const faces = mergeGeometries([body.toNonIndexed(), cut(tStart).toNonIndexed(), cut(tStart + tLen).toNonIndexed()])!
    const sectionMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.12, 0.135), roughness: 0.3, emissive: new THREE.Color('#7fb0b6'), emissiveIntensity: 0.12, side: THREE.DoubleSide })
    const wbody = new THREE.Mesh(faces, sectionMat)
    tankWater.add(wbody)
    const top = new THREE.CircleGeometry(wr, 48, tStart - Math.PI / 2, tLen)
    top.rotateX(-Math.PI / 2)
    top.translate(0, 1, 0)
    const surf = new THREE.Mesh(top, water)
    surf.name = 'surface'
    tankWater.add(surf)
    tankWater.position.set(x, 0.3, z)
    group.add(tankWater)
  }
  const tankTop = new THREE.Vector3(TANK.x, TANK.h + 0.25, TANK.z)

  // ---- the downpipe from the house's gutter, along the wall, to the tank ----
  {
    const run = [new THREE.Vector3(W + 0.12, GH, TANK.z), new THREE.Vector3(W + 0.12, TANK.h + 0.9, TANK.z), new THREE.Vector3(TANK.x - 0.2, TANK.h + 0.9, TANK.z), new THREE.Vector3(TANK.x - 0.2, TANK.h + 0.05, TANK.z)]
    for (let i = 0; i < run.length - 1; i++) {
      const a = run[i]
      const b = run[i + 1]
      const len = a.distanceTo(b)
      const g = new THREE.CylinderGeometry(0.075, 0.075, len, 12, 1, true)
      g.translate(0, len / 2, 0)
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
      g.translate(a.x, a.y, a.z)
      put('metal', metal, g)
    }
    for (const p of run.slice(1, 3)) {
      const s = new THREE.SphereGeometry(0.09, 10, 8)
      s.translate(p.x, p.y, p.z)
      put('metal', metal, s)
    }
  }

  // ---- a forklift by the dock, a parked pallet stack, a skip ----
  {
    const fx = 25.4
    const fz = -2.4
    put('straw', strawMat, new RoundedBoxGeometry(1.1, 1.0, 2.0, 2, 0.12).translate(fx, 0.75, fz))
    put('black', blackMat, box(1.0, 0.08, 1.0, fx, 2.2, fz + 0.3))
    for (const dx of [-0.42, 0.42]) {
      put('black', blackMat, box(0.06, 2.2, 0.06, fx + dx, 1.1, fz + 0.75))
      put('black', blackMat, box(0.06, 2.0, 0.06, fx + dx, 1.25, fz - 0.6))
      put('metal', metal, box(0.1, 2.6, 0.08, fx + dx * 0.8, 1.3, fz - 1.05))
      put('metal', metal, box(0.12, 0.05, 1.1, fx + dx * 0.6, 0.12, fz - 1.6))
      for (const dz of [-0.6, 0.6]) {
        const wh = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 14)
        wh.rotateZ(Math.PI / 2)
        wh.translate(fx + dx * 1.25, 0.26, fz + dz)
        put('rubber', rubber, wh)
      }
    }
    put('black', blackMat, box(0.9, 0.5, 0.4, fx, 0.95, fz + 1.1))
    // the empty-pallet stack by the hall's side door
    for (let i = 0; i < 9; i++) put('pallet', new THREE.MeshStandardMaterial({ color: '#6d6458', roughness: 0.9 }), box(1.2, 0.14, 0.8, HALL.x0 + 4.4 + (i > 4 ? 1.35 : 0), 0.07 + (i % 5) * 0.145, HALL.z1 + 1.0))
  }

  // ---- lamp posts along the yard (their heads burn in the dark months) ----
  for (const [x, z] of [[20.2, 2.3], [27.6, 2.3], [5.5, 2.3]] as [number, number][]) {
    put('metal', metal, cyl(0.05, 0.07, 5.0, x, 0, z, 8))
    put('metal', metal, box(0.8, 0.07, 0.14, x - 0.3, 5.0, z))
    put('window', windowMat, box(0.38, 0.04, 0.12, x - 0.55, 4.96, z), false)
  }

  // ---- the merge ----
  for (const b of bins.values()) {
    const g = mergeGeometries(b.geos, false)
    if (!g) continue
    const mesh = new THREE.Mesh(g, b.mat)
    mesh.castShadow = b.cast
    mesh.receiveShadow = b.receive
    group.add(mesh)
  }

  // ---- the trees: a windbreak of Lombardy poplars along the back, a clipped hedge, a few shrubs ----
  // A crown is built the way a model-maker builds one: a few hundred small faceted tufts on the skin of the tree's
  // shape (a poplar's spindle - narrow to a point at the top, rounded at the bottom), each catching the light on its
  // own, darker toward the trunk and the ground. One smooth, displaced ball per tree read as a cone of plasticine.
  const treeMat = weather(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: true, flatShading: true }), U)
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#2a2925', roughness: 0.9 })
  const crownGeo = (seed: number) => {
    const r = rng(Math.floor(seed * 1000) + 7)
    const parts: THREE.BufferGeometry[] = []
    const N = 190
    for (let i = 0; i < N; i++) {
      const t = 0.02 + 0.96 * r()
      const a = r() * Math.PI * 2
      const taper = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.92)), 0.8)
      // most on the skin, some inside: no daylight through the crown
      const depth = r() < 0.72 ? 0.8 + 0.28 * r() : 0.3 + 0.5 * r()
      const rad = taper * depth
      const s = (0.17 + 0.15 * r()) * (0.5 + 0.6 * taper)
      const g = new THREE.IcosahedronGeometry(1, r() < 0.6 ? 0 : 1)
      g.deleteAttribute('uv')
      g.scale(s * (0.8 + 0.5 * r()), s * (0.34 + 0.2 * r()), s * (0.8 + 0.5 * r()))
      g.rotateZ((r() - 0.5) * 0.9)
      g.rotateY(r() * Math.PI * 2)
      g.translate(Math.cos(a) * rad, t * 2 - 1, Math.sin(a) * rad)
      const shade = (0.5 + 0.5 * depth) * (0.68 + 0.36 * t) * (0.86 + 0.28 * r())
      const n = g.attributes.position.count
      const col = new Float32Array(n * 3)
      // a touch of yellow in the lit tufts, of blue in the deep ones
      for (let k = 0; k < n; k++) col.set([shade * (0.96 + 0.1 * depth), shade, shade * (1.08 - 0.2 * depth)], k * 3)
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      parts.push(g)
    }
    const m = mergeGeometries(parts)!
    for (const g of parts) g.dispose()
    return m
  }
  type Tree = { x: number; z: number; h: number; w: number; kind: 'poplar' | 'hedge' | 'shrub' }
  const trees: Tree[] = []
  {
    const r = rng(17)
    for (let x = BASE.x0 + 1.0; x < 16.5; x += 2.5 + r() * 0.6) trees.push({ x, z: BASE.z0 + 0.9 + (r() - 0.5) * 0.4, h: 9 + r() * 2.6, w: 1.1 + r() * 0.35, kind: 'poplar' })
    for (let z = BASE.z0 + 2.2; z < 1.6; z += 1.1 + r() * 0.2) trees.push({ x: BASE.x0 + 0.7, z, h: 1.4 + r() * 0.2, w: 0.8 + r() * 0.12, kind: 'hedge' })
    for (const [x, z] of [[-3.4, 1.7], [-6.0, 1.9], [-8.4, 1.5], [BASE.x1 - 1.0, -16.4], [BASE.x1 - 1.1, -21.2], [17.4, -18.6], [BASE.x1 - 1.0, 0.9]] as [number, number][]) trees.push({ x, z, h: 1.3 + r() * 1.1, w: 1.0 + r() * 0.6, kind: 'shrub' })
  }
  const crowns = new THREE.InstancedMesh(crownGeo(1.3), treeMat, trees.length)
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length)
  const treeBase = trees.map((t) => {
    const r = rng(Math.floor(t.x * 100 + t.z * 7))
    return { yaw: r() * Math.PI * 2, tint: 0.8 + r() * 0.35, hue: (r() - 0.5) * 0.06 }
  })
  crowns.castShadow = true
  crowns.receiveShadow = true
  trunks.castShadow = true
  group.add(crowns, trunks)
  const placeTrees = (green: number) => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const col = new THREE.Color()
    const summer = new THREE.Color('#3f5233')
    const autumn = new THREE.Color('#6f6a45')
    const bare = new THREE.Color('#3a3934')
    trees.forEach((t, i) => {
      const b = treeBase[i]
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw)
      // poplars drop their leaves: in winter a thin grey spindle of twigs; the hedge and shrubs keep a thinner coat
      const leafy = t.kind === 'poplar' ? green : 0.45 + 0.55 * green
      const crownH = t.kind === 'poplar' ? t.h * 0.82 : t.h
      const crownW = t.w * (t.kind === 'poplar' ? 0.55 + 0.45 * leafy : 0.85 + 0.15 * leafy)
      const y0 = t.kind === 'poplar' ? t.h * 0.18 : 0
      pos.set(t.x, y0 + crownH / 2, t.z)
      scl.set(crownW, crownH / 2, crownW * (t.kind === 'hedge' ? 1.15 : 1))
      crowns.setMatrixAt(i, m.compose(pos, q, scl))
      trunks.setMatrixAt(i, m.compose(pos.set(t.x, 0, t.z), q, scl.set(1, t.kind === 'poplar' ? t.h * 0.5 : 0.001, 1)))
      col.copy(bare).lerp(autumn, Math.min(1, leafy * 1.6)).lerp(summer, Math.max(0, leafy * 1.4 - 0.4))
      if (t.kind !== 'poplar') col.lerp(new THREE.Color('#344530'), 0.6)
      col.offsetHSL(b.hue, 0, 0).multiplyScalar(b.tint)
      crowns.setColorAt(i, col)
    })
    crowns.instanceMatrix.needsUpdate = true
    trunks.instanceMatrix.needsUpdate = true
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true
  }

  // ---- crates of the crop by the dock (harvest months) ----
  const CR = { nx: 2, nz: 2, ny: 6, stacks: [[DOCK_X + 2.4, HALL.z1 + 0.9], [DOCK_X + 3.75, HALL.z1 + 0.9], [DOCK_X + 2.4, HALL.z1 + 2.1], [DOCK_X - 2.5, HALL.z1 + 0.9]] as [number, number][] }
  const nCr = CR.stacks.length * CR.nx * CR.nz * CR.ny
  const crateMat = new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.6 })
  const crates = new THREE.InstancedMesh(new RoundedBoxGeometry(0.58, 0.26, 0.38, 1, 0.03), crateMat, nCr)
  const produceMat = new THREE.MeshStandardMaterial({ roughness: 0.5 })
  const produce = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.04, 0.32), produceMat, nCr)
  const pallets = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.14, 0.8), new THREE.MeshStandardMaterial({ color: '#6d6458', roughness: 0.9 }), CR.stacks.length)
  crates.castShadow = true
  pallets.castShadow = true
  group.add(crates, produce, pallets)
  let lastCrates = -1
  const placeCrates = (amount: number) => {
    const m = new THREE.Matrix4()
    const show = Math.round(amount * nCr)
    if (show === lastCrates) return
    lastCrates = show
    let i = 0
    CR.stacks.forEach(([x, z], si) => {
      pallets.setMatrixAt(si, m.makeTranslation(x, 0.07, z))
      for (let y = 0; y < CR.ny; y++)
        for (let a = 0; a < CR.nx; a++)
          for (let b = 0; b < CR.nz; b++) {
            const vis = i < show
            const px = x - 0.3 + a * 0.6
            const pz = z - 0.2 + b * 0.4
            const py = 0.14 + 0.13 + y * 0.27
            m.makeScale(vis ? 1 : 0.0001, vis ? 1 : 0.0001, vis ? 1 : 0.0001).setPosition(px, py, pz)
            crates.setMatrixAt(i, m)
            m.makeScale(vis ? 1 : 0.0001, vis ? 1 : 0.0001, vis ? 1 : 0.0001).setPosition(px, py + 0.11, pz)
            produce.setMatrixAt(i, m)
            i++
          }
    })
    crates.instanceMatrix.needsUpdate = true
    produce.instanceMatrix.needsUpdate = true
    pallets.instanceMatrix.needsUpdate = true
    pallets.visible = show > 0
  }

  // ---- the truck: a rigid reefer, it comes in along the road out of the base's cut edge and backs onto the dock ----
  const truck = new THREE.Group()
  const TL = 10.2 // its length; the group's origin is its middle, +z toward the cab
  const clip = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), BASE.x1), new THREE.Plane(new THREE.Vector3(1, 0, 0), -BASE.x0)]
  const tw = truckWhite.clone()
  const tg = truckGlass.clone()
  const tb = blackMat.clone()
  const tr = rubber.clone()
  const tl = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.5) })
  const tred = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.06, 0.03) })
  for (const m of [tw, tg, tb, tr, tl, tred]) m.clippingPlanes = clip
  {
    const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
      const mesh = new THREE.Mesh(g, m)
      mesh.castShadow = cast
      mesh.receiveShadow = true
      truck.add(mesh)
    }
    const boxL = 7.6
    add(new RoundedBoxGeometry(2.5, 2.9, boxL, 2, 0.06).translate(0, 1.15 + 1.45, -TL / 2 + boxL / 2), tw)
    add(new THREE.BoxGeometry(2.3, 0.5, boxL - 0.4).translate(0, 0.95, -TL / 2 + boxL / 2), tb)
    add(new RoundedBoxGeometry(2.0, 1.3, 0.7, 2, 0.08).translate(0, 3.1, -TL / 2 + boxL + 0.3), tb) // the reefer unit
    const cabZ = -TL / 2 + boxL + 0.75 + 1.1
    add(new RoundedBoxGeometry(2.45, 2.5, 2.2, 3, 0.22).translate(0, 1.0 + 1.25, cabZ), tw)
    add(new THREE.BoxGeometry(2.2, 0.95, 0.06).translate(0, 2.65, cabZ + 1.105), tg, false)
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.8, 1.0).translate(s * 1.23, 2.6, cabZ + 0.3), tg, false)
    add(new THREE.BoxGeometry(2.3, 0.4, 0.12).translate(0, 1.0, cabZ + 1.12), tb)
    for (const s of [-0.85, 0.85]) {
      add(new THREE.BoxGeometry(0.35, 0.14, 0.04).translate(s, 1.35, cabZ + 1.13), tl, false)
      add(new THREE.BoxGeometry(0.3, 0.14, 0.04).translate(s * 1.2, 1.05, -TL / 2 - 0.01), tred, false)
    }
    for (const z of [cabZ - 0.1, -TL / 2 + 1.2, -TL / 2 + 2.6])
      for (const s of [-1.05, 1.05]) {
        const wh = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 16)
        wh.rotateZ(Math.PI / 2)
        wh.translate(s, 0.5, z)
        add(wh, tr)
      }
  }
  group.add(truck)
  const truckLights = tl
  // its path: in along the road from beyond the right edge, a stop past the dock, then backing round into it
  const roadZ = (ROAD.z0 + ROAD.z1) / 2 + 0.5
  const B = (p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2, t: number, out: THREE.Vector2, der: THREE.Vector2) => {
    const u = 1 - t
    out.set(0, 0).addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t)
    der.set(0, 0).addScaledVector(p1.clone().sub(p0), 3 * u * u).addScaledVector(p2.clone().sub(p1), 6 * u * t).addScaledVector(p3.clone().sub(p2), 3 * t * t)
  }
  const docked = new THREE.Vector2(DOCK_X, HALL.z1 + 0.35 + TL / 2)
  const halt = new THREE.Vector2(DOCK_X - 7.5, roadZ)
  const P = { x: 0, z: 0, yaw: 0 }
  const vA = new THREE.Vector2()
  const vD = new THREE.Vector2()
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
  /** the truck at `t` of its coming in (0 away … 1 docked) or of its leaving */
  const truckAt = (t: number, leaving: boolean) => {
    if (!leaving) {
      if (t < 0.55) {
        const k = ease(t / 0.55)
        P.x = 50 + (halt.x - 50) * k
        P.z = roadZ
        P.yaw = -Math.PI / 2 // cab toward -x
      } else {
        const k = ease((t - 0.55) / 0.45)
        B(halt, new THREE.Vector2(DOCK_X - 2.5, roadZ), new THREE.Vector2(DOCK_X, roadZ - 1.5), docked, k, vA, vD)
        P.x = vA.x
        P.z = vA.y
        // backing: the cab points against the motion
        if (vD.lengthSq() > 1e-6) P.yaw = Math.atan2(-vD.x, -vD.y)
      }
    } else {
      if (t < 0.45) {
        const k = ease(t / 0.45)
        B(docked, new THREE.Vector2(DOCK_X, roadZ), new THREE.Vector2(DOCK_X + 1.5, roadZ), new THREE.Vector2(DOCK_X + 7, roadZ), k, vA, vD)
        P.x = vA.x
        P.z = vA.y
        if (vD.lengthSq() > 1e-6) P.yaw = Math.atan2(vD.x, vD.y)
      } else {
        const k = ease((t - 0.45) / 0.55)
        P.x = DOCK_X + 7 + (50 - DOCK_X - 7) * k
        P.z = roadZ
        P.yaw = Math.PI / 2
      }
    }
    truck.position.set(P.x, 0, P.z)
    truck.rotation.y = P.yaw
    truck.visible = P.x - TL / 2 < BASE.x1 + 1
  }
  const tk = { state: 'away' as 'away' | 'in' | 'docked' | 'out', p: 0 }
  truckAt(0, false)

  // ---- vapour over the chimney (and the CHP's stack) ----
  const vapourUni = { uTime: { value: 0 }, uHeat: { value: 0 }, uCol: { value: new THREE.Color() }, uPuff: { value: keep(puffTexture()) }, uNoise: { value: noise }, uScale: { value: 1 } }
  if (plumes.length) {
    const per = 22
    const base = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('uv', base.getAttribute('uv'))
    const seeds = new Float32Array(plumes.length * per * 4)
    const ys = new Float32Array(plumes.length * per)
    const r = rng(77)
    plumes.forEach((p, k) => {
      for (let i = 0; i < per; i++) {
        const j = k * per + i
        seeds.set([p.x + (r() - 0.5) * 0.2, p.z + (r() - 0.5) * 0.2, i / per + r() * 0.03, (k ? 0.6 : 1) * (0.8 + r() * 0.5)], j * 4)
        ys[j] = p.y
      }
    })
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
    g.setAttribute('aBase', new THREE.InstancedBufferAttribute(ys, 1))
    g.instanceCount = plumes.length * per
    const vapour = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        vertexShader: VAPOUR_VERT,
        fragmentShader: VAPOUR_FRAG,
        uniforms: vapourUni,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    )
    vapour.frustumCulled = false
    vapour.renderOrder = 6
    group.add(vapour)
  }

  // ---- night: the dock's lamp and the yard posts ----
  const dockLamp = new THREE.PointLight(new THREE.Color(1.0, 0.66, 0.36), 0, 22, 2)
  dockLamp.position.set(DOCK_X + 1.5, 4.6, HALL.z1 + 2.2)
  group.add(dockLamp)

  const lit = { green: -1, harvest: 0 }
  return {
    group,
    tankTop,
    dispose: () => {
      for (const o of owned) o.dispose()
    },
    update: (s) => {
      // the season's green: rebuild the trees' instances only when it really changes
      if (Math.abs(s.green - lit.green) > 0.004) {
        lit.green = s.green
        placeTrees(s.green)
      }
      // the crates come out over a second or so, the truck takes a few
      lit.harvest = s.snap ? (s.harvest ? 1 : 0) : lit.harvest + ((s.harvest ? 1 : 0) - lit.harvest) * (1 - Math.exp(-s.dt * 1.6))
      placeCrates(lit.harvest)
      produceMat.color.copy(s.fruitCol)
      if (s.snap) {
        tk.state = s.harvest ? 'docked' : 'away'
        truckAt(s.harvest ? 1 : 0, false)
      } else {
        if (s.harvest && (tk.state === 'away')) {
          tk.state = 'in'
          tk.p = 0
        } else if (!s.harvest && tk.state === 'docked') {
          tk.state = 'out'
          tk.p = 0
        }
        if (tk.state === 'in' || tk.state === 'out') {
          tk.p = Math.min(1, tk.p + s.dt / (tk.state === 'in' ? 3.4 : 2.8))
          truckAt(tk.p, tk.state === 'out')
          if (tk.p >= 1) {
            tk.state = tk.state === 'in' ? 'docked' : 'away'
            truckAt(tk.state === 'docked' ? 1 : 0, false)
          }
        }
      }
      const dark = s.night
      truckLights.color.setRGB(1, 0.75, 0.5).multiplyScalar(0.4 + 3 * dark)
      windowMat.emissiveIntensity = 0.12 + 2.2 * dark
      dockLamp.intensity = 60 * dark + 6
      vapourUni.uTime.value = s.time
      vapourUni.uHeat.value = s.heat > 0.01 ? 0.35 + 0.65 * s.heat : 0
      vapourUni.uCol.value.setRGB(0.5, 0.53, 0.58).multiplyScalar(0.08 + 0.5 * s.light).lerp(s.sunCol, 0.15 * s.light)
      // the tank's water at the month's level
      tankWater.scale.y = Math.max(0.004, s.level) * (TANK.h - 0.12)
    },
  }
}
