import { ArrowRight, Coins, Droplets, Sprout, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { CATEGORIES, CROPS, CROP_BY_ID, categoryOf, type CropId } from '../lib/crops'
import type { Evaluation, Priorities } from '../lib/rotation'
import { Instrument, usePlate } from './Instrument'
import { SpaceHistory } from './SpaceHistory'
import { CountUp, CropTile, RankDelta, Reveal, useRankDelta, SectionHeader, SiteSwitch, WaterControl, type WaterApi } from './ui'

export function lastSeasonYear(): number {
  const now = new Date()
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

type Props = {
  history: (CropId | null)[]
  setHistory: (h: (CropId | null)[]) => void
  priorities: Priorities
  setPriorities: (p: Priorities) => void
  exclude: CropId[]
  setExclude: (x: CropId[]) => void
  water: WaterApi
  next: Evaluation | null
  /** the live ranking, so the faders show what they do right where they are */
  ranking: Evaluation[]
  onGreenhouse: () => void
  lat: number
  lon: number
  hemisphere: 'north' | 'south' | 'tropics' | null
  /** a pinned crossing stands before the section: as a plate it rides up over that scene (story mode) */
  over?: boolean
}

const FADERS: { key: keyof Priorities; label: string; hint: string; color: string; icon: typeof Sprout }[] = [
  { key: 'soil', label: 'Soil health', hint: 'organic matter, nitrogen, structure', color: 'var(--color-leaf)', icon: Sprout },
  { key: 'water', label: 'Save water', hint: 'drought resilience, less irrigation', color: 'var(--color-water)', icon: Droplets },
  { key: 'profit', label: 'Profit', hint: 'expected margin after climate risk', color: 'var(--color-wheat)', icon: Coins },
]

const MIXES: { label: string; p: Priorities }[] = [
  { label: 'Balanced', p: { soil: 60, water: 60, profit: 60 } },
  { label: 'Soil first', p: { soil: 100, water: 50, profit: 30 } },
  { label: 'Water first', p: { soil: 50, water: 100, profit: 40 } },
  { label: 'Profit first', p: { soil: 30, water: 40, profit: 100 } },
]

export function FieldSection(props: Props) {
  const { history, setHistory, priorities, setPriorities, exclude, setExclude, water, next, ranking, onGreenhouse, lat, lon, hemisphere } = props
  const plate = usePlate(props.over, true)
  const [editing, setEditing] = useState<number | null>(null)
  const [pickCat, setPickCat] = useState('all')
  const last = lastSeasonYear()
  const years = history.map((_, i) => last - (history.length - 1 - i))

  useEffect(() => {
    if (editing === null) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setEditing(null)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [editing])

  return (
    <section id="field" className={`sec-field relative scroll-mt-16 px-5 pt-16 pb-16 sm:pt-24 sm:pb-20 sm:px-8 lg:pl-28 xl:pl-36 ${plate.root}`}>
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col">
        <SectionHeader
          kicker="The field"
          altitude="0 m · surface"
          step={plate.story ? 'Step 2 of 4 · your field' : undefined}
          title={plate.story ? <>Tell us about <em className="text-leaf">this</em> field.</> : <>Five seasons of <em className="text-leaf">this</em> field.</>}
          dek={plate.story
            ? 'What grew here in the last five seasons? Tap a season to change it. Below that: what matters most to you, which crops you can grow and sell, and whether you can water. Leave anything as it is - the answer further down uses whatever you give it.'
            : 'Tell Zixtaro what grew here. Satellites can tell a winter crop from a summer crop, but not wheat from barley - so the farmer stays in the loop. Tap a season to change it.'}
        />
        {!plate.story && <SiteSwitch to="greenhouse" onClick={onGreenhouse} />}

        <Reveal className="mt-14">
          {/* phones: the five seasons and the next one as a 3 × 2 grid - a sideways scroller hid the next season off-screen */}
          <div className="scrollbar-none pb-2 sm:overflow-x-auto">
            <div className="grid grid-cols-3 justify-items-center gap-1 sm:flex sm:min-w-max sm:items-end sm:gap-4">
              {history.map((id, i) => (
                <button
                  key={i}
                  onClick={() => setEditing(editing === i ? null : i)}
                  className={`group flex flex-col items-center gap-2 rounded-2xl p-1.5 transition sm:p-2 ${editing === i ? 'bg-white/[0.07] ring-1 ring-leaf/50' : 'hover:bg-white/[0.04]'}`}
                  aria-label={`${years[i]} ${id ? CROP_BY_ID[id].name : 'Unknown'}: change the crop`}
                  aria-expanded={editing === i}
                >
                  <span className="num text-xs text-ink-3">{years[i]}</span>
                  <CropTile crop={id ? CROP_BY_ID[id] : null} size="lg" className="transition-transform group-hover:-translate-y-1 sm:!h-28 sm:!w-28 xl:!h-32 xl:!w-32" />
                  <span className="line-clamp-2 h-8 max-w-24 text-center text-xs leading-4 text-ink-2 sm:max-w-28">{id ? CROP_BY_ID[id].name : 'Unknown'}</span>
                </button>
              ))}
              <div className="hidden h-28 items-center px-3 text-ink-4 sm:flex xl:h-32">
                <ArrowRight className="h-6 w-6" />
              </div>
              <a href="#plan" className="group flex flex-col items-center gap-2 rounded-2xl p-1.5 sm:p-2">
                {/* (the story: the answer comes after the farmer's own inputs, in step 4 - the tile holds its place) */}
                <span className="num text-xs text-leaf">{last + 1} · next</span>
                <div className="breathe">
                  <CropTile crop={plate.story ? null : next?.crop ?? null} size="xl" glow className="max-sm:!h-24 max-sm:!w-24 xl:!h-44 xl:!w-44" />
                </div>
                <span className="h-8 text-center text-xs leading-4 text-leaf">{plate.story ? 'the answer: step 4, below' : next ? `${next.crop.name} · ${Math.round(next.score)}` : 'waiting for data'}</span>
              </a>
            </div>
          </div>

          <SpaceHistory key={`${lat},${lon}`} lat={lat} lon={lon} hemisphere={hemisphere} years={years} history={history} setHistory={setHistory} />

          <AnimatePresence>
            {editing !== null && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="panel mt-4 p-4 sm:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="kicker">The periodic table of crops</div>
                      <div className="mt-1 text-sm text-ink-2">What grew here in {years[editing]}?</div>
                    </div>
                    <button onClick={() => setEditing(null)} className="rounded-full p-2 text-ink-3 hover:bg-white/5 hover:text-ink" aria-label="Close">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {[{ id: 'all', label: 'All' }, ...CATEGORIES].map((k) => (
                      <button key={k.id} onClick={() => setPickCat(k.id)} className={`rounded-full border px-3 py-1 text-xs transition ${pickCat === k.id ? 'border-leaf/60 bg-leaf/10 text-leaf' : 'border-white/10 text-ink-3 hover:text-ink'}`}>
                        {k.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-12">
                    {CROPS.filter((c) => pickCat === 'all' || categoryOf(c) === pickCat).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          const h = [...history]
                          h[editing] = c.id
                          setHistory(h)
                          setEditing(null)
                        }}
                        className="flex flex-col items-center gap-1.5 rounded-xl p-1 transition hover:-translate-y-0.5 hover:bg-white/5"
                      >
                        <CropTile crop={c} size="md" glow={history[editing] === c.id} />
                        {/* the name under the plant: four of the cereals are the same ear to anyone but a botanist, and
                            a picker that has to be hovered to be read is a guessing game */}
                        <span className={`text-center text-[11px] leading-tight text-balance ${history[editing] === c.id ? 'text-leaf' : 'text-ink-3'}`}>{c.name}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        const h = [...history]
                        h[editing] = null
                        setHistory(h)
                        setEditing(null)
                      }}
                      className="flex flex-col items-center gap-1.5 rounded-xl p-1 hover:bg-white/5"
                    >
                      <CropTile crop={null} size="md" />
                      <span className="text-center text-[11px] leading-tight text-ink-3">Unknown</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Reveal>

        <Instrument
          title="What matters to you, what can grow here"
          kicker="Instrument · 0 m"
          label="Change what matters to you, your crops and your water"
          inline
        >
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <Reveal className="panel p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="font-display-soft text-2xl">What matters most?</h3>
              <div className="flex flex-wrap gap-1.5">
                {MIXES.map((m) => {
                  const on = m.p.soil === priorities.soil && m.p.water === priorities.water && m.p.profit === priorities.profit
                  return (
                    <button
                      key={m.label}
                      onClick={() => setPriorities(m.p)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-white/40 bg-white/10 text-ink' : 'border-white/10 text-ink-3 hover:text-ink'}`}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mt-6 space-y-5">
              {FADERS.map((f) => (
                <label key={f.key} className="block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2.5">
                      <f.icon className="h-4 w-4" style={{ color: f.color }} />
                      <span className="text-[15px] text-ink">{f.label}</span>
                      <span className="hidden text-xs text-ink-3 sm:inline">{f.hint}</span>
                    </span>
                    <span className="num text-lg" style={{ color: f.color }}>
                      {priorities[f.key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={priorities[f.key]}
                    onChange={(e) => setPriorities({ ...priorities, [f.key]: Number(e.target.value) })}
                    className="fader mt-1"
                    style={{ ['--fader' as string]: f.color, ['--val' as string]: `${priorities[f.key]}%` }}
                  />
                </label>
              ))}
            </div>
            <MixBar p={priorities} />
            <div className="mt-7 border-t border-white/8 pt-5">
              <div className="text-sm text-ink">Water for this field</div>
              <div className="mb-3 text-xs text-ink-3">Irrigation water available per season. It runs through the root-zone water model, so stress, yield and the ranking follow it.</div>
              <WaterControl {...water} />
            </div>
            <LivePick ranking={ranking} />
          </Reveal>

          <Reveal delay={0.08} className="panel p-5 sm:p-7">
            <h3 className="font-display-soft text-2xl">What can you grow?</h3>
            <p className="mt-2 text-sm text-ink-3">Switch off crops without a local market or the kit to grow them. Clover-grass ley needs livestock; a green fallow earns nothing, and a bare fallow pays only through the next crop - so all three start off.</p>
            <div className="mt-5 space-y-4">
              {CATEGORIES.map((cat) => {
                const crops = CROPS.filter((c) => categoryOf(c) === cat.id)
                const allOn = crops.every((c) => !exclude.includes(c.id))
                return (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between">
                      <span className="kicker !text-[11px]">{cat.label}</span>
                      <button
                        onClick={() => setExclude(allOn ? [...new Set([...exclude, ...crops.map((c) => c.id)])] : exclude.filter((x) => !crops.some((c) => c.id === x)))}
                        className="-my-1.5 rounded-full px-2.5 py-1.5 font-mono text-[11px] text-ink-3 transition hover:bg-white/[0.06] hover:text-ink"
                      >
                        {allOn ? 'all off' : 'all on'}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {crops.map((c) => {
                        const off = exclude.includes(c.id)
                        return (
                          <button
                            key={c.id}
                            onClick={() => setExclude(off ? exclude.filter((x) => x !== c.id) : [...exclude, c.id])}
                            aria-pressed={!off}
                            className={`flex items-center gap-2 border py-1 pr-3 pl-1 text-[13px] transition ${off ? 'border-white/8 text-ink-4 line-through' : 'border-white/15 bg-white/[0.04] text-ink-2 hover:border-white/35'}`}
                          >
                            {/* the crop's own specimen, dimmed when it's switched off */}
                            <CropTile crop={c} size="xs" dim={off} className="!h-7 !w-7" />
                            {c.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Reveal>
        </div>
        </Instrument>
      </div>
    </section>
  )
}

function MixBar({ p }: { p: Priorities }) {
  const total = p.soil + p.water + p.profit || 1
  return (
    <div className="mt-7">
      <div className="flex h-2 overflow-hidden rounded-full">
        <motion.i layout className="h-full" style={{ width: `${(p.soil / total) * 100}%`, background: 'var(--color-leaf)' }} />
        <motion.i layout className="h-full" style={{ width: `${(p.water / total) * 100}%`, background: 'var(--color-water)' }} />
        <motion.i layout className="h-full" style={{ width: `${(p.profit / total) * 100}%`, background: 'var(--color-wheat)' }} />
      </div>
      <div className="mt-2 font-mono text-[11px] text-ink-3">
        your weighting · soil {Math.round((p.soil / total) * 100)}% · water {Math.round((p.water / total) * 100)}% · profit {Math.round((p.profit / total) * 100)}%
      </div>
    </div>
  )
}

/** The top of the ranking, re-sorting live while the faders move or crops are switched off. */
function LivePick({ ranking }: { ranking: Evaluation[] }) {
  const top = ranking.slice(0, 5)
  const moved = useRankDelta(top.map((e) => e.crop.id))
  return (
    <div className="mt-7 border-t border-white/8 pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="kicker !text-[11px]">Next season, with these priorities</span>
        <a href="#plan" className="font-mono text-[11px] text-ink-3 transition hover:text-ink">
          full plan ↓
        </a>
      </div>
      {top.length === 0 ? (
        <div className="mt-3 text-sm text-ink-3">Every crop is switched off - turn some back on in “What can you grow?”.</div>
      ) : (
        <LayoutGroup id="live-pick">
          <ol className="mt-3 space-y-0.5">
            {top.map((e, i) => (
              <motion.li
                key={e.crop.id}
                layout
                className="grid grid-cols-[14px_32px_minmax(0,1.6fr)_minmax(0,1fr)_26px] items-center gap-2 py-1 sm:grid-cols-[14px_32px_minmax(0,1fr)_minmax(0,1.2fr)_26px] sm:gap-3"
                animate={moved[e.crop.id] ? { backgroundColor: ['rgba(201,176,122,0.10)', 'rgba(201,176,122,0)'] } : undefined}
                transition={{ layout: { type: 'spring', stiffness: 380, damping: 34 }, backgroundColor: { duration: 1.2 } }}
              >
                <span className={`num text-xs ${i === 0 ? 'text-leaf' : 'text-ink-4'}`}>{i + 1}</span>
                <CropTile crop={e.crop} size="xs" glow={i === 0} />
                <span className={`flex min-w-0 items-center gap-1.5 text-sm leading-tight ${i === 0 ? 'text-ink' : 'text-ink-2'}`}><span className="min-w-0 sm:truncate">{e.crop.name}</span><RankDelta d={moved[e.crop.id]} /></span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.i
                    className="block h-full rounded-full"
                    style={{ background: i === 0 ? 'var(--color-leaf)' : 'rgb(255 255 255 / 0.3)' }}
                    initial={false}
                    animate={{ width: `${Math.max(2, e.score)}%` }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </span>
                <CountUp value={e.score} className={`num text-right text-sm ${i === 0 ? 'text-leaf' : 'text-ink-2'}`} />
              </motion.li>
            ))}
          </ol>
        </LayoutGroup>
      )}
    </div>
  )
}
