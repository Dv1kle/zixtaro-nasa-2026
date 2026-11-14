import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/standard.css'
import '@fontsource-variable/archivo/standard-italic.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App'
import { governAnimations } from './lib/animationGovernor'
import { startSmoothScroll } from './lib/scroll'

// wheels and trackpads on desktop get an inertial scroll (touch and reduced motion keep the native one)
startSmoothScroll()
// endless CSS animations rest while their element is off screen
governAnimations()

// scripts/i18n collects every sentence on the page through this (development builds only)
if (import.meta.env.DEV) void import('./lib/pageTranslate').then((m) => Object.assign(window, { __zixtaroHarvest: m.harvestPage }))

// offline: a field opened once opens again without a network (public/sw.js); production builds only
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${__BUILD_ID__}`).catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* people who asked their system for less motion get fades instead of flights */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
