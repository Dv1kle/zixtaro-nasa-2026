/// <reference lib="webworker" />
// A Radiance .hdr sky read off the main thread: fetched here, its run-length scanlines unpacked, every pixel taken
// from RGBE to half floats - a megabyte of file, half a million pixels, a fifth of a second that used to be one long
// task on the page's thread in the middle of whatever the reader was doing. The sun's disc is brought down on the
// way (`cap`: the brightest a pixel may be - see lib/objects/cc0 SUN_CAP), while the values are still plain numbers.
// In: { id, url, cap }. Out: { id, width, height, data } (RGBA half floats, the file's row order, transferred) or
// { id, error }.
declare const self: DedicatedWorkerGlobalScope

const f32 = new Float32Array(1)
const u32 = new Uint32Array(f32.buffer)
/** a non-negative float as a half float's bits */
function toHalf(v: number): number {
  f32[0] = v
  const x = u32[0]
  const exp = ((x >> 23) & 0xff) - 112
  const mant = x & 0x7fffff
  if (exp <= 0) {
    // too small for a normal half: a denormal, or nothing
    if (exp < -10) return 0
    return ((mant | 0x800000) >> (1 - exp)) + 0x1000 >> 13
  }
  if (exp >= 31) return 0x7bff // the largest finite half (an .hdr has no infinities)
  return ((exp << 10) | (mant >> 13)) + ((mant >> 12) & 1)
}

function parse(bytes: Uint8Array, cap: number): { width: number; height: number; data: Uint16Array } {
  // the header: text lines up to an empty one, then the resolution line ("-Y 512 +X 1024")
  let p = 0
  const line = () => {
    let s = ''
    while (p < bytes.length && bytes[p] !== 10) s += String.fromCharCode(bytes[p++])
    p++
    return s
  }
  if (!/^#\?(RADIANCE|RGBE)/.test(line())) throw new Error('not a Radiance file')
  while (p < bytes.length && line() !== '') {
    /* the header's own lines (format, exposure) are not needed */
  }
  const m = /^-Y (\d+) \+X (\d+)$/.exec(line().trim())
  if (!m) throw new Error('an orientation other than -Y +X')
  const height = +m[1]
  const width = +m[2]
  const out = new Uint16Array(width * height * 4)
  const row = new Uint8Array(width * 4)
  const ONE = 0x3c00
  for (let y = 0; y < height; y++) {
    if (bytes[p] === 2 && bytes[p + 1] === 2 && ((bytes[p + 2] << 8) | bytes[p + 3]) === width) {
      // run-length coded, each of the four channels on its own
      p += 4
      for (let c = 0; c < 4; c++) {
        let x = 0
        while (x < width) {
          let n = bytes[p++]
          if (n > 128) {
            n -= 128
            const v = bytes[p++]
            while (n-- > 0) row[x++ * 4 + c] = v
          } else while (n-- > 0) row[x++ * 4 + c] = bytes[p++]
        }
      }
    } else {
      // flat: four bytes a pixel
      row.set(bytes.subarray(p, p + width * 4))
      p += width * 4
    }
    const o = y * width * 4
    for (let x = 0; x < width; x++) {
      const e = row[x * 4 + 3]
      let r = 0
      let g = 0
      let b = 0
      if (e) {
        const f = Math.pow(2, e - 136)
        r = row[x * 4] * f
        g = row[x * 4 + 1] * f
        b = row[x * 4 + 2] * f
        const top = Math.max(r, g, b)
        if (top > cap) {
          const k = cap / top
          r *= k
          g *= k
          b *= k
        }
      }
      out[o + x * 4] = toHalf(r)
      out[o + x * 4 + 1] = toHalf(g)
      out[o + x * 4 + 2] = toHalf(b)
      out[o + x * 4 + 3] = ONE
    }
  }
  return { width, height, data: out }
}

self.onmessage = async (e: MessageEvent<{ id: number; url: string; cap: number }>) => {
  const { id, url, cap } = e.data
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const sky = parse(new Uint8Array(await res.arrayBuffer()), cap)
    self.postMessage({ id, ...sky }, [sky.data.buffer])
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
