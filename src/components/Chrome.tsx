import { BookOpen, Check, Link2, Printer, Scale, Share2, Tractor } from 'lucide-react'
import { openLegal } from '../lib/nav'
import { AnimatePresence, motion, useSpring } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ascentAltitude, between, cameraAltitude, descentDepth, dwell, formatAltitude, STRATUM, stopMetres } from '../lib/descent'
import { coord } from '../lib/format'
import { useActiveSection, useScrolled } from '../lib/hooks'
import { setMode, useMode } from '../lib/mode'
import { onPageGeometry, sectionSpan, viewportHeight } from '../lib/pageGeometry'
import { usePageProgress } from '../lib/scrollSpan'
import { lazyPart } from './lazyPart'
import { Popover } from './Popover'
import { CROPS } from '../lib/crops'
import { GH_CROPS } from '../lib/greenhouse'
import { CropTile, Logo } from './ui'

export type Stop = { id: string; alt: string; label: string; sub: string }

const TOP: Stop[] = [
  { id: 'orbit', alt: '705 km', label: 'Orbit', sub: 'Landsat · SMAP' },
  { id: 'ground', alt: '2.5 m', label: 'Ground', sub: 'Street View' },
  { id: 'air', alt: '2 m', label: 'Air', sub: 'NASA POWER' },
]
/** A field descends into the soil; a greenhouse stops under its roof. */
export const STOPS: Record<'field' | 'greenhouse', Stop[]> = {
  field: [
    ...TOP,
    { id: 'field', alt: '0 m', label: 'Field', sub: 'your rotation' },
    { id: 'roots', alt: '−0.6 m', label: 'Roots', sub: 'SoilGrids' },
    { id: 'plan', alt: '▲ 0 m', label: 'Plan', sub: 'resurface' },
    { id: 'market', alt: '▲ 0 m', label: 'Market', sub: 'where it sells' },
  ],
  greenhouse: [
    ...TOP,
    { id: 'house', alt: '0 m', label: 'House', sub: 'under glass' },
    { id: 'energy', alt: 'roof', label: 'Energy', sub: 'CERES · POWER' },
    { id: 'plan', alt: '▲ 0 m', label: 'Plan', sub: 'the year' },
    { id: 'market', alt: '▲ 0 m', label: 'Market', sub: 'where it sells' },
  ],
}

/** The story's stops, in the order a farmer works in (App: `linear`). */
export const FLOW_STOPS: Stop[] = [
  { id: 'orbit', alt: '705 km', label: 'Choose a field', sub: 'the map' },
  { id: 'field', alt: '0 m', label: 'Your field', sub: 'what you grow' },
  { id: 'air', alt: '2 m', label: 'Weather', sub: 'NASA POWER' },
  { id: 'roots', alt: '−0.6 m', label: 'Soil', sub: 'SoilGrids' },
  { id: 'plan', alt: '▲ 0 m', label: 'What to sow', sub: 'the answer' },
]

