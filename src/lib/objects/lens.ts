// The lens: one place that turns what a scene wants from its camera into a post-processing chain.
//
// Every scene of the descent used to build its own EffectComposer, near copies of one another: a 4x multisampled HDR
// buffer, a depth of field in a pass of its own, bloom and a tone map in a second, SMAA in a third, a vignette and
// grain in a fourth. Anti-aliasing was paid for twice (multisampling, then SMAA over it) and every frame carried full
// screen passes that only existed because the effects had been added one `addPass` at a time.
//
// A scene now says what it wants - `{ focus, bloom, tilt, tone, vignette, grain }` - and the lens decides how that is
// drawn: one anti-aliasing, never two, and every effect that can share a pass shares it. On the high tier that is the
// scene into a multisampled buffer and ONE effect pass to finish it; where multisampling is missing (or on the low
// tier, when the frame budget asks for it) SMAA takes its place, merged with the vignette and grain.
//
// What the reader sees stays the same: the effects and their settings are the scenes' own, only the number of passes
// drops. `planLens` is the decision alone, pure, for the tests; `buildLens` makes the composer from it.
import { BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, SMAAEffect, SMAAPreset, TiltShiftEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, type Effect } from 'postprocessing'
import * as THREE from 'three'

type DofOptions = ConstructorParameters<typeof DepthOfFieldEffect>[1]
type BloomOptions = ConstructorParameters<typeof BloomEffect>[0]
type TiltOptions = ConstructorParameters<typeof TiltShiftEffect>[0]

/** What a scene asks of its camera. Omitted parts are not drawn. */
export type LensIntent = {
  /** a depth of field (its focus is the scene's to pull afterwards) */
  focus?: DofOptions
  /** a model photographed close: a sharp band, soft above and below */
  tilt?: TiltOptions
  /** bright things burn */
  bloom?: BloomOptions
  /** the tone map; ACES filmic unless said */
  tone?: ToneMappingMode
  vignette?: { offset: number; darkness: number }
  /** film grain, as its opacity over the frame */
  grain?: number
  /**
   * hair-thin geometry (stalks, glazing bars) that shimmers without proper anti-aliasing: the lens keeps
   * multisampling for it even on the low tier, where it would otherwise fall back to SMAA
   */
  thinLines?: boolean
}

/** how much the frame may cost; the shared canvas's budget picks it (high until it does) */
export type LensTier = 'high' | 'low'

export type LensEffect = 'dof' | 'tilt' | 'bloom' | 'tone' | 'vignette' | 'grain' | 'smaa'
/** the chain, as data: the samples of the scene's buffer and the effects of each pass after the scene's own */
export type LensPlan = { msaa: number; passes: LensEffect[][] }

/**
 * The decision alone: which anti-aliasing, and how the effects fall into passes.
 * `maxSamples`: what the renderer can multisample (0 on WebGL 1). `off`: development switches (`?nofx=dof,bloom`).
 */
export function planLens(intent: LensIntent, maxSamples: number, tier: LensTier = 'high', off: readonly string[] = []): LensPlan {
  const msaaOk = maxSamples > 0 && (tier === 'high' || !!intent.thinLines)
  const msaa = msaaOk ? Math.min(4, maxSamples) : 0
  // One pass reads the scene: the blurs (depth of field, tilt) and the bloom each work from the scene's buffer on
  // their own, and none of them reshapes the picture's coordinates, so they merge - focus first, then what burns, then
  // the tone map, then what a lens adds on the way to the eye.
  const main: LensEffect[] = []
  if (intent.focus && !off.includes('dof')) main.push('dof')
  if (intent.tilt && !off.includes('tilt')) main.push('tilt')
  if (intent.bloom && !off.includes('bloom')) main.push('bloom')
  main.push('tone')
  const finish: LensEffect[] = []
  if (intent.vignette) finish.push('vignette')
  if (intent.grain && !off.includes('grain')) finish.push('grain')
  // SMAA works on display values and samples its input around each pixel - it has to lead a pass of its own, after
  // the tone map. The vignette and the grain ride along with it there instead of in the scene's pass.
  if (!msaa) return { msaa, passes: [main, ['smaa', ...finish]] }
  return { msaa, passes: [[...main, ...finish]] }
}

export type Lens = {
  composer: EffectComposer
  /** the depth of field, when the scene asked for one: its focus is pulled by the scene */
  dof: DepthOfFieldEffect | null
  bloom: BloomEffect | null
  plan: LensPlan
}

/** Make the scene's composer from what it wants. The stage takes it from here (`stage.setComposer`). */
export function buildLens(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, intent: LensIntent, tier: LensTier = 'high', off: readonly string[] = []): Lens {
  const plan = planLens(intent, renderer.capabilities.maxSamples, tier, off)
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: plan.msaa })
  composer.addPass(new RenderPass(scene, camera))
  let dof: DepthOfFieldEffect | null = null
  let bloom: BloomEffect | null = null
  const make = (e: LensEffect): Effect => {
    switch (e) {
      case 'dof':
        return (dof = new DepthOfFieldEffect(camera, intent.focus))
      case 'tilt':
        return new TiltShiftEffect(intent.tilt)
      case 'bloom':
        return (bloom = new BloomEffect(intent.bloom))
      case 'tone':
        return new ToneMappingEffect({ mode: intent.tone ?? ToneMappingMode.ACES_FILMIC })
      case 'vignette':
        return new VignetteEffect(intent.vignette)
      case 'grain': {
        const grain = new NoiseEffect({ premultiply: true })
        grain.blendMode.opacity.value = intent.grain ?? 0
        return grain
      }
      case 'smaa':
        return new SMAAEffect({ preset: SMAAPreset.HIGH })
    }
  }
  for (const pass of plan.passes) composer.addPass(new EffectPass(camera, ...pass.map(make)))
  return { composer, dof, bloom, plan }
}

/** development only: `?nofx=dof,bloom,...` switches parts of every lens off, to judge each one's share of the frame */
export function devLensOff(): string[] {
  if (!import.meta.env.DEV || typeof location === 'undefined') return []
  return new URLSearchParams(location.search).get('nofx')?.split(',') ?? []
}
