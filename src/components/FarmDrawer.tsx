import { AlertTriangle, Download, Hexagon, MapPin, Plus, RotateCcw, Trash2, UserRound, Warehouse, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CROP_BY_ID, FAMILY_LABEL } from '../lib/crops'
import { download, farmGeoJSON, farmKML } from '../lib/export'
import type { Farm, FarmField, SiteKind } from '../lib/farm'
import { demoFarm, kindOf } from '../lib/farm'
import { MONTHS_SHORT } from '../lib/format'
import { formatArea } from '../lib/geo'
import { useEdgeFade } from '../lib/hooks'
import { COVERS, GH_CROP_BY_ID } from '../lib/greenhouse'
import { staticView } from '../lib/staticmap'
import { lastSeasonYear } from './FieldSection'
import { ghLine } from './GreenhouseSection'
import { Chip, CropTile, MapImage } from './ui'

type Props = {
  open: boolean
  onClose: () => void
  farm: Farm
  setFarm: (f: Farm) => void
  isCurrent: (ff: FarmField) => boolean
  site: SiteKind
  onOpenField: (ff: FarmField) => void
  onAddCurrent: () => void
}

const weight = (ff: FarmField) => (ff.field.kind === 'area' ? ff.field.areaHa : 1)

export function FarmDrawer({ open, onClose, farm, setFarm, isCurrent, site, onOpenField, onAddCurrent }: Props) {
  const last = lastSeasonYear()
  const years = Array.from({ length: 5 }, (_, i) => last - 4 + i)
  const inFarm = farm.fields.some(isCurrent)
  const matrixFade = useEdgeFade<HTMLDivElement>()
  // One farm, two kinds of site: the rotation matrix is about fields, the list shows everything.
  const fields = farm.fields.filter((f) => kindOf(f) === 'field')
  const houses = farm.fields.filter((f) => kindOf(f) === 'greenhouse')
  const totalHa = fields.reduce((s, f) => s + (f.field.kind === 'area' ? f.field.areaHa : 0), 0)
  const glassM2 = houses.reduce((s, f) => s + (f.gh?.floorM2 ?? 0), 0)
  const [hover, setHover] = useState<string | null>(null)
  // a drawer closes with Esc, takes the focus while open and gives it back to what opened it
  const panel = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const back = document.activeElement as HTMLElement | null
    const t = setTimeout(() => panel.current?.focus({ preventScroll: true }), 50)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      back?.focus?.({ preventScroll: true })
    }
  }, [open])
  const fileBase = `${farm.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'farm'}-${new Date().toISOString().slice(0, 10)}`

  // Concentration risk: the biggest plant family's share of farm area, per season (incl. the planned one).
  const columns = [...years.map((y, i) => ({ label: String(y), crop: (ff: FarmField) => ff.history[i] ?? null })), { label: `${last + 1} plan`, crop: (ff: FarmField) => ff.snapshot?.next ?? null }]
  const shares = columns.map((col) => {
    const byFam = new Map<string, number>()
    let tot = 0
    for (const ff of fields) {
      const id = col.crop(ff)
      if (!id || CROP_BY_ID[id].family === 'none') continue // a bare fallow is no plant family
      const fam = CROP_BY_ID[id].family
      byFam.set(fam, (byFam.get(fam) ?? 0) + weight(ff))
      tot += weight(ff)
    }
    const top = [...byFam.entries()].sort((a, b) => b[1] - a[1])[0]
    return top && tot ? { fam: top[0], share: top[1] / tot } : null
  })
  const planRisk = shares[shares.length - 1]

  const map = useMemo(() => {
    if (!farm.fields.length) return null
    const pts = farm.fields.flatMap((f) => (f.field.kind === 'area' ? f.field.ring.map(([lon, lat]) => ({ lat, lon })) : [{ lat: f.field.lat, lon: f.field.lon }]))
    return staticView(pts, 520, 230, 800, 0.15)
  }, [farm.fields])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[70] bg-void/75" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className="surface fixed inset-y-0 right-0 z-[71] flex w-full max-w-[600px] flex-col !rounded-none !border-y-0 !border-r-0 outline-none"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            aria-label="My farm"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-leaf">
                  <UserRound className="h-3.5 w-3.5" /> Guest farmer · no sign-up · saved in this browser
                </div>
                <input
                  value={farm.name}
                  onChange={(e) => setFarm({ ...farm, name: e.target.value })}
                  className="font-display-soft mt-2 w-full border-b border-transparent bg-transparent text-3xl text-ink outline-none transition-colors hover:border-white/15 focus-visible:border-leaf/70"
                  aria-label="Farm name"
                />
                <div className="mt-1 font-mono text-xs text-ink-3">
                  {fields.length} field{fields.length === 1 ? '' : 's'}{totalHa ? ` · ${formatArea(totalHa)}` : ''}
                  {houses.length > 0 && ` · ${houses.length} greenhouse${houses.length === 1 ? '' : 's'} · ${(glassM2 / 10_000).toFixed(1)} ha under cover`}
                </div>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-ink-3 hover:bg-white/5 hover:text-ink" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {map && (
                <div className="relative overflow-hidden rounded-xl" style={{ height: 230 }}>
                  <MapImage src={map.url} alt="All sites of the farm" className="absolute inset-0 h-full w-full object-cover" />
                  <svg viewBox="0 0 520 230" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
                    {farm.fields.map((f, i) => {
                      const [cx, cy] = map.project(f.field.lat, f.field.lon)
                      const glass = kindOf(f) === 'greenhouse'
                      const tone = glass ? 'var(--color-water)' : 'var(--color-leaf)'
                      const lit = hover === f.id
                      return (
                        <g key={f.id} className="transition-opacity duration-300" opacity={hover && !lit ? 0.45 : 1}>
                          {f.field.kind === 'area' && <polygon points={f.field.ring.map(([lon, lat]) => map.project(lat, lon).join(',')).join(' ')} fill={glass ? `rgb(95 208 243 / ${lit ? 0.4 : 0.2})` : `rgb(201 176 122 / ${lit ? 0.38 : 0.18})`} stroke={tone} strokeWidth={lit ? 3 : 2} />}
                          {isCurrent(f) && <circle cx={cx} cy={cy} r={10} fill="none" stroke={tone} strokeWidth="2" className="site-pulse" />}
                          {glass ? <rect x={cx - 10} y={cy - 10} width={20} height={20} rx={4} fill="#0a0b0e" stroke={tone} /> : <circle cx={cx} cy={cy} r={10} fill="#0a0b0e" stroke={tone} />}
                          <text x={cx} y={cy + 4} textAnchor="middle" className={`${glass ? 'fill-water' : 'fill-leaf'} font-mono text-[11px]`}>{i + 1}</text>
                        </g>
                      )
                    })}
                  </svg>
                  <div className="absolute bottom-2 left-2 flex gap-3 rounded-full bg-void/70 px-3 py-1 font-mono text-[11px] text-ink-2">
                    <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border border-leaf" />field</span>
                    <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm border border-water" />greenhouse</span>
                  </div>
                </div>
              )}

              {fields.length > 0 && (
                <div>
                  <div className="kicker">Rotation matrix · field × season</div>
                  <div ref={matrixFade} className="edge-fade scrollbar-none mt-3 overflow-x-auto">
                    <table className="w-full border-separate border-spacing-1 text-left">
                      <thead>
                        <tr>
                          <th />
                          {columns.map((c) => (
                            <th key={c.label} className={`text-center font-mono text-[11px] font-normal ${c.label.includes('plan') ? 'text-leaf' : 'text-ink-3'}`}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((f) => (
                          <tr key={f.id}>
                            <td className="pr-2 text-xs whitespace-nowrap text-ink-2">{farm.fields.indexOf(f) + 1}. {f.name}</td>
                            {columns.map((c) => {
                              const id = c.crop(f)
                              return (
                                <td key={c.label} className="text-center">
                                  <div className="flex justify-center"><CropTile crop={id ? CROP_BY_ID[id] : null} size="xs" glow={c.label.includes('plan')} /></div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                        <tr>
                          <td className="pr-2 font-mono text-[11px] text-ink-4">largest family</td>
                          {shares.map((s, i) => (
                            <td key={i} className={`text-center font-mono text-[11px] ${s && s.share >= 0.6 ? 'text-heat' : 'text-ink-3'}`}>{s ? `${Math.round(s.share * 100)}%` : '-'}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {planRisk && planRisk.share >= 0.6 && (
                    <div className="mt-3 flex gap-2 rounded-xl bg-heat/10 p-3 text-sm text-ink-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-heat" />
                      {Math.round(planRisk.share * 100)}% of the farm would be {FAMILY_LABEL[planRisk.fam as keyof typeof FAMILY_LABEL].toLowerCase()} next season - one bad season, pest or price drop hits everything. Consider diversifying one field.
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {farm.fields.map((f, i) => {
                  const current = isCurrent(f)
                  const remove = () => setFarm({ ...farm, fields: farm.fields.filter((x) => x.id !== f.id) })
                  if (kindOf(f) === 'greenhouse') {
                    const g = f.ghSnapshot
                    const spec = f.gh
                    return (
                      <SiteCard
                        key={f.id}
                        current={current}
                        onOpen={() => onOpenField(f)}
                        onRemove={remove}
                        onHover={(on) => setHover(on ? f.id : null)}
                        title={<><Warehouse className="h-3.5 w-3.5 text-water" />{i + 1}. {f.name}</>}
                        meta={spec ? `${COVERS[spec.cover].short} · ${spec.floorM2.toLocaleString('en-US')} m² · ${spec.heated ? 'heated' : 'unheated'}${spec.lit ? ' · lit' : ''}` : 'greenhouse'}
                      >
                        {g ? (
                          <>
                            <div className="mt-2 flex items-center gap-1.5">
                              <CropTile crop={GH_CROP_BY_ID[g.crop]} size="xs" glow />
                              <span className="ml-2 text-xs text-ink-2">
                                {GH_CROP_BY_ID[g.crop].name} ·{' '}
                                {g.plant && g.firstHarvest && g.clear
                                  ? `plant ${MONTHS_SHORT[g.plant - 1]}, harvest ${MONTHS_SHORT[g.firstHarvest - 1]}-${MONTHS_SHORT[g.clear - 1]}`
                                  : 'no run pays for its energy'}
                              </span>
                            </div>
                            <div className="mt-1.5 font-mono text-[11px] text-ink-3">{ghLine(g)}</div>
                          </>
                        ) : (
                          <div className="mt-1 font-mono text-[11px] text-ink-3">computing…</div>
                        )}
                      </SiteCard>
                    )
                  }
                  const s = f.snapshot
                  return (
                    <SiteCard
                      key={f.id}
                      current={current}
                      onOpen={() => onOpenField(f)}
                      onRemove={remove}
                      onHover={(on) => setHover(on ? f.id : null)}
                      title={<>{f.field.kind === 'area' ? <Hexagon className="h-3.5 w-3.5 text-leaf" /> : <MapPin className="h-3.5 w-3.5 text-leaf" />}{i + 1}. {f.name}</>}
                      meta={`${f.field.kind === 'area' ? formatArea(f.field.areaHa) : 'point'}${f.irrigated ? ' · irrigated' : ''}${s ? ` · ${s.texture} · ${Math.round(s.paw100)} mm · ${s.signal}` : ' · computing…'}`}
                    >
                      {s && (
                        <div className="mt-2 flex items-center gap-1.5">
                          {s.plan.slice(0, 4).map((id, k) => <CropTile key={k} crop={CROP_BY_ID[id]} size="xs" glow={k === 0} />)}
                          <span className="ml-2 text-xs text-ink-2">next: {s.nextName ?? CROP_BY_ID[s.next].name} · {Math.round(s.score)}</span>
                        </div>
                      )}
                    </SiteCard>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/10 p-4">
              <button onClick={onAddCurrent} disabled={inFarm} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-leaf px-4 py-2.5 text-sm font-medium text-[#0a0b0e] disabled:opacity-40">
                <Plus className="h-4 w-4" /> {inFarm ? `Current ${site} is saved` : `Add the ${site} on screen`}
              </button>
              <button onClick={() => setFarm(demoFarm())} className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-sm text-ink-2 hover:text-ink">
                <RotateCcw className="h-4 w-4" /> Demo farm
              </button>
              <div className="flex w-full items-center gap-2 pt-1">
                <span className="kicker mr-auto !text-[11px]">Export boundaries & plans</span>
                <button onClick={() => download(`${fileBase}.geojson`, farmGeoJSON(farm), 'application/geo+json')} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-mono text-[11px] text-ink-2 hover:text-ink" title="QGIS, Climate FieldView and most farm-management software">
                  <Download className="h-3.5 w-3.5" /> GeoJSON
                </button>
                <button onClick={() => download(`${fileBase}.kml`, farmKML(farm), 'application/vnd.google-earth.kml+xml')} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-mono text-[11px] text-ink-2 hover:text-ink" title="Google Earth and many terminal tools">
                  <Download className="h-3.5 w-3.5" /> KML
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function SiteCard({ current, title, meta, onOpen, onRemove, onHover, children }: { current: boolean; title: ReactNode; meta: string; onOpen: () => void; onRemove: () => void; onHover: (on: boolean) => void; children: ReactNode }) {
  return (
    <div className={`panel p-4 ${current ? 'ring-1 ring-leaf/50' : ''}`} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onFocus={() => onHover(true)} onBlur={() => onHover(false)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[15px] text-ink">
            {title}
            {current && <Chip tone="good">open now</Chip>}
          </div>
          <div className="mt-1 font-mono text-[11px] text-ink-3">{meta}</div>
          {children}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button onClick={onOpen} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-medium text-[#0a0b0e]">Open</button>
          <button onClick={onRemove} className="flex items-center justify-center rounded-full border border-white/10 p-1.5 text-ink-3 hover:text-heat" aria-label="Remove site">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
