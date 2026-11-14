import { ChevronRight, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NARRATED, useLang } from '../lib/i18n'
import { pageTranslator } from '../lib/pageTranslate'
import script from '../lib/tourScript.json'
import manifest from '../lib/tourClips.json'
import { readKey } from '../lib/storage'
import { announce, whenVisible } from '../lib/reveal'

// A guided three minutes through the story - for a live demo that can't go wrong and for recording the video.
// Each step scrolls to a part of the page, may do something there (sweep the years, switch on a what-if,
// open the greenhouse), shows a caption and speaks it: recorded neural narration in English, Russian and
// Ukrainian (Piper TTS, scripts/voice.py), the browser's own voice for other languages. A step lasts until
// its narration has finished. Pause, skip, mute or leave (Esc) at any time.
//
// Clean starts and ends: every clip plays through one audio element that lives as long as the tour, and a
// silent Web Audio stream keeps the sound device awake between clips (Bluetooth and some laptop outputs
// sleep after a second of silence and swallow the first syllable when they wake up). The clips themselves
// carry a short silence at both ends. A step is spoken once, even when React runs its effect twice.

export type VoiceId = keyof typeof script.en

export type TourStep = {
  voice: VoiceId
  target: string // CSS selector to bring into view
  ms?: number // minimum time on screen, default 6 s
  enter?: () => void
  block?: ScrollLogicalPosition
  delay?: number // ms to wait after `enter` before scrolling (e.g. while a section swaps in)
  vars?: Record<string, string> // {place}, {crop} in captions
}

type Script = Record<string, Record<string, { title: string; caption: string; voice: string }>>

/** Chrome fills its voice list a moment after the page loads. */
function voicesFor(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(synth.getVoices()), 1200)
    synth.addEventListener('voiceschanged', () => {
      clearTimeout(t)
      resolve(synth.getVoices())
    }, { once: true })
  })
}
const SCRIPT = script as Script
const fill = (s: string, vars: Record<string, string> = {}) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
const MUTE_KEY = 'zixtaro:tour-muted'
/** Seconds per recorded clip (scripts/voice.py): a step without a clip in the reader's language falls back. */
const CLIPS = manifest as Record<string, Record<string, number>>
const hasClip = (lang: string, id: string) => !!CLIPS[lang]?.[id]

/** The browser's voice reads long text badly (Chrome stops after ~15 s): one sentence per utterance. */
function sentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+[\s"”»)]*|[^.!?…]+$/g) ?? [text]).map((x) => x.trim()).filter(Boolean)
}

/** A silent stream that keeps the sound device awake while the tour runs; needs the click that started it. */
function keepAwake(): () => void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return () => undefined
    const ctx = new Ctx()
    const gain = ctx.createGain()
    gain.gain.value = 0
    const osc = ctx.createOscillator()
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    void ctx.resume().catch(() => undefined)
    return () => {
      osc.stop()
      void ctx.close().catch(() => undefined)
    }
  } catch {
    return () => undefined
  }
}

