// The field crossing's light: three's standard material (lit by a low warm sun and a cool sky hemisphere) with a few
// lines grafted on - wind that rolls across the field as travelling gusts (a small noise texture, one fetch per
// vertex), light passing through thin leaves, awns and petals when the lens looks toward the sun, a warm rim on every
// edge, and aerial perspective that sinks the far field into the horizon's own colour. One program serves every plant,
// flower and tree; the ground and the sky have their own small ones. No hash arithmetic in fragment shaders: noise is
// a 128² texture (ANGLE inlines everything, and big procedural shaders took seconds to compile here).
import * as THREE from 'three'

/** a tileable fbm value-noise texture: R and G two independent fields, B a finer one */
export function noiseTexture(size = 128) {
  const lattice = (n: number, seed: number) => {
    const a = new Float32Array(n * n)
    let s = seed
    for (let i = 0; i < a.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0
      a[i] = s / 4294967296
    }
    return a
  }
  const sample = (lat: Float32Array, n: number, x: number, y: number) => {
    const fx = (x / size) * n
    const fy = (y / size) * n
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const at = (i: number, j: number) => lat[((j % n) + n) % n * n + (((i % n) + n) % n)]
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
    return a + (b - a) * sy
  }
  const fbm = (seed: number, base: number, oct: number, x: number, y: number) => {
    let v = 0
    let amp = 0.5
    let tot = 0
    for (let o = 0; o < oct; o++) {
      const n = base << o
      v += sample(lats[seed][o], n, x, y) * amp
      tot += amp
      amp *= 0.5
    }
    return v / tot
  }
  const lats = [0, 1, 2].map((s) => [0, 1, 2, 3].map((o) => lattice(([4, 6, 16][s] << o), 977 + s * 131 + o * 17)))
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      data[i] = Math.round(fbm(0, 4, 3, x, y) * 255)
      data[i + 1] = Math.round(fbm(1, 6, 3, x, y) * 255)
      data[i + 2] = Math.round(fbm(2, 16, 2, x, y) * 255)
      data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

export type FieldUniforms = ReturnType<typeof fieldUniforms>

export function fieldUniforms(noise: THREE.Texture, sun: THREE.Vector3) {
  return {
    uTime: { value: 0 },
    uNoise: { value: noise },
    uWindDir: { value: new THREE.Vector2(0.55, 0.83).normalize() },
    uWindAmp: { value: 0.12 },
    uSun: { value: sun },
    // the two temperatures of the hour: a cool steel zenith and horizon, warm only toward the sun
    uZenith: { value: new THREE.Color(0.022, 0.05, 0.125) },
    uHorCool: { value: new THREE.Color(0.1, 0.13, 0.2) },
    uHorWarm: { value: new THREE.Color(1.0, 0.5, 0.19) },
    uHazeK: { value: 0.0075 },
    uTransCol: { value: new THREE.Color(1.0, 0.66, 0.3) },
    uRimCol: { value: new THREE.Color(1.0, 0.72, 0.42) },
    /** tramline pair centre, spacing, on/off */
    uTrack: { value: new THREE.Vector3(0.9, 1.8, 1) },
    uRow: { value: 0.125 },
  }
}

const AIR = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uHorCool;
uniform vec3 uHorWarm;
uniform float uHazeK;
// the air along a direction near the horizon: cool steel away from the sun, warm in a wedge toward it, and the
// forward-scattering glow around the sun itself (wide lobes only - never a disc)
vec3 zxAir(vec3 d) {
  vec2 h = normalize(d.xz + vec2(1e-5));
  float az = max(dot(h, normalize(uSun.xz)), 0.0);
  float mu = max(dot(d, uSun), 0.0);
  return mix(uHorCool, uHorWarm, pow(az, 13.0)) + uHorWarm * (0.07 * pow(mu, 10.0) + 0.26 * pow(mu, 90.0) + 0.7 * pow(mu, 700.0));
}
vec3 zxHaze(vec3 col, vec3 wp) {
  vec3 dv = wp - cameraPosition;
  float d = length(dv);
  float f = 1.0 - exp(-d * uHazeK);
  return mix(col, zxAir(dv / d), f);
}
`

const VERT_HEAD = /* glsl */ `
attribute vec3 aWind;
uniform float uTime;
uniform sampler2D uNoise;
uniform vec2 uWindDir;
uniform float uWindAmp;
varying float vGust;
varying float vThin;
varying vec3 vWorldP;
`

// gusts: a noise field drifting downwind; each plant bends from its base by the gust at its own root, an ear nods
// with the gust a moment earlier (a lag), and a small flutter of its own keeps it alive between gusts
const VERT_WIND = /* glsl */ `
#ifdef USE_INSTANCING
  mat4 zxM = modelMatrix * instanceMatrix;
#else
  mat4 zxM = modelMatrix;
#endif
  vec3 zxOrg = zxM[3].xyz;
  vec2 zxUv = zxOrg.xz * 0.045 - uWindDir * uTime * 0.12;
  float zxG = texture2D(uNoise, zxUv).r;
  float zxGl = texture2D(uNoise, zxUv + uWindDir * 0.05).r;
  float zxGust = smoothstep(0.38, 0.78, mix(zxG, zxGl, aWind.y));
  float zxFl = sin(uTime * 2.1 + zxOrg.x * 4.1 + zxOrg.z * 3.3 + aWind.y * 2.0) + 0.5 * sin(uTime * 3.7 + zxOrg.z * 5.0);
  float zxA = uWindAmp * (0.15 + 1.1 * zxGust) + uWindAmp * 0.12 * zxFl;
  vec2 zxB = uWindDir * zxA * aWind.x;
  vec3 zxD = vec3(zxB.x, -0.5 * zxA * length(zxB), zxB.y);
  mat3 zxR = mat3(zxM);
  transformed += transpose(zxR) * zxD / max(dot(zxR[0], zxR[0]), 1e-4);
  vGust = zxGust;
  vThin = aWind.z;
`

const VERT_GROUND = /* glsl */ `
  vec3 zxW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vGust = smoothstep(0.38, 0.78, texture2D(uNoise, zxW.xz * 0.045 - uWindDir * uTime * 0.12).r);
  vThin = aWind.z * 0.6;
`

const FRAG_HEAD = /* glsl */ `
uniform vec3 uTransCol;
uniform vec3 uRimCol;
uniform sampler2D uNoise;
uniform vec3 uTrack;
uniform float uRow;
varying float vGust;
varying float vThin;
varying vec3 vWorldP;
${AIR}
`

// light through the tissue when the lens looks toward the sun (strongest in the ripe tips, where the vertex colour is
// brightest), the gust tipping more of it into view; a warm rim; then the air
const FRAG_LIGHT = /* glsl */ `
  {
    vec3 zxV = normalize(vWorldP - cameraPosition);
    float zxMu = max(dot(zxV, uSun), 0.0);
    float zxLobe = 0.08 + 0.42 * pow(zxMu, 4.0) + 1.5 * pow(zxMu, 22.0);
    outgoingLight += diffuseColor.rgb * uTransCol * vThin * zxLobe * (0.7 + 0.6 * vGust);
    float zxFr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
    outgoingLight += uRimCol * diffuseColor.rgb * zxFr * (0.06 + 1.1 * pow(zxMu, 6.0)) * (0.4 + vThin);
    outgoingLight = zxHaze(outgoingLight, vWorldP);
  }
`

// the soil between the rows: clods and crumbs, the drill rows as faint ridges, the tramlines pressed paler with a
// tread across them; where the ground is the far canopy instead, its own colour rippling with the gusts
const FRAG_GROUND = /* glsl */ `
  {
    vec2 zxXZ = vWorldP.xz;
    float zxN1 = texture2D(uNoise, zxXZ * 0.37).b;
    float zxN2 = texture2D(uNoise, zxXZ * 2.3 + 0.5).g;
    float zxN3 = texture2D(uNoise, zxXZ * 0.05).r;
    float zxDist = length(vWorldP - cameraPosition);
    float zxRowc = 0.5 + 0.5 * cos(6.2831853 * (zxXZ.x - uTrack.x) / uRow);
    float zxNear = exp(-zxDist * 0.25);
    float zxSoil = (0.7 + 0.5 * zxN1) * (0.82 + 0.36 * zxN2) * mix(1.0, mix(0.8, 1.05, zxRowc), zxNear);
    float zxT = abs(abs(mod(zxXZ.x - uTrack.x + 12.0, 24.0) - 12.0) - uTrack.y * 0.5);
    float zxTrack = uTrack.z * (1.0 - smoothstep(0.17, 0.27, zxT));
    zxSoil = mix(zxSoil, (1.25 + 0.15 * sin(zxXZ.y * 46.0) * zxNear) * (0.85 + 0.3 * zxN2), zxTrack);
    float zxCan = (0.74 + 0.4 * zxN3) * (0.8 + 0.5 * vGust) * mix(1.0, 0.55, zxTrack * 0.8);
    diffuseColor.rgb *= mix(zxSoil, zxCan, vThin / 0.6);
  }
`

/** the one material of every plant, flower and tree in the field (instanced, vertex-coloured, double-sided) */
export function plantMaterial(u: FieldUniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide })
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_WIND}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n  vWorldP = (zxM * vec4(transformed, 1.0)).xyz;`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <opaque_fragment>', `${FRAG_LIGHT}\n#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'zx-field-plant-1'
  return m
}

