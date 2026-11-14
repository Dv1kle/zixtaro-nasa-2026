/// <reference lib="webworker" />
// The soil core's surface bake, off the main thread: ~1.5 megapixels of horizons, crumbs, pores and stones per atlas,
// and the tiling ground textures - half a second or more of arithmetic that used to hold the page's frame while the
// crossing scrolled in. One request, one answer; the arrays are handed back without a copy.
import { bakeProfile, surfaceArrays, type RGB, type StoneSpot, type SurfaceOptions } from './soilProfile'
import type { SoilLayer } from '../soil'

export type BakeRequest =
  | { id: number; kind: 'profile'; layers: SoilLayer[]; seed: number; coreH: number; stones: StoneSpot[]; /** per atlas column: x, z, s, region, width */ columns: Float64Array }
  | { id: number; kind: 'surface'; seed: number; soil: RGB; options: SurfaceOptions }

self.onmessage = async (e: MessageEvent<BakeRequest>) => {
  const m = e.data
  try {
    if (m.kind === 'profile') {
      const c = m.columns
      const bake = await bakeProfile({
        layers: m.layers,
        seed: m.seed,
        coreH: m.coreH,
        stones: m.stones,
        yieldMs: Infinity,
        column: (i) => ({ x: c[i * 5], z: c[i * 5 + 1], s: c[i * 5 + 2], region: c[i * 5 + 3] as 0 | 1 | 2, width: c[i * 5 + 4] }),
      })
      if (!bake) throw new Error('no bake')
      self.postMessage({ id: m.id, value: bake }, [bake.albedo.buffer, bake.normal.buffer, bake.data.buffer, bake.height.buffer])
    } else {
      const s = surfaceArrays(m.seed, m.soil, m.options)
      self.postMessage({ id: m.id, value: s }, [s.map.buffer, s.normal.buffer])
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) })
  }
}
