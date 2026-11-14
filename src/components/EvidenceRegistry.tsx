import { BookOpen, ChevronDown, FlaskConical } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { KIND_LABEL, PARAMS, SOURCES, type Checked, type EvidenceKind, type Param } from '../lib/evidence'

export const KIND_TONE: Record<EvidenceKind, string> = {
  observed: 'border-orbit/40 text-orbit bg-orbit/[0.08]',
  modeled: 'border-water/35 text-water bg-water/[0.07]',
  literature: 'border-leaf/35 text-leaf bg-leaf/[0.07]',
  heuristic: 'border-wheat/35 text-wheat bg-wheat/[0.07]',
  farmer: 'border-[#b8a8ff]/35 text-[#c9b8ff] bg-[#b8a8ff]/[0.07]',
  projection: 'border-[#e79bd0]/35 text-[#f0b3dd] bg-[#e79bd0]/[0.07]',
  assumption: 'border-heat/40 text-heat bg-heat/[0.08]',
}
const CHECKED: Record<Checked, { label: string; title: string; cls: string }> = {
  tested: { label: '✓ tested', title: 'A unit test compares the code with a transcription of the source', cls: 'text-leaf' },
  cited: { label: 'cited', title: 'The source is named; the value was not re-checked row by row against it', cls: 'text-ink-3' },
  none: { label: 'no source', title: 'A design choice or assumption - nothing to check it against', cls: 'text-ink-4' },
}
const BAR: Record<EvidenceKind, string> = {
  observed: 'bg-orbit/70', modeled: 'bg-water/60', literature: 'bg-leaf/60', heuristic: 'bg-wheat/60',
  farmer: 'bg-[#b8a8ff]/60', projection: 'bg-[#e79bd0]/60', assumption: 'bg-heat/70',
}
const ORDER: EvidenceKind[] = ['observed', 'modeled', 'literature', 'projection', 'farmer', 'heuristic', 'assumption']

export function KindBadge({ kind }: { kind: EvidenceKind }) {
  return <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap ${KIND_TONE[kind]}`}>{KIND_LABEL[kind]}</span>
}

/**
 * Where every number comes from: the whole parameter registry, filterable by the kind of evidence, with what each
 * value rests on, how far to trust it and whether a test holds the code to its source.
 */
export function EvidenceRegistry() {
  const [kind, setKind] = useState<EvidenceKind | null>(null)
  const [refs, setRefs] = useState(false)
  const counts = useMemo(() => Object.fromEntries(ORDER.map((k) => [k, PARAMS.filter((p) => p.kind === k).length])) as Record<EvidenceKind, number>, [])
  const shown = kind ? PARAMS.filter((p) => p.kind === kind) : PARAMS
  const groups = [...new Set(shown.map((p) => p.group))]
  const tested = PARAMS.filter((p) => p.checked === 'tested').length
  const used = [...new Set(PARAMS.flatMap((p) => p.sources))].map((id) => SOURCES[id]).filter(Boolean).sort((a, b) => a.full.localeCompare(b.full))
  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><FlaskConical className="h-4 w-4 text-leaf" /> Where every number comes from</div>
        <div className="font-mono text-[11px] text-ink-3">{PARAMS.length} parameters · {tested} held to their source by tests · {used.length} sources</div>
      </div>
      <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-2">
        Each value is labelled for what it is. Published science and NASA data carry most of the water and soil physics; rules of thumb and
        our own assumptions are named as such - prices above all, which you should replace with local ones.
      </p>
      <div className="mt-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by kind of evidence">
        <button onClick={() => setKind(null)} aria-pressed={kind === null} className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${kind === null ? 'border-white/40 bg-white/10 text-ink' : 'border-white/10 text-ink-3 hover:text-ink'}`}>
          all {PARAMS.length}
        </button>
        {ORDER.map((k) => (
          <button key={k} onClick={() => setKind(kind === k ? null : k)} aria-pressed={kind === k} className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${kind === k ? KIND_TONE[k] : 'border-white/10 text-ink-3 hover:text-ink'}`}>
            {KIND_LABEL[k]} {counts[k]}
          </button>
        ))}
      </div>
      {/* share of the registry by kind */}
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full">
        {ORDER.map((k) => (
          <i key={k} className={`block h-full ${BAR[k]}`} style={{ width: `${(counts[k] / PARAMS.length) * 100}%` }} title={`${KIND_LABEL[k]}: ${counts[k]}`} />
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {groups.map((g) => (
          <div key={g}>
            <div className="kicker">{g}</div>
            <div className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
              <AnimatePresence initial={false}>
                {shown.filter((p) => p.group === g).map((p) => <Row key={p.id} p={p} />)}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setRefs(!refs)} aria-expanded={refs} className="mt-6 flex items-center gap-2 text-[13px] text-ink-2 hover:text-ink">
        <BookOpen className="h-4 w-4 text-orbit" /> References ({used.length}) <ChevronDown className={`h-4 w-4 transition ${refs ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {refs && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 list-decimal space-y-1.5 overflow-hidden pl-5 text-[12px] leading-relaxed text-ink-3">
            {used.map((s) => (
              <li key={s.id}>
                {s.full}{' '}
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-orbit/80 underline decoration-orbit/30 hover:text-orbit">link</a>}
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}

function Row({ p }: { p: Param }) {
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-x-4 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto]">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{p.what}</div>
        {(p.uncertainty || p.limits) && (
          <div className="mt-0.5 text-[11px] leading-snug text-ink-4">
            {p.uncertainty && <span>± {p.uncertainty}</span>}
            {p.uncertainty && p.limits && <span> · </span>}
            {p.limits && <span>limit: {p.limits}</span>}
          </div>
        )}
      </div>
      <div className="min-w-0 text-[12.5px] leading-snug text-ink-2">
        {p.value}
        {p.sources.length > 0 && (
          <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
            {p.sources.map((id, i) => (
              <span key={id} title={SOURCES[id]?.full}>
                {i > 0 && ' · '}
                {SOURCES[id]?.url ? <a href={SOURCES[id].url} target="_blank" rel="noreferrer" className="hover:text-ink">{SOURCES[id].short}</a> : SOURCES[id]?.short}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="flex items-start gap-2 sm:flex-col sm:items-end">
        <KindBadge kind={p.kind} />
        <span className={`font-mono text-[11px] ${CHECKED[p.checked].cls}`} title={CHECKED[p.checked].title}>{CHECKED[p.checked].label}</span>
      </div>
    </motion.div>
  )
}
