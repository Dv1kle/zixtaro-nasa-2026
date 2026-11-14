// The page's last screen: which NASA missions and open datasets the numbers above come from, where to read how it
// works and how well it does, and the way back up to orbit. No reveal animation: people arrive here by jumping to the
// end of the page, and an entrance effect can miss a jump.
import { ArrowUp, ArrowUpRight } from 'lucide-react'
import { openLegal, openMethod, type LegalTab, type MethodTab } from '../lib/nav'
import { MODEL_VERSION } from '../lib/version'
import { Logo } from './ui'
import { useAscent } from './Ascent'

const NASA: { name: string; what: string; url: string }[] = [
  { name: 'POWER', what: '45 years of daily weather, sunshine and evaporation', url: 'https://power.larc.nasa.gov/' },
  { name: 'MERRA-2', what: 'root-zone wetness: an independent check of the water balance', url: 'https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/' },
  { name: 'GPM IMERG', what: 'rain measured from orbit: a second record beside the model’s', url: 'https://gpm.nasa.gov/data/imerg' },
  { name: 'GRACE-FO', what: 'the region’s water, weighed from orbit since 2002', url: 'https://grace.jpl.nasa.gov/' },
  { name: 'SMAP', what: 'root-zone soil moisture on the globe', url: 'https://smap.jpl.nasa.gov/' },
  { name: 'MODIS', what: 'vegetation and surface heat - the seasons seen from space', url: 'https://modis.gsfc.nasa.gov/' },
  { name: 'VIIRS', what: 'yesterday’s true-colour picture, through NASA GIBS', url: 'https://worldview.earthdata.nasa.gov/' },
  { name: 'SRTM', what: 'the elevation and slope under the field', url: 'https://www.earthdata.nasa.gov/data/instruments/srtm' },
]

const OPEN: { name: string; url: string }[] = [
  { name: 'SoilGrids 2.0 (ISRIC)', url: 'https://soilgrids.org/' },
  { name: 'Open-Meteo', url: 'https://open-meteo.com/' },
  { name: 'FAOSTAT', url: 'https://www.fao.org/faostat/' },
  { name: 'CROPGRIDS', url: 'https://doi.org/10.6084/m9.figshare.29532806' },
  { name: 'FAO/IIASA GAEZ v4', url: 'https://gaez.fao.org/' },
]

const READ: { tab: MethodTab; label: string }[] = [
  { tab: 'how', label: 'How Zixtaro works' },
  { tab: 'validation', label: 'Is it right? Validation' },
  { tab: 'limits', label: 'What it cannot do' },
  { tab: 'data', label: 'Data and sources' },
  { tab: 'registry', label: 'Every number’s evidence' },
  { tab: 'farmers', label: 'For farmers' },
  { tab: 'words', label: 'The words, explained' },
]

const LEGAL: { tab: LegalTab; label: string }[] = [
  { tab: 'notice', label: 'What it is not' },
  { tab: 'privacy', label: 'Privacy' },
  { tab: 'terms', label: 'Terms' },
  { tab: 'sources', label: 'Sources' },
  { tab: 'licence', label: 'Licence' },
]

export function SiteFooter() {
  // the closing film runs behind the page's last stretch: the footer stands on it, under a veil of its own
  const ascent = useAscent()
  return (
    <footer className={`screen-only relative overflow-hidden border-t border-white/10 px-5 pt-20 pb-28 sm:px-8 sm:pt-24 lg:pl-28 xl:pl-36 ${ascent ? 'min-h-[100svh] bg-[linear-gradient(180deg,rgb(10_11_14/0.3)_0%,rgb(10_11_14/0.78)_55%,rgb(10_11_14/0.9)_100%)]' : 'bg-void'}`}>
      {/* the horizon the page climbs back to */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_50%_at_50%_100%,rgb(159_178_138_/_0.10),transparent_70%)]" />
      <div className="relative mx-auto max-w-[1240px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="kicker">▲ Resurface</div>
            <h2 className="mt-3 font-display-soft text-4xl leading-[1.05] text-ink sm:text-5xl">
              Seen from orbit. <em className="text-leaf">Checked on the ground.</em>
            </h2>
          </div>
          <a href="#orbit" className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-ink-2 transition hover:border-leaf/50 hover:text-ink">
            <ArrowUp className="h-4 w-4" aria-hidden /> Back to orbit
          </a>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.55fr_1fr]">
          <div>
            <div className="kicker !text-orbit">NASA data on this page</div>
            <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {NASA.map((m) => (
                <li key={m.name}>
                  <a href={m.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3">
                    <span translate="no" className="notranslate mt-0.5 shrink-0 rounded-md border border-orbit/30 bg-orbit/[0.07] px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-orbit transition group-hover:border-orbit/60">
                      {m.name}
                    </span>
                    <span className="text-[14px] leading-snug text-ink-2 transition group-hover:text-ink">{m.what}</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-8 kicker">Open data beside it</div>
            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] leading-relaxed text-ink-3">
              {OPEN.map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noreferrer" translate="no" className="notranslate whitespace-nowrap underline decoration-white/15 underline-offset-4 transition hover:text-ink hover:decoration-white/50">
                    {s.name}
                  </a>
                </li>
              ))}
              <li>imagery: Sentinel-2 cloudless by EOX (Copernicus Sentinel data 2016); Lithuania: orthophoto © Nacionalinė žemės tarnyba</li>
            </ul>
          </div>

          <div>
            <div className="kicker">Read how it works</div>
            <ul className="mt-5 space-y-1">
              {READ.map((r) => (
                <li key={r.tab}>
                  <button onClick={() => openMethod(r.tab)} className="group flex w-full items-center justify-between gap-3 border-b border-white/[0.07] py-2.5 text-left text-[15px] text-ink-2 transition hover:text-ink">
                    {r.label}
                    <ArrowUpRight className="h-4 w-4 text-ink-4 transition group-hover:text-leaf" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* the small print, as easy to find as how it works: what the tool is not, privacy, terms, whose work it
            stands on, its licence (a line of 11 px links under the model's version was read by nobody) */}
        <div className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="kicker">The small print</div>
            <span className="font-mono text-[11px] tracking-[0.06em] text-ink-4 uppercase">Decision support, not advice</span>
          </div>
          <nav aria-label="Legal" className="mt-4 grid border-t border-white/10 sm:grid-cols-2 lg:grid-cols-5">
            {LEGAL.map((l, i) => (
              <button
                key={l.tab}
                onClick={() => openLegal(l.tab)}
                className="group flex items-center justify-between gap-3 border-b border-white/[0.07] py-3.5 text-left text-[15px] text-ink-2 transition hover:text-ink sm:pr-5 lg:border-b-0 lg:border-l lg:border-white/[0.07] lg:pl-5 lg:first:border-l-0 lg:first:pl-0"
              >
                <span className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[10px] text-ink-4">0{i + 1}</span>
                  {l.label}
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-4 transition group-hover:text-leaf" aria-hidden />
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-white/10 pt-6 text-[12.5px] text-ink-4">
          <div className="flex items-center gap-2.5">
            <Logo className="h-5 w-5" />
            <span translate="no" className="notranslate font-display-soft text-base text-ink-2">Zixtaro</span>
            <span>· built for the NASA Space Apps Challenge 2026 · Field Shift</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              model <span translate="no" title={MODEL_VERSION} className="notranslate num text-ink-3">{MODEL_VERSION.split('-')[0]}</span>
            </span>
            <span>an independent project, not affiliated with or endorsed by NASA</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
