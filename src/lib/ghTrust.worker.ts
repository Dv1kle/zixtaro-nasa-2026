/// <reference lib="webworker" />
// The greenhouse re-runs (about three seconds of the monthly model, ~200 times over) off the main thread: answered in
// the order asked; the page asks once per distinct input (useGhTrust), so there is no queue to drop.
import { ghTrust } from './ghTrust'

self.onmessage = (e: MessageEvent<{ id: number; args: Parameters<typeof ghTrust> }>) => {
  let value: ReturnType<typeof ghTrust> | null = null
  try {
    value = ghTrust(...e.data.args)
  } catch (err) {
    console.error('ghTrust', err)
  }
  self.postMessage({ id: e.data.id, value })
}
