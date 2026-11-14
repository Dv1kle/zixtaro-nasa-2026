// src/lib/data/net.ts
// Network helpers for the field dossier: timeouts, typed failures, a small cache that works in the browser
// (localStorage) and in Node scripts (memory), and gates that keep each source inside its fair-use limits.

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export type FailKind = 'rate-limited' | 'failed' | 'out-of-coverage'
export class SourceError extends Error {
  constructor(public kind: FailKind, message: string, public status?: number) {
    super(message)
  }
}

/** Replaced in tests. */
export const clock = { now: () => Date.now() }

const PREFIX = 'zixtaro:v2:data:'
const memory = new Map<string, string>()
function store(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // blocked storage: fall through to memory
  }
  return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) }
}

export function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = store().getItem(PREFIX + key)
    if (!raw) return null
    const { t, v } = JSON.parse(raw) as { t: number; v: T }
    return clock.now() - t < maxAgeMs ? v : null
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, v: T): void {
  try {
    store().setItem(PREFIX + key, JSON.stringify({ t: clock.now(), v }))
  } catch {
    // storage full: caching is only a convenience
  }
}

const host = (u: string) => {
  try {
    return new URL(u).hostname
  } catch {
    return u
  }
}

export async function getJson<T>(url: string, opts: { timeoutMs?: number; signal?: AbortSignal; init?: RequestInit } = {}): Promise<T> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(url, { ...opts.init, signal })
  } catch (e) {
    if (opts.signal?.aborted) throw e
    throw new SourceError('failed', `${host(url)} did not answer`)
  }
  if (res.status === 429) throw new SourceError('rate-limited', `${host(url)} asks to slow down`, 429)
  if (!res.ok) throw new SourceError('failed', `${host(url)} responded ${res.status}`, res.status)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new SourceError('failed', `${host(url)}: ${text.slice(0, 80)}`)
  }
}

/** Fresh cache → load → (on failure) stale cache flagged `cache` → the error. Loaders return parsed, compact data. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: { signal?: AbortSignal; staleMs?: number } = {}): Promise<{ data: T; from: 'live' | 'cache' }> {
  const fresh = readCache<T>(key, ttlMs)
  if (fresh !== null) return { data: fresh, from: 'cache' }
  try {
    const data = await load()
    writeCache(key, data)
    return { data, from: 'live' }
  } catch (e) {
    if (opts.signal?.aborted) throw e
    const stale = readCache<T>(key, opts.staleMs ?? 30 * DAY)
    if (stale !== null) return { data: stale, from: 'cache' }
    throw e
  }
}

/** At most `concurrency` calls in flight and at least `minGapMs` between their starts (FIFO). */
export function gate(concurrency: number, minGapMs = 0) {
  let active = 0
  let last = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null
  const queue: (() => void)[] = []
  const pump = () => {
    if (timer || active >= concurrency || queue.length === 0) return
    const wait = last + minGapMs - clock.now()
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = null
        pump()
      }, wait)
      return
    }
    active++
    last = clock.now()
    queue.shift()!()
    pump()
  }
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve)
      pump()
    })
    try {
      return await fn()
    } finally {
      active--
      pump()
    }
  }
}

/** One gate per service, shared by every caller in the page (and by api.ts for SoilGrids). */
export const GATES = {
  soilgrids: gate(1, 12_500), // ISRIC fair use: ≤ 5 requests a minute
  ornl: gate(4),
  mpc: gate(4),
  openmeteo: gate(3),
  power: gate(2),
  isda: gate(6),
}
