import { AlertTriangle, Database, ExternalLink, Ruler } from 'lucide-react'
import type { ScaleNote } from '../lib/scale'
import { motion } from 'motion/react'

export type SourceState = 'live' | 'cache' | 'bundled' | 'provisional' | 'manual' | 'loading' | 'error' | 'none'

export type SourceItem = {
  key: string
  label: string // plain words: what it is for the farmer
  tech: string // the product names, for the curious
  res: string // spatial / temporal resolution
  state: SourceState
  note?: string
  url?: string
  nasa?: boolean
}

const STATE: Record<SourceState, { word: string; dot: string; text: string }> = {
  live: { word: 'live', dot: 'bg-leaf shadow-[0_0_8px_var(--color-leaf)]', text: 'text-leaf' },
  cache: { word: 'saved copy', dot: 'bg-orbit', text: 'text-orbit' },
  bundled: { word: 'offline demo data', dot: 'bg-orbit/70', text: 'text-orbit' },
  provisional: { word: 'provisional', dot: 'bg-wheat animate-pulse', text: 'text-wheat' },
  manual: { word: 'your input', dot: 'bg-[#b8a8ff]', text: 'text-[#c9b8ff]' },
  loading: { word: 'loading…', dot: 'bg-wheat animate-pulse', text: 'text-ink-3' },
  error: { word: 'unavailable', dot: 'bg-heat', text: 'text-heat' },
  none: { word: 'not for this field', dot: 'bg-ink-4', text: 'text-ink-4' },
}

/**
 * "What this recommendation is built on" - every source, whether it answered live, from a saved copy, from the
 * offline demo bundle, or not yet - so a plan made on a provisional soil never looks final. NASA stays visible
 * as a badge; product names (POWER, MERRA-2, CERES…) sit one hover deeper.
 */
export function DataProvenance({ items, scale }: { items: SourceItem[]; scale?: ScaleNote }) {
  const provisional = items.filter((i) => i.state === 'provisional')
  const failed = items.filter((i) => i.state === 'error')
  const nasa = items.filter((i) => i.nasa && i.state !== 'none' && i.state !== 'error' && i.state !== 'loading').length
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 text-[13px] text-ink"><Database className="h-3.5 w-3.5 text-orbit" /> Built on</span>
        <span className="font-mono text-[11px] text-ink-3">{nasa} NASA data sets · {items.filter((i) => !i.nasa && i.state !== 'none').length} other sources</span>
        {provisional.length > 0 && (
          <span className="font-mono text-[11px] text-wheat">· {provisional.map((w) => w.label.toLowerCase()).join(', ')}: provisional - the plan refines itself when it arrives</span>
        )}
        {failed.length > 0 && (
          <span className="font-mono text-[11px] text-heat/90">· {failed.map((w) => w.label.toLowerCase()).join(', ')}: unavailable - the plan runs without {failed.length === 1 ? 'it' : 'them'}</span>
        )}
      </div>
      {scale && (
        <div
          role={scale.tone === 'bad' ? 'alert' : undefined}
          className={`mt-3 flex gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] leading-snug ${scale.tone === 'bad' ? 'border border-heat/35 bg-heat/[0.08] text-ink' : scale.tone === 'warn' ? 'border border-wheat/30 bg-wheat/[0.06] text-ink-2' : 'bg-white/[0.02] text-ink-3'}`}
        >
          {scale.tone === 'ok' ? <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" /> : <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${scale.tone === 'bad' ? 'text-heat' : 'text-wheat'}`} />}
          <span><span className={scale.tone === 'ok' ? 'text-ink-2' : 'text-ink'}>{scale.title}.</span> {scale.text}</span>
        </div>
      )}
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((it, i) => {
          const st = STATE[it.state]
          return (
            <motion.li
              key={it.key}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.04 * i }}
              className="group relative flex items-start gap-2.5 rounded-xl bg-white/[0.025] px-3 py-2"
              title={`${it.tech} · ${it.res}${it.note ? ` · ${it.note}` : ''}`}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] text-ink-2">{it.label}</span>
                  {it.nasa && <span className="shrink-0 rounded bg-orbit/15 px-1 font-mono text-[11px] tracking-wider text-orbit">NASA</span>}
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-4">
                  <span className={st.text}>{st.word}</span> · {it.res}
                </span>
                {it.note && <span className="block text-[11px] leading-snug text-ink-3">{it.note}</span>}
              </span>
              {it.url && (
                <a href={it.url} target="_blank" rel="noreferrer" className="mt-0.5 shrink-0 text-ink-4 opacity-0 transition group-hover:opacity-100 hover:text-ink" aria-label={`Open the ${it.tech} request`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}
