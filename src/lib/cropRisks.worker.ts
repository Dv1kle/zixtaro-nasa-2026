// The crop water models (lib/water allCropRisks: a soil-water bucket run for every crop over every season on record)
// off the main thread. On a first visit they were half a second of the page's one thread, under a loader that was
// waiting for exactly them.
import { allCropRisks } from './water'

type Ask = { id: number; climate: Parameters<typeof allCropRisks>[0]; soil: Parameters<typeof allCropRisks>[1]; budget: number; transpiration: number }

self.onmessage = (e: MessageEvent<Ask>) => {
  const { id, climate, soil, budget, transpiration } = e.data
  try {
    ;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id, risks: allCropRisks(climate, soil, budget, transpiration) })
  } catch {
    ;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id, risks: null })
  }
}
