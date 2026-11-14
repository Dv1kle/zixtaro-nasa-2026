// The page in the reader's language, fastest source first:
//  1. a dictionary shipped with the site (/i18n/<lang>.json, built by scripts/i18n): instant, any browser;
//  2. on-device machine translation (Chrome/Edge Translator API) for text the dictionary lacks;
//  3. otherwise the English original stays.
// The unit is a whole sentence (lib/segments): the text of one line of inline content, across its bold words,
// links and numbers, translated at once and poured back into the same text nodes. Only text changes - never the
// DOM structure - so React keeps working: when React writes new English, the observer sees it and the sentence
// is translated again. A sentence the dictionary cannot cover whole stays English rather than half-translated.
// Numbers, crop names and months inside phrases are placeholders in the dictionary (see dictionary.ts), so one
// entry serves every field and every crop. Placeholders, tooltips and accessible names are translated too.

import { lookup, type Dict } from './dictionary'
import { protect } from './protect'
import { containerFor, containerOf, LETTER, pour, pourFlat, resetLayoutCache, runsOf, SKIP, stripTags, templateOf, type Template, type Tok } from './segments'

type Translator = { translate(text: string): Promise<string>; destroy?: () => void }
type TranslatorFactory = {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }): Promise<Translator>
}

const api = (): TranslatorFactory | null => (typeof self !== 'undefined' && 'Translator' in self ? (self as unknown as { Translator: TranslatorFactory }).Translator : null)

export const canTranslateOnDevice = () => api() !== null

export type TranslateStatus =
  | { state: 'off' }
  | { state: 'loading' }
  | { state: 'downloading'; progress: number }
  | { state: 'translating'; left: number }
  | { state: 'on'; dictionary: boolean; device: boolean }
  | { state: 'unsupported'; reason: 'no-api' | 'no-pair' | 'error'; detail?: string }

/** Attributes people read or hear: placeholders, tooltips, names for screen readers, image text. */
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const

const CASELESS = /^(zh|ja|ko|ar|he|fa|hi|bn|th|ka|am|ur)\b/
/** Machine translation capitalises fragments at will; keep the source's first-letter case (not in German). */
export function matchCase(src: string, out: string, lang: string): string {
  if (CASELESS.test(lang) || lang.startsWith('de')) return out
  const a = src.match(/\p{L}/u)?.[0]
  const i = out.search(/\p{L}/u)
  if (!a || i < 0) return out
  const lower = a === a.toLowerCase() && a !== a.toUpperCase()
  const upper = a === a.toUpperCase() && a !== a.toLowerCase()
  const b = out[i]
  if (lower) return out.slice(0, i) + b.toLowerCase() + out.slice(i + 1)
  if (upper) return out.slice(0, i) + b.toUpperCase() + out.slice(i + 1)
  return out
}

const dictionaries = new Map<string, Promise<Dict | null>>()
function loadDictionary(lang: string): Promise<Dict | null> {
  let p = dictionaries.get(lang)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}i18n/${lang}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : null))
      .then((d) => (d ? new Map(Object.entries(d)) : null))
      .catch(() => null)
    dictionaries.set(lang, p)
  }
  return p
}

/** The pieces of a run the device translator can take: split at untranslatable placeholders, tags dropped. */
function deviceParts(run: Tok[]): Tok[][] {
  const parts: Tok[][] = [[]]
  for (const t of run) {
    if (t.k === 'void') parts.push([])
    else parts[parts.length - 1].push(t)
  }
  return parts.filter((p) => p.some((t) => t.k === 'text' && LETTER.test(t.node.nodeValue ?? '')))
}

class PageTranslator {
  private tr: Translator | null = null
  private dict: Dict | null = null
  private gen = 0 // bumps on every language switch: late answers for an old language are dropped
  private lang = 'en'
  private cache = new Map<string, string>()
  private inflight = new Map<string, Promise<string>>()
  /** what we wrote into a text node, and the English it replaced */
  private written = new WeakMap<Text, { src: string; out: string }>()
  private tracked = new Set<Text>()
  private attrs = new WeakMap<Element, Map<string, { src: string; out: string }>>()
  private attrTracked = new Set<Element>()
  /** containers waiting for the device translator */
  private queue = new Set<Element>()
  private mo: MutationObserver | null = null
  private running = false
  private status: TranslateStatus = { state: 'off' }
  private listeners = new Set<(s: TranslateStatus) => void>()
  private onResize = () => {
    resetLayoutCache()
  }

