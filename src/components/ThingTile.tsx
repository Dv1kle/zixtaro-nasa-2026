// The greenhouse's own objects as small lit renders - a cover sample, a piece of kit, a seedling - drawn once by the
// specimen studio (lib/specimen.ts, loaded lazily) and kept as an image for the session, like the crop specimens. No
// live WebGL context; while the image is drawn (or where WebGL is missing) the space stays quietly empty.
import { useEffect, useState } from 'react'
import type { ThingId } from '../lib/specimen'

const THINGS = new Map<ThingId, string | null>()

function useThing(id: ThingId): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(() => THINGS.get(id))
  useEffect(() => {
    const known = THINGS.get(id)
    if (known !== undefined) {
      setSrc(known)
      return
    }
    let live = true
    import('../lib/specimen')
      .then((m) => m.thingFor(id))
      .then((u) => {
        THINGS.set(id, u)
        if (live) setSrc(u)
      })
      .catch(() => live && setSrc(null))
    return () => {
      live = false
    }
  }, [id])
  return src
}

export function ThingTile({ id, className = '', dim = false }: { id: ThingId; className?: string; dim?: boolean }) {
  const src = useThing(id)
  return (
    <span aria-hidden className={`relative inline-block shrink-0 ${className}`}>
      {src && (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-contain transition-[opacity,filter] duration-300 ${dim ? 'opacity-45 saturate-[0.4]' : 'opacity-100'}`}
        />
      )}
    </span>
  )
}
