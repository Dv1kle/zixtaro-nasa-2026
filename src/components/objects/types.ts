// What the descent's 3D objects receive. Each one is lazy (three.js loads only when a crossing comes near) and is
// driven by its crossing's scroll progress - never by a timer of its own beyond slow ambient drift.
import type { MotionValue } from 'motion/react'
import type { SoilLayer } from '../../lib/soil'

export type ObjectBase = {
  /** 0 → 1 as the reader scrolls through the pinned crossing */
  progress: MotionValue<number>
  /** prefers-reduced-motion: draw still frames on progress changes only */
  reduce: boolean
}

/** H1 - the signature object: a two-metre soil core lifted out of this very field. */
export type SoilCoreProps = ObjectBase & {
  /** SoilGrids horizons, 0-200 cm (top/bottom in cm; sand/silt/clay %; soc g/kg; cfvo stones vol %; paw m³/m³) */
  layers: SoilLayer[]
  /** the next crop's rooting depth, metres (draw its roots to exactly this depth) */
  rootDepthM: number
  /** the next crop */
  crop: { name: string; color: string; family: string }
  /** plant-available water within that root reach, mm (the glowing water band) */
  pawMm: number
}

/** The market: the elevator the harvest is tipped at - the load is this crop (grain, or roots and tubers as a pile). */
export type MarketYardProps = ObjectBase & {
  crop: { id: string; name: string; color: string; group: string }
}

/** H2 - the field standing: the crop that grew here last (or the pick), as a field the camera passes through. */
export type CanopyFieldProps = ObjectBase & {
  crop: { id: string; name: string; color: string; family: string }
}
