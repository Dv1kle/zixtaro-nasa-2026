import { useEffect, useRef, useState } from 'react'
import { phases, type EngineJob, type EngineResult, type Phase } from './engineCore'

const EMPTY: EngineResult = { confidence: null, sens: null, sobol: undefined, // undefined: not computed yet; null: not applicable
  causal: null, sowing: null }
let worker: Worker | null | undefined

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    worker = null // no module workers: fall back to the main thread
  }
  return worker
}

/** The analyses for the current job, filled in phase by phase; the previous results stay until new ones arrive. */
export function useEngine(job: EngineJob | null): EngineResult {
  const [result, setResult] = useState<EngineResult>(EMPTY)
  const seq = useRef(0)
  useEffect(() => {
    if (!job) return
    const id = ++seq.current
    const w = getWorker()
    const put = (phase: Phase, value: unknown) => {
      if (id === seq.current) setResult((r) => ({ ...r, [phase]: value }))
    }
    if (w) {
      const onMsg = (e: MessageEvent<{ id: number; phase: Phase; value: unknown }>) => e.data.id === id && put(e.data.phase, e.data.value)
      const onErr = () => {
        worker = null // the worker failed to load: compute here from now on
      }
      w.addEventListener('message', onMsg)
      w.addEventListener('error', onErr)
      w.postMessage({ id, job })
      return () => {
        w.removeEventListener('message', onMsg)
        w.removeEventListener('error', onErr)
      }
    }
    // main-thread fallback: one phase per tick so the page stays responsive
    const steps = phases(job)
    let t = 0
    const step = (i: number) => {
      if (i >= steps.length || id !== seq.current) return
      put(steps[i][0], steps[i][1]())
      t = window.setTimeout(() => step(i + 1), 30)
    }
    t = window.setTimeout(() => step(0), 120)
    return () => clearTimeout(t)
  }, [job])
  return result
}
