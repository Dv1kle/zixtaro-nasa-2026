// The soil core's textures: baked in a worker (soilBake.worker.ts, the arithmetic of soilProfile.ts), wrapped here as
// three.js textures. A browser that refuses the worker gets the same bake on this thread, yielding between row bands.
import * as THREE from 'three'
import type { SoilLayer } from '../soil'
import { ATLAS_H, ATLAS_W, RELIEF_AMP, bakeProfile, surfaceArrays, type ProfileBake, type RGB, type StoneSpot, type SurfaceOptions } from './soilProfile'

export type AtlasColumn = { x: number; z: number; s: number; region: 0 | 1 | 2; width: number }

export type ProfileTextures = {
  albedo: THREE.DataTexture
  normal: THREE.DataTexture
  data: THREE.DataTexture
  /** relief height in metres at an atlas uv (for displacing the geometry) */
  heightAt: (u: number, v: number) => number
  dispose: () => void
}

/** undefined: not asked for yet; null: this browser will not run it */
let worker: Worker | null | undefined
let nextId = 1
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()

function bakery(): Worker | null {
  if (worker !== undefined) return worker
  try {
    const w = new Worker(new URL('./soilBake.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; value?: unknown; error?: string }>) => {
      const p = waiting.get(e.data.id)
      if (!p) return
      waiting.delete(e.data.id)
      if (e.data.error) p.reject(new Error(e.data.error))
      else p.resolve(e.data.value)
    }
    w.onerror = () => {
      // the worker did not load or threw outside a request: answer everyone, and bake on this thread from now on
      worker = null
      w.terminate()
      for (const p of waiting.values()) p.reject(new Error('soil bake worker failed'))
      waiting.clear()
    }
    worker = w
  } catch {
    worker = null
  }
  return worker
}

/** The worker's answer, or null when there is no worker (or it failed): then the caller computes it here. */
async function ask<T>(message: object): Promise<T | null> {
  const w = bakery()
  if (!w) return null
  const id = nextId++
  try {
    return await new Promise<T>((resolve, reject) => {
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject })
      w.postMessage({ ...message, id })
    })
  } catch {
    return null
  }
}

export function dataTex(arr: Uint8Array, w: number, h: number, srgb: boolean, repeat: boolean) {
  const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.anisotropy = 8
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  return t
}

/**
 * The monolith's atlas as textures. `column(i)` gives an atlas column's plan position (x, z), its metric surface
 * coordinate s and its region (0, 1 the cut faces, 2 the skin) with the region's metric width.
 */
export async function profileTextures(o: { layers: SoilLayer[]; seed: number; coreH: number; column: (i: number) => AtlasColumn; stones: StoneSpot[]; cancelled?: () => boolean }): Promise<ProfileTextures | null> {
  const columns = new Float64Array(ATLAS_W * 5)
  for (let i = 0; i < ATLAS_W; i++) {
    const c = o.column(i)
    columns[i * 5] = c.x
    columns[i * 5 + 1] = c.z
    columns[i * 5 + 2] = c.s
    columns[i * 5 + 3] = c.region
    columns[i * 5 + 4] = c.width
  }
  let bake = await ask<ProfileBake>({ kind: 'profile', layers: o.layers, seed: o.seed, coreH: o.coreH, stones: o.stones, columns })
  if (o.cancelled?.()) return null
  if (!bake) bake = await bakeProfile(o)
  if (!bake) return null
  const W = ATLAS_W
  const H = ATLAS_H
  const hgt = bake.height
  const albedo = dataTex(bake.albedo, W, H, true, false)
  const normal = dataTex(bake.normal, W, H, false, false)
  const data = dataTex(bake.data, W, H, false, false)
  return {
    albedo,
    normal,
    data,
    heightAt: (u, v) => {
      const i = Math.min(W - 1, Math.max(0, Math.round(u * W - 0.5)))
      const j = Math.min(H - 1, Math.max(0, Math.round(v * H - 0.5)))
      return (hgt[j * W + i] - 0.5) * RELIEF_AMP
    },
    dispose: () => {
      albedo.dispose()
      normal.dispose()
      data.dispose()
    },
  }
}

/** A tiling texture pair for a crumbly soil surface (albedo + normal), `tile` metres across. */
export async function surfaceTextures(seed: number, soil: RGB, options: SurfaceOptions): Promise<{ map: THREE.DataTexture; normal: THREE.DataTexture }> {
  const s = (await ask<ReturnType<typeof surfaceArrays>>({ kind: 'surface', seed, soil, options })) ?? surfaceArrays(seed, soil, options)
  return { map: dataTex(s.map, s.size, s.size, true, true), normal: dataTex(s.normal, s.size, s.size, false, true) }
}
