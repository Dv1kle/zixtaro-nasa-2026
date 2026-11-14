// Whole sentences for the page translator. React splits one sentence into several text nodes wherever it has an
// inline element or an expression in it ("Grow <b>{crop}</b> next season"); translated node by node, a sentence
// falls apart ("Ask about this поле"). Here the text of a sentence is gathered across its inline elements into one
// template - inline elements become tags ⟨a⟩…⟨/a⟩, untranslatable ones (translate="no", code) placeholders ⟨b/⟩ -
// the template is translated as a whole, and the translation is poured back into the same text nodes. Only the
// text of existing nodes changes, never the DOM structure, so React keeps working; if a translation moves the tags
// around, the whole sentence goes into its first node instead.

/** Text we never touch; inline ones stay in the sentence as a placeholder. */
export const SKIP = 'script,style,noscript,code,pre,kbd,samp,textarea,input,select,[translate="no"],.notranslate'
/** Elements that end a sentence where they stand: replaced content and form controls. */
const ATOMIC = new Set(['IMG', 'BR', 'HR', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'WBR', 'PICTURE'])
export const LETTER = /\p{L}{2}/u
export const TAG_RE = /⟨\/?[a-z]+\/?⟩/g

export type Tok =
  | { k: 'text'; node: Text }
  | { k: 'open'; el: Element }
  | { k: 'close'; el: Element }
  | { k: 'void'; el: Element }

/** Which elements flow inside a line of text, cached (reset when the layout may have changed, e.g. on resize). */
let inlineCache = new WeakMap<Element, boolean>()
export const resetLayoutCache = () => {
  inlineCache = new WeakMap()
}
export function isInline(el: Element): boolean {
  let v = inlineCache.get(el)
  if (v === undefined) {
    if (ATOMIC.has(el.tagName) || el instanceof SVGElement) v = false
    else {
      const d = getComputedStyle(el).display
      v = d === 'inline' || d === 'contents'
    }
    inlineCache.set(el, v)
  }
  return v
}

const isSkip = (el: Element) => el.matches(SKIP)

/** The element a text node's sentence lives in: its nearest ancestor that is not inline text. */
export function containerOf(n: Node): Element | null {
  let el = n.parentElement
  if (!el) return null
  // SVG labels and <option>s are translated one text at a time
  if (el instanceof SVGElement || el.tagName === 'OPTION') return el
  while (el.parentElement && isInline(el) && !isSkip(el)) el = el.parentElement
  return el
}

/** The container an element's own content belongs to: itself when it is a block, else the one around it. */
export function containerFor(el: Element): Element | null {
  if (el instanceof SVGElement || el.tagName === 'OPTION') return el
  return isInline(el) && !isSkip(el) ? containerOf(el) : el
}

/** The sentences (runs of inline content) directly inside a container, in reading order. */
export function runsOf(container: Element): Tok[][] {
  if (container instanceof SVGElement || container.tagName === 'OPTION') {
    return [...container.childNodes].filter((c): c is Text => c.nodeType === Node.TEXT_NODE).map((node) => [{ k: 'text', node }])
  }
  const runs: Tok[][] = []
  let cur: Tok[] = []
  const flush = () => {
    if (cur.some((t) => t.k === 'text' && LETTER.test(t.node.nodeValue ?? ''))) runs.push(prune(cur))
    cur = []
  }
  const walk = (el: Element) => {
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === Node.TEXT_NODE) {
        cur.push({ k: 'text', node: c as Text })
        continue
      }
      if (c.nodeType !== Node.ELEMENT_NODE) continue
      const e = c as Element
      if (!isInline(e)) {
        flush()
        continue
      }
      if (isSkip(e)) {
        if (/\S/.test(e.textContent ?? '')) cur.push({ k: 'void', el: e })
        continue
      }
      cur.push({ k: 'open', el: e })
      walk(e)
      cur.push({ k: 'close', el: e })
    }
  }
  walk(container)
  flush()
  return runs
}