export function Tour({ steps, onExit }: { steps: TourStep[]; onExit: () => void }) {
  const lang = useLang()
  const narrated = (NARRATED as readonly string[]).includes(lang)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(() => {
    try {
      return readKey(MUTE_KEY) === '1'
    } catch {
      return false
    }
  })
  // the step's progress bar is drawn straight onto the element: a state update every frame would keep interrupting
  // React's background render of whatever the step just opened (the greenhouse took 8-9 s to appear)
  const bar = useRef<HTMLDivElement>(null)
  const drawBar = (f: number) => {
    if (bar.current) bar.current.style.transform = `scaleX(${f})`
  }
  const [voiceMs, setVoiceMs] = useState(0)
  const [cap, setCap] = useState<{ title: string; caption: string }>({ title: '', caption: '' })
  const step = steps[i]
  const ms = Math.max(step?.ms ?? 6000, voiceMs)
  const started = useRef(0)
  const elapsed = useRef(0)
  const voiceDone = useRef(true)
  // one element for every clip of the tour, created with it (inside the click that started the tour)
  const audio = useRef<HTMLAudioElement | null>(null)
  if (!audio.current && typeof Audio !== 'undefined') {
    audio.current = new Audio()
    audio.current.preload = 'auto'
  }
  /** the step whose narration is playing or queued: React may run the step's effect twice (StrictMode) */
  const speaking = useRef<number | null>(null)
  /** bumps with every new narration: callbacks of an interrupted one (a skip, React's double run) are ignored */
  const utter = useRef(0)
  useEffect(() => keepAwake(), [])

  const go = useCallback((k: number) => {
    if (k >= steps.length) return onExit()
    setI(k)
  }, [steps.length, onExit])

  const stopVoice = () => {
    speaking.current = null
    utter.current++
    const a = audio.current
    if (a) {
      a.onended = a.onerror = a.onloadedmetadata = null
      a.pause()
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  // captions in the reader's language: hand-written for narrated languages, machine-translated otherwise
  useEffect(() => {
    if (!step) return
    const src = SCRIPT[narrated ? lang : 'en'][step.voice]
    setCap({ title: fill(src.title, step.vars), caption: fill(src.caption, step.vars) })
    if (lang === 'en') return
    let live = true
    ;(async () => {
      const vars = Object.fromEntries(await Promise.all(Object.entries(step.vars ?? {}).map(async ([k, v]) => [k, await pageTranslator.text(v)] as const)))
      const title = fill(src.title, vars)
      const caption = fill(src.caption, vars)
      const [t, c] = narrated ? [title, caption] : await Promise.all([pageTranslator.text(title), pageTranslator.text(caption)])
      if (live) setCap({ title: t, caption: c })
    })()
    return () => {
      live = false
    }
  }, [i, lang, narrated, step])

  const speak = useCallback(async (s: TourStep, idx: number) => {
    if (speaking.current === idx) return // already speaking this step
    stopVoice()
    speaking.current = idx
    const run = utter.current
    setVoiceMs(0)
    voiceDone.current = muted
    if (muted) return
    // only this narration may say it has finished (an aborted play() of an earlier one rejects later)
    const done = () => {
      if (utter.current === run) voiceDone.current = true
    }
    const playFile = (code: string) => {
      const a = audio.current
      if (!a) return done()
      a.onloadedmetadata = () => utter.current === run && setVoiceMs(a.duration * 1000 + 500)
      a.onended = done
      a.onerror = done
      a.src = `${import.meta.env.BASE_URL}audio/tour/${code}/${s.voice}.mp3`
      a.currentTime = 0
      a.play().catch((e: unknown) => {
        // AbortError: a newer narration took over - not this one's end
        if ((e as { name?: string })?.name !== 'AbortError') done()
      })
    }
    if (narrated && hasClip(lang, s.voice)) return playFile(lang)
    // other languages: the browser's voice reads the narration, if it has one for this language
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null
    const voices = synth ? await voicesFor(synth) : []
    if (utter.current !== run) return
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()))
    if (synth && voice) {
      const own = (SCRIPT as Record<string, Record<string, { voice: string }>>)[lang]?.[s.voice]?.voice
      const text = narrated && own ? own : await pageTranslator.text(SCRIPT.en[s.voice].voice)
      if (utter.current !== run) return
      const parts = sentences(text)
      // Chrome drops an utterance queued right after cancel(): give it a moment
      await new Promise((r) => setTimeout(r, 120))
      if (utter.current !== run) return
      parts.forEach((part, k) => {
        const u = new SpeechSynthesisUtterance(part)
        u.voice = voice
        u.lang = voice.lang
        if (k === parts.length - 1) {
          u.onend = done
          u.onerror = done
        }
        synth.speak(u)
      })
      return
    }
    if (hasClip('en', s.voice)) return playFile('en')
    done() // no voice at all: the caption carries the step
  }, [lang, muted, narrated]) // eslint-disable-line react-hooks/exhaustive-deps

  // enter the step: act, open the tab that holds its target, scroll, speak; its clock starts from zero
  useEffect(() => {
    if (!step) return
    elapsed.current = 0 // runs after the previous clock's cleanup banked its time
    drawBar(0)
    step.enter?.()
    const part = step.target.match(/data-tour="([^"]+)"/)?.[1]
    if (part) announce(part)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let live = true
    const t = setTimeout(() => {
      // a step can open another part of the page first (the greenhouse renders for a second or two): wait for it
      void whenVisible(step.target, 6000).then((el) => live && el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: step.block ?? 'start' }))
    }, step.delay ?? 30)
    void speak(step, i)
    return () => {
      live = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  useEffect(() => () => stopVoice(), [])

  // run the clock (pausable); the step ends when its time is up and the narration has finished
  useEffect(() => {
    if (paused || !step) return
    started.current = performance.now()
    let raf = 0
    const tick = () => {
      const run = elapsed.current + performance.now() - started.current
      drawBar(Math.min(1, run / ms))
      if (run >= ms && voiceDone.current) {
        go(i + 1)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      elapsed.current += performance.now() - started.current
    }
  }, [paused, i, ms, go, step])

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p
      if (next) {
        audio.current?.pause()
        window.speechSynthesis?.pause()
      } else {
        const a = audio.current
        if (a && a.src && !a.ended && a.currentTime > 0) a.play().catch(() => undefined)
        window.speechSynthesis?.resume()
      }
      return next
    })
  }, [])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0')
    } catch {
      // a convenience only
    }
    if (next) {
      stopVoice()
      voiceDone.current = true
    }
  }
  // the narrator back on: this step starts again from its beginning
  const wasMuted = useRef(muted)
  useEffect(() => {
    if (wasMuted.current && !muted && step) {
      speaking.current = null
      void speak(step, i)
    }
    wasMuted.current = muted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
      if (e.key === 'ArrowRight') go(i + 1)
      if (e.key === ' ') {
        e.preventDefault()
        togglePause()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [i, go, onExit, togglePause])

  if (!step) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4 sm:bottom-8" translate="no">
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          role="dialog"
          aria-live="polite"
          aria-label={`Tour, step ${i + 1} of ${steps.length}`}
          initial={{ opacity: 0, y: 24, scale: 0.97, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="surface pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl"
        >
          <div className="h-0.5 bg-white/10">
            <div ref={bar} className="h-full origin-left bg-gradient-to-r from-orbit via-leaf to-wheat" style={{ transform: 'scaleX(0)' }} />
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="kicker flex items-center gap-2 !text-leaf">
                {!muted && !paused && (
                  <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                    {[0, 1, 2, 3].map((b) => <i key={b} className="tour-eq w-[2px] rounded-full bg-leaf" style={{ animationDelay: `${b * 0.13}s` }} />)}
                  </span>
                )}
                Tour · {i + 1} / {steps.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={toggleMute} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-ink" aria-label={muted ? 'Turn the narrator on' : 'Mute the narrator'}>
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button onClick={togglePause} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-ink" aria-label={paused ? 'Resume the tour' : 'Pause the tour'}>
                  {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
                <button onClick={() => go(i + 1)} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-ink" aria-label="Next step">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={onExit} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-ink" aria-label="Leave the tour">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="font-display-soft mt-2 text-2xl leading-tight text-ink sm:text-[1.7rem]">{cap.title}</div>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{cap.caption}</p>
            <div className="mt-3 hidden font-mono text-[11px] text-ink-4 sm:block">space = pause · → = next · esc = leave</div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
