/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Maps Platform key with the Maps JavaScript API enabled (for Street View). Optional. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
}

/** Set per build in vite.config.ts: names the offline cache of public/sw.js. */
declare const __BUILD_ID__: string
