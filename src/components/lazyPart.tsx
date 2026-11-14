import { lazy, Suspense, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { Boundary } from './ui'

/**
 * A named export loaded on first render (its own chunk), already wrapped in Suspense - and in a Boundary, so a
 * chunk that fails to load (offline, a stale deploy) leaves its part out instead of the whole page.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPart<T extends ComponentType<any>>(load: () => Promise<T>, fallback: ReactNode = null) {
  const L = lazy(async () => ({ default: await load() }))
  return function LazyPart(props: ComponentProps<T>) {
    return (
      <Boundary>
        <Suspense fallback={fallback}>
          <L {...props} />
        </Suspense>
      </Boundary>
    )
  }
}
