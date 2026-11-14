// H0 - the cloud deck over the field: a real volume of cloud the camera sinks through as the reader scrolls. Above
// it, a sea of tops lit gold by the same low sun that later stands behind the crop; inside, the light goes soft and
// grey and comes in shafts; below, the underside darkens overhead and the field opens up as a patchwork, lit in
// patches where the deck breaks. One full-screen ray-marched shader (density from fbm noise, light marched toward the
// sun with a Beer-powder term and a two-lobe Henyey-Greenstein phase for the silver lining), drawn at half
// resolution and capped at 30 fps: soft by nature, so the upscale costs nothing it can see.
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { lookAround } from '../../lib/objects/lookAround'
import { createStage } from '../../lib/objects/stage'
import type { ObjectBase } from './types'

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uF;
uniform vec3 uR;
uniform vec3 uU;
uniform float uTan;
uniform float uAspect;
uniform vec3 uSun;
varying vec2 vUv;

const float BOT = 1.0;
const float TOP = 2.15;

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm4(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float fbm2(vec3 p) { return 0.5 * noise3(p) + 0.25 * noise3(p * 2.03 + vec3(1.7, 9.2, 3.1)); }
float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// cumulus: rounded tops, flatter bases, the deck breaking into gaps
float shapeH(float h) { return smoothstep(0.0, 0.16, h) * smoothstep(1.0, 0.42, h); }
float density(vec3 p) {
  float h = (p.y - BOT) / (TOP - BOT);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = p * vec3(0.62, 1.15, 0.62) + vec3(uTime * 0.018, 0.0, uTime * 0.008);
  float b = fbm4(q);
  // erosion: fine noise eats the thin edges, so the tops read as crisp heaped bodies, not a soft fog
  b -= (noise3(q * 5.3 + vec3(0.0, uTime * 0.05, 0.0)) - 0.35) * 0.22 * (1.0 - b);
  float s = shapeH(h);
  return clamp((b - 0.56 + 0.22 * s) * 6.0, 0.0, 1.0) * s;
}
float densityLo(vec3 p) {
  float h = (p.y - BOT) / (TOP - BOT);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = p * vec3(0.62, 1.15, 0.62) + vec3(uTime * 0.018, 0.0, uTime * 0.008);
  float s = shapeH(h);
  return clamp((fbm2(q) / 0.75 * 0.94 - 0.56 + 0.22 * s) * 3.4, 0.0, 1.0) * s;
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5) / 12.566; }

vec3 sky(vec3 d) {
  float mu = dot(d, uSun);
  float toSun = max(mu, 0.0);
  float az = clamp(0.5 + 0.5 * dot(normalize(d.xz + vec2(1e-5)), normalize(uSun.xz)), 0.0, 1.0);
  vec3 zenith = vec3(0.008, 0.013, 0.03);
  vec3 horizon = mix(vec3(0.04, 0.05, 0.075), vec3(0.55, 0.3, 0.12), pow(az, 6.0));
  vec3 col = mix(zenith, horizon, exp(-max(d.y, 0.0) * 6.0));
  col += vec3(0.9, 0.5, 0.2) * pow(toSun, 30.0) + vec3(2.4, 1.6, 0.8) * pow(toSun, 900.0);
  return col;
}

