import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { EASE_OUT } from '../lib/motion'
import type { MethodThing } from '../lib/specimen'

const DRAWN = new Map<MethodThing, string | null>()

/** the chapter's object, drawn large in the specimens' studio (lib/specimen); undefined while it is drawn */
function useMethodThing(id: MethodThing): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(() => DRAWN.get(id))
  useEffect(() => {
    const known = DRAWN.get(id)
    if (known !== undefined) {
      setSrc(known)
      return
    }
    setSrc(undefined)
    let live = true
    import('../lib/specimen')
      .then((m) => m.thingFor(id, 1024))
      .then((u) => {
        DRAWN.set(id, u)
        if (live) setSrc(u)
      })
      .catch(() => live && setSrc(null))
    return () => {
      live = false
    }
  }, [id])
  return src
}

/**
 * The head of a Method chapter: what it says on the left, and beside it the one object the chapter is about, in the
 * same dark vitrine the plan keeps its crop in. Every chapter opens the same way - a kicker, a headline, a line, a
 * thing on the table - where four of the six used to open on a form.
 */
export function MethodHead({ thing, label, note, pool, children }: { thing: MethodThing; label: string; note: string; /** where the object stands in its square, % from the top (default 80) */ pool?: number; children: ReactNode }) {
  const src = useMethodThing(thing)
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === 'touch' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3))
    ref.current.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3))
  }
  const leave = () => {
    ref.current?.style.removeProperty('--px')
    ref.current?.style.removeProperty('--py')
  }
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)] lg:items-stretch lg:gap-14">
      <div className="min-w-0 lg:py-4">{children}</div>
      <div ref={ref} className="plan-vitrine method-vitrine mt-10 lg:mt-0" onPointerMove={move} onPointerLeave={leave}>
        <div aria-hidden className="plan-vitrine-stage" style={pool ? ({ '--pool': `${pool}%` } as CSSProperties) : undefined}>
          <span className="plan-vitrine-pool" />
          {src && (
            <motion.img
              key={thing}
              src={src}
              alt=""
              draggable={false}
              decoding="async"
              className="plan-vitrine-img"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: EASE_OUT }}
            />
          )}
        </div>
        <div className="plan-vitrine-label font-mono">
          <span>{label}</span>
          <i className="font-voice">{note}</i>
        </div>
      </div>
    </div>
  )
}
