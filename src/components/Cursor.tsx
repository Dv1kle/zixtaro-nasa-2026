// A follower for the pointer: a thin ring that trails the (kept) native cursor on a spring and opens over anything
// you can press - the page answering the hand without taking the cursor away. Fine pointers only; gone on touch,
// under reduced motion, over the map (it has its own crosshair) and over text fields. Positions are motion values,
// so moving the mouse never re-renders React.
// Over a pressable area that carries no word of its own (`data-cursor-label`: the dimmed page behind an open
// instrument) the ring opens wide and says what a press will do.
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

const PRESSABLE = 'a, button, [role="button"], [role="tab"], [role="switch"], summary, label, select, [data-cursor="press"]'
const HIDE = 'input, textarea, [contenteditable="true"], .maplibregl-canvas, [data-cursor="none"]'

export function Cursor() {
  const reduce = useReducedMotion()
  const [fine, setFine] = useState(false)
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const sx = useSpring(x, { stiffness: 520, damping: 42, mass: 0.6 })
  const sy = useSpring(y, { stiffness: 520, damping: 42, mass: 0.6 })
  const size = useMotionValue(26)
  const ss = useSpring(size, { stiffness: 380, damping: 30 })
  const fill = useMotionValue(0)
  const sf = useSpring(fill, { stiffness: 300, damping: 30 })
  // a hairline ring at rest; over something pressable it fills faintly with straw
  const bg = useTransform(sf, [0, 1], ['rgb(236 232 224 / 0)', 'rgb(236 232 224 / 0.1)'])
  const show = useMotionValue(0)
  const so = useSpring(show, { stiffness: 300, damping: 34 })
  const said = useMotionValue(0)
  const ssaid = useSpring(said, { stiffness: 300, damping: 30 })
  const word = useRef<HTMLSpanElement>(null)
  /** the ring's size at rest where it is now (a press shrinks it, the release returns it here) */
  const rest = useRef(26)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const on = () => setFine(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (!fine || reduce) return
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      x.set(e.clientX)
      y.set(e.clientY)
      const t = e.target instanceof Element ? e.target : null
      const hidden = !!t?.closest(HIDE)
      const press = !hidden && !!t?.closest(PRESSABLE)
      const says = hidden ? undefined : t?.closest<HTMLElement>('[data-cursor-label]')?.dataset.cursorLabel
      if (says && word.current && word.current.textContent !== says) word.current.textContent = says
      show.set(hidden ? 0 : 1)
      rest.current = says ? 74 : press ? 46 : 26
      size.set(rest.current)
      fill.set(press || says ? 1 : 0)
      said.set(says ? 1 : 0)
    }
    const leave = () => show.set(0)
    const down = () => size.set(Math.max(18, size.get() * 0.82))
    const up = () => size.set(rest.current)
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  }, [fine, reduce, x, y, size, fill, show, said])

  if (!fine || reduce) return null
  return (
    <motion.div
      aria-hidden
      className="keep-round screen-only pointer-events-none fixed top-0 left-0 z-[90] grid place-items-center overflow-hidden rounded-full"
      style={{
        x: sx,
        y: sy,
        width: ss,
        height: ss,
        translateX: '-50%',
        translateY: '-50%',
        opacity: so,
        // a bone hairline with a dark outline under it: it reads on the graphite night and on the bone paper alike
        border: '1px solid rgb(236 232 224 / 0.6)',
        boxShadow: '0 0 0 1px rgb(10 11 14 / 0.3)',
        backgroundColor: bg,
      }}
    >
      {/* the word, on a dark disc of its own so it reads over whatever is under it */}
      <motion.span style={{ opacity: ssaid }} className="keep-round absolute inset-0 grid place-items-center rounded-full bg-[rgb(10_11_14/0.82)]">
        <span ref={word} className="font-mono text-[10px] tracking-[0.16em] text-ink uppercase" />
      </motion.span>
    </motion.div>
  )
}