/** Inline elements with no text inside say nothing: drop their tags. */
function prune(toks: Tok[]): Tok[] {
  const keep = new Set<Element>()
  const stack: Element[] = []
  for (const t of toks) {
    if (t.k === 'open') stack.push(t.el)
    else if (t.k === 'close') stack.pop()
    else if ((t.k === 'text' && /\S/.test(t.node.nodeValue ?? '')) || t.k === 'void') stack.forEach((e) => keep.add(e))
  }
  return toks.filter((t) => (t.k === 'open' || t.k === 'close' ? keep.has(t.el) : true))
}

const letterName = (i: number) => (i < 26 ? String.fromCharCode(97 + i) : `z${String.fromCharCode(97 + (i % 26))}`)

export type Template = {
  /** English with tags, whitespace collapsed and trimmed: what the dictionary is keyed by */
  text: string
  /** the tag sequence, e.g. ["⟨a⟩", "⟨/a⟩", "⟨b/⟩"] */
  tags: string[]
  /** text nodes between consecutive tags (gaps.length = tags.length + 1) */
  gaps: Text[][]
  lead: string
  trail: string
  /** every text node of the run, with the English it holds */
  nodes: { node: Text; src: string }[]
}

/** The English template of a run; `english` recovers a node's English after we translated it. */
export function templateOf(run: Tok[], english: (n: Text) => string): Template {
  const names = new Map<Element, string>()
  const name = (el: Element) => {
    let v = names.get(el)
    if (!v) names.set(el, (v = letterName(names.size)))
    return v
  }
  let raw = ''
  const tags: string[] = []
  const gaps: Text[][] = [[]]
  const nodes: Template['nodes'] = []
  for (const t of run) {
    if (t.k === 'text') {
      const src = english(t.node)
      nodes.push({ node: t.node, src })
      gaps[gaps.length - 1].push(t.node)
      raw += src
      continue
    }
    const tag = t.k === 'open' ? `⟨${name(t.el)}⟩` : t.k === 'close' ? `⟨/${name(t.el)}⟩` : `⟨${name(t.el)}/⟩`
    tags.push(tag)
    gaps.push([])
    raw += tag
  }
  const lead = raw.match(/^\s*/)![0]
  const trail = raw.slice(lead.length).match(/\s*$/)![0]
  return { text: raw.replace(/\s+/g, ' ').trim(), tags, gaps, lead, trail, nodes }
}

export const stripTags = (s: string) => s.replace(TAG_RE, '')
export const tagsOf = (s: string) => s.match(TAG_RE) ?? []

/**
 * The new value of every text node for a translated template, or null when its tags are not the source's tags in
 * the source's order (then the caller writes the whole sentence into the first node).
 */
export function pour(t: Template, translated: string): Map<Text, string> | null {
  const got = tagsOf(translated)
  if (got.length !== t.tags.length || got.some((g, i) => g !== t.tags[i])) return null
  const pieces = translated.split(TAG_RE)
  const out = new Map<Text, string>()
  let carry = '' // text for a gap without a node of its own goes to the nearest node before it
  let lastNode: Text | null = null
  pieces.forEach((piece, i) => {
    const gap = t.gaps[i]
    let text = piece
    if (i === 0) text = t.lead + text.replace(/^\s+/, '')
    if (i === pieces.length - 1) text = text.replace(/\s+$/, '') + t.trail
    if (!gap.length) {
      if (lastNode) out.set(lastNode, (out.get(lastNode) ?? '') + text)
      else carry += text
      return
    }
    gap.forEach((n, k) => out.set(n, k === 0 ? carry + text : ''))
    carry = ''
    lastNode = gap[0]
  })
  if (carry && t.nodes[0]) out.set(t.nodes[0].node, carry + (out.get(t.nodes[0].node) ?? ''))
  return out
}

/** The whole sentence in the run's first node, the rest emptied: for translations that moved the tags. */
export function pourFlat(t: Template, translated: string): Map<Text, string> {
  const out = new Map<Text, string>()
  const flat = t.lead + stripTags(translated).replace(/\s+/g, ' ').trim() + t.trail
  t.nodes.forEach(({ node }, i) => out.set(node, i === 0 ? flat : ''))
  return out
}