/** Fixed altitude gauge: every section sits at the height where its data is measured. */
export function Altimeter({ stops }: { stops: Stop[] }) {
  const ids = useMemo(() => stops.map((s) => s.id), [stops])
  const active = useActiveSection(ids)
  const idx = Math.max(0, ids.indexOf(active))
  const stop = stops[idx]
  const readout = useRef<HTMLDivElement>(null)
  // over the story's hero the gauge waits: nothing has been descended yet, and the first screen has enough on it
  const scrolled = useScrolled()
  // (the story is no longer a descent by altitude: the gauge is the workbench's. It stays mounted - it feeds the
  // depth the background reads - and is not shown)
  const wait = useMode() === 'story' || !scrolled

  // One continuous number instead of seven fixed labels: over the hero it is the camera's own height, below it the
  // height each section measures at - dwelling on a section, then falling to the next as its end scrolls by.
  // Written straight to the DOM: it changes on every scroll frame. Everything it reads comes from the page's kept
  // measurements (no layout), and it reads before it writes - a frame here must not make the page lay itself out.
  useEffect(() => {
    const metres = stops.map((s) => stopMetres(s.alt))
    let frame = 0
    let last = ''
    const update = () => {
      frame = 0
      const probe = window.scrollY + viewportHeight() / 2
      const boxes = ids.map((id) => sectionSpan(id))
      let i = 0
      boxes.forEach((r, k) => {
        if (r && r.top <= probe) i = k
      })
      const here = boxes[i]
      const next = boxes[i + 1]
      const cam = cameraAltitude.get()
      let m: number
      let t = 0
      if (i === 0 && here) {
        // the hero: the camera, then down through the cloud band to the ground's 2.5 m
        const from = cam != null ? cam * 1000 : metres[0]
        t = next ? Math.min(1, Math.max(0, (probe - here.bottom) / Math.max(1, next.top - here.bottom))) : 0
        m = between(from, metres[1] ?? from, t)
      } else {
        t = here && next ? dwell((probe - here.top) / Math.max(1, next.top - here.top)) : 0
        m = between(metres[i], metres[i + 1] ?? metres[i], t)
      }
      // the strata the atmosphere and the crossings read: linear between sections (no dwell), smooth as the scroll
      const lin = i === 0 ? t : here && next ? Math.min(1, Math.max(0, (probe - here.top) / Math.max(1, next.top - here.top))) : 0
      const sA = STRATUM[ids[i]] ?? 0
      const sB = STRATUM[ids[i + 1]] ?? sA
      descentDepth.set({ stratum: sA + (sB - sA) * lin, metres: m })
      const s = stops[i]
      const word = !/\d/.test(s.alt) && t < 0.01
      // on the way back up the closing film's camera is the height that matters
      const up = ascentAltitude.get() ?? 0
      const text = up > 0.05 ? `▲ ${formatAltitude(up * 1000)}` : word ? s.alt : `${s.alt.startsWith('▲') && t < 0.01 ? '▲ ' : ''}${formatAltitude(m)}`
      if (text !== last && readout.current) {
        readout.current.textContent = text
        last = text
      }
    }
    const on = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    const offCam = cameraAltitude.subscribe(on)
    const offUp = ascentAltitude.subscribe(on)
    const offGeometry = onPageGeometry(on)
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      offCam()
      offUp()
      offGeometry()
      window.removeEventListener('scroll', on)
    }
  }, [ids, stops])

  return (
    <nav aria-label="Descent" className={`screen-only fixed bottom-5 left-4 z-40 hidden w-[96px] border-t border-ink/20 bg-void/90 px-1.5 pt-2 pb-1.5 transition-opacity duration-300 lg:block xl:left-6 ${wait ? 'opacity-0' : ''}`}>
      <div className="kicker !text-[11px]">altitude</div>
      <div className="mt-1">
        {/* aria-live off: a number that changes on every frame is not an announcement */}
        {/* no React children: the effect owns this text, a re-render must not put a stale label back */}
        {/* a box of its own size, laid out and painted on its own: the number changing never touches the page */}
        <div ref={readout} className="num h-5 overflow-hidden text-sm text-leaf [contain:strict]" />
        <div className="mt-0.5 font-mono text-[11px] leading-tight text-ink-4">{stop.sub}</div>
      </div>
      <ol className="sr-only">
        {stops.map((s, i) => (
          <li key={s.id} className="relative">
            <a href={`#${s.id}`} className="group block" aria-current={i === idx ? 'location' : undefined}>
              {/* dot and ring share one 18 × 18 box centred on the rail, so they stay concentric */}
              <span className="absolute top-0 -left-[25px] grid h-[18px] w-[18px] place-items-center">
                <span className={`h-2.5 w-2.5 rounded-full border transition-colors duration-300 ${i <= idx ? 'border-leaf bg-leaf/70' : 'border-white/25 bg-void'}`} />
              </span>
              <span className={`block font-mono text-[11px] leading-[18px] tracking-wider uppercase transition-colors ${i === idx ? 'text-ink' : 'text-ink-4 group-hover:text-ink-2'}`}>{s.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * Phones and tablets have no room for the altimeter rail: the same descent becomes a bar along the bottom edge, every
 * section one thumb-tap away (the phone page is ~28 000 px tall, the answer ~16 000 px down). Hidden over the hero,
 * whose own controls own that edge, and during the tour.
 */
export function AltimeterBar({ stops, hidden = false }: { stops: Stop[]; hidden?: boolean }) {
  const ids = useMemo(() => stops.map((s) => s.id), [stops])
  const active = useActiveSection(ids)
  const idx = Math.max(0, ids.indexOf(active))
  const show = idx > 0 && !hidden
  return (
    <nav
      aria-label="Sections"
      aria-hidden={!show}
      className={`screen-only fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[rgb(5_8_15/0.97)] pb-[env(safe-area-inset-bottom)] transition-[opacity,transform] duration-300 lg:hidden ${show ? '' : 'pointer-events-none translate-y-full opacity-0'}`}
    >
      <div className="relative mx-auto max-w-[640px]">
        {/* the rail: the part already descended is lit */}
        <span className="absolute top-[13px] right-[7%] left-[7%] h-px bg-white/10" aria-hidden />
        <motion.span
          className="absolute top-[13px] left-[7%] h-px origin-left bg-leaf/60"
          style={{ width: '86%' }}
          animate={{ scaleX: stops.length > 1 ? idx / (stops.length - 1) : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          aria-hidden
        />
        <ol className="flex">
          {stops.map((s, i) => (
            <li key={s.id} className="relative flex-1">
              <a href={`#${s.id}`} tabIndex={show ? 0 : -1} aria-current={i === idx ? 'location' : undefined} className="flex min-h-[52px] flex-col items-center gap-1.5 px-0.5 pt-2 pb-1.5">
                <span className="relative grid h-[12px] w-[12px] place-items-center">
                  <span className={`h-2 w-2 rounded-full border transition ${i <= idx ? 'border-leaf bg-leaf/70' : 'border-white/25 bg-void'}`} />
                  {i === idx && (
                    <motion.span layoutId="alt-bar-bug" className="absolute -inset-[4px] rounded-full border border-leaf/70 shadow-[0_0_12px_rgba(201,176,122,.55)]" transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
                  )}
                </span>
                <span className={`max-w-full truncate text-[11px] leading-none transition ${i === idx ? 'text-ink' : 'text-ink-4'}`}>{s.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  )
}

/** The page's answer, kept in the top bar while the reader is anywhere but the plan itself. */
export type TopAnswer = { label: string; name: string; color: string }

export function TopBar({ stops, place, lat, lon, farmCount, onFarm, onMethod, canPrint, answer }: { stops: Stop[]; place: string | null; lat: number; lon: number; farmCount: number; onFarm: () => void; onMethod: () => void; canPrint: boolean; answer: TopAnswer | null }) {
  const scrolled = useScrolled()
  // The story's bar is the way through the page and nothing else: over the hero the name and the method; once the
  // descent has begun, its stops and the share card. The farm, the workbench switch, the small print and the printer
  // are the workbench's (?view=workbench); the story has the last two in the footer and on the plan's plate.
  const story = useMode() === 'story'
  const full = !story || scrolled
  // (the answer's chip was a third copy of the answer and a second way to the plan: the story names the field instead)
  const chip = !!answer && !story
  const ids = useMemo(() => stops.map((s) => s.id), [stops])
  const active = useActiveSection(ids)
  const atPlan = active === 'plan'
  // The altimeter's bug, in the menu: a straw hairline under the stop the reader is at, sliding to the next as they
  // descend. Placed from the link's own box (a transform on one element), so it needs no layout animation inside a
  // fixed bar on a scrolling page.
  const nav = useRef<HTMLDivElement>(null)
  const bug = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const box = nav.current
    const b = bug.current
    if (!box || !b) return
    const place = () => {
      const a = box.querySelector<HTMLElement>('a[aria-current="location"]')
      // (no offsetParent: the stops are hidden at this width)
      if (!a || !a.offsetParent) {
        b.style.opacity = '0'
        return
      }
      const pad = parseFloat(getComputedStyle(a).paddingLeft) || 0
      b.style.opacity = '1'
      b.style.transform = `translateX(${a.offsetLeft + pad}px) scaleX(${Math.max(1, a.offsetWidth - pad * 2)})`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(box)
    return () => ro.disconnect()
  }, [active, stops])
  const progress = useSpring(usePageProgress(), { stiffness: 140, damping: 30 })
  // the answer's own specimen in the chip, not a dot of its data colour
  const answerCrop = useMemo(() => (answer ? [...GH_CROPS, ...CROPS].find((c) => c.name === answer.name) ?? null : null), [answer?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <header className={`screen-only fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300 ${scrolled ? 'border-b border-white/10 bg-[rgb(5_8_15/0.97)]' : 'border-b border-transparent'}`}>
      <motion.div className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-gradient-to-r from-orbit via-leaf to-wheat" style={{ scaleX: progress }} />
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-4 sm:gap-4 sm:px-8">
        <a href="#orbit" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span translate="no" className="notranslate font-display-soft text-[22px] leading-none">Zixtaro</span>
        </a>
        <div className={`hidden min-w-0 items-center gap-3 text-sm transition-opacity md:flex ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
          {/* the bar is as wide as the page's column, and with every stop and button in it there is room for the place
              or the answer, not both: squeezed in beside the answer, the place shrank to nothing and its coordinates
              wrapped under the chip */}
          <span className={`min-w-0 items-center gap-3 overflow-hidden ${chip ? 'flex lg:hidden' : 'flex'}`}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-leaf shadow-[0_0_8px_var(--color-leaf)]" />
            <span className="truncate text-ink-2">{place ?? 'Your field'}</span>
            <span translate="no" className="num hidden shrink-0 text-xs whitespace-nowrap text-ink-4 2xl:inline">{coord(lat, lon)}</span>
          </span>
          {chip && answer && (
            <a
              href="#plan"
              tabIndex={atPlan ? -1 : 0}
              className={`hidden max-w-[17rem] min-w-0 items-center gap-2 rounded-full border border-leaf/25 bg-leaf/[0.07] py-1 pr-3 pl-2.5 text-[13px] text-ink-3 transition-[opacity,border-color,background-color] duration-300 hover:border-leaf/50 hover:bg-leaf/[0.13] lg:flex ${atPlan ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
              aria-label={`${answer.label}: ${answer.name} - go to the plan`}
            >
              {answerCrop ? <CropTile crop={answerCrop} size="xs" className="-my-1.5 !h-7 !w-7" /> : <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: answer.color, boxShadow: `0 0 8px ${answer.color}` }} />}
              <span className="truncate whitespace-nowrap">
                {answer.label}: <span className="text-ink">{answer.name}</span>
              </span>
            </a>
          )}
        </div>
        <div ref={nav} className="relative flex items-center gap-1 sm:gap-2">
          <span ref={bug} aria-hidden className="stop-bug" />
          {full && stops.slice(1).map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={s.id === active ? 'location' : undefined} className={`stop hidden px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors duration-300 xl:block ${s.id === active ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}>
              {s.label}
            </a>
          ))}
          {!story && <ModeSwitch />}
          <button onClick={onMethod} className="flex items-center gap-2 rounded-full border border-white/15 px-2.5 py-1.5 text-[13px] text-ink-2 transition hover:border-white/40 hover:text-ink sm:px-3" aria-label="Method: how Zixtaro works">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            <span className="max-[359px]:sr-only">Method</span>
          </button>
          {/* the small print beside the method: privacy, terms, what the tool is not, sources, licence (phones reach
              it from the footer - the bar has no room there) */}
          {!story && <button onClick={() => openLegal()} className="hidden items-center gap-2 rounded-full border border-white/15 px-2.5 py-1.5 text-[13px] text-ink-2 transition hover:border-white/40 hover:text-ink sm:flex sm:px-3" aria-label="Legal: what it is not, privacy, terms, sources, licence" title="Legal: privacy, terms, sources, licence">
            <Scale className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden min-[1440px]:inline">Legal</span>
          </button>}
          {!story && <button onClick={onFarm} className="flex items-center gap-2 rounded-full bg-leaf/15 px-2.5 py-1.5 text-[13px] text-leaf transition hover:bg-leaf/25 sm:px-3" aria-label={`My farm: ${farmCount} saved`}>
            <Tractor className="h-3.5 w-3.5" />
            <span className="hidden whitespace-nowrap sm:inline">My farm</span>
            <span className="num rounded-full bg-leaf px-1.5 text-[11px] text-[#0a0b0e]">{farmCount}</span>
          </button>}
          {/* phones: the address bar shares and printing is rare - the room goes to the word "Method" */}
          {full && (
            <div className="hidden sm:block">
              <ShareButton />
            </div>
          )}
          {canPrint && !story && (
            <button onClick={() => window.print()} className="hidden items-center gap-2 rounded-full sm:flex border border-white/15 px-2.5 py-1.5 text-[13px] text-ink-2 transition hover:border-white/40 hover:text-ink sm:px-3" aria-label="Print the report">
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline xl:hidden 2xl:inline">Report</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

/**
 * Story or workbench (lib/mode): the story keeps one screen per height and each height's instrument one click deeper;
 * the workbench lays every instrument open in the page - the tool for someone who came to work, not to watch.
 */
export function ModeSwitch({ className = 'hidden md:flex' }: { className?: string }) {
  const work = useMode() === 'work'
  return (
    <button
      onClick={() => setMode(work ? 'story' : 'work')}
      aria-pressed={work}
      title={work ? 'Back to the story: one screen per height, instruments one click deeper' : 'Workbench: every chart, table and input open in the page'}
      className={`items-center gap-2 rounded-full border px-2.5 py-1.5 text-[13px] transition sm:px-3 ${work ? 'border-leaf/60 text-leaf hover:border-leaf' : 'border-white/15 text-ink-2 hover:border-white/40 hover:text-ink'} ${className}`}
    >
      <span aria-hidden className="grid h-3 w-3 grid-rows-3 gap-[2px]">
        <i className="bg-current" />
        <i className={work ? 'bg-current' : 'bg-current opacity-35'} />
        <i className={work ? 'bg-current' : 'bg-current opacity-35'} />
      </span>
      <span className="whitespace-nowrap">Workbench</span>
    </button>
  )
}

// the QR code comes with the print reports' chunk, loaded when the card first opens
const QR = lazyPart(() => import('./PrintReport').then((m) => m.QR), <div className="h-[224px] w-[224px] rounded-lg bg-white/5" />)

/** This exact scenario (field, history, priorities, greenhouse, what-if): a QR code to open it on a phone, or a link. */
function ShareButton() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const button = useRef<HTMLButtonElement>(null)
  // the link is read when the card opens: the scenario lives in the address bar
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 2600)
    return () => clearTimeout(t)
  }, [state])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('manual') // no clipboard permission (e.g. plain http): the address bar has the same link
    }
  }
  const native = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <div className="relative">
      <button
        ref={button}
        onClick={() => {
          setUrl(window.location.href)
          setState('idle')
          setOpen(!open)
        }}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/15 px-2.5 py-1.5 text-[13px] text-ink-2 transition hover:border-white/40 hover:text-ink sm:px-3"
        aria-label="Share this scenario: a QR code for your phone or a link"
      >
        <Link2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline xl:hidden 2xl:inline">Share</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={button} label="Share this scenario" width={300} align="end">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-[15px] text-ink">Open it on your phone</div>
          <div className="overflow-hidden rounded-lg">
            <QR text={url} size={224} />
          </div>
          <p className="text-xs leading-relaxed text-ink-3">Scan it with the phone’s camera: the page opens on this exact field, history, priorities and what-if.</p>
          <div className="flex w-full gap-2">
            <button onClick={copy} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[13px] text-ink-2 transition hover:border-white/40 hover:text-ink">
              {state === 'copied' ? <Check className="h-3.5 w-3.5 text-leaf" /> : <Link2 className="h-3.5 w-3.5" />}
              {state === 'copied' ? 'Copied' : 'Copy link'}
            </button>
            {native && (
              <button onClick={() => void navigator.share({ title: document.title, url }).catch(() => {})} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[13px] text-ink-2 transition hover:border-white/40 hover:text-ink">
                <Share2 className="h-3.5 w-3.5" />
                Send…
              </button>
            )}
          </div>
          {state !== 'idle' && (
            <p role="status" className="text-xs leading-relaxed text-ink-2">
              {state === 'copied'
                ? 'Link copied. Whoever opens it sees this exact field, history, priorities and what-if.'
                : 'Copy the address bar - the link there holds this exact scenario.'}
            </p>
          )}
        </div>
      </Popover>
    </div>
  )
}
