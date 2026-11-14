// Golden rankings: every demo field's top five and rotation plan, frozen. A change in the science shows up here as a
// reviewed snapshot diff (update with `npx vitest run -u` only when the change is intended and explained).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withDailyExtremes } from './extremes'
import { rFactor } from './erosion'
import { parseGrid, ringMix, type GridIndex } from './localCrops'
import { winterDrainage } from './nitrate'
import { practiceFor } from './practice'
import { REGION_RING } from './prior'
import { buildStrategies, rankNext } from './rotation'
import { pickConfidence } from './robust'
import { load } from './testkit'
import { canonical, fnv1a, MODEL_VERSION, scenarioId } from './version'

describe('golden rankings on the demo fields', () => {
  for (const id of ['torgau', 'poltava', 'iowa', 'kansas', 'pergamino', 'torgau-east', 'torgau-pivot']) {
    it(id, () => {
      const { p, climate, soil, ctx, daily } = load(id)
      const c = { ...ctx, risks: withDailyExtremes(ctx.risks, daily.raw, climate), winterDrain: winterDrainage(climate, soil), erosivity: rFactor(climate.monthly.recent) }
      const ex = new Set(p.exclude)
      const top = rankNext(p.history, c, p.priorities, ex).slice(0, 5).map((e) => `${e.crop.id} ${e.score.toFixed(1)}`)
      const plan = buildStrategies(p.history, c, p.priorities, ex)[0]?.seq.map((e) => e.crop.id)
      expect({ model: MODEL_VERSION, top, plan }).toMatchSnapshot()
    })
  }
})

describe('golden mode C (local practice, the page default) on the demo fields', () => {
  const index = JSON.parse(readFileSync('public/data/crops/grid.json', 'utf8')) as GridIndex
  const buf = readFileSync('public/data/crops/grid.bin')
  const grid = parseGrid(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), index)
  const ISO3: Record<string, string> = { torgau: 'DEU', poltava: 'UKR', iowa: 'USA', kansas: 'USA', pergamino: 'ARG' }
  for (const id of Object.keys(ISO3)) {
    it(id, () => {
      const { p, climate, soil, ctx, daily } = load(id)
      const { lat, lon } = p.field
      const practice = practiceFor(ringMix(grid, lat, lon, REGION_RING[0], REGION_RING[1]), lat, ISO3[id])
      const c = { ...ctx, practice, risks: withDailyExtremes(ctx.risks, daily.raw, climate), winterDrain: winterDrainage(climate, soil), erosivity: rFactor(climate.monthly.recent) }
      const top = rankNext(p.history, c, p.priorities, new Set(p.exclude)).slice(0, 5).map((e) => `${e.crop.id} ${e.score.toFixed(1)} (science ${e.science.toFixed(1)})`)
      expect({ model: MODEL_VERSION, source: practice.source, top }).toMatchSnapshot()
    })
  }
})

describe('determinism and scenario IDs', () => {
  it('the Monte Carlo gives the same answer twice (seeded)', () => {
    const { p, climate, ctx } = load('torgau')
    const a = pickConfidence(p.history, ctx, p.priorities, new Set(p.exclude), climate, 60)
    const b = pickConfidence(p.history, ctx, p.priorities, new Set(p.exclude), climate, 60)
    expect(a).toEqual(b)
  })
  it('IDs ignore key order, change with any input, and carry the model version', () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}')
    expect(scenarioId({ x: 1, y: 2 })).toBe(scenarioId({ y: 2, x: 1 }))
    expect(scenarioId({ x: 1, y: 2 })).not.toBe(scenarioId({ x: 1, y: 3 }))
    expect(fnv1a('')).toBe('811c9dc5')
    expect(fnv1a('a')).toBe('e40c292c')
  })
})
