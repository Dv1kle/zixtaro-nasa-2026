import { describe, expect, it } from 'vitest'
import { planReport, planScore, currentRotation, type PlanEnv } from './planMetrics'
import { buildStrategies, PERSONAS } from './rotation'
import { asNow, chosenPlan, chosenSeasons, readPlan, type PlanView } from './strategyReading'
import { load } from './testkit'

function board(id: string) {
  const { p, climate, ctx, daily } = load(id)
  const env: PlanEnv = { climate, erosivity: daily.erosivityByMonth.recent, strawRemoved: false, catchCrops: false }
  const strategies = buildStrategies(p.history, ctx, p.priorities)
  const ref = currentRotation(p.history)
  const plans: PlanView[] = []
  const now = asNow(p.history)
  if (now) plans.push({ key: 'now', label: 'As now', blurb: '', ids: now, report: planReport(now, p.history, ctx, p.priorities, env, ref), w: null })
  for (const s of strategies) {
    const ids = s.seq.map((e) => e.crop.id)
    plans.push({ key: s.key, label: s.label, blurb: s.blurb, ids, report: planReport(ids, p.history, ctx, p.priorities, env, ref), w: PERSONAS.find((x) => x.key === s.key)?.w ?? null })
  }
  return { p, ctx, strategies, plans, now: plans.find((x) => x.key === 'now') ?? null }
}

describe('the rotation the farm is on, as a plan', () => {
  it('lays the last known seasons over four, in their order', () => {
    expect(asNow(['wheat', 'maize', null, 'wheat', 'rapeseed'])).toEqual(['wheat', 'maize', 'wheat', 'rapeseed'])
    expect(asNow([null, 'wheat', 'maize'])).toEqual(['wheat', 'maize', 'wheat', 'maize'])
    expect(asNow([null, null, 'wheat'])).toBeNull()
  })

  it('stands on the board of every demo field that has a history', () => {
    for (const id of ['torgau', 'poltava', 'iowa', 'kansas', 'pergamino']) {
      const { p, plans, now } = board(id)
      expect(!!now).toBe(p.history.filter(Boolean).length >= 2)
      expect(plans.length).toBeGreaterThanOrEqual(now ? 3 : 2)
    }
  })
})

describe('the plans on the plan plate', () => {
  it('carry the ledger’s own score, plan for plan', () => {
    for (const id of ['torgau', 'poltava', 'iowa']) {
      const { p, ctx, plans } = board(id)
      for (const x of plans) expect(planScore(x.ids, p.history, ctx, p.priorities)).toBe(x.report.score)
    }
  })
})

describe('a plan read out', () => {
  it('shows the engine’s own numbers for its strategies - the board invents none', () => {
    const { strategies, plans } = board('torgau')
    for (const s of strategies) {
      const r = plans.find((x) => x.key === s.key)!.report
      expect(r.fertiliserN).toBeCloseTo(s.metrics.fertiliserN, 6)
      expect(r.margin).toBeCloseTo(s.metrics.margin, 6)
      expect(r.loss).toBeCloseTo(s.metrics.loss, 6)
      expect(r.seq.reduce((a, e) => a + e.sub.soil, 0) / r.seq.length).toBeCloseTo(s.metrics.soil, 6)
    }
  })

  it('answers all five questions for every plan, on every demo field', () => {
    for (const id of ['torgau', 'poltava', 'iowa', 'kansas', 'pergamino']) {
      const { p, ctx, plans, now } = board(id)
      for (const plan of plans) {
        const r = readPlan(plan, { now, all: plans, ctx, priorities: p.priorities, start: 2027 })
        for (const part of ['why', 'rests', 'gives', 'gaps', 'check'] as const) expect(r[part].length, `${id} ${plan.key} ${part}`).toBeGreaterThan(0)
        // a plan is never read out as a sure thing: something unknown and something to check, always
        expect(r.check[r.check.length - 1].text).toMatch(/agronomist/)
        expect(r.check.length).toBeLessThanOrEqual(7)
        for (const l of [...r.why, ...r.rests, ...r.gives, ...r.costs, ...r.gaps, ...r.check]) expect(l.text).not.toMatch(/NaN|undefined|Infinity/)
      }
    }
  })

  it('measures a strategy against carrying on, and carrying on against nothing', () => {
    const { p, ctx, plans, now } = board('torgau')
    expect(now).not.toBeNull()
    const o = { now, all: plans, ctx, priorities: p.priorities, start: 2027 }
    const mine = readPlan(plans.find((x) => x.key === 'you')!, o)
    expect([...mine.gives, ...mine.costs].some((l) => /against/.test(l.text))).toBe(true)
    const same = readPlan(now!, o)
    expect(same.why.some((l) => /yardstick/.test(l.text))).toBe(true)
    expect([...same.gives, ...same.costs].some((l) => /against \d/.test(l.text))).toBe(false)
  })

  it('says so when the soil is a map, and stops saying it once the farmer brings a lab test', () => {
    const { p, ctx, plans, now } = board('torgau')
    const plan = plans.find((x) => x.key === 'you')!
    const mapped = readPlan(plan, { now, all: plans, ctx, priorities: p.priorities, start: 2027 })
    expect(mapped.gaps.some((l) => /not a sample from this field/.test(l.text))).toBe(true)
    const tested = readPlan(plan, { now, all: plans, ctx: { ...ctx, soil: { ...ctx.soil, lab: ['soc'] } }, priorities: p.priorities, start: 2027 })
    expect(tested.gaps.some((l) => /not a sample from this field/.test(l.text))).toBe(false)
    expect(tested.rests.some((l) => /Your own soil test/.test(l.text))).toBe(true)
  })
})

