/// <reference lib="webworker" />
// The market yard's painted surfaces, off the main thread (marketPaint.ts does the painting): each picture comes back
// as a bitmap, already turned upside down - a bitmap is uploaded as it is, where a canvas would be flipped on the way
// to the GPU - and handed over without a copy.
import { paintApron, paintCorrugated, type Canvas } from './marketPaint'

export type PaintAsk = { kind: 'corrugated'; base: string; seed: number; ridges: number } | { kind: 'apron'; seed: number }
export type PaintRequest = PaintAsk & { id: number }

const mk = (w: number, h: number) => new OffscreenCanvas(w, h)

self.onmessage = async (e: MessageEvent<PaintRequest>) => {
  const m = e.data
  try {
    const canvases: Record<string, Canvas> = m.kind === 'apron' ? paintApron(mk, m.seed) : paintCorrugated(mk, m.base, m.seed, m.ridges)
    const pictures: Record<string, ImageBitmap> = {}
    for (const [k, c] of Object.entries(canvases)) pictures[k] = await createImageBitmap(c as OffscreenCanvas, { imageOrientation: 'flipY' })
    self.postMessage({ id: m.id, pictures }, Object.values(pictures))
  } catch (err) {
    self.postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) })
  }
}
