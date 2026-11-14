import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { fetchDaily, fetchForecastRaw, fetchPower, fetchSoil, reversePlace, type Provenance, type SoilSamples } from './api'
import { analyzeClimate, parsePowerMonthly, type ClimateAnalysis } from './climate'
import { analyzeDaily, type DailyAnalysis } from './daily'
import { parseForecast, type Forecast } from './forecast'
import { fieldKey, type Field } from './geo'
import { onPageGeometry, sectionSpan, viewportHeight } from './pageGeometry'
import { calm, RANK } from './calm'
import { averageProfiles, manualProfile, parseSoilGrids, type SoilProfile } from './soil'
import { terrainFor, type Terrain } from './terrain'

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T; from: Provenance; url: string }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const LOADING = { status: 'loading' } as const

function profileFrom(s: SoilSamples): SoilProfile | null {
  const profiles: SoilProfile[] = []
  const points: { lat: number; lon: number }[] = []
  s.responses.forEach((r, i) => {
    if (!r) return
    try {
      profiles.push(parseSoilGrids(r))
      points.push(s.points[i])
    } catch {
      // a sample on a road, roof or pond - skip it
    }
  })
  return profiles.length ? averageProfiles(profiles, points) : null
}

/**
 * Everything we know about a field: 45 years of NASA POWER (monthly + daily), SoilGrids
 * (1-5 samples for areas, refined progressively), terrain and the live 16-day outlook.
 */
export function useFieldData(field: Field) {
  const key = fieldKey(field)
  const [climate, setClimate] = useState<Loadable<ClimateAnalysis>>(LOADING)
  const [soil, setSoil] = useState<Loadable<SoilProfile>>(LOADING)
  const [soilProgress, setSoilProgress] = useState({ done: 0, total: 1 })
  const [daily, setDaily] = useState<Loadable<DailyAnalysis | null>>(LOADING)
  const [terrain, setTerrain] = useState<Loadable<Terrain>>(LOADING)
  const [forecast, setForecast] = useState<Loadable<Forecast>>(LOADING)
  const [attempt, setAttempt] = useState(0)
  const fieldRef = useRef(field)
  fieldRef.current = field

  useEffect(() => {
    const f = fieldRef.current
    const ac = new AbortController()
    const live = <T,>(set: (v: Loadable<T>) => void) => (e: unknown) => {
      if (!ac.signal.aborted) set({ status: 'error', error: message(e) })
    }
    setClimate(LOADING)
    setSoil(LOADING)
    setDaily(LOADING)
    setTerrain(LOADING)
    setForecast(LOADING)
    setSoilProgress({ done: 0, total: 1 })

    // The daily series (800 kB) only feeds the frost panel: fetch it after the monthly one so
    // NASA POWER answers the request the plan depends on first.
    const daily = () =>
      fetchDaily(f, ac.signal)
        .then((r) => {
          if (!ac.signal.aborted) setDaily({ status: 'ready', data: analyzeDaily(r.data, f.lat), from: r.from, url: r.url })
        })
        .catch(live(setDaily))

    fetchPower(f, ac.signal)
      .then((r) => {
        const analysis = { ...analyzeClimate(parsePowerMonthly(r.data, f.lat), f.lat, f.lon), ...(r.height ? { height: r.height } : {}) }
        if (!ac.signal.aborted) setClimate({ status: 'ready', data: analysis, from: r.from, url: r.url })
      })
      .catch(live(setClimate))
      .finally(() => {
        if (!ac.signal.aborted) daily()
      })

    // SoilGrids can take 30+ s (or fail): after 3.5 s plan on a typical loam and refine when it answers.
    let gotSoil = false
    const provisional = () => {
      if (!gotSoil && !ac.signal.aborted) setSoil({ status: 'ready', data: manualProfile('loam', 6.5, 'provisional'), from: 'live', url: '' })
    }
    const soilTimer = setTimeout(provisional, 3500)
    fetchSoil(f, ac.signal, (s, done) => {
      if (ac.signal.aborted) return
      setSoilProgress({ done, total: s.points.length })
      const p = profileFrom(s)
      if (p) {
        gotSoil = true
        setSoil({ status: 'ready', data: p, from: 'live', url: '' })
      }
    })
      .then((r) => {
        if (ac.signal.aborted) return
        const p = profileFrom(r.data)
        if (p) {
          gotSoil = true
          setSoil({ status: 'ready', data: p, from: r.from, url: r.url })
        } else provisional()
      })
      .catch(() => provisional())

    terrainFor(f)
      .then((t) => {
        if (!ac.signal.aborted) setTerrain({ status: 'ready', data: t, from: 'live', url: '' })
      })
      .catch(live(setTerrain))

    fetchForecastRaw(f, ac.signal)
      .then((r) => {
        if (!ac.signal.aborted) setForecast({ status: 'ready', data: parseForecast(r.data as Parameters<typeof parseForecast>[0]), from: r.from, url: r.url })
      })
      .catch(live(setForecast))

    return () => {
      clearTimeout(soilTimer)
      ac.abort()
    }
  }, [key, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return { climate, soil, soilProgress, daily, terrain, forecast, retry }
}

export function usePlaceName(lat: number, lon: number, fallback?: string) {
  const [name, setName] = useState<string | null>(fallback ?? null)
  useEffect(() => {
    if (fallback) {
      setName(fallback)
      return
    }
    const ac = new AbortController()
    setName(null)
    const t = setTimeout(() => {
      reversePlace(lat, lon, ac.signal).then((n) => {
        if (!ac.signal.aborted) setName(n)
      })
    }, 350)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [lat, lon, fallback])
  return name
}

/**
 * Element width via ResizeObserver, for responsive SVG charts (measured before first paint).
 * A callback ref, so charts that first render a skeleton still get measured once the real element mounts.
 */
export function useWidth<T extends HTMLElement>(initial = 320) {
  const [width, setWidth] = useState(initial)
  const ro = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect()
    ro.current = null
    if (!el) return
    const measure = (w: number) => setWidth(Math.max(240, Math.floor(w)))
    measure(el.getBoundingClientRect().width)
    ro.current = new ResizeObserver(([entry]) => measure(entry.contentRect.width))
    ro.current.observe(el)
  }, [])
  useEffect(() => () => ro.current?.disconnect(), [])
  return [ref, width] as const
}

/**
 * Callback ref for a sideways scroller with a hidden scrollbar: fades the edge that still has more to show
 * (with the `edge-fade` class), so a phone shows that the row goes on. Writes CSS variables, no re-render.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const off = useRef<(() => void) | null>(null)
  const ref = useCallback((el: T | null) => {
    off.current?.()
    off.current = null
    if (!el) return
    const update = () => {
      const more = el.scrollWidth - el.clientWidth - el.scrollLeft
      el.style.setProperty('--fade-l', el.scrollLeft > 2 ? '28px' : '0px')
      el.style.setProperty('--fade-r', more > 2 ? '28px' : '0px')
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    el.addEventListener('scroll', update, { passive: true })
    off.current = () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])
  useEffect(() => () => off.current?.(), [])
  return ref
}

/** Which of the given section ids is crossing the middle of the viewport. */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    // Sections can be re-mounted (loading → ready), so they are looked up by id, not observed as nodes - in the page's
    // kept measurements, retaken when the page changes: measuring each one on every frame forced a layout per frame.
    let frame = 0
    const update = () => {
      frame = 0
      const mid = window.scrollY + viewportHeight() / 2
      // the last section whose top has passed the middle of the screen - so the gaps between sections (the
      // descent bands) and jumps straight to a section keep the right altitude
      let current = ids[0]
      for (const id of ids) {
        const s = sectionSpan(id)
        if (s && s.top <= mid) current = id
      }
      setActive(current)
    }
    const on = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', on, { passive: true })
    const offGeometry = onPageGeometry(on)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', on)
      offGeometry()
    }
  }, [ids])
  return active
}