  onStatus(fn: (s: TranslateStatus) => void) {
    this.listeners.add(fn)
    fn(this.status)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private set(s: TranslateStatus) {
    this.status = s
    this.listeners.forEach((l) => l(s))
  }

  private settled() {
    this.set({ state: 'on', dictionary: !!this.dict, device: !!this.tr })
  }

  /** Call it from a click when possible: the on-device model may need one to download. */
  async start(lang: string) {
    if (lang === 'en') return this.stop()
    const gen = ++this.gen
    this.detach()
    this.lang = lang
    document.documentElement.lang = lang
    this.set({ state: 'loading' })
    this.tr?.destroy?.()
    this.tr = null
    this.cache.clear()
    this.inflight.clear()
    const dict = await loadDictionary(lang)
    if (gen !== this.gen) return
    this.dict = dict
    // the dictionary goes on screen at once; the device model is only a helper for what it lacks
    if (dict) {
      this.observe()
      this.scan(document.body)
      this.settled()
    }
    const tr = await this.deviceTranslator(lang, !dict)
    if (gen !== this.gen) {
      tr?.destroy?.()
      return
    }
    this.tr = tr
    if (!this.dict && !this.tr) return this.set({ state: 'unsupported', reason: api() ? 'no-pair' : 'no-api' })
    if (!dict) this.observe()
    this.scan(document.body) // queue what the dictionary could not cover
    if (!this.queue.size) this.settled()
  }

  /** The on-device translator, if it answers in time; with a dictionary only a model already on the device. */
  private async deviceTranslator(lang: string, mayDownload: boolean): Promise<Translator | null> {
    const T = api()
    if (!T) return null
    const within = <X,>(p: Promise<X>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])
    try {
      const avail = await within(T.availability({ sourceLanguage: 'en', targetLanguage: lang }), 4000)
      if (!avail || avail === 'unavailable' || avail === 'unsupported') return null
      if (avail !== 'available' && !mayDownload) return null
      if (avail !== 'available') this.set({ state: 'downloading', progress: 0 })
      return await T.create({
        sourceLanguage: 'en',
        targetLanguage: lang,
        monitor: (m) => m.addEventListener('downloadprogress', (e) => this.set({ state: 'downloading', progress: (e as unknown as { loaded: number }).loaded })),
      })
    } catch {
      return null // no gesture for a download, or no model: the dictionary (if any) carries on
    }
  }

  stop() {
    this.gen++
    this.detach()
    this.tr?.destroy?.()
    this.tr = null
    this.dict = null
    this.cache.clear()
    this.inflight.clear()
    this.lang = 'en'
    document.documentElement.lang = 'en'
    this.set({ state: 'off' })
  }

  /** One string (tour captions and voice): dictionary, then device, else unchanged. */
  async text(s: string): Promise<string> {
    const t = s.trim()
    if (!t || this.lang === 'en') return s
    const hit = this.fromDictionary(t)
    if (hit !== null) return hit
    return this.tr ? this.translate(t) : s
  }

  private fromDictionary(t: string): string | null {
    return this.dict ? lookup(this.dict, this.lang, t) : null
  }

  private detach() {
    this.mo?.disconnect()
    this.mo = null
    window.removeEventListener('resize', this.onResize)
    this.queue.clear()
    for (const n of this.tracked) {
      const w = this.written.get(n)
      if (w && n.isConnected && n.nodeValue === w.out) n.nodeValue = w.src
    }
    this.tracked.clear()
    for (const el of this.attrTracked) {
      for (const [a, w] of this.attrs.get(el) ?? []) if (el.getAttribute(a) === w.out) el.setAttribute(a, w.src)
    }
    this.attrTracked.clear()
    this.attrs = new WeakMap()
  }

