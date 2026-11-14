// One market for the whole page: Auto (best of home and the region next door), Home, Region, or ship to any country.
import { Check, ChevronDown, Search, Ship } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { COUNTRY, countryLabel, MARKETS } from '../lib/markets'
import { useLang } from '../lib/i18n'
import type { MarketContext, MarketMode } from '../lib/marketProfit'
import { Popover } from './Popover'

/** Regional-indicator flag from an ISO alpha-2 code; a globe where there is none. */
export const flagOf = (iso3: string) => {
  const a2 = COUNTRY[iso3]?.a2
  return a2 && /^[A-Z]{2}$/.test(a2) ? String.fromCodePoint(...[...a2].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐'
}
export const countryName = (iso3: string, lang = 'en') => countryLabel(iso3, lang)
/**
 * A country already written in the reader's language, kept out of the sentence around it (translate="no" makes it a
 * ⟨a/⟩ in the dictionary key): one entry then serves every country - with the name inside, "Where you sell now:
 * 🇧🇪 Бельгия" matched no key and the whole sentence stayed English.
 */
export function Place({ iso3, flag = true }: { iso3: string; flag?: boolean }) {
  const lang = useLang()
  return <span translate="no">{flag ? `${flagOf(iso3)} ` : ''}{countryName(iso3, lang)}</span>
}

export function MarketChip({ ctx, mode, onMode, guessed = false }: { ctx: MarketContext; mode: MarketMode; onMode: (m: MarketMode) => void; guessed?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const lang = useLang()
  const nameOf = (iso3: string) => countryName(iso3, lang)
  const button = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setQ('')
  }, [])
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return MARKETS.countries
      .filter((c) => c.iso3 !== ctx.home && (c.name.toLowerCase().includes(s) || nameOf(c.iso3).toLowerCase().includes(s) || c.iso3.toLowerCase() === s))
      .sort((a, b) => Number(!nameOf(a.iso3).toLowerCase().startsWith(s)) - Number(!nameOf(b.iso3).toLowerCase().startsWith(s)) || nameOf(a.iso3).localeCompare(nameOf(b.iso3)))
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ctx.home, lang])
  const pick = (m: MarketMode) => {
    onMode(m)
    close()
  }
  // auto can sell next door (Belgium for a Saxon strawberry): the chip must not read as "Germany" alone
  const label = mode.kind === 'to' ? <Place iso3={mode.iso3} /> : mode.kind === 'auto' ? <><Place iso3={ctx.home} /> + next door</> : <Place iso3={ctx.home} />
  const kind = { auto: 'auto', home: 'home', region: 'region', to: 'ship to' }[mode.kind]
  const options: { m: MarketMode; title: ReactNode; sub: string | ReactNode }[] = [
    { m: { kind: 'auto' }, title: 'Auto', sub: <>Best of <Place iso3={ctx.home} flag={false} /> and big markets next door, crop by crop</> },
    { m: { kind: 'home' }, title: <>Home: <Place iso3={ctx.home} flag={false} /></>, sub: 'Farm-gate prices, no freight' },
    { m: { kind: 'region' }, title: 'Region', sub: COUNTRY[ctx.home]?.union ? `Inside the ${COUNTRY[ctx.home]!.union} customs union, duty-free` : `Neighbours in ${COUNTRY[ctx.home]?.sub ?? 'the region'}` },
  ]
  return (
    <div className="inline-flex flex-wrap items-center gap-2" data-market>
      <button
        ref={button}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition ${open ? 'border-leaf/60 bg-leaf/10 text-ink' : 'border-white/15 text-ink-2 hover:border-white/40 hover:text-ink'}`}
      >
        <Ship className="h-4 w-4 text-water" aria-hidden />
        <span>Market:</span>
        <strong className="font-medium text-ink">{label}</strong>
        <span className="font-mono text-[11px] text-ink-3">· {kind}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {ctx.routes === 'loading' && <span className="text-xs text-ink-3">loading sea routes…</span>}
      {ctx.routes === 'unavailable' && <span className="text-xs text-wheat">Sea routes unavailable: home market only.</span>}
      {guessed && <span className="text-xs text-ink-3">No country under this point. Nearest: <Place iso3={ctx.home} flag={false} />.</span>}
      <Popover open={open} onClose={close} anchor={button} label="Choose where you sell" title="Where do you sell?" width={400} initialFocus={input}>
        <div className="kicker mb-2 hidden px-1 sm:block">Where do you sell?</div>
        <div className="space-y-1">
          {options.map((o) => {
            const on = mode.kind === o.m.kind
            return (
              <button
                key={o.m.kind}
                onClick={() => pick(o.m)}
                aria-pressed={on}
                className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${on ? 'border-leaf/40 bg-leaf/10' : 'border-transparent hover:bg-white/[0.06]'}`}
              >
                <span className="min-w-0">
                  <span className="block text-[15px] text-ink">{o.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{o.sub}</span>
                </span>
                {on && <Check className="mt-1 h-4 w-4 shrink-0 text-leaf" aria-hidden />}
              </button>
            )
          })}
        </div>
        <div className="mt-3 border-t border-white/10 pt-3">
          <label className="mb-1.5 block px-1 text-[13px] text-ink-2" htmlFor="ship-to">Or ship to another country</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              id="ship-to"
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && hits[0] && pick({ kind: 'to', iso3: hits[0].iso3 })}
              placeholder="Type a country: Egypt, USA, China…"
              autoComplete="off"
              className="w-full rounded-xl border border-white/20 bg-black/40 py-2.5 pr-3 pl-9 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-leaf/70"
            />
          </div>
          {mode.kind === 'to' && !q.trim() && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-leaf/40 bg-leaf/10 px-3 py-2 text-[15px] text-ink">
              <span aria-hidden>{flagOf(mode.iso3)}</span> {nameOf(mode.iso3)}
              <Check className="ml-auto h-4 w-4 text-leaf" aria-hidden />
            </div>
          )}
          {hits.length > 0 && (
            <ul className="mt-2 space-y-0.5" role="listbox" aria-label="Countries">
              {hits.map((c, i) => (
                <li key={c.iso3}>
                  <button
                    onClick={() => pick({ kind: 'to', iso3: c.iso3 })}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[15px] transition hover:bg-white/[0.07] ${i === 0 ? 'bg-white/[0.05] text-ink' : 'text-ink-2 hover:text-ink'}`}
                  >
                    <span aria-hidden>{flagOf(c.iso3)}</span> {nameOf(c.iso3)}
                    {i === 0 && <span className="ml-auto font-mono text-[11px] text-ink-3">Enter ↵</span>}
                    {mode.kind === 'to' && mode.iso3 === c.iso3 && <Check className="ml-auto h-4 w-4 text-leaf" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && !hits.length && <p className="px-3 py-2 text-[13px] text-ink-3">No country matches.</p>}
        </div>
      </Popover>
    </div>
  )
}