/** the ground: soil and tramlines near, the far canopy as a surface toward the horizon */
export function groundMaterial(u: FieldUniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_GROUND}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n  vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_GROUND}`)
      .replace('#include <opaque_fragment>', `${FRAG_LIGHT}\n#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'zx-field-ground-1'
  return m
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform sampler2D uNoise;
uniform float uTime;
varying vec3 vDir;
${AIR}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  float mu = max(dot(d, uSun), 0.0);
  vec3 air = zxAir(d);
  // a cool steel zenith paling toward the horizon, then the thin band of the hour's colour along it
  vec3 col = mix(uZenith, uHorCool * 0.85, exp(-max(up, 0.0) * 3.2));
  col = mix(col, air, exp(-max(up, 0.0) * 10.0));
  // the sun: a hot, soft core the bloom turns into light - no edge for the lens to draw a ring around
  col += vec3(2.6, 1.8, 1.0) * pow(mu, 2600.0);
  // thin cirrus: the noise pulled long across the sky, lit warm toward the sun and cool away from it
  vec2 cuv = d.xz / (max(up, 0.0) + 0.1);
  float c = texture2D(uNoise, cuv * vec2(0.045, 0.14) + vec2(uTime * 0.0015, 0.0)).r;
  float c2 = texture2D(uNoise, cuv * vec2(0.16, 0.42) + 0.37).b;
  float cl = smoothstep(0.58, 0.86, c * 0.8 + c2 * 0.3) * smoothstep(0.03, 0.12, up) * (1.0 - smoothstep(0.3, 0.6, up));
  vec2 h = normalize(d.xz + vec2(1e-5));
  float az = max(dot(h, normalize(uSun.xz)), 0.0);
  vec3 cc = mix(uHorCool * 1.5 + vec3(0.04, 0.03, 0.04), uHorWarm * 1.3, pow(az, 8.0)) + uHorWarm * pow(mu, 30.0) * 1.5;
  col = mix(col, cc, cl * 0.38);
  col = mix(col, air, smoothstep(0.0, -0.03, up));
  gl_FragColor = vec4(col, 1.0);
}
`

export function skyMaterial(u: FieldUniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: { uSun: u.uSun, uHorCool: u.uHorCool, uHorWarm: u.uHorWarm, uHazeK: u.uHazeK, uZenith: u.uZenith, uNoise: u.uNoise, uTime: u.uTime },
    side: THREE.BackSide,
    depthWrite: false,
  })
}

// chaff, pollen and midges: tiny, sparse, visible only where they stand in the low sun's light
const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform vec2 uWindDir;
attribute vec4 aSeed;
varying float vA;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  float s = aSeed.x;
  if (aSeed.w > 0.5) {
    // a midge: a tight, restless dance around its swarm's centre
    p += vec3(sin(uTime * (5.0 + s * 4.0) + s * 40.0), sin(uTime * (6.5 + s * 3.0) + s * 17.0) * 0.6, cos(uTime * (5.5 + s * 5.0) + s * 23.0)) * 0.09;
    p += vec3(sin(uTime * 0.7 + s * 9.0), 0.0, cos(uTime * 0.6 + s * 7.0)) * 0.12;
  } else {
    // chaff drifting downwind, rising and settling
    p.xz += uWindDir * uTime * (0.18 + s * 0.12);
    p.y += sin(uTime * 0.33 + s * 17.0) * 0.12;
    p.x += sin(uTime * 0.21 + s * 40.0) * 0.25;
    p.xz = mod(p.xz - aSeed.yz, vec2(12.0, 16.0)) + aSeed.yz;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  // never a blob at the lens: capped size, and the nearest fade before they reach it
  gl_PointSize = clamp(uScale * (0.5 + s * 0.6) / -mv.z, 1.0, 4.5);
  vA = smoothstep(0.6, 1.4, -mv.z) * (1.0 - smoothstep(14.0, 22.0, -mv.z));
}
`
const MOTE_FRAG = /* glsl */ `
uniform vec3 uSun;
varying float vA;
varying vec3 vWorld;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  vec3 V = normalize(vWorld - cameraPosition);
  float back = pow(max(dot(V, uSun), 0.0), 8.0);
  gl_FragColor = vec4(vec3(1.0, 0.74, 0.42) * (0.02 + back * 2.4) * exp(-r * 14.0) * vA, 1.0);
}
`

export function moteMaterial(u: FieldUniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: { uTime: u.uTime, uScale: { value: 18 }, uSun: u.uSun, uWindDir: u.uWindDir },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}
