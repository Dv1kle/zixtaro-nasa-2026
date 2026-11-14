// The details under an answer, one topic at a time: a tab bar that stays under the top bar while its topic
// scrolls by, instead of fifteen panels in a row. A topic mounts the first time it is opened and then stays, so
// what the reader typed into it survives a switch. Jump links and the tour open the right topic by announcing
// the data-tour id they want (lib/reveal).
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useEdgeFade } from '../lib/hooks'
import type { LucideIcon } from 'lucide-react'
import { onAnnounce } from '../lib/reveal'

export type DeepTab = {
  id: string
  label: string
  icon: LucideIcon
  /** a short figure beside the label, e.g. "80 %" */
  badge?: string
  /** data-tour ids inside this topic: asking for one of them opens it */
  holds?: string[]
  render: () => ReactNode
}

const TOP_BAR = 56

export function DeepTabs({ tabs, label, intro }: { tabs: DeepTab[]; label: string; intro?: ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  const [seen, setSeen] = useState<Set<string>>(() => new Set([tabs[0]?.id ?? '']))
  const box = useRef<HTMLDivElement>(null)
  const fade = useEdgeFade<HTMLDivElement>()
  const uid = useId()
  const open = (id: string) => {
    setActive(id)
    setSeen((s) => (s.has(id) ? s : new Set(s).add(id)))
  }
  // a jump link or the tour wants something inside one of the topics
  useEffect(
    () =>
      onAnnounce((want) => {
        const t = tabs.find((x) => x.id === want || x.holds?.includes(want))
        if (t) open(t.id)
      }),
    [tabs],
  )
  const pick = (id: string) => {
    open(id)
    // deep inside a long topic: start the new one from its top
    const el = box.current
    if (!el) return
    const y = el.getBoundingClientRect().top + window.scrollY - TOP_BAR - 8
    if (window.scrollY > y + 4) window.scrollTo({ top: y, behavior: 'instant' })
  }
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = tabs[(i + d + tabs.length) % tabs.length]
    pick(next.id)
    document.getElementById(`${uid}-tab-${next.id}`)?.focus()
  }
  return (
    <div ref={box} className="mt-12">
      {intro}
      <div className="deep-bar sticky top-14 z-30 -mx-5 border-b border-white/10 bg-[#060a0f] px-5 py-2.5 sm:-mx-8 sm:px-8 lg:mx-0 lg:rounded-2xl lg:border lg:px-2">
        <div ref={fade} role="tablist" aria-label={label} className="edge-fade flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t, i) => {
            const on = t.id === active
            const Icon = t.icon
            return (
              <button
                key={t.id}
                id={`${uid}-tab-${t.id}`}
                role="tab"
                aria-selected={on}
                aria-controls={`${uid}-panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(t.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={`flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm whitespace-nowrap transition ${on ? 'bg-white/[0.13] text-ink' : 'text-ink-3 hover:bg-white/[0.06] hover:text-ink'}`}
              >
                <Icon className={`h-4 w-4 ${on ? 'text-leaf' : ''}`} aria-hidden />
                {t.label}
                {t.badge && <span className={`font-mono text-[11px] ${on ? 'text-leaf' : 'text-ink-4'}`}>{t.badge}</span>}
              </button>
            )
          })}
        </div>
      </div>
      {tabs.map((t) =>
        seen.has(t.id) ? (
          <div key={t.id} id={`${uid}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${uid}-tab-${t.id}`} hidden={t.id !== active} className="pt-5">
            {t.render()}
          </div>
        ) : null,
      )}
    </div>
  )
}
