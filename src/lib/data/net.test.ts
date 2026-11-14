// src/lib/data/net.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cached, clock, gate, getJson, readCache, SourceError, writeCache } from './net'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  clock.now = () => Date.now()
})

describe('dossier network helpers', () => {
  it('expires cache entries after their age', () => {
    let t = 1_000_000
    clock.now = () => t
    writeCache('k1', { a: 1 })
    expect(readCache('k1', 60_000)).toEqual({ a: 1 })
    t += 61_000
    expect(readCache('k1', 60_000)).toBeNull()
  })

  it('classifies 429 as rate-limited and other errors as failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })))
    await expect(getJson('https://x.test/a')).rejects.toMatchObject({ kind: 'rate-limited', status: 429 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    await expect(getJson('https://x.test/a')).rejects.toBeInstanceOf(SourceError)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(getJson('https://x.test/a')).rejects.toMatchObject({ kind: 'failed' })
  })

  it('serves a stale cached value, flagged cache, when the network fails', async () => {
    let t = 5_000_000
    clock.now = () => t
    writeCache('k2', 42)
    t += 2 * 3_600_000
    const r = await cached('k2', 3_600_000, async () => {
      throw new SourceError('failed', 'offline')
    })
    expect(r).toEqual({ data: 42, from: 'cache' })
    await expect(cached('never', 1, async () => { throw new SourceError('failed', 'offline') })).rejects.toThrow('offline')
  })

  it('keeps at most N calls in flight and spaces their starts', async () => {
    vi.useFakeTimers()
    let t = 0
    clock.now = () => t
    const run = gate(1, 1000)
    const starts: number[] = []
    const job = () => run(async () => { starts.push(t) })
    const all = Promise.all([job(), job(), job()])
    await vi.advanceTimersByTimeAsync(0) // let the first admitted call run before the clock moves
    for (let i = 0; i < 5; i++) {
      t += 1000
      await vi.advanceTimersByTimeAsync(1000)
    }
    await all
    expect(starts).toHaveLength(3)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000)
  })
})
