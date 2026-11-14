// The legal pages (?page=legal): what the tool is and is not, privacy, terms, every source with its licence, and the
// project's own licence. They open over the main page as the Method page does and are set the same way - a kicker,
// a headline with one word in the serif voice, the record in a few figures, then hairline lists - because a page
// nobody wants to read is still part of the site, and is read by the people who decide whether to trust it.
//
// The text is lib/legal.ts and lib/attribution.ts: this file only sets it.
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { ALL_CREDITS, ASSETS, CHECKED, FONTS, MAPS, NASA_DATA, OPEN_DATA, OPEN_QUESTIONS, SOFTWARE, TERMS_LABEL, type Credit } from '../lib/attribution'
import { useEdgeFade } from '../lib/hooks'
import { AI_NOTICE, ASKED, NOT_ADVICE, NOT_NASA, OPERATOR, PRIVACY, STORED, TERMS, type Clause } from '../lib/legal'
import { openMethod, type LegalTab } from '../lib/nav'
import { Logo } from './ui'

const TABS: { id: LegalTab; label: string }[] = [
  { id: 'notice', label: 'What it is not' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'terms', label: 'Terms' },
  { id: 'sources', label: 'Sources' },
  { id: 'licence', label: 'Licence' },
]

type Figure = { v: string; unit?: string; l: string }

