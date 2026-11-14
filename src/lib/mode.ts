// How the page is laid out: as a story or as a workbench.
//  - story: every height of the descent is a plate - one sentence, a few numbers - over its scene, and everything a
//    farmer works with (charts, tables, inputs) is the height's instrument, one click deeper;
//  - work: the instruments lie open in the page, one after another - the tool as it always was.
// One world and one set of numbers either way; only how much of it is on the table at once.
//
// The page has one way through it: the story. A switch between the two, kept from visit to visit, was a second route
// to the same things, and with the tour, the farm and the greenhouse it made a first visit a maze. The workbench is
// still there for whoever maintains the instruments or films them: add ?view=workbench to the address.
import { useSyncExternalStore } from 'react'

export type Mode = 'story' | 'work'

const subs = new Set<() => void>()

function read(): Mode {
  try {
    return new URLSearchParams(window.location.search).get('view') === 'workbench' ? 'work' : 'story'
  } catch {
    return 'story'
  }
}
let mode: Mode = typeof window === 'undefined' ? 'story' : read()

export const getMode = (): Mode => mode

/** For this visit only (the tour, inside the workbench): nothing is kept, so nobody is left in a view with no way out. */
export function setMode(next: Mode) {
  if (next === mode) return
  mode = next
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

export function useMode(): Mode {
  return useSyncExternalStore(subscribe, getMode)
}
