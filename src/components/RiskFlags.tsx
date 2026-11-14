import { ShieldAlert } from 'lucide-react'
import { flagSummary, type RotationFlag } from '../lib/rotation'

/** A crop's rotation risks the score does not price (history v3): the level, the evidence, and that no yield figure
 *  backs them - so the farmer weighs them, not the model. */
export function RiskFlags({ flags, compact = false }: { flags: RotationFlag[]; compact?: boolean }) {
  const s = flagSummary(flags)
  if (!s) return null
  const tone = s.level === 'high' ? 'border-heat/35 bg-heat/[0.06] text-heat' : 'border-wheat/30 bg-wheat/[0.05] text-wheat'
  if (compact) return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] leading-none ${tone}`}><ShieldAlert className="h-3 w-3" aria-hidden />rotation risk {s.level} · not priced</span>
  return (
    <div className={`rounded-xl border p-3 text-[13px] leading-relaxed ${tone}`}>
      <div className="flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4" aria-hidden /> Rotation risk: {s.level}</div>
      <div className="mt-1 text-ink-2">Evidence: {s.causes.length ? s.causes.join(', ') : 'shared pests of one plant family'} · Yield penalty: not quantified - the score leaves it out, so weigh it yourself.</div>
    </div>
  )
}
