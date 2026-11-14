import { describe, expect, it } from 'vitest'
import { createCalm, RANK, SLICE_MS, STILL_MS, type Calm } from './calm'

/** a fake page: a clock that only moves when told, timers on it, a frame every 16 ms */
function fakePage() {
  let t = 1000
  let visible = true
  const timers: { at: number; fn: () => void }[] = []
  const calm = createCalm({
    now: () => t,
    after: (ms, fn) => void timers.push({ at: t + ms, fn }),
    afterPaint: (fn) => void timers.push({ at: Math.ceil((t + 1) / 16) * 16, fn }),
    visible: () => visible,
  })
  /** move the clock to `to`, running every timer due on the way (and their promise continuations) */
  const advance = async (ms: number) => {
    const to = t + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > to) break
      timers.shift()
      t = Math.max(t, next.at)
      next.fn()
      // let the continuations of a resolved turn run before the next timer, as they would in a browser
      for (let i = 0; i < 5; i++) await Promise.resolve()
    }
    t = Math.max(t, to)
  }
  return {
    calm,
    advance,
    now: () => t,
    spend: (ms: number) => void (t += ms),
    hide: (h: boolean) => void (visible = !h),
  }
}

/** a long job of `steps` steps of `ms` each, breathing between them; records when each step ran */
async function job(page: ReturnType<typeof fakePage>, calm: Calm, steps: number, ms: number, log: number[], rank: number = RANK.build) {
  await calm.turn({ rank })
  for (let i = 0; i < steps; i++) {
    log.push(page.now())
    page.spend(ms)
    await calm.breathe({ rank })
  }
}

describe('calm: when heavy work may run', () => {
  it('waits for the reader to pause', async () => {
    const page = fakePage()
    const { calm } = page
    let ran = false
    calm.scrolled()
    void calm.turn().then(() => (ran = true))
    await page.advance(STILL_MS - 50)
    expect(ran).toBe(false)
    await page.advance(200)
    expect(ran).toBe(true)
  })

  it('runs nothing while the reader keeps scrolling, then runs when they stop', async () => {
    const page = fakePage()
    const { calm } = page
    let ran = 0
    void calm.turn().then(() => ran++)
    void calm.turn({ rank: RANK.idle }).then(() => ran++)
    for (let i = 0; i < 40; i++) {
      calm.scrolled()
      await page.advance(50)
    }
    expect(ran).toBe(0)
    await page.advance(STILL_MS + 100)
    expect(ran).toBe(2)
  })

  it('holds work while the page is hidden', async () => {
    const page = fakePage()
    page.hide(true)
    let ran = false
    void page.calm.turn().then(() => (ran = true))
    await page.advance(5000)
    expect(ran).toBe(false)
    page.hide(false)
    await page.advance(200)
    expect(ran).toBe(true)
  })

  it('takes a turn anyway once its patience runs out', async () => {
    const page = fakePage()
    const { calm } = page
    let ran = false
    void calm.turn({ patience: 2000 }).then(() => (ran = true))
    for (let i = 0; i < 30 && !ran; i++) {
      calm.scrolled()
      await page.advance(100)
    }
    expect(ran).toBe(true)
    expect(page.now()).toBeGreaterThanOrEqual(3000)
  })

  it('a longer stillness is asked for what is heavy and unseen', async () => {
    const page = fakePage()
    const { calm } = page
    const order: string[] = []
    calm.scrolled()
    void calm.turn({ still: 1500, rank: RANK.frame }).then(() => order.push('unseen'))
    void calm.turn({ rank: RANK.idle }).then(() => order.push('quick'))
    await page.advance(1000)
    // (the quick one's pause has come, the unseen one's has not: rank does not hold the queue up)
    expect(order).toEqual(['quick'])
    await page.advance(600)
    expect(order).toEqual(['quick', 'unseen'])
  })

  it('goes by rank, then by age', async () => {
    const page = fakePage()
    const { calm } = page
    const order: string[] = []
    calm.scrolled()
    void calm.turn({ rank: RANK.idle }).then(() => order.push('idle'))
    void calm.turn({ rank: RANK.start }).then(() => order.push('start 1'))
    void calm.turn({ rank: RANK.start }).then(() => order.push('start 2'))
    void calm.turn({ rank: RANK.frame }).then(() => order.push('frame'))
    await page.advance(2000)
    expect(order).toEqual(['frame', 'start 1', 'start 2', 'idle'])
  })

  it('cuts a long job into slices, one per painted frame, none over budget', async () => {
    const page = fakePage()
    const { calm } = page
    const log: number[] = []
    // 30 steps of 3 ms: 90 ms of work that used to be one long task
    const done = job(page, calm, 30, 3, log)
    await page.advance(3000)
    await done
    expect(log).toHaveLength(30)
    // group the steps into the slices they ran in: a new slice starts on a later frame
    const slices: number[][] = []
    let prev = -Infinity
    for (const at of log) {
      if (at - prev > 3) slices.push([at])
      else slices[slices.length - 1].push(at)
      prev = at
    }
    // a step starts only while the slice has budget left, so no slice runs past its budget by more than one step
    for (const s of slices) expect(s[s.length - 1] + 3 - s[0]).toBeLessThanOrEqual(SLICE_MS + 3)
    expect(slices.length).toBeGreaterThanOrEqual(Math.ceil(90 / (SLICE_MS + 3)))
    // and every slice starts on a frame of its own
    const frames = slices.map((s) => Math.floor(s[0] / 16))
    expect(new Set(frames).size).toBe(frames.length)
  })

  it('two jobs share the main thread: one turn at a time, never two in one frame', async () => {
    const page = fakePage()
    const { calm } = page
    const a: number[] = []
    const b: number[] = []
    const both = Promise.all([job(page, calm, 10, 5, a), job(page, calm, 10, 5, b)])
    await page.advance(3000)
    await both
    expect(a).toHaveLength(10)
    expect(b).toHaveLength(10)
    // no step of one ran inside the other's slice
    const all = [...a.map((t) => ({ t, j: 'a' })), ...b.map((t) => ({ t, j: 'b' }))].sort((x, y) => x.t - y.t)
    for (let i = 1; i < all.length; i++) expect(all[i].t - all[i - 1].t).toBeGreaterThanOrEqual(5)
  })

  it('a scroll in the middle of a job stops it until the next pause', async () => {
    const page = fakePage()
    const { calm } = page
    const log: number[] = []
    const done = job(page, calm, 20, 4, log)
    await page.advance(40)
    const before = log.length
    expect(before).toBeGreaterThan(0)
    expect(before).toBeLessThan(20)
    // the reader scrolls for half a second: nothing of the job runs in it
    const from = page.now()
    for (let i = 0; i < 10; i++) {
      calm.scrolled()
      await page.advance(50)
    }
    const to = page.now()
    expect(log.filter((t) => t > from && t <= to + STILL_MS - 1)).toEqual([])
    await page.advance(2000)
    await done
    expect(log).toHaveLength(20)
  })

  it('breathe carries on at once while the slice lasts', async () => {
    const page = fakePage()
    const { calm } = page
    // (granted on the first frame, at 1008; the clock stops just after it)
    await Promise.all([calm.turn(), page.advance(9)])
    const t0 = page.now()
    page.spend(2)
    await calm.breathe()
    expect(page.now()).toBe(t0 + 2)
    expect(calm.waiting()).toBe(0)
  })
})
