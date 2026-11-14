import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, type PointerEvent as RPointerEvent } from 'react'
import { CROP_BY_ID, isCropId } from '../lib/crops'
import { EASE_OUT } from '../lib/motion'
import { useSpecimen, type TileCrop } from './ui'

/** dev only: ?plancrop=<crop id> puts another crop in the vitrine (design review) */
const DEV_CROP = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('plancrop') : null

/**
 * The plan's answer as an object. Every height of the descent has its scene; the plan had a form. Here the crop
 * itself stands in a dark vitrine set into the paper - the one piece of the world the page keeps when it turns to
 * paper - drawn large for this plate (the cards' own drawing stands in until it is ready), with its name as a
 * collection label. Whatever the pick - wheat, maize, potato, a cover crop - it is that plant.
 */
export function PlanVitrine({ crop: given, className = '' }: { crop: TileCrop; className?: string }) {
  const crop = DEV_CROP && isCropId(DEV_CROP) ? CROP_BY_ID[DEV_CROP] : given
  const large = useSpecimen(crop, 1024)
  const small = useSpecimen(crop)
  const src = large ?? small ?? null
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  // the plant gives a little under the pointer, like the cards
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
    <div ref={ref} className={`plan-vitrine ${className}`} onPointerMove={move} onPointerLeave={leave}>
      <div aria-hidden className="plan-vitrine-stage">
        <span className="plan-vitrine-pool" />
        <AnimatePresence mode="wait" initial={false}>
          {src && (
            <motion.img
              // the small drawing gives way to the large one in place; another crop comes in new
              key={crop.id ?? crop.name}
              src={src}
              alt=""
              draggable={false}
              decoding="async"
              className="plan-vitrine-img"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: EASE_OUT }}
            />
          )}
        </AnimatePresence>
      </div>
      <div className="plan-vitrine-label font-mono">
        <span className="num opacity-60">{String(crop.n).padStart(2, '0')}</span>
        <span>{crop.name}</span>
        <i translate="no" className="font-voice">{crop.latin}</i>
      </div>
    </div>
  )
}