void main() {
  vec3 rd = normalize(uF + vUv.x * uTan * uAspect * uR + vUv.y * uTan * uU);
  vec3 ro = uCam;
  vec3 sunCol = vec3(1.7, 1.2, 0.74);
  float c = dot(rd, uSun);
  float phase = mix(hg(c, 0.62), hg(c, -0.18), 0.35) * 12.566;

  // the background: sky above, the field below (a patchwork of plots, lit through the gaps of the deck)
  vec3 bg;
  float tg = rd.y < -0.001 ? -ro.y / rd.y : -1.0;
  if (tg > 0.0) {
    vec3 gp = ro + rd * tg;
    // farmland: districts at their own angles, each cut into long strips of unequal width - never a tiled floor
    vec2 g = gp.xz * 3.2 + vec2(fbm2(vec3(gp.xz * 0.5, 1.0)), fbm2(vec3(gp.xz * 0.5, 5.0))) * 1.3;
    vec2 dc = floor(g * 0.45);
    float ang = hash2(dc + 3.1) * 3.1416;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 w = rot * g * vec2(2.6, 0.9);
    w.x += floor(w.y) * 0.37;
    vec2 cell = floor(w);
    vec2 fr = fract(w);
    float k = hash2(cell + dc * 17.0);
    vec3 plot = k < 0.22 ? vec3(0.05, 0.068, 0.034)      // winter crop, green
              : k < 0.42 ? vec3(0.105, 0.1, 0.05)        // ripening
              : k < 0.64 ? vec3(0.15, 0.12, 0.072)       // stubble, straw
              : k < 0.86 ? vec3(0.075, 0.054, 0.036)     // ploughed
                         : vec3(0.04, 0.045, 0.032);     // wood, wet ground
    // drill rows inside each plot, gone at a distance before they can shimmer
    float rows = 0.5 + 0.5 * sin(fr.x * 60.0);
    plot *= 1.0 - 0.18 * rows * exp(-tg * 0.35);
    plot *= 0.82 + 0.36 * noise3(vec3(gp.xz * 7.0, 2.0));
    float edge = min(min(fr.x, 1.0 - fr.x) / 2.6, min(fr.y, 1.0 - fr.y) / 0.9);
    plot *= mix(0.5, 1.0, smoothstep(0.0, 0.025, edge)); // hedgerows and tracks
    // trees standing in some of the hedges, and small woods: dark crowns that break the ruled lines
    float near = exp(-tg * 0.22);
    float crowns = smoothstep(0.45, 0.7, noise3(vec3(gp.xz * 34.0, 4.0)));
    float hedge = (1.0 - smoothstep(0.0, 0.05, edge)) * step(0.45, hash2(cell + 2.7));
    float wood = smoothstep(0.66, 0.7, fbm2(vec3(gp.xz * 1.1, 9.0)) / 0.75);
    plot = mix(plot, vec3(0.018, 0.028, 0.016), max(hedge * crowns * near, wood * (0.6 + 0.4 * crowns)));
    // a lane between the districts, pale in the dusk
    vec2 de = abs(fract(g * 0.45) - 0.5);
    plot = mix(plot, vec3(0.13, 0.125, 0.115), (1.0 - smoothstep(0.004, 0.012, 0.5 - max(de.x, de.y))) * 0.8 * near);
    // sunlight through the deck: three coarse samples up toward the sun
    float sd = 0.0;
    for (int j = 0; j < 3; j++) {
      float y = BOT + (float(j) + 0.5) / 3.0 * (TOP - BOT);
      sd += densityLo(gp + uSun / max(uSun.y, 0.05) * y);
    }
    float lit = exp(-sd * 5.0);
    // under the deck the land lies in cool shade, and where the deck breaks the low sun lays gold on it
    bg = plot * (vec3(0.055, 0.075, 0.115) + sunCol * 0.95 * lit);
    // the air below the deck: thin and cool, warm only toward the sun - the land shows far out, not a brown wash
    float fog = 1.0 - exp(-tg * 0.046);
    float toward = pow(max(dot(normalize(rd.xz + vec2(1e-5)), normalize(uSun.xz)), 0.0), 3.0);
    vec3 fogCol = mix(vec3(0.05, 0.066, 0.1), sky(normalize(vec3(rd.x, 0.02, rd.z))) * 0.7, 0.1 + 0.42 * toward);
    bg = mix(bg, fogCol, fog);
  } else {
    bg = sky(rd);
  }
  // over the deck, a shallow ray that passes beyond the marched distance still lands on cloud: the far sea of tops
  // melts into the bright haze of the horizon (the dark ground there drew a hard horizon line); steep rays keep the
  // ground, seen through the gaps of the deck
  if (ro.y > TOP && rd.y < 0.0) bg = mix(sky(normalize(vec3(rd.x, 0.03, rd.z))) * 1.08, bg, smoothstep(-0.08, -0.3, rd.y));

  // the deck: march the slab between its base and its tops
  float tb = (BOT - ro.y) / rd.y;
  float tt = (TOP - ro.y) / rd.y;
  float t0 = max(0.0, min(tb, tt));
  float t1 = max(tb, tt);
  if (abs(rd.y) < 1e-4) { t0 = (ro.y > BOT && ro.y < TOP) ? 0.0 : 1e9; t1 = 1e9; }
  t1 = min(t1, t0 + 9.0);
  vec3 col = vec3(0.0);
  float T = 1.0;
  // inside the deck the near murk is thinned, so the wisps rushing past read as shapes
  float inCloud = step(BOT, ro.y) * step(ro.y, TOP);
  if (t1 > t0 && t0 < 60.0) {
    const int N = 48;
    float dt = (t1 - t0) / float(N);
    float t = t0 + dt * hash2(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0);
    for (int i = 0; i < N; i++) {
      vec3 p = ro + rd * t;
      float d = density(p);
      if (d > 0.002) {
        float ld = 0.0;
        for (int j = 0; j < 4; j++) ld += densityLo(p + uSun * (0.09 + 0.13 * float(j)));
        float lightT = exp(-ld * 0.13 * 7.0);
        float powder = 1.0 - exp(-d * 4.0);
        float h = clamp((p.y - BOT) / (TOP - BOT), 0.0, 1.0);
        vec3 amb = mix(vec3(0.022, 0.028, 0.042), vec3(0.075, 0.095, 0.14), h);
        // tops catch the sun, bases sink into shade: the relief that makes a cloud a body and not a fog
        vec3 S = (sunCol * lightT * min(phase, 1.5) * (0.25 + 0.75 * powder) * 0.8 + amb) * mix(0.5, 1.12, h);
        float a = 1.0 - exp(-d * dt * 7.0 * mix(1.0, 0.4, inCloud));
        // the far deck melts into the horizon haze
        float far = 1.0 - exp(-t * 0.09);
        col += T * a * mix(S, sky(normalize(vec3(rd.x, 0.05, rd.z))), far * 0.85);
        T *= 1.0 - a;
        if (T < 0.02) break;
      }
      t += dt;
    }
  }
  vec3 o = bg * T + col;
  // inside the deck: everything goes to a soft, lit grey
  float inside = smoothstep(BOT - 0.08, BOT + 0.25, ro.y) * smoothstep(TOP + 0.08, TOP - 0.3, ro.y);
  o = mix(o, mix(vec3(0.07, 0.08, 0.1), vec3(0.3, 0.22, 0.14), pow(max(c, 0.0), 3.0)), inside * 0.15);
  // filmic, display gamma, vignette, grain
  o = clamp((o * (2.51 * o + 0.03)) / (o * (2.43 * o + 0.59) + 0.14), 0.0, 1.0);
  o = pow(o, vec3(1.0 / 2.2));
  o *= 1.0 - 0.32 * smoothstep(0.55, 1.45, length(vUv * vec2(1.0, 0.8)));
  o += (hash2(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * 0.03;
  gl_FragColor = vec4(o, 1.0);
}
`

export default function CloudDeck({ progress, reduce }: ObjectBase) {
  const ref = useRef<HTMLDivElement>(null)
  // the slot can't pass the reader's motion preference, so the object asks for it itself
  const reduceMotion = useReducedMotion()
  reduce = reduce || !!reduceMotion
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // the same low sun that stands behind the crop at the next crossing: right of the sentence, a few degrees up
    const sun = new THREE.Vector3(0.5, 0.1, -0.86).normalize()
    const uniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uF: { value: new THREE.Vector3() },
      uR: { value: new THREE.Vector3() },
      uU: { value: new THREE.Vector3() },
      uTan: { value: Math.tan(THREE.MathUtils.degToRad(24)) },
      uAspect: { value: 1 },
      uSun: { value: sun },
    }
    const look = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const lookAt = lookAround()
    const stage = createStage(el, {
      label: 'clouds',
      animate: !reduce,
      // a soft ray-march: half the frame budget's pixel ratio is plenty
      resolution: 0.5,
      minFrameMs: 33,
      // the ray-march grades itself: its own filmic curve and display gamma
      encoded: true,
      onResize: (w, h) => (uniforms.uAspect.value = w / h),
      onFrame: ({ time, dt }) => {
        const p = progress.get()
        // the reader's hand: the view turns a little toward the pointer
        const lk = reduce ? { x: 0, y: 0 } : lookAt(dt)
        // from over the deck, down through it, to under it with the field below
        const ss = THREE.MathUtils.smoothstep
        const y = p < 0.45 ? THREE.MathUtils.lerp(3.35, 2.45, ss(p, 0, 0.45)) : p < 0.58 ? THREE.MathUtils.lerp(2.45, 0.8, ss(p, 0.45, 0.58)) : THREE.MathUtils.lerp(0.8, 0.66, ss(p, 0.58, 1))
        const pitch = THREE.MathUtils.lerp(-0.17, -0.06, ss(p, 0.44, 0.6))
        uniforms.uTime.value = time + 40
        uniforms.uCam.value.set(0.2 + lk.x * 0.05, y - lk.y * 0.02, 1.5 - p * 3.2)
        look.set(0.18 + lk.x * 0.07, pitch - lk.y * 0.035, -1).normalize()
        uniforms.uF.value.copy(look)
        uniforms.uR.value.crossVectors(look, up).normalize()
        uniforms.uU.value.crossVectors(uniforms.uR.value, look).normalize()
      },
    })
    if (!stage) return
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false }))
    quad.frustumCulled = false
    stage.scene.add(quad)
    stage.renderer.setClearColor(0x0a0b0e, 1)
    const size = new THREE.Vector2()
    stage.renderer.getSize(size)
    if (size.x && size.y) uniforms.uAspect.value = size.x / size.y
    // the ray-march is one long program: nothing is drawn until the driver has linked it in the background
    stage.hold(stage.compile())
    const off = progress.on('change', () => stage.invalidate())
    return () => {
      off()
      stage.dispose()
    }
  }, [progress, reduce])
  // (drawn on the canvas the scenes share - lib/objects/world; this block only says where)
  return <div ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
}
