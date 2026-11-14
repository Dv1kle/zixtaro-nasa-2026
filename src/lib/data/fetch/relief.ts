// src/lib/data/fetch/relief.ts
// The DEM grid around a field from AWS terrarium tiles (browser only: tiles decode through a canvas), with a margin
// so upslope water from outside the field is counted.
import type { Field } from '../../geo'
import { ringBbox } from '../../geo'
import { loadTile, worldPx } from '../../terrain'
import { maskFor, reliefStats, type Grid, type ReliefStats } from '../derive/relief'

export async function reliefFor(field: Field): Promise<ReliefStats> {
  const dLat = 150 / 111_320
  const dLon = dLat / Math.cos((field.lat * Math.PI) / 180)
  const [w, s, e, n] = field.kind === 'area' ? ringBbox(field.ring) : [field.lon - dLon, field.lat - dLat, field.lon + dLon, field.lat + dLat]
  const area = field.kind === 'area' ? field.areaHa : 9
  const zoom = area <= 500 ? 14 : area <= 5_000 ? 13 : 12
  const mx = (e - w) * 0.3 + dLon
  const my = (n - s) * 0.3 + dLat
  const a = worldPx(n + my, w - mx, zoom)
  const b = worldPx(s - my, e + mx, zoom)
  const x0 = Math.floor(a.x)
  const y0 = Math.floor(a.y)
  const gw = Math.min(1024, Math.ceil(b.x) - x0)
  const gh = Math.min(1024, Math.ceil(b.y) - y0)
  const z = new Float32Array(gw * gh)
  const tiles = new Map<string, ImageData>()
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + gh - 1) / 256); ty++)
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + gw - 1) / 256); tx++) tiles.set(`${tx}/${ty}`, await loadTile(zoom, tx, ty))
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const px = x0 + i
      const py = y0 + j
      const t = tiles.get(`${Math.floor(px / 256)}/${Math.floor(py / 256)}`)!
      const k = ((py % 256) * 256 + (px % 256)) * 4
      z[j * gw + i] = t.data[k] * 256 + t.data[k + 1] + t.data[k + 2] / 256 - 32768
    }
  const cell = (156_543.03392 * Math.cos((field.lat * Math.PI) / 180)) / 2 ** zoom
  const g: Grid = { w: gw, h: gh, z, cell, zoom, x0, y0 }
  return reliefStats(g, maskFor(g, field))
}
