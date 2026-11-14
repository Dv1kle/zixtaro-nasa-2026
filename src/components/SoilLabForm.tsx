import { FlaskConical, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cleanLab, LAB_KEYS, LAB_RANGE, type LabKey, type LabSoil, type SoilProfile } from '../lib/soil'

export const LAB_LABEL: Record<LabKey, string> = { ph: 'pH', sand: 'sand', clay: 'clay', soc: 'organic carbon', bd: 'bulk density' }
const SHORT: Record<LabKey, string> = { ph: 'pH', sand: 'sand', clay: 'clay', soc: 'org. C', bd: 'density' }
const UNIT: Record<LabKey, string> = { ph: '', sand: '%', clay: '%', soc: '%', bd: 'g/cm³' }
const STEP: Record<LabKey, number> = { ph: 0.1, sand: 1, clay: 1, soc: 0.1, bd: 0.01 }
// organic carbon is typed in % (lab reports), stored in g/kg like SoilGrids
const toShown = (k: LabKey, v: number) => (k === 'soc' ? v / 10 : v)
const toStored = (k: LabKey, v: number) => (k === 'soc' ? v * 10 : v)

/**
 * "Have a soil test?" - the farmer's lab numbers for the plough layer, each replacing only its own property.
 * The map value is shown as the placeholder, so it's clear what is being overridden; empty = keep the map.
 */
export function SoilLabForm({ soil, lab, setLab }: { soil: SoilProfile; lab: LabSoil; setLab: (l: LabSoil) => void }) {
  const [draft, setDraft] = useState<Record<LabKey, string>>(() => fromLab(lab))
  useEffect(() => setDraft(fromLab(lab)), [lab])
  // the map's own topsoil values (before any lab override) for the placeholders
  const mapValue = (k: LabKey) => {
    if (soil.lab?.includes(k)) return null
    const v = k === 'soc' ? soil.top.soc : soil.top[k]
    return Number.isFinite(v) ? toShown(k, v) : null
  }
  const parsed: LabSoil = {}
  for (const k of LAB_KEYS) {
    const v = Number(draft[k].replace(',', '.'))
    if (draft[k].trim() !== '' && Number.isFinite(v)) parsed[k] = toStored(k, v)
  }
  const clean = cleanLab(parsed)
  const rejected = LAB_KEYS.filter((k) => parsed[k] !== undefined && clean[k] === undefined)
  const dirty = JSON.stringify(clean) !== JSON.stringify(cleanLab(lab))
  const used = soil.lab ?? []
  return (
    <form
      className="panel p-5"
      onSubmit={(e) => {
        e.preventDefault()
        setLab(clean)
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-ink"><FlaskConical className="h-4 w-4 text-wheat" /> Have a soil test? (0-30 cm)</div>
          <div className="mt-0.5 text-xs text-ink-3">Each number replaces only that property; blanks keep the map. Water holding is recomputed from the merged values.</div>
        </div>
        {used.length > 0 && (
          <button type="button" onClick={() => setLab({})} className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-ink-3 hover:text-ink">
            <RotateCcw className="h-3 w-3" /> map only
          </button>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
        {LAB_KEYS.map((k) => {
          const m = mapValue(k)
          const [lo, hi] = LAB_RANGE[k]
          const from = used.includes(k)
          return (
            <label key={k} className="block">
              <span className="flex items-center justify-between font-mono text-[11px] text-ink-3" title={LAB_LABEL[k]}>
                {SHORT[k]}
                <span className={from ? 'text-wheat' : 'text-ink-4'}>{from ? 'lab' : 'map'}</span>
              </span>
              <span className="mt-1 flex items-center rounded-lg border border-white/12 bg-void focus-within:border-wheat/60">
                <input
                  inputMode="decimal"
                  className="num w-full min-w-0 bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-4"
                  placeholder={m !== null ? String(+m.toFixed(k === 'bd' ? 2 : 1)) : '-'}
                  value={draft[k]}
                  step={STEP[k]}
                  aria-label={`${LAB_LABEL[k]} from your lab test${UNIT[k] ? `, ${UNIT[k]}` : ''} (${toShown(k, lo)}-${toShown(k, hi)})`}
                  aria-invalid={rejected.includes(k)}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
                {UNIT[k] && <span className="pr-2 font-mono text-[11px] text-ink-4">{UNIT[k]}</span>}
              </span>
            </label>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!dirty} className="rounded-full bg-wheat px-4 py-1.5 text-sm font-medium text-[#1a1305] transition enabled:hover:brightness-110 disabled:opacity-40">
          Use my test
        </button>
        {rejected.length > 0 && <span className="text-xs text-heat">Out of range: {rejected.map((k) => LAB_LABEL[k]).join(', ')}{parsed.sand !== undefined && parsed.clay !== undefined && parsed.sand + parsed.clay > 100 ? ' (sand + clay over 100 %)' : ''}.</span>}
        {used.length > 0 && !dirty && <span className="text-xs text-ink-3">Using your {used.map((k) => LAB_LABEL[k]).join(', ')} - shown as “lab” in the plan's sources and the report.</span>}
      </div>
    </form>
  )
}

function fromLab(lab: LabSoil): Record<LabKey, string> {
  return Object.fromEntries(LAB_KEYS.map((k) => [k, lab[k] === undefined ? '' : String(+toShown(k, lab[k]!).toFixed(2))])) as Record<LabKey, string>
}
