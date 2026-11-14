// The market yard's painted surfaces (components/objects/marketYardParts): the corrugated sheet and the concrete apron,
// as 2D canvas work and nothing else - no three.js, no document - so the same code paints them in a worker
// (marketPaint.worker.ts) on an OffscreenCanvas, or on this thread where a browser has no worker for it. The apron
// alone is three canvases of 1680 x 1120 and some thirty-five thousand strokes, painted on the page's thread in the
// middle of the reader's scroll until it moved.

export type Canvas = HTMLCanvasElement | OffscreenCanvas
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const ctx = (c: Canvas) => c.getContext('2d') as Ctx

export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The apron's extent on the ground, metres (x0, z0, width, depth): what `paintApron` paints. */
export const APRON = { x0: -30, z0: -20, w: 60, d: 40 }

/** corrugated sheet: ridges for the bump, and the streaks rain leaves down them for the colour */
export function paintCorrugated(mk: (w: number, h: number) => Canvas, base: string, seed: number, ridges = 16): { col: Canvas; bump: Canvas } {
  const W = 256
  const H = 256
  const col = mk(W, H)
  const bump = mk(W, H)
  const g = ctx(col)
  const b = ctx(bump)
  const r = rng(seed)
  g.fillStyle = base
  g.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y++) {
    const v = Math.round(128 + 110 * Math.sin((y / H) * Math.PI * 2 * ridges))
    b.fillStyle = `rgb(${v} ${v} ${v})`
    b.fillRect(0, y, W, 1)
    g.fillStyle = `rgb(255 255 255 / ${0.05 + 0.05 * Math.sin((y / H) * Math.PI * 2 * ridges)})`
    g.fillRect(0, y, W, 1)
  }
  // the sheets' vertical laps, a bolt at every ridge
  for (let x = 0; x < W; x += 64) {
    g.fillStyle = 'rgb(0 0 0 / 0.22)'
    g.fillRect(x, 0, 2, H)
    b.fillStyle = 'rgb(40 40 40)'
    b.fillRect(x, 0, 2, H)
    for (let y = 4; y < H; y += H / ridges) {
      g.fillStyle = 'rgb(20 20 20 / 0.45)'
      g.fillRect(x + 4, y, 2, 2)
    }
  }
  for (let i = 0; i < 80; i++) {
    const x = r() * W
    const len = 30 + r() * 170
    const streak = g.createLinearGradient(0, 0, 0, len)
    streak.addColorStop(0, r() < 0.6 ? 'rgb(20 18 16 / 0.3)' : 'rgb(190 180 160 / 0.15)')
    streak.addColorStop(1, 'rgb(0 0 0 / 0)')
    g.save()
    g.translate(x, r() * H * 0.6)
    g.fillStyle = streak
    g.fillRect(0, 0, 1.5 + r() * 4, len)
    g.restore()
  }
  return { col, bump }
}

/**
 * The concrete apron, from above: slabs in their joints, each a shade of its own, cracks, oil, tyre rubber into the
 * pit and across the weighbridge, hazard stripes round the pit, a bay number, chaff blown into the corners - and
 * where the water stands after rain: the roughness map makes those pools mirrors for the lamps.
 */
