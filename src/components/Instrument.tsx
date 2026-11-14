import { ArrowRight, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMedia } from '../lib/hooks'
import { useMode } from '../lib/mode'
import { EASE_OUT } from '../lib/motion'
import { holdScroll } from '../lib/scroll'

/** Is the page told as a story (plates over the scenes, instruments one click deeper)? See lib/mode. */
export const useStory = () => useMode() === 'story'

/**
 * A section as a plate. In the story a section is one screen: its sentence, a few numbers, the door to its
 * instrument. `over`: a pinned crossing stands before it, and the plate rides up over that scene's last screen - the
 * scene does not end before the section, the section arrives on top of it (desktop, with motion on; elsewhere the
 * crossing is in the flow and the plate simply follows it).
 * Returns the class for the section's root.
 */
export function usePlate(over = false, wide = false): { story: boolean; root: string } {
  const story = useStory()
  const desktop = useMedia('(min-width: 1024px)')
  const reduce = useReducedMotion()
  // `wide`: the plate's content runs the full width (a row of objects), so its whole frame is dimmed, not just its left
  return { story, root: story ? `plate${over && desktop && !reduce ? ` plate-over${wide ? ' plate-wide' : ''}` : ''}` : '' }
}

export type Fact = { value: ReactNode; unit?: string; label: string }

/**
 * Has the element come into view yet? Once, and for good. A callback ref, so it follows the element as the mode
 * switches the plate in and out of the page (a ref object read once by an effect would miss the second mount, and a
 * plate's numbers would stay hidden).
 */
function useSeen(): [(el: Element | null) => void, boolean] {
  const [seen, setSeen] = useState(false)
  const io = useRef<IntersectionObserver | null>(null)
  const ref = useCallback((el: Element | null) => {
    io.current?.disconnect()
    io.current = null
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    io.current = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        setSeen(true)
        io.current?.disconnect()
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.current.observe(el)
  }, [])
  return [ref, seen]
}

/**
 * The plate's numbers: the two or three a decision is made on, large; what each is, small. Each is a reading under
 * its own hairline; they arrive one after another once the plate's sentence is up (index.css .plate-seq).
 */
export function PlateFacts({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null
  return (
    <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-7">
      {facts.map((f, k) => (
        <div key={f.label} className="fact min-w-[7rem]" style={{ '--k': k } as CSSProperties}>
          <dd className="font-display-soft text-[clamp(2.3rem,3.7vw,3.5rem)] leading-none text-ink">
            <span className="fact-fig">
              {f.value}
              {f.unit && <span className="ml-1.5 font-mono text-sm tracking-normal text-ink-3">{f.unit}</span>}
            </span>
          </dd>
          <dt className="mt-2.5 max-w-[20ch] text-[13px] leading-snug text-ink-3">{f.label}</dt>
        </div>
      ))}
    </dl>
  )
}

/**
 * A section's working part - its charts, tables and inputs.
 * Work mode: simply there, in the page. Story: behind a door on the plate (after the plate's `facts`), opening as a
 * sheet over the world; its contents exist only while it is open, so a story page carries none of their weight.
 */
export function Instrument({ title, kicker, label = 'Open the instrument', facts = [], paper = false, inline = false, children }: { title: ReactNode; kicker?: string; label?: string; facts?: Fact[]; paper?: boolean; /** open on the plate, not behind a door: what the farmer has to fill in */ inline?: boolean; children: ReactNode }) {
  const story = useStory()
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const [seq, seen] = useSeen()
  // the mode can change under an open sheet (the tour switches to the workbench)
  useEffect(() => {
    if (!story) setOpen(false)
  }, [story])
  if (!story || inline) return <>{children}</>
  return (
    <>
      {/* one order for every plate: the sentence, the readings, then the door (index.css .plate-seq) */}
      <div ref={seq} data-in={seen || undefined} className="plate-seq">
        <PlateFacts facts={facts} />
        <button
          ref={opener}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="door mt-10 inline-flex items-center gap-3 border border-leaf/50 px-5 py-3 font-mono text-[12px] tracking-[0.14em] text-leaf uppercase"
          style={{ '--k': facts.length } as CSSProperties}
        >
          {label}
          {/* the arrow goes through the door: one leaves to the right as its twin comes in from the left */}
          <span className="door-arrow" aria-hidden>
            <ArrowRight className="h-4 w-4" />
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      </div>
      {createPortal(
        <AnimatePresence>
          {open && (
            <Sheet
              title={title}
              kicker={kicker}
              paper={paper}
              onClose={() => {
                setOpen(false)
                opener.current?.focus()
              }}
            >
              {children}
            </Sheet>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

function Sheet({ title, kicker, paper, onClose, children }: { title: ReactNode; kicker?: string; paper: boolean; onClose: () => void; children: ReactNode }) {
  const reduce = useReducedMotion()
  const id = useId()
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    // the page behind holds still and steps out of reach while the instrument is on the table
    const main = document.querySelector('main')
    main?.setAttribute('inert', '')
    holdScroll(true)
    return () => {
      window.removeEventListener('keydown', key)
      main?.removeAttribute('inert')
      holdScroll(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <motion.div
        className="screen-only fixed inset-0 z-[70] bg-[rgb(5_6_9/0.6)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={onClose}
        data-cursor-label="Close"
        aria-hidden
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`screen-only fixed inset-y-0 right-0 z-[71] flex w-full flex-col border-l lg:w-[min(1180px,84vw)] ${paper ? 'paper border-black/10 bg-[#e7e5df] text-ink' : 'border-white/10 bg-[#0b0c10]'}`}
        initial={reduce ? { opacity: 0 } : { x: '5%', opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { x: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { x: '4%', opacity: 0 }}
        transition={{ duration: 0.38, ease: EASE_OUT }}
      >
        <header className="flex shrink-0 items-end justify-between gap-4 border-b border-white/10 px-5 pt-5 pb-4 sm:px-8">
          <div className="min-w-0">
            {kicker && <div className="font-mono text-[11px] tracking-[0.16em] text-ink-3 uppercase">{kicker}</div>}
            <h2 id={id} className="mt-1 truncate font-display-soft text-[clamp(1.5rem,2.4vw,2.1rem)] leading-none uppercase">
              {title}
            </h2>
          </div>
          <button ref={close} onClick={onClose} className="flex shrink-0 items-center gap-2 border border-white/15 px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-ink-2 uppercase transition-colors hover:border-white/40 hover:text-ink">
            <X className="h-3.5 w-3.5" aria-hidden />
            Close
          </button>
        </header>
        {/* its own scroll: the page's inertial scroll keeps out (data-lenis-prevent); a link to a section closes the sheet */}
        <div
          data-lenis-prevent
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-20 sm:px-8"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest?.('a[href^="#"]')) onClose()
          }}
        >
          {children}
        </div>
      </motion.aside>
    </>
  )
}