export function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [threshold])
  return scrolled
}

/** A CSS media query as state - e.g. the desktop breakpoint. */
export function useMedia(query: string) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const change = () => setOn(m.matches)
    change()
    m.addEventListener('change', change)
    return () => m.removeEventListener('change', change)
  }, [query])
  return on
}

/**
 * Mounts a long page part by part: the count goes 0 → total, one step per idle moment, so the browser gets to
 * paint (and the intro's compositor animations keep running) between the steps instead of after one giant
 * render. `all()` jumps to the end synchronously (a jump to a section, printing); `startAll` begins there.
 * Steps up to `soon` happen promptly (the intro is waiting for them); later ones wait for real idle time, so
 * they don't stutter what is on screen by then (the globe's descent).
 * Plain updates on purpose: as transitions, every data arrival and the intro's own clock restarted them.
 */
export function useStaged(total: number, startAll = false, soon = total) {
  const [n, setN] = useState(startAll ? total : 0)
  useEffect(() => {
    if (n >= total) return
    const next = () => setN((x) => Math.max(x, Math.min(total, n + 1)))
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(next, { timeout: n < soon ? 60 : 1500 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(next, 32)
    return () => window.clearTimeout(id)
  }, [n, total])
  const all = useCallback(() => flushSync(() => setN(total)), [total])
  return [n, all] as const
}

/**
 * True once the loader has left and the page has had `ms` to itself - for what nobody is waiting for (the hidden
 * print reports and their QR code were mounted under the loader, while it waited for the scenes). A print asked for
 * sooner gets them at once.
 */
export function useAfterIntro(ms = 2500, bare = ms, quiet = false): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let t = 0
    let alive = true
    // (`quiet`: what turns on is heavy and unseen - it waits on for a pause in the scrolling; a timer alone put the
    // print reports' render in the middle of the reader's first scroll)
    const fire = () => {
      if (!quiet) setOn(true)
      else void calm.turn({ rank: RANK.idle, still: 1500, patience: 20000 }).then(() => alive && setOn(true))
    }
    const later = () => {
      t = window.setTimeout(fire, ms)
    }
    // (`bare`: the wait where there is no loader at all - a return visit)
    const atOnce = () => {
      t = window.setTimeout(fire, bare)
    }
    const now = () => flushSync(() => setOn(true))
    window.addEventListener('beforeprint', now)
    if (document.querySelector('[aria-label="Loading Zixtaro"]')) window.addEventListener('zixtaro:intro-done', later, { once: true })
    else atOnce()
    return () => {
      alive = false
      window.clearTimeout(t)
      window.removeEventListener('beforeprint', now)
      window.removeEventListener('zixtaro:intro-done', later)
    }
  }, [ms, bare, quiet])
  return on
}

/**
 * A heavy derived value computed just after the render that needs it, and again (debounced) when its inputs
 * change - so a slider keeps moving while the numbers catch up. Keeps the last value in the meantime.
 */
export function useLater<T>(compute: () => T, deps: unknown[], delay = 120): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    let t = 0
    const run = () => {
      t = window.setTimeout(() => setValue(compute()), delay)
    }
    // heavy analyses wait until the intro has left, so its animation never stutters
    if (document.querySelector('[aria-label="Loading Zixtaro"]')) {
      window.addEventListener('zixtaro:intro-done', run, { once: true })
      return () => {
        window.removeEventListener('zixtaro:intro-done', run)
        clearTimeout(t)
      }
    }
    run()
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}
