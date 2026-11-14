// A menu or small dialog that always sits on top of the page and is always readable. It renders into
// document.body, so no section below can paint over it and no animated ancestor (a filter or a transform
// makes its own stacking context) can clip it; its surface is opaque, so the text under it never shows
// through. It opens under its button (or above it, where there is more room) and follows it on scroll;
// on a phone it becomes a sheet at the bottom of the screen. Esc, a tap outside or the X closes it and
// the focus goes back to the button.

import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const PHONE = '(max-width: 639px)'
const GAP = 8
const EDGE = 8
const HEADER = 60 // the fixed top bar: a popover never slides under it

type Place = { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

export function Popover({
  open,
  onClose,
  anchor,
  label,
  children,
  width = 360,
  align = 'start',
  initialFocus,
  title,
}: {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  /** accessible name of the dialog */
  label: string
  children: ReactNode
  width?: number
  align?: 'start' | 'end'
  /** what gets the focus when it opens (default: the dialog itself) */
  initialFocus?: RefObject<HTMLElement | null>
  /** heading of the phone sheet (defaults to the label) */
  title?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE).matches)
  const [place, setPlace] = useState<Place | null>(null)

  useEffect(() => {
    const mq = window.matchMedia(PHONE)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // where it goes: under the button, or above it when there is more room there; kept inside the screen
  useLayoutEffect(() => {
    if (!open || phone) return
    let frame = 0
    const measure = () => {
      frame = 0
      const a = anchor.current
      if (!a) return
      const r = a.getBoundingClientRect()
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      // the button scrolled away: nothing left to point at
      if (r.bottom < 0 || r.top > vh) return onClose()
      const w = Math.min(width, vw - 2 * EDGE)
      const left = Math.min(Math.max(align === 'end' ? r.right - w : r.left, EDGE), vw - EDGE - w)
      const below = vh - r.bottom - GAP - EDGE
      const above = r.top - GAP - Math.max(EDGE, HEADER)
      setPlace(below >= 300 || below >= above
        ? { left, width: w, top: r.bottom + GAP, maxHeight: below }
        : { left, width: w, bottom: vh - r.top + GAP, maxHeight: above })
    }
    measure()
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    window.addEventListener('scroll', later, true)
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', later, true)
      window.removeEventListener('resize', later)
    }
  }, [open, phone, anchor, width, align, onClose])

  // Esc and a tap outside close it; the focus moves in, and back to the button when it closes
  useEffect(() => {
    if (!open) return
    const back = anchor.current
    const t = setTimeout(() => (initialFocus?.current ?? box.current)?.focus({ preventScroll: true }), 30)
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node
      if (!box.current?.contains(n) && !anchor.current?.contains(n)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      if (back && box.current?.contains(document.activeElement)) back.focus({ preventScroll: true })
    }
  }, [open, anchor, initialFocus, onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && phone && (
        <motion.div key="sheet-bg" className="fixed inset-0 z-[94] bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
      )}
      {open && (phone || place) && (
        <motion.div
          key="pop"
          ref={box}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          initial={phone ? { y: '100%' } : { opacity: 0, y: place?.top !== undefined ? -6 : 6, scale: 0.98 }}
          animate={phone ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={phone ? { y: '100%' } : { opacity: 0, y: place?.top !== undefined ? -6 : 6, scale: 0.98 }}
          transition={{ duration: phone ? 0.28 : 0.16, ease: [0.16, 1, 0.3, 1] }}
          style={phone ? undefined : { left: place!.left, width: place!.width, top: place!.top, bottom: place!.bottom, maxHeight: place!.maxHeight }}
          className={
            phone
              ? 'surface fixed inset-x-0 bottom-0 z-[95] flex max-h-[85svh] flex-col rounded-t-3xl border-b-0 pb-[env(safe-area-inset-bottom)] outline-none'
              : 'surface fixed z-[95] flex flex-col overflow-hidden rounded-2xl outline-none'
          }
        >
          {phone && (
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="text-[15px] font-medium text-ink">{title ?? label}</div>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-ink" aria-label="Close">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          )}
          <div className="min-h-0 overflow-y-auto overscroll-contain p-3">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