function Head({ kicker, children, lede, figures }: { kicker: string; children: ReactNode; lede: string; figures?: Figure[] }) {
  return (
    <>
      <div className="font-mono text-xs tracking-[0.18em] text-ink-3 uppercase">Legal · {kicker}</div>
      <h1 className="font-display-soft mt-5 max-w-[17ch] text-[clamp(2.6rem,6.4vw,6rem)] leading-[0.88] uppercase">{children}</h1>
      <p className="mt-7 max-w-[54ch] font-voice text-[clamp(1.2rem,1.9vw,1.5rem)] leading-snug text-ink-2 italic">{lede}</p>
      {figures && (
        <dl className="mt-12 grid grid-cols-2 border-t border-ink/15 lg:grid-cols-4">
          {figures.map((f, i) => (
            <div key={f.l} className={`py-6 pr-6 ${i % 2 ? 'border-l border-ink/15 pl-6' : ''} ${i > 1 ? 'border-t border-ink/15 lg:border-t-0' : ''} ${i ? 'lg:border-l lg:border-ink/15 lg:pl-6' : ''}`}>
              <dd className="font-display-soft text-[clamp(2.6rem,5.4vw,4.6rem)] leading-[0.85] text-ink tabular-nums">
                {f.v}
                {f.unit && <span className="ml-1.5 font-mono text-base text-leaf">{f.unit}</span>}
              </dd>
              <dt className="mt-3 max-w-[26ch] font-mono text-[11px] leading-relaxed text-ink-3">{f.l}</dt>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

function Sub({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-20 scroll-mt-32 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
      {children}
    </h2>
  )
}

/** numbered clauses on hairlines - the Method page's limits, with a title to each */
function Clauses({ items, code }: { items: Clause[]; code: string }) {
  return (
    <ol className="mt-8 grid border-t border-ink/15 lg:grid-cols-2 lg:gap-x-12">
      {items.map((c, i) => (
        <li key={c.k} className="flex gap-5 border-b border-ink/10 py-6">
          <span className="font-mono text-[11px] text-wheat">
            {code}
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <div className="text-[16px] text-ink">{c.k}</div>
            <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-pretty text-ink-2">{c.v}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

const TERM_TONE: Record<Credit['terms'], string> = {
  open: 'text-orbit',
  credit: 'text-ink-3',
  restricted: 'text-wheat',
  unconfirmed: 'text-wheat',
}

function Credits({ items, start = 0 }: { items: Credit[]; start?: number }) {
  return (
    <ol className="mt-8 border-t border-ink/15">
      {items.map((c, i) => (
        <li key={c.name} className="grid gap-x-8 gap-y-1.5 border-b border-ink/10 py-5 sm:grid-cols-[2.2rem_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.1fr)]">
          <span className="font-mono text-[11px] text-ink-4">{String(start + i + 1).padStart(2, '0')}</span>
          <div className="min-w-0">
            <a href={c.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1.5 text-[15px] text-ink underline decoration-ink/15 underline-offset-4 hover:text-leaf hover:decoration-leaf/60">
              <span translate="no" className="notranslate">{c.name}</span>
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4 transition group-hover:text-leaf" aria-hidden />
            </a>
            <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{c.by}</div>
          </div>
          <div className="min-w-0 text-[14px] leading-relaxed text-ink-2">
            {c.what}
            {c.note && <span className="mt-1.5 block text-[13px] text-ink-3">{c.note}</span>}
          </div>
          <div className="min-w-0 font-mono text-[11px] leading-relaxed">
            <span className={`tracking-[0.08em] uppercase ${TERM_TONE[c.terms]}`}>{TERMS_LABEL[c.terms]}</span>
            <span className="text-ink-4"> · {c.use}</span>
            <span className="mt-1 block text-ink-3">{c.licence}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Contact() {
  return (
    <div className="mt-20 grid gap-x-12 gap-y-6 border-t border-ink/20 pt-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="font-mono text-[11px] tracking-[0.12em] text-ink-3 uppercase">Legal and privacy requests</div>
      <div className="max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
        {OPERATOR.contact ? (
          <>
            Write to{' '}
            <a href={`mailto:${OPERATOR.contact}`} translate="no" className="notranslate text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-leaf">
              {OPERATOR.contact}
            </a>
            . Say which page or number the request is about; a licence question is answered with the source’s own terms.
          </>
        ) : (
          <>An address for legal and privacy requests will be published here before the site’s public release. Until then the team is reached through its project page at the NASA Space Apps Challenge.</>
        )}
        {OPERATOR.repository && (
          <span className="mt-2 block">
            Source code:{' '}
            <a href={OPERATOR.repository} target="_blank" rel="noreferrer" translate="no" className="notranslate text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-leaf">
              {OPERATOR.repository.replace(/^https?:\/\//, '')}
            </a>
          </span>
        )}
        <span className="mt-3 block font-mono text-[11px] text-ink-4">
          {OPERATOR.name} · last changed <span className="num">{OPERATOR.updated}</span>
        </span>
      </div>
    </div>
  )
}

export function LegalPage({ site, place, tab, onTab, onClose }: { site: 'field' | 'greenhouse'; place: string | null; tab: LegalTab; onTab: (t: LegalTab) => void; onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const navFade = useEdgeFade<HTMLElement>()

  // the page under it stays where it was; only this one scrolls (as on the Method page)
  useEffect(() => {
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    const behind = [...(scroller.current?.parentElement?.children ?? [])].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== scroller.current && !el.inert)
    behind.forEach((el) => (el.inert = true))
    back.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      html.style.overflow = prev
      behind.forEach((el) => (el.inert = false))
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [tab])

  const always = ASKED.filter((a) => a.when === 'always').length
  const open = ALL_CREDITS.filter((c) => c.terms === 'open' || c.terms === 'credit').length

  return (
    <div ref={scroller} role="dialog" aria-modal="true" aria-label="Legal" className="grain fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-void" data-lenis-prevent>
      <header className="sticky top-0 z-20 border-b border-ink/10 bg-void">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-8">
          <button ref={back} onClick={onClose} className="flex min-h-[40px] min-w-0 items-center gap-2 border border-ink/15 px-3.5 py-2 text-sm text-ink-2 transition hover:border-ink/40 hover:text-ink">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{site === 'greenhouse' ? 'Back to the greenhouse' : 'Back to the field'}</span>
            {place && <span className="hidden truncate text-ink-3 md:inline">· {place}</span>}
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 text-sm text-ink-2 sm:flex">
              <Logo className="h-6 w-6" />
              <span translate="no" className="notranslate font-display-soft text-[19px] leading-none text-ink">Zixtaro</span>
              <span className="text-ink-4">/</span>
              <span>Legal</span>
            </span>
          </div>
        </div>
        <nav ref={navFade} aria-label="Legal sections" className="edge-fade mx-auto flex max-w-[1240px] gap-6 overflow-x-auto px-4 [scrollbar-width:none] sm:px-8">
          {TABS.map((t, i) => {
            const on = tab === t.id
            return (
              <button key={t.id} onClick={() => onTab(t.id)} aria-current={on ? 'page' : undefined} className={`relative flex shrink-0 items-baseline gap-2 py-3 text-sm whitespace-nowrap transition ${on ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}>
                <span className={`font-mono text-[10px] ${on ? 'text-leaf' : 'text-ink-4'}`}>0{i + 1}</span>
                {t.label}
                {on && <motion.span layoutId="legal-tab" className="absolute inset-x-0 -bottom-px h-[2px] bg-leaf" />}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pt-12 pb-24 sm:px-8 sm:pt-20">
        {tab === 'notice' && (
          <>
            <Head kicker="what it is not" lede="Zixtaro helps a farmer look at a field’s record and weigh rotations. Three things it is not: advice, an oracle, or NASA.">
              A second opinion, <em className="font-voice text-wheat normal-case">not the decision</em>
            </Head>
            <Sub>
              Farming: <em className="font-voice text-leaf normal-case">support, not advice</em>
            </Sub>
            <Clauses items={NOT_ADVICE} code="A" />
            <Sub>
              AI: <em className="font-voice text-leaf normal-case">where it is, where it is not</em>
            </Sub>
            <Clauses items={AI_NOTICE} code="B" />
            <Sub>
              NASA: <em className="font-voice text-leaf normal-case">the data, not the badge</em>
            </Sub>
            <Clauses items={NOT_NASA} code="C" />
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs">
              <button onClick={() => openMethod('limits')} className="group flex items-center gap-2 border-b border-ink/25 pb-1 text-ink-2 transition hover:border-leaf hover:text-ink">
                What the model cannot do <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-leaf" aria-hidden />
              </button>
              <button onClick={() => openMethod('validation')} className="group flex items-center gap-2 border-b border-ink/25 pb-1 text-ink-2 transition hover:border-leaf hover:text-ink">
                How it was tested <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-leaf" aria-hidden />
              </button>
            </div>
          </>
        )}

        {tab === 'privacy' && (
          <>
            <Head
              kicker="privacy"
              lede="There is no account and no server of ours behind this page. What you enter stays in your browser; what leaves it is the field’s place, asked of the data services."
              figures={[
                { v: '0', l: 'cookies set by this site' },
                { v: '0', l: 'analytics, advertising or social scripts' },
                { v: '1', l: 'place your farm is kept: this browser' },
                { v: String(always), l: 'services your browser asks on every visit - more when you pick your own field' },
              ]}
            >
              What this page <em className="font-voice text-leaf normal-case">knows about you</em>
            </Head>
            <Clauses items={PRIVACY} code="P" />

            <Sub>
              Kept <em className="font-voice text-leaf normal-case">in your browser</em>
            </Sub>
            <ol className="mt-8 border-t border-ink/15">
              {STORED.map((s, i) => (
                <li key={s.what} className="grid gap-x-8 gap-y-1 border-b border-ink/10 py-5 sm:grid-cols-[2.2rem_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="font-mono text-[11px] text-ink-4">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[14.5px] leading-relaxed text-ink">{s.what}</span>
                  <span className="font-mono text-[11px] leading-relaxed text-ink-3">{s.where}</span>
                  <span className="text-[13.5px] leading-relaxed text-ink-2">{s.why}</span>
                </li>
              ))}
            </ol>

            <Sub>
              Asked <em className="font-voice text-leaf normal-case">by your browser</em>
            </Sub>
            <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">Each of these receives your IP address with the request and keeps its own logs under its own policy. None receives your crop history, priorities, soil test or prices.</p>
            <ol className="mt-8 border-t border-ink/15">
              {ASKED.map((a, i) => (
                <li key={a.host} className="grid gap-x-8 gap-y-1 border-b border-ink/10 py-5 sm:grid-cols-[2.2rem_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)]">
                  <span className="font-mono text-[11px] text-ink-4">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div className="text-[15px] text-ink">{a.who}</div>
                    <div translate="no" className="notranslate mt-1 font-mono text-[11px] break-words text-ink-4">{a.host}</div>
                  </div>
                  <span className="text-[14px] leading-relaxed text-ink-2">{a.gets}</span>
                  <span className="font-mono text-[11px] leading-relaxed text-ink-3">{a.when}</span>
                </li>
              ))}
            </ol>
            {OPERATOR.host && (
              <p className="mt-8 max-w-[62ch] text-[14px] leading-relaxed text-ink-3">
                The site’s files are served by <span translate="no" className="notranslate text-ink-2">{OPERATOR.host}</span>, whose access logs are the server logs described above.
              </p>
            )}
          </>
        )}

        {tab === 'terms' && (
          <>
            <Head kicker="terms of use" lede="A hackathon prototype, free, as it is. The short version: it may be wrong, the decision is yours, and the data services behind it are shared.">
              Use it, <em className="font-voice text-leaf normal-case">weigh it,</em> decide yourself
            </Head>
            <Clauses items={TERMS} code="T" />
          </>
        )}

        {tab === 'sources' && (
          <>
            <Head
              kicker="sources and attribution"
              lede="Everything here that the authors did not make, with who made it and the terms it comes under. Where the terms are not plainly open, the line says so."
              figures={[
                { v: String(NASA_DATA.length), l: 'NASA and mission-partner records' },
                { v: String(OPEN_DATA.length + MAPS.length), l: 'other data sets, maps and imagery' },
                { v: String(open), l: `of ${ALL_CREDITS.length} sources are open or need only a credit` },
                { v: String(OPEN_QUESTIONS.length), l: 'come under other terms, or were not confirmed - marked below' },
              ]}
            >
              Whose work <em className="font-voice text-leaf normal-case">this stands on</em>
            </Head>
            <p className="mt-10 max-w-[62ch] text-[14px] leading-relaxed text-ink-3">
              Checked on <span className="num">{CHECKED}</span>. The papers behind each parameter are cited one by one in{' '}
              <button onClick={() => openMethod('registry')} className="text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-leaf">Method, Every number</button>.
            </p>
            <Sub id="nasa">
              NASA and <em className="font-voice text-leaf normal-case">its missions</em>
            </Sub>
            <Credits items={NASA_DATA} />
            <Sub id="open">
              Open data <em className="font-voice text-leaf normal-case">beside it</em>
            </Sub>
            <Credits items={OPEN_DATA} />
            <Sub id="maps">
              The map <em className="font-voice text-leaf normal-case">under the field</em>
            </Sub>
            <Credits items={MAPS} />
            <Sub id="assets">
              Typefaces, objects, <em className="font-voice text-leaf normal-case">voices</em>
            </Sub>
            <Credits items={[...FONTS, ...ASSETS]} />
          </>
        )}

        {tab === 'licence' && (
          <>
            <Head
              kicker="licence"
              lede="The site’s own code and text are open source. What it borrows keeps the licence it came with."
              figures={[
                { v: 'Apache', unit: '2.0', l: 'the licence of Zixtaro’s own code, text and drawings' },
                { v: String(SOFTWARE.length), l: 'groups of open-source software it is built with' },
                { v: String(OPEN_QUESTIONS.length), l: 'third-party materials under other terms, or not confirmed - see Sources' },
              ]}
            >
              Open source, <em className="font-voice text-leaf normal-case">with its debts named</em>
            </Head>
            <Clauses
              code="L"
              items={[
                { k: 'Zixtaro’s own work', v: 'The code, the model, the interface text, the procedural 3D scenes and crop drawings are licensed under the Apache License, Version 2.0: you may use, change and pass them on, including commercially, keeping the copyright and licence notices. It comes without warranty.' },
                { k: 'Why Apache 2.0', v: 'The NASA Space Apps Challenge asks that original work be freely available or open source as the Open Source Initiative defines it, and distributes work that names no licence under Apache 2.0. Naming it removes the doubt.' },
                { k: 'What the licence does not cover', v: 'Data, imagery, typefaces, scanned objects and voices made by others. Each keeps its own terms, named under Sources; some are not open licences, and reusing the site commercially means meeting them or replacing those parts.' },
                { k: 'Where the texts are', v: 'In the repository: LICENSE (the licence), NOTICE (the credits that travel with the code) and THIRD_PARTY.md (every third-party material and every software package with its licence).' },
              ]}
            />
            <Sub>
              Built <em className="font-voice text-leaf normal-case">with</em>
            </Sub>
            <Credits items={SOFTWARE} />
          </>
        )}

        <Contact />
        <footer className="mt-12 flex flex-col gap-3 border-t border-ink/10 pt-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Zixtaro · a NASA Space Apps Challenge 2026 prototype for “Field Shift: Adapting Farms with NASA Data”.</span>
          <span className="font-mono text-xs">An independent project; not affiliated with or endorsed by NASA.</span>
        </footer>
      </main>
    </div>
  )
}
