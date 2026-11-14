// The market context for the page: which country the field is in, the lazy route and shape files, and the quotes.
import { useEffect, useMemo, useState } from 'react'
import { CROPS } from './crops'
import { GH_CROPS, type Prices } from './greenhouse'
import type { Rates, SeaMatrix } from './logistics'
import { countryAt, loadMarketRecords, marketRecordsLoaded, nearestCountry, type CropKey, type Shape } from './markets'
import { buildMarket, ghMarketPrices, type MarketContext, type MarketMode } from './marketProfit'

const ALL: CropKey[] = [...CROPS.map((c) => c.id), ...GH_CROPS.map((c) => c.id)]
let shapesP: Promise<Shape[]> | null = null
let seaP: Promise<SeaMatrix> | null = null
const load = <T,>(url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))

export type MarketState = {
  /** null until the price records are in: nothing is priced on estimates meanwhile */
  ctx: MarketContext | null
  /** the field's country (iso3) */
  home: string
  /** no country polygon under the field (coast, sea): the nearest capital's country was taken */
  guessed: boolean
  sea: SeaMatrix | null
  ghMarket: NonNullable<Prices['market']> | null
}

export function useMarket(o: { lat: number; lon: number; mode: MarketMode; own?: Partial<Record<CropKey, number>>; rates?: Rates }): MarketState {
  const [shapes, setShapes] = useState<Shape[] | null>(null)
  const [sea, setSea] = useState<SeaMatrix | null>(null)
  const [routes, setRoutes] = useState<MarketContext['routes']>('loading')
  const [records, setRecords] = useState(marketRecordsLoaded)
  useEffect(() => {
    let live = true
    let timer = 0
    const get = () => loadMarketRecords().then(() => live && setRecords(true), () => void (timer = window.setTimeout(get, 3000)))
    if (!records) get()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [records])
  useEffect(() => {
    const base = import.meta.env.BASE_URL
    shapesP ??= load<Shape[]>(`${base}data/markets/shapes.json`)
    seaP ??= load<SeaMatrix>(`${base}data/markets/sea.json`)
    let live = true
    shapesP.then((s) => live && setShapes(s), () => live && setShapes([]))
    seaP.then(
      (s) => {
        if (!live) return
        setSea(s)
        setRoutes('ready')
      },
      () => live && setRoutes('unavailable'),
    )
    return () => {
      live = false
    }
  }, [])
  const found = useMemo(() => (shapes ? countryAt(o.lon, o.lat, shapes) : null), [shapes, o.lat, o.lon])
  const home = found ?? nearestCountry(o.lon, o.lat)
  const ctx = useMemo(
    () => (records ? buildMarket({ origin: [o.lon, o.lat], home, mode: o.mode, crops: ALL, sea, own: o.own, rates: o.rates, routes }) : null),
    [records, o.lon, o.lat, home, o.mode, sea, o.own, o.rates, routes],
  )
  const ghMarket = useMemo(() => (ctx ? ghMarketPrices(ctx, o.lat) : null), [ctx, o.lat])
  return { ctx, home, guessed: !!shapes && shapes.length > 0 && !found, sea, ghMarket }
}
