// What farms actually grow around a field, anywhere on Earth - CROPGRIDS 2020 (Tang et al. 2024, Scientific Data
// 11:413), the harvested area of 173 crops at 0.05°, folded by scripts/cropgrids.py into a 0.5° grid that ships with
// the app (public/data/crops). It is the reality a recommendation should be read against: a region's farmers know
// their markets, machinery and pests, which no model sees. Shares are of all harvested area in the cell, so they
// need not add up to 100 %: the rest is other crops (vegetables, fruit, fodder…).

import { REGION_RING } from './prior'

export type GridIndex = { crops: string[]; d: number; cells: number; source: string; url: string }
export type LocalCrop = { id: string; share: number }
export type LocalCrops = {
  /** harvested area in the 0.5° cell, km² */
  areaKm2: number
  crops: LocalCrop[] // share of the cell's harvested area, largest first
  /** how far the nearest cropland cell was, in cells (0 = the field's own) */
  offset: number
  cell: { lat: number; lon: number }
}

const COLS = 720
const ROWS = 360

/** Parse grid.bin into a map from cell index (row × 720 + col) to its record. */
export function parseGrid(buf: ArrayBuffer, index: GridIndex): Map<number, { areaKm2: number; crops: LocalCrop[] }> {
  const v = new DataView(buf)
  const out = new Map<number, { areaKm2: number; crops: LocalCrop[] }>()
  let o = 0
  while (o + 7 <= v.byteLength) {
    const row = v.getUint16(o, true)
    const col = v.getUint16(o + 2, true)
    const total = v.getUint16(o + 4, true)
    const n = v.getUint8(o + 6)
    o += 7
    const crops: LocalCrop[] = []
    for (let k = 0; k < n; k++) {
      crops.push({ id: index.crops[v.getUint8(o)], share: v.getUint8(o + 1) / 100 })
      o += 2
    }
    out.set(row * COLS + col, { areaKm2: total, crops })
  }
  return out
}

/** The field's own 0.5° cell, or the nearest one with cropland within `reach` cells. */
export function lookup(grid: Map<number, { areaKm2: number; crops: LocalCrop[] }>, lat: number, lon: number, reach = 2): LocalCrops | null {
  const r0 = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / 0.5)))
  const c0 = ((Math.floor((lon + 180) / 0.5) % COLS) + COLS) % COLS
  for (let ring = 0; ring <= reach; ring++) {
    let best: { rec: { areaKm2: number; crops: LocalCrop[] }; r: number; c: number } | null = null
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
        const r = r0 + dr
        if (r < 0 || r >= ROWS) continue
        const c = (((c0 + dc) % COLS) + COLS) % COLS
        const rec = grid.get(r * COLS + c)
        if (rec && (!best || rec.areaKm2 > best.rec.areaKm2)) best = { rec, r, c }
      }
    }
    if (best) {
      return { areaKm2: best.rec.areaKm2, crops: best.rec.crops, offset: ring, cell: { lat: 90 - (best.r + 0.5) * 0.5, lon: -180 + (best.c + 0.5) * 0.5 } }
    }
  }
  return null
}

/**
 * The CROPGRIDS mix of a square ring of cells rIn..rOut cells from the field's own 0.5-degree cell (rIn 2: the cell and
 * its 8 neighbours left out), as shares of ALL the ring's harvested area, CROPGRIDS ids - the region's practice, mode C's
 * prior (prior.ts REGION_RING). Null when the ring holds no cropland.
 */
export function ringMix(grid: Map<number, { areaKm2: number; crops: LocalCrop[] }>, lat: number, lon: number, rIn: number, rOut: number): Record<string, number> | null {
  const r0 = Math.floor((90 - lat) / 0.5)
  const c0 = ((Math.floor((lon + 180) / 0.5) % COLS) + COLS) % COLS
  const mix: Record<string, number> = {}
  let total = 0
  for (let dr = -rOut; dr <= rOut; dr++) {
    for (let dc = -rOut; dc <= rOut; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) < rIn || r0 + dr < 0 || r0 + dr >= ROWS) continue
      const rec = grid.get((r0 + dr) * COLS + ((((c0 + dc) % COLS) + COLS) % COLS))
      if (!rec) continue
      for (const c of rec.crops) {
        total += rec.areaKm2 * c.share
        mix[c.id] = (mix[c.id] ?? 0) + rec.areaKm2 * c.share
      }
    }
  }
  if (!total) return null
  for (const k of Object.keys(mix)) mix[k] /= total
  return mix
}

/** how far "around the field" reaches when asking what is grown there at all: 5 cells of 0.5°, about 250 km */
const AROUND_CELLS = 5

let loaded: Promise<{ index: GridIndex; grid: Map<number, { areaKm2: number; crops: LocalCrop[] }> } | null> | null = null
const base = () => `${import.meta.env.BASE_URL}data/crops/`

export async function localCrops(lat: number, lon: number): Promise<{ here: LocalCrops | null; region: Record<string, number> | null; around: Record<string, number> | null; source: string; url: string } | null> {
  loaded ??= Promise.all([
    fetch(`${base()}grid.json`).then((r) => (r.ok ? (r.json() as Promise<GridIndex>) : null)),
    fetch(`${base()}grid.bin`).then((r) => (r.ok ? r.arrayBuffer() : null)),
  ])
    .then(([index, buf]) => (index && buf ? { index, grid: parseGrid(buf, index) } : null))
    .catch(() => null)
  const g = await loaded
  if (!g) return null
  return { here: lookup(g.grid, lat, lon), region: ringMix(g.grid, lat, lon, REGION_RING[0], REGION_RING[1]), around: ringMix(g.grid, lat, lon, 0, AROUND_CELLS), source: g.index.source, url: g.index.url }
}

/** Display names for the CROPGRIDS groups Zixtaro does not model as crops of its own. */
export const OTHER_NAMES: Record<string, string> = {
  rice: 'Rice', cotton: 'Cotton', sugarcane: 'Sugarcane', groundnut: 'Groundnut', bean: 'Dry bean', cassava: 'Cassava',
  pigeonpea: 'Pigeon pea', cowpea: 'Cowpea', sesame: 'Sesame', oilpalm: 'Oil palm', coffee: 'Coffee', cocoa: 'Cocoa',
  vegetables: 'Other vegetables', sweetpotato: 'Sweet potato',
  tomato: 'Tomato', onion: 'Onion', cabbage: 'Cabbage', chilli: 'Chilli & pepper', watermelon: 'Watermelon', okra: 'Okra',
  yam: 'Yam', tobacco: 'Tobacco', safflower: 'Safflower', castor: 'Castor bean', jute: 'Jute', fonio: 'Fonio',
  quinoa: 'Quinoa', taro: 'Taro', bambara: 'Bambara groundnut', vetch: 'Vetch', silagemaize: 'Silage maize',
  grassley: 'Grass ley', foragesorghum: 'Forage sorghum', forage: 'Other fodder', trees: 'Orchards & plantations',
  otherannual: 'Other field crops',
}