  private observe() {
    this.mo?.disconnect()
    window.addEventListener('resize', this.onResize)
    this.mo = new MutationObserver((records) => {
      const dirty = new Set<Element>()
      for (const r of records) {
        if (r.type === 'characterData') {
          const n = r.target as Text
          if (this.written.get(n)?.out === n.nodeValue) continue // our own write
          const c = containerOf(n)
          if (c) dirty.add(c)
        } else if (r.type === 'attributes') {
          this.attributes(r.target as Element)
        } else {
          r.addedNodes.forEach((n) => this.collect(n, dirty))
          // a removed inline piece changes the sentence around it
          if (r.removedNodes.length && r.target.nodeType === Node.ELEMENT_NODE) {
            const c = containerFor(r.target as Element)
            if (c) dirty.add(c)
          }
        }
      }
      dirty.forEach((c) => this.process(c))
      this.pump()
    })
    this.mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
  }

  /** Containers of every text inside `root` (and the attributes under it). */
  private collect(root: Node, into: Set<Element>) {
    if (root.nodeType === Node.TEXT_NODE) {
      const c = containerOf(root)
      if (c) into.add(c)
      return
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return
    const el = root as Element
    if (el.closest(SKIP)) return
    this.attributes(el)
    el.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')).forEach((x) => this.attributes(x))
    // the element may itself sit inside a sentence
    const own = containerOf(el)
    if (own && own !== el && el.textContent && LETTER.test(el.textContent)) into.add(own)
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!LETTER.test(n.nodeValue ?? '')) continue
      const c = containerOf(n)
      if (c) into.add(c)
    }
  }

  private scan(root: Node) {
    const dirty = new Set<Element>()
    this.collect(root, dirty)
    dirty.forEach((c) => this.process(c))
    this.pump()
  }

  /** The English a node holds: what it had before we translated it, unless React has written new text since. */
  private english = (n: Text): string => {
    const w = this.written.get(n)
    return w && n.nodeValue === w.out ? w.src : (n.nodeValue ?? '')
  }

  private write(values: Map<Text, string>, t: Template) {
    for (const { node, src } of t.nodes) {
      const v = values.get(node) ?? ''
      this.written.set(node, { src, out: v })
      this.tracked.add(node)
      if (node.nodeValue !== v) node.nodeValue = v
    }
  }

  /** Put the English back (a sentence neither source could cover). */
  private restore(t: Template) {
    for (const { node, src } of t.nodes) {
      if (node.nodeValue !== src) node.nodeValue = src
      this.written.delete(node)
    }
  }

  /** Translate every sentence in a container, from the dictionary or the device model's cache. */
  private process(container: Element) {
    if (!container.isConnected || container.closest(SKIP)) return
    const svg = container instanceof SVGElement
    let missing = false
    for (const run of runsOf(container)) {
      const t = templateOf(run, this.english)
      if (!LETTER.test(stripTags(t.text))) continue
      const hit = this.fromDictionary(t.text)
      if (hit !== null) {
        this.write(pour(t, hit) ?? pourFlat(t, hit), t)
        continue
      }
      // fragments the dictionary knows, but only when every one of them is known: never half a sentence
      const pieces = t.nodes.map(({ src }) => (LETTER.test(src) ? this.fromDictionary(src.trim()) : src))
      if (t.nodes.length > 1 && pieces.every((p) => p !== null)) {
        const values = new Map<Text, string>()
        t.nodes.forEach(({ node, src }, i) => values.set(node, `${src.match(/^\s*/)![0]}${pieces[i]!.trim()}${src.match(/\s*$/)![0]}`))
        this.write(values, t)
        continue
      }
      if (!this.tr || svg) {
        this.restore(t)
        continue
      }
      // the device model: one request per piece between untranslatable placeholders, tags dropped
      const parts = deviceParts(run)
      const ready = parts.map((p) => this.cache.get(templateOf(p, this.english).text.replace(/⟨[^⟩]*⟩/g, '')))
      if (ready.every((x) => x !== undefined)) {
        const values = new Map<Text, string>()
        parts.forEach((p, i) => {
          const pt = templateOf(p, this.english)
          pourFlat(pt, ready[i]!).forEach((v, n) => values.set(n, v))
        })
        this.write(values, t)
      } else missing = true
    }
    if (missing) this.queue.add(container)
  }

  private attributes(el: Element) {
    if (el.closest(SKIP) && !el.matches('input,textarea,select')) return
    for (const a of ATTRS) {
      const v = el.getAttribute(a)
      if (!v || !LETTER.test(v)) continue
      const map = this.attrs.get(el) ?? new Map<string, { src: string; out: string }>()
      const w = map.get(a)
      if (w && w.out === v) continue // ours
      const src = v
      const hit = this.fromDictionary(src.trim())
      const apply = (out: string) => {
        map.set(a, { src, out })
        this.attrs.set(el, map)
        this.attrTracked.add(el)
        if (el.getAttribute(a) === src) el.setAttribute(a, out)
      }
      if (hit !== null) apply(hit)
      else if (this.tr) void this.translate(src.trim()).then((out) => this.lang !== 'en' && apply(out))
    }
  }

  private translate(src: string): Promise<string> {
    const hit = this.cache.get(src)
    if (hit !== undefined) return Promise.resolve(hit)
    let p = this.inflight.get(src)
    if (!p) {
      const tr = this.tr!
      const lang = this.lang
      const guard = protect(src)
      p = tr.translate(guard.masked).then(
        (raw) => {
          // names come back untranslated, or the sentence stays in English rather than lose one
          const out = guard.restore(raw) ?? src
          const fixed = matchCase(src, out, lang)
          this.cache.set(src, fixed)
          this.inflight.delete(src)
          return fixed
        },
        () => {
          this.inflight.delete(src)
          this.cache.set(src, src)
          return src
        },
      )
      this.inflight.set(src, p)
    }
    return p
  }

  private visibleFirst(): Element[] {
    const h = window.innerHeight
    const scored = [...this.queue].map((el) => {
      const r = el.getBoundingClientRect()
      return { el, k: r.bottom > -200 && r.top < h + 200 ? 0 : 1 }
    })
    scored.sort((a, b) => a.k - b.k)
    return scored.map((x) => x.el)
  }

  private async pump() {
    if (this.running || !this.tr || !this.queue.size) return
    this.running = true
    try {
      while (this.queue.size && this.tr) {
        const batch = this.visibleFirst().slice(0, 16)
        batch.forEach((el) => this.queue.delete(el))
        this.set({ state: 'translating', left: this.queue.size + batch.length })
        const gen = this.gen
        await Promise.all(
          batch.map(async (el) => {
            const texts = runsOf(el).flatMap((run) => deviceParts(run).map((p) => templateOf(p, this.english).text.replace(/⟨[^⟩]*⟩/g, '')))
            await Promise.all(texts.filter((x) => LETTER.test(x)).map((x) => this.translate(x)))
            if (gen === this.gen) this.process(el)
          }),
        )
      }
    } finally {
      this.running = false
      if (this.lang !== 'en' && (this.dict || this.tr)) this.settled()
    }
  }
}

