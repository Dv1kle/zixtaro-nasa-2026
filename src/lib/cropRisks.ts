// The crop water models, asked for from the page: computed in a worker (lib/cropRisks.worker), on the main thread
// only where there is no worker or the question cannot be sent.
import { useEffect, useState } from 'react'
import { allCropRisks } from './water'

type Climate = Parameters<typeof allCropRisks>[0]
type Soil = Parameters<typeof allCropRisks>[1]
type Risks = ReturnType<typeof allCropRisks>

let worker: Worker | null | undefined
let seq = 0
const waiting = new Map<number, (r: Risks | null) => void>()

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    const w = new Worker(new URL('./cropRisks.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; risks: Risks | null }>) => {
      waiting.get(e.data.id)?.(e.data.risks)
      waiting.delete(e.data.id)
    }
    w.onerror = () => {
      // it could not start (or died): everything asked of it is answered here instead, and so is whatever comes next
      worker = null
      for (const answer of waiting.values()) answer(null)
      waiting.clear()
    }
    worker = w
  } catch {
    worker = null
  }
  return worker
}
// started with the page, so it is up before the climate and the soil are in
if (typeof window !== 'undefined' && typeof Worker !== 'undefined') queueMicrotask(getWorker)

/** `allCropRisks`, off the main thread where it can be. */
export function cropRisksOffThread(climate: Climate, soil: Soil, budget: number, transpiration: number): Promise<Risks> {
  const here = () => allCropRisks(climate, soil, budget, transpiration)
  const w = getWorker()
  if (!w) return Promise.resolve(here())
  return new Promise((resolve) => {
    const id = ++seq
    waiting.set(id, (r) => resolve(r ?? here()))
    try {
      w.postMessage({ id, climate, soil, budget, transpiration })
    } catch {
      // something in the question does not survive the trip
      waiting.delete(id)
      resolve(here())
    }
  })
}

/**
 * The crops' water risks for this climate and soil; null until they are in. Another field's (or another climate's)
 * figures are never returned against this one; a new water budget keeps the last figures until its own arrive, as a
 * slider's deferred value always did.
 */
export function useCropRisks(climate: Climate | null | undefined, soil: Soil | null | undefined, budget: number, transpiration: number): Risks | null {
  const [got, setGot] = useState<{ climate: Climate; soil: Soil; risks: Risks } | null>(null)
  useEffect(() => {
    if (!climate || !soil) return
    let live = true
    void cropRisksOffThread(climate, soil, budget, transpiration).then((risks) => {
      if (live) setGot({ climate, soil, risks })
    })
    return () => {
      live = false
    }
  }, [climate, soil, budget, transpiration])
  return climate && soil && got && got.climate === climate && got.soil === soil ? got.risks : null
}