export function paintApron(mk: (w: number, h: number) => Canvas, seed = 9): { col: Canvas; rough: Canvas; bump: Canvas } {
  // (px per metre: 28 keeps the joints and the paint crisp at the pit; more only cost time on the main thread)
  const PX = 28
  const W = APRON.w * PX
  const H = APRON.d * PX
  const col = mk(W, H)
  const rough = mk(W, H)
  const bump = mk(W, H)
  const g = ctx(col)
  const q = ctx(rough)
  const b = ctx(bump)
  const r = rng(seed)
  const X = (x: number) => (x - APRON.x0) * PX
  const Z = (z: number) => (z - APRON.z0) * PX
  q.fillStyle = 'rgb(214 214 214)'
  q.fillRect(0, 0, W, H)
  b.fillStyle = 'rgb(128 128 128)'
  b.fillRect(0, 0, W, H)
  // slabs
  const S = 5
  for (let x = APRON.x0; x < APRON.x0 + APRON.w; x += S) {
    for (let z = APRON.z0; z < APRON.z0 + APRON.d; z += S) {
      const v = 58 + Math.floor(r() * 16)
      g.fillStyle = `rgb(${v} ${v} ${v - 2})`
      g.fillRect(X(x), Z(z), S * PX, S * PX)
      const t = 200 + Math.floor(r() * 30)
      q.fillStyle = `rgb(${t} ${t} ${t})`
      q.fillRect(X(x), Z(z), S * PX, S * PX)
    }
  }
  // the aggregate
  // (one fill style per pass, not per speck: setting the style 90 000 times was most of this texture's cost)
  for (const v of [44, 62, 80, 98]) {
    g.fillStyle = `rgb(${v} ${v} ${v - 3} / 0.22)`
    for (let i = 0; i < 7000; i++) g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2)
  }
  // joints
  for (const [ctx, style, w] of [[g, 'rgb(14 14 14 / 0.8)', 3], [b, 'rgb(30 30 30)', 4], [q, 'rgb(250 250 250)', 3]] as [Ctx, string, number][]) {
    ctx.strokeStyle = style
    ctx.lineWidth = w
    for (let x = APRON.x0; x <= APRON.x0 + APRON.w; x += S) {
      ctx.beginPath()
      ctx.moveTo(X(x), 0)
      ctx.lineTo(X(x), H)
      ctx.stroke()
    }
    for (let z = APRON.z0; z <= APRON.z0 + APRON.d; z += S) {
      ctx.beginPath()
      ctx.moveTo(0, Z(z))
      ctx.lineTo(W, Z(z))
      ctx.stroke()
    }
  }
  // cracks
  for (let i = 0; i < 26; i++) {
    let x = r() * W
    let y = r() * H
    let a = r() * Math.PI * 2
    for (const [ctx, style] of [[g, 'rgb(10 10 10 / 0.7)'], [b, 'rgb(20 20 20)']] as [Ctx, string][]) {
      ctx.strokeStyle = style
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      let cx = x
      let cy = y
      let ca = a
      const rr = rng(i * 7 + 1)
      for (let k = 0; k < 14; k++) {
        ca += (rr() - 0.5) * 1.1
        cx += Math.cos(ca) * 22
        cy += Math.sin(ca) * 22
        ctx.lineTo(cx, cy)
      }
      ctx.stroke()
    }
    x += 0
    y += 0
    a += 0
  }
  // stains
  for (let i = 0; i < 60; i++) {
    const x = r() * W
    const y = r() * H
    const rad = (0.4 + r() * 2.2) * PX
    const st = g.createRadialGradient(x, y, 0, x, y, rad)
    st.addColorStop(0, r() < 0.6 ? 'rgb(12 12 12 / 0.42)' : 'rgb(120 100 70 / 0.16)')
    st.addColorStop(1, 'rgb(0 0 0 / 0)')
    g.fillStyle = st
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // tyre rubber: the lane in to the pit (x 1.9 … 4.3), the lane over the weighbridge (x -15.2 … -12.8)
  g.strokeStyle = 'rgb(8 8 8 / 0.3)'
  g.lineWidth = 0.42 * PX
  for (const x of [2.05, 4.15, -15.05, -12.95]) {
    g.beginPath()
    g.moveTo(X(x + (r() - 0.5) * 0.2), Z(20))
    g.bezierCurveTo(X(x + 0.3), Z(12), X(x - 0.2), Z(8), X(x), Z(x > 0 ? 3.5 : -2))
    g.stroke()
  }
  // paint: the lane's edges, an arrow, the bay's number, hazard stripes round the pit
  g.strokeStyle = 'rgb(214 208 190 / 0.55)'
  g.lineWidth = 0.14 * PX
  for (const x of [0.6, 5.6]) {
    g.setLineDash([2.4 * PX, 0.5 * PX])
    g.beginPath()
    g.moveTo(X(x), Z(20))
    g.lineTo(X(x), Z(6))
    g.stroke()
  }
  g.setLineDash([])
  g.fillStyle = 'rgb(214 208 190 / 0.5)'
  g.font = `700 ${Math.round(2.6 * PX)}px sans-serif`
  g.textAlign = 'center'
  g.save()
  g.translate(X(8.4), Z(9.5))
  g.rotate(Math.PI)
  g.fillText('1', 0, 0)
  g.restore()
  const pit = { x0: 0.5, z0: 1.4, w: 5.2, d: 3.2 }
  g.save()
  g.beginPath()
  g.rect(X(pit.x0 - 0.5), Z(pit.z0 - 0.5), (pit.w + 1) * PX, (pit.d + 1) * PX)
  g.rect(X(pit.x0), Z(pit.z0), pit.w * PX, pit.d * PX)
  g.clip('evenodd')
  for (let k = -20; k < 40; k++) {
    g.fillStyle = k % 2 ? 'rgb(196 160 40 / 0.85)' : 'rgb(14 14 14 / 0.85)'
    g.beginPath()
    g.moveTo(X(pit.x0 - 0.5) + k * 0.4 * PX, Z(pit.z0 - 0.5))
    g.lineTo(X(pit.x0 - 0.5) + (k + 1) * 0.4 * PX, Z(pit.z0 - 0.5))
    g.lineTo(X(pit.x0 - 0.5) + (k + 1) * 0.4 * PX - 4.2 * PX, Z(pit.z0 + pit.d + 0.5))
    g.lineTo(X(pit.x0 - 0.5) + k * 0.4 * PX - 4.2 * PX, Z(pit.z0 + pit.d + 0.5))
    g.fill()
  }
  g.restore()
  // chaff and spilt grain: round the pit, and blown against the bins' feet
  for (const tone of ['rgb(200 160 80 / 0.5)', 'rgb(226 186 96 / 0.62)', 'rgb(190 150 76 / 0.42)']) {
    g.fillStyle = tone
    for (let i = 0; i < 1700; i++) {
      const a = r() * Math.PI * 2
      const d = Math.pow(r(), 1.7) * 5.5
      g.fillRect(X(3.1 + Math.cos(a) * d * 1.2), Z(3.2 + Math.sin(a) * d * 0.8), 1.6, 1.6)
    }
  }
  // standing water: pools, darker in colour, smooth in the roughness map, level in the bump map
  for (let i = 0; i < 22; i++) {
    const cx = r() * W
    const cy = r() * H
    const n = 3 + Math.floor(r() * 5)
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 2.4 * PX
      const y = cy + (r() - 0.5) * 1.6 * PX
      const rad = (0.5 + r() * 1.3) * PX
      for (const [ctx, c0] of [[q, 'rgb(16 16 16 / 0.96)'], [g, 'rgb(6 7 9 / 0.26)'], [b, 'rgb(128 128 128 / 0.9)']] as [Ctx, string][]) {
        const pool = ctx.createRadialGradient(x, y, rad * 0.5, x, y, rad)
        pool.addColorStop(0, c0)
        pool.addColorStop(1, c0.replace(/\/ [0-9.]+\)/, '/ 0)'))
        ctx.fillStyle = pool
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
      }
    }
  }
  return { col, rough, bump }
}
