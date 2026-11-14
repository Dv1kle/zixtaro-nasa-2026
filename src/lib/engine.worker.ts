/// <reference lib="webworker" />
// Heavy analyses off the main thread. Only the newest job is worked on: a job that went stale while another was
// computing is dropped between phases, so dragging a slider never queues up minutes of work.
import { phases, type EngineJob } from './engineCore'

let latest: { id: number; job: EngineJob } | null = null
let busy = false

function next() {
  const cur = latest
  latest = null
  if (!cur) {
    busy = false
    return
  }
  busy = true
  const steps = phases(cur.job)
  const step = (i: number) => {
    if (latest) return next() // a newer job arrived: abandon this one
    if (i >= steps.length) return next()
    const [phase, run] = steps[i]
    let value: unknown = null
    try {
      value = run()
    } catch (e) {
      console.error('engine', phase, e)
    }
    self.postMessage({ id: cur.id, phase, value })
    setTimeout(() => step(i + 1), 0)
  }
  step(0)
}

self.onmessage = (e: MessageEvent<{ id: number; job: EngineJob }>) => {
  latest = e.data
  if (!busy) next()
}
