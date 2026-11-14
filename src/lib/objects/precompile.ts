// Link a scene's shaders in the background, before its first frame.
//
// three.js compiles a program the first time something is drawn with it and then asks the driver for the result at
// once, which blocks the page until the driver is done - on Windows (ANGLE → D3D) a scene with lit materials, shadows
// and a post-processing chain froze the page for 0.5-1.4 s the moment it scrolled into view. With
// KHR_parallel_shader_compile the driver links on its own threads as long as nobody asks; so every program the first
// frame will need is requested here, ahead of time, and the stage draws nothing until the driver reports them done.
//
// The catch is that a program is keyed by where it draws to as well as by its material: the scene goes into the
// composer's linear HDR buffer, the passes into buffers, the last pass to the canvas, the shadow casters into the shadow
// map with the renderer's own depth material. Each is compiled here under the state its real draw will have -
// otherwise the "precompiled" programs are simply not the ones the frame uses.
import { Effect, Pass, type EffectComposer } from 'postprocessing'
import * as THREE from 'three'

const SHADOW_SIDE: Record<number, THREE.Side> = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide }

/** Every material the composer's passes draw with, the ones effects keep inside included (blur, edges, bokeh...). */
function passMaterials(composer: EffectComposer): { toBuffer: THREE.Material[]; toScreen: THREE.Material[] } {
  const toBuffer = new Set<THREE.Material>()
  const toScreen = new Set<THREE.Material>()
  const seen = new Set<object>()
  const visit = (o: unknown, depth: number, into: Set<THREE.Material>) => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) {
      for (const x of o) visit(x, depth, into)
      return
    }
    if (seen.has(o)) return
    if ((o as THREE.Material).isMaterial) {
      seen.add(o)
      into.add(o as THREE.Material)
      return
    }
    if (!(o instanceof Pass) && !(o instanceof Effect)) return
    seen.add(o)
    if (depth > 6) return
    if (o instanceof Pass && o.fullscreenMaterial) visit(o.fullscreenMaterial, depth + 1, into)
    for (const k of Object.keys(o)) visit((o as unknown as Record<string, unknown>)[k], depth + 1, into)
  }
  const passes = composer.passes.filter((p) => p.enabled)
  const last = passes[passes.length - 1]
  for (const p of passes) {
    if (p === last && p.renderToScreen && p.fullscreenMaterial) {
      // the last pass draws to the canvas: its own material is compiled for that, whatever its effects hold for buffers
      seen.add(p.fullscreenMaterial)
      toScreen.add(p.fullscreenMaterial)
    }
    visit(p, 0, toBuffer)
  }
  return { toBuffer: [...toBuffer], toScreen: [...toScreen] }
}

/** A throwaway scene of full-screen triangles, one per material, as a pass draws them. */
function screens(materials: THREE.Material[], geometry: THREE.BufferGeometry): THREE.Scene {
  const scene = new THREE.Scene()
  for (const m of materials) {
    const mesh = new THREE.Mesh(geometry, m)
    mesh.frustumCulled = false
    scene.add(mesh)
  }
  return scene
}

/**
 * Stand-ins for the shadow pass: the renderer draws every shadow caster with its own depth material, whose program
 * depends on the caster (instanced or not, which side, an alpha-tested map). One stand-in per combination, with the
 * scene's lights copied in, so the programs asked for here are the ones the shadow pass will ask for.
 */
function shadowStandIns(renderer: THREE.WebGLRenderer, scene: THREE.Scene): { scene: THREE.Scene; materials: THREE.Material[] } | null {
  if (!renderer.shadowMap.enabled) return null
  const lights: THREE.Light[] = []
  let casts = false
  scene.traverseVisible((o) => {
    const l = o as THREE.Light
    if (!l.isLight) return
    lights.push(l)
    if (l.castShadow) casts = true
  })
  if (!casts) return null
  const out = new THREE.Scene()
  for (const l of lights) out.add(l.clone(false))
  const materials: THREE.Material[] = []
  const seen = new Set<string>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!(mesh.isMesh || (o as unknown as THREE.Points).isPoints || (o as unknown as THREE.Line).isLine) || !mesh.castShadow || !mesh.visible) return
    const inst = (mesh as unknown as THREE.InstancedMesh).isInstancedMesh ? (mesh as unknown as THREE.InstancedMesh) : null
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!m) continue
      const std = m as THREE.MeshStandardMaterial
      const side = m.shadowSide ?? SHADOW_SIDE[m.side]
      const alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest
      const attrs = Object.keys(mesh.geometry.attributes).sort().join('+')
      const key = [mesh.customDepthMaterial?.uuid ?? '', !!inst, !!inst?.instanceColor, side, std.map?.uuid ?? '', std.alphaMap?.uuid ?? '', alphaTest, std.displacementMap?.uuid ?? '', attrs].join()
      if (seen.has(key)) continue
      seen.add(key)
      let depth = mesh.customDepthMaterial
      if (!depth) {
        const d = new THREE.MeshDepthMaterial()
        d.side = side
        d.map = std.map ?? null
        d.alphaMap = std.alphaMap ?? null
        d.alphaTest = alphaTest
        d.displacementMap = std.displacementMap ?? null
        if (std.displacementMap) {
          d.displacementScale = std.displacementScale
          d.displacementBias = std.displacementBias
        }
        materials.push(d)
        depth = d
      }
      let standIn: THREE.Mesh
      if (inst) {
        const im = new THREE.InstancedMesh(mesh.geometry, depth, 1)
        im.instanceColor = inst.instanceColor
        standIn = im
      } else standIn = new THREE.Mesh(mesh.geometry, depth)
      standIn.frustumCulled = false
      out.add(standIn)
    }
  })
  return { scene: out, materials }
}

