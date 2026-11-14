// Dictionary lookup that survives how Zixtaro builds its sentences. A key is an English template in which
// numbers are {0} {1}…, crop names {c0} (as written in lower case) or {C0} (capitalised), and month names
// {m0}. Crops come back from the same dictionary, months from Intl in the reader's language. Sentences the
// app composes from parts ("Next season, grow sunflower - break crop after 3 cereal seasons - …") are
// looked up whole first, then part by part along " - ", " · " and "; ". The same normaliser builds the keys
// (scripts/i18n), so what the page shows and what the dictionary holds always line up.

import { autumnSownName, CROPS, springOf } from './crops'
import { GH_CROPS } from './greenhouse'
import { stripTags } from './segments'

export type Dict = Map<string, string>

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// the forms a field may grow are crop names too - spring wheat, the autumn-sown type (water.ts formsOf) - so a sentence
// about one is the same template as about any crop, and the name comes back from the dictionary in the reader's language
export const FORM_NAMES = CROPS.flatMap((c) => {
  const s = springOf(c)
  return s ? [s.name, autumnSownName(s.name)] : []
})
const CROP_NAMES = [...new Set([...CROPS.map((c) => c.name), ...FORM_NAMES, ...GH_CROPS.map((c) => c.name)])]
const CANON = new Map<string, string>()
for (const n of CROP_NAMES) {
  CANON.set(n, n)
  CANON.set(n.toLowerCase(), n)
}
// a crop name hyphen-glued to a word is part of a name - "CERES-Maize", "Wheat-Sorghum-Fallow" in a paper's title -
// and stays English in every language
const CROP_RE = new RegExp(`(?<!\\p{L}-?)(${[...CANON.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})(?!-?\\p{L})`, 'gu')
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// en-GB writes September short as "Sept" (the page's dates are en-GB)
const MONTH_RE = new RegExp(`\\b(${[...MONTHS_LONG, 'Sept', ...MONTHS_SHORT.filter((m) => m !== 'May')].join('|')})\\b`, 'g')
// a comma is a thousands separator only before exactly three digits ("2025, run" keeps its comma)
const NUM = /[−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g
const SEPARATORS = [' - ', ' · ', '; ']
const CASELESS = /^(zh|ja|ko|ar|he|fa|hi|bn|th|ka|am|ur)\b/

export type Normalized = { key: string; nums: string[]; crops: { name: string; lower: boolean }[]; months: { i: number; long: boolean }[] }

/** English text → dictionary key plus the values that fill it back in. */
export function normalize(text: string): Normalized {
  const nums: string[] = []
  const crops: Normalized['crops'] = []
  const months: Normalized['months'] = []
  let key = text.replace(NUM, (m) => `{${nums.push(m) - 1}}`)
  key = key.replace(CROP_RE, (m) => {
    const name = CANON.get(m)!
    const lower = m !== name
    return `{${lower ? 'c' : 'C'}${crops.push({ name, lower }) - 1}}`
  })
  key = key.replace(MONTH_RE, (m) => {
    const long = MONTHS_LONG.indexOf(m)
    return `{m${months.push({ i: long >= 0 ? long : MONTHS_SHORT.indexOf(m === 'Sept' ? 'Sep' : m), long: long >= 0 }) - 1}}`
  })
  return { key, nums, crops, months }
}

/** Change the first letter that is not part of a sentence tag (⟨a⟩ ⟨/a⟩ ⟨b/⟩). */
function mapFirst(s: string, f: (c: string) => string): string {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '⟨') {
      const j = s.indexOf('⟩', i)
      if (j < 0) break
      i = j
      continue
    }
    if (/\p{L}/u.test(s[i])) return s.slice(0, i) + f(s[i]) + s.slice(i + 1)
  }
  return s
}
const lowerFirst = (s: string) => mapFirst(s, (c) => c.toLowerCase())
const upperFirst = (s: string) => mapFirst(s, (c) => c.toUpperCase())
const firstLetter = (s: string) => stripTags(s).match(/\p{L}/u)?.[0]