describe('the plan the page is built around', () => {
  it('is the engine’s own until another is chosen', () => {
    const { p, strategies } = board('torgau')
    const own = chosenPlan(strategies, p.history, 'you')!
    expect(own.key).toBe('you')
    expect(own.ids).toEqual(strategies[0].seq.map((e) => e.crop.id))
  })

  it('is the strategy chosen, crop for crop', () => {
    const { p, strategies } = board('torgau')
    for (const s of strategies) {
      const c = chosenPlan(strategies, p.history, s.key)!
      expect(c.key).toBe(s.key)
      expect(c.label).toBe(s.label)
      expect(c.ids).toEqual(s.seq.map((e) => e.crop.id))
    }
  })

  it('is the rotation the farm is on when that is chosen, over as many seasons as the plans have', () => {
    const { p, strategies } = board('torgau')
    const c = chosenPlan(strategies, p.history, 'now')!
    expect(c.key).toBe('now')
    expect(c.ids).toEqual(asNow(p.history, strategies[0].seq.length))
  })

  it('falls back to the engine’s own when the choice names no plan here', () => {
    const { p, strategies } = board('torgau')
    // a strategy the priorities no longer produce
    const gone = (['soil', 'water', 'profit'] as const).find((k) => !strategies.some((s) => s.key === k))
    if (gone) expect(chosenPlan(strategies, p.history, gone)!.key).toBe('you')
    // carrying on, where the history is not known
    expect(chosenPlan(strategies, [null, null, null], 'now')!.key).toBe('you')
    expect(chosenPlan([], p.history, 'you')).toBeNull()
  })
})

describe('the chosen plan, as the report prints it', () => {
  it('is the engine’s strategy untouched when a strategy was chosen', () => {
    const { p, ctx, strategies } = board('torgau')
    const s = strategies[strategies.length - 1]
    const c = chosenSeasons(chosenPlan(strategies, p.history, s.key)!, strategies, p.history, ctx, p.priorities)
    expect(c.seq).toBe(s.seq)
    expect(c.metrics).toBe(s.metrics)
    expect(c.label).toBe(s.label)
  })

  it('says of the rotation the farm is on what the plans’ ledger says of it', () => {
    for (const id of ['torgau', 'iowa', 'pergamino']) {
      const { p, ctx, strategies, now } = board(id)
      if (!now) continue
      const c = chosenSeasons(chosenPlan(strategies, p.history, 'now')!, strategies, p.history, ctx, p.priorities)
      expect(c.key).toBe('now')
      expect(c.seq.map((e) => e.crop.id)).toEqual(now.ids)
      // season by season the ledger's own scores, and the measures of its row
      c.seq.forEach((e, i) => expect(e.score, `${id} season ${i}`).toBeCloseTo(now.report.seq[i].score, 6))
      expect(c.metrics.fertiliserN).toBeCloseTo(now.report.fertiliserN, 6)
      expect(c.metrics.margin).toBeCloseTo(now.report.margin, 6)
      expect(c.metrics.loss).toBeCloseTo(now.report.loss, 6)
    }
  })
})