/**
 * A composer's frame buffers - its two main ones and every pass's own (bloom's mips, the depth-of-field's stack) - let
 * go while the scene is far from the screen, taken back at the renderer's size on the way in. The stage's `rest` hook.
 * (The composer's own setSize would resize the renderer and the canvas with them.)
 */
export function restComposer(composer: EffectComposer | null, resting: boolean) {
  if (!composer) return
  if (!resting) {
    // at the renderer's present size: the composer leaves the renderer alone and resizes its own buffers
    const size = composer.getRenderer().getSize(new THREE.Vector2())
    composer.setSize(size.x, size.y)
    return
  }
  composer.inputBuffer.setSize(2, 2)
  composer.outputBuffer.setSize(2, 2)
  for (const pass of composer.passes) pass.setSize(2, 2)
}

/**
 * Resolves once every program the scene's first frame needs has linked. Call it with the scene complete (lights, fog,
 * environment, every mesh) and the composer's passes all added; hold the stage on the promise.
 * Without the parallel-compile extension there is nothing to gain and it resolves at once.
 * `target`: where a scene without a composer is drawn, when that is not the canvas (a layer of the shared canvas).
 */
export async function precompile(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, composer?: EffectComposer | null, target?: THREE.WebGLRenderTarget | null): Promise<void> {
  if (!renderer.extensions.has('KHR_parallel_shader_compile')) return
  const before = renderer.getRenderTarget()
  const waits: Promise<unknown>[] = []
  const temp: THREE.Material[] = []
  let depthTarget: THREE.WebGLRenderTarget | null = null
  try {
    // the scene, as it will be drawn: into the composer's buffer when there is one
    renderer.setRenderTarget(composer ? composer.inputBuffer : target ?? null)
    waits.push(renderer.compileAsync(scene, camera))
    const shadows = shadowStandIns(renderer, scene)
    if (shadows) {
      temp.push(...shadows.materials)
      depthTarget = new THREE.WebGLRenderTarget(1, 1)
      renderer.setRenderTarget(depthTarget)
      waits.push(renderer.compileAsync(shadows.scene, camera))
    }
    if (composer) {
      const { toBuffer, toScreen } = passMaterials(composer)
      const tri = composer.passes.map((p) => (p as unknown as { screen: THREE.Mesh | null }).screen).find((s) => s)?.geometry
      if (tri) {
        const flat = new THREE.OrthographicCamera()
        renderer.setRenderTarget(composer.outputBuffer)
        waits.push(renderer.compileAsync(screens(toBuffer, tri), flat))
        renderer.setRenderTarget(null)
        waits.push(renderer.compileAsync(screens(toScreen, tri), flat))
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[precompile] fell back to compiling on first draw:', e)
  } finally {
    renderer.setRenderTarget(before)
  }
  await Promise.all(waits)
  // The driver has linked them. What is left is three.js reading each program's uniforms and attributes on first use:
  // a round trip to the GPU process apiece, each waiting its turn there - forty of them in the first frame were a
  // tenth of a second on their own. Taken a few at a time instead, with a breath between.
  let t = performance.now()
  for (const program of [...(renderer.info.programs ?? [])]) {
    // gone while this waited: its scene was taken down (on a shared renderer the others' programs are still there), or
    // the whole renderer was
    if (!renderer.info.programs?.includes(program)) continue
    // Still with the driver: on a shared renderer that is another scene's program, asked for a moment ago. Asking for
    // its uniforms now would wait for it on the page's thread - the closing film's shader takes the driver most of a
    // second, and whichever scene finished meanwhile froze the page for exactly that long. Its own scene comes for it
    // when it is linked (and the first frame that uses it would, failing that).
    const ready = (program as unknown as { isReady?: () => boolean }).isReady
    if (ready && !ready.call(program)) continue
    try {
      program.getUniforms()
      program.getAttributes()
    } catch {
      // the renderer was disposed while this waited
      break
    }
    if (performance.now() - t > 4) {
      await new Promise((res) => setTimeout(res, 12))
      t = performance.now()
    }
  }
  // the stand-in depth materials shared their programs with the renderer's own; let the first frame take them over
  // before these let go
  if (temp.length || depthTarget) {
    setTimeout(() => {
      for (const m of temp) m.dispose()
      depthTarget?.dispose()
    }, 4000)
  }
}