export const pageTranslator = new PageTranslator()

/**
 * Every sentence and attribute text on the page as dictionary keys (English templates), with the section it is in.
 * For scripts/i18n (a headless browser calls it); only in development builds.
 */
export function harvestPage(): { text: string; where: string }[] {
  const out: { text: string; where: string }[] = []
  const seen = new Set<Element>()
  const where = (el: Element) =>
    el.closest('[role="dialog"][aria-label="Method"]') ? 'method'
      : el.closest('header') && !el.closest('main') ? 'topbar'
        : el.closest('article.report') ? 'report' : el.closest('section[id]')?.id ?? 'other'
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!LETTER.test(n.nodeValue ?? '') || n.parentElement?.closest(SKIP)) continue
    const c = containerOf(n)
    if (!c || seen.has(c)) continue
    seen.add(c)
    for (const run of runsOf(c)) {
      const t = templateOf(run, (x) => x.nodeValue ?? '')
      if (LETTER.test(stripTags(t.text))) out.push({ text: t.text, where: where(c) })
    }
  }
  document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')).forEach((el) => {
    if (el.closest(SKIP) && !el.matches('input,textarea,select')) return
    for (const a of ATTRS) {
      const v = el.getAttribute(a)?.trim()
      if (v && LETTER.test(v)) out.push({ text: v, where: where(el) })
    }
  })
  return out
}
