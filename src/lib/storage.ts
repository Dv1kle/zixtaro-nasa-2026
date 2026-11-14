// Browser storage under the Zixtaro name. The app was called Rootline before; a saved farm, language or tour
// setting under the old name is moved over once, so nobody loses their fields to a rename.

const OLD_PREFIX = 'rootline:'
export const PREFIX = 'zixtaro:'

/** Read a key, adopting the value saved under the former name if there is none yet. */
export function readKey(key: string): string | null {
  try {
    const now = localStorage.getItem(key)
    if (now !== null || !key.startsWith(PREFIX)) return now
    const old = localStorage.getItem(OLD_PREFIX + key.slice(PREFIX.length))
    if (old !== null) {
      localStorage.setItem(key, old)
      localStorage.removeItem(OLD_PREFIX + key.slice(PREFIX.length))
    }
    return old
  } catch {
    return null // storage is a convenience (private windows, blocked site data)
  }
}