function monthName(lang: string, i: number, long: boolean): string {
  try {
    return new Intl.DateTimeFormat(lang, { month: long ? 'long' : 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2021, i, 15)))
  } catch {
    return (long ? MONTHS_LONG : MONTHS_SHORT)[i]
  }
}

// Intl names a month in the nominative; Russian and Ukrainian decline it: "в октябре" / "у жовтні" after в/у,
// "21 октября", "до жовтня" after a day or до/с/з/від (the genitive, which Intl gives beside a day number)
const LOCATIVE: Record<string, string[]> = {
  ru: ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'],
  uk: ['січні', 'лютому', 'березні', 'квітні', 'травні', 'червні', 'липні', 'серпні', 'вересні', 'жовтні', 'листопаді', 'грудні'],
}
const BEFORE_LOCATIVE = /(^|[\s(])(в|во|у)\s+$/iu
const BEFORE_GENITIVE = /(\{\d+\}|\d|(^|[\s(])(до|с|со|от|из|з|із|від|після))\s*$/iu

function monthIn(lang: string, i: number, long: boolean, before: string): string {
  const two = lang.slice(0, 2)
  if (long && LOCATIVE[two]) {
    if (BEFORE_LOCATIVE.test(before)) return LOCATIVE[two][i]
    if (BEFORE_GENITIVE.test(before)) {
      try {
        const parts = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2021, i, 15)))
        const g = parts.find((p) => p.type === 'month')?.value
        if (g) return g
      } catch {
        // no locale data: the nominative below
      }
    }
  }
  return monthName(lang, i, long)
}

function fill(tpl: string, n: Normalized, dict: Dict, lang: string): string {
  return tpl.replace(/\{([cCm]?)(\d+)\}/g, (whole, kind: string, idx: string, at: number) => {
    const i = Number(idx)
    if (kind === '') return n.nums[i] ?? whole
    if (kind === 'm') {
      const m = n.months[i]
      return m ? monthIn(lang, m.i, m.long, tpl.slice(0, at)) : whole
    }
    const crop = n.crops[i]
    if (!crop) return whole
    const t = dict.get(crop.name) ?? crop.name
    // a crop written in lower case in English reads in lower case too - except German nouns and caseless scripts
    return kind === 'c' && !CASELESS.test(lang) && !lang.startsWith('de') ? lowerFirst(t) : t
  })
}

/** A capital in English stays a capital (months from Intl come in lower case in many languages). */
function capitalLike(src: string, out: string, lang: string): string {
  if (CASELESS.test(lang)) return out
  const a = firstLetter(src)
  return a && a !== a.toLowerCase() ? upperFirst(out) : out
}

function whole(dict: Dict, lang: string, text: string): string | null {
  const n = normalize(text)
  const tpl = dict.get(n.key)
  if (tpl !== undefined) return capitalLike(text, fill(tpl, n, dict, lang), lang)
  // the app lower-cases the first letter of a note it quotes inside a sentence: find it either way
  const first = firstLetter(n.key)
  if (!first) return null
  const flipped = first === first.toLowerCase() ? upperFirst(n.key) : lowerFirst(n.key)
  const alt = dict.get(flipped)
  if (alt === undefined) return null
  const out = fill(alt, n, dict, lang)
  return CASELESS.test(lang) || lang.startsWith('de') ? out : first === first.toLowerCase() ? lowerFirst(out) : upperFirst(out)
}

/**
 * Translation of one text - a plain string or a sentence template with tags (lib/segments) - or null when the
 * dictionary cannot cover every part of it. Only plain text is split along separators: a split could cut a tag.
 */
export function lookup(dict: Dict, lang: string, text: string, depth = 0): string | null {
  const t = text.trim()
  if (!t) return text
  if (!/\p{L}{2}/u.test(stripTags(t))) return t // numbers, units, punctuation: nothing to translate
  const hit = whole(dict, lang, t)
  if (hit !== null) return hit
  if (depth > 3 || t.includes('⟨')) return null
  for (const sep of SEPARATORS) {
    if (!t.includes(sep)) continue
    const parts = t.split(sep).map((p) => lookup(dict, lang, p, depth + 1))
    if (parts.every((p) => p !== null)) return parts.join(sep)
  }
  return null
}
