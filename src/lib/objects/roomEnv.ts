// The studio environment the lit scenes take their reflections from, baked once per renderer.
// The soil core and the market yard each baked their own copy of the same thing under the loader: a pass of
// shader compiles and cube renders apiece, on a renderer they share.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const baked = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()

/** The room's pre-filtered environment for this renderer. It is kept for as long as the renderer is: do not dispose it. */
export function roomEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  let env = baked.get(renderer)
  if (!env) {
    const pmrem = new THREE.PMREMGenerator(renderer)
    env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    baked.set(renderer, env)
  }
  return env
}
