// The reader's language. Zixtaro is written in English and, as submitted to the NASA Space Apps Challenge, shown in
// English only: the challenge asks that a submission and everything it links to be in English, so the language menu,
// the shipped ru/uk/de dictionaries and the recorded narration are out. The translation machinery (pageTranslate.ts)
// stays in the code, switched off, for whoever brings the languages back; the tour is read by the browser's voice.

import { useSyncExternalStore } from 'react'

export type Lang = { code: string; name: string }

/** Offered first; "Other…" in the menu accepts any BCP-47 code the device can translate to. */
export const LANGS: Lang[] = [
  { code: 'en', name: 'English' },
  { code: 'uk', name: 'Українська' },
  { code: 'ru', name: 'Русский' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'pl', name: 'Polski' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'cs', name: 'Čeština' },
  { code: 'ro', name: 'Română' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'ar', name: 'العربية' },
  { code: 'sw', name: 'Kiswahili' },
]

/** Languages with recorded tour narration and hand-written captions. */
export const NARRATED: readonly string[] = []

const KEY = 'zixtaro:lang'
// (a language kept from an earlier visit is not read back: there is no menu to change it with)
let current = 'en'
const listeners = new Set<() => void>()

export const getLang = () => current

export function setLang(code: string) {
  current = code || 'en'
  try {
    localStorage.setItem(KEY, current)
  } catch {
    // storage is a convenience
  }
  listeners.forEach((l) => l())
}

export function useLang(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getLang,
    getLang,
  )
}

export function langName(code: string): string {
  const known = LANGS.find((l) => l.code === code)
  if (known) return known.name
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
