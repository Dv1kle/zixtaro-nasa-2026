// Moving around the app without a router: the Method page lives at ?page=method[&tab=…] over the main page, the
// legal pages at ?page=legal[&tab=…], and any component can ask for either (a "see Method" link, the footer's
// "Privacy") without knowing who opens it.

export type MethodTab = 'how' | 'data' | 'limits' | 'validation' | 'registry' | 'farmers' | 'words'
export const METHOD_TABS: MethodTab[] = ['how', 'data', 'limits', 'validation', 'registry', 'farmers', 'words']
export const isMethodTab = (x: string | null): x is MethodTab => !!x && (METHOD_TABS as string[]).includes(x)

/** The legal pages: what the tool is and is not, privacy, terms, every source and its licence, the project's own. */
export type LegalTab = 'notice' | 'privacy' | 'terms' | 'sources' | 'licence'
export const LEGAL_TABS: LegalTab[] = ['notice', 'privacy', 'terms', 'sources', 'licence']
export const isLegalTab = (x: string | null): x is LegalTab => !!x && (LEGAL_TABS as string[]).includes(x)

export type Route = { page: 'main' } | { page: 'method'; tab: MethodTab } | { page: 'legal'; tab: LegalTab }

const EVENT = 'zixtaro:method'
const LEGAL_EVENT = 'zixtaro:legal'

/** Open the Method page (on one of its tabs). */
export const openMethod = (tab: MethodTab = 'how') => window.dispatchEvent(new CustomEvent<MethodTab>(EVENT, { detail: tab }))

export function onOpenMethod(fn: (tab: MethodTab) => void): () => void {
  const on = (e: Event) => fn((e as CustomEvent<MethodTab>).detail ?? 'how')
  window.addEventListener(EVENT, on)
  return () => window.removeEventListener(EVENT, on)
}

/** Open the legal pages (on one of their tabs). */
export const openLegal = (tab: LegalTab = 'notice') => window.dispatchEvent(new CustomEvent<LegalTab>(LEGAL_EVENT, { detail: tab }))

export function onOpenLegal(fn: (tab: LegalTab) => void): () => void {
  const on = (e: Event) => fn((e as CustomEvent<LegalTab>).detail ?? 'notice')
  window.addEventListener(LEGAL_EVENT, on)
  return () => window.removeEventListener(LEGAL_EVENT, on)
}

/**
 * The addresses people type or are sent: /privacy, /terms, /legal ... The app has no router and one HTML file, so a
 * path is only a way in - it is turned into the page's real address (?page=legal&tab=privacy) at once, before
 * anything reads it. A server that answers any path with the app (the dev server, the preview) makes these work as
 * they are; a plain static host gets the same from the stub pages in public/ (public/privacy/index.html ...).
 */
const PATHS: Record<string, Exclude<Route, { page: 'main' }>> = {
  legal: { page: 'legal', tab: 'notice' },
  disclaimer: { page: 'legal', tab: 'notice' },
  privacy: { page: 'legal', tab: 'privacy' },
  terms: { page: 'legal', tab: 'terms' },
  sources: { page: 'legal', tab: 'sources' },
  attribution: { page: 'legal', tab: 'sources' },
  credits: { page: 'legal', tab: 'sources' },
  licence: { page: 'legal', tab: 'licence' },
  license: { page: 'legal', tab: 'licence' },
  method: { page: 'method', tab: 'how' },
  glossary: { page: 'method', tab: 'words' },
}

function adoptPath() {
  const base = import.meta.env.BASE_URL || '/'
  const { pathname, search, hash } = window.location
  if (!pathname.startsWith(base)) return
  const to = PATHS[pathname.slice(base.length).replace(/\/+$/, '').toLowerCase()]
  if (!to) return
  const q = new URLSearchParams(search)
  q.set('page', to.page)
  if (to.tab === (to.page === 'method' ? 'how' : 'notice')) q.delete('tab')
  else q.set('tab', to.tab)
  window.history.replaceState(window.history.state, '', `${base}?${q}${hash}`)
}

/** The page the address asks for. */
export function pageFromUrl(): Route {
  adoptPath()
  const q = new URLSearchParams(window.location.search)
  const t = q.get('tab')
  if (q.get('page') === 'method') return { page: 'method', tab: isMethodTab(t) ? t : 'how' }
  if (q.get('page') === 'legal') return { page: 'legal', tab: isLegalTab(t) ? t : 'notice' }
  return { page: 'main' }
}

/** The address of a page, keeping everything else in it (other query flags, the scenario in the hash). */
export function urlFor(p: Route): string {
  const u = new URL(window.location.href)
  if (p.page === 'main') {
    u.searchParams.delete('page')
    u.searchParams.delete('tab')
  } else {
    u.searchParams.set('page', p.page)
    if (p.tab === (p.page === 'method' ? 'how' : 'notice')) u.searchParams.delete('tab')
    else u.searchParams.set('tab', p.tab)
  }
  return `${u.pathname}${u.search}${u.hash}`
}
