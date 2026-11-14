import { readdirSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * A freshly started dev server transforms each module on its first request, and the app is ~250 of them: the first
 * page load used to sit blank for seconds. So the server warms the app up by itself - one module at a time, leaves
 * first, with a breath between them, so that a page opened meanwhile still gets its tiny boot script and the loader
 * film's worker (warmed at once, below) served between two modules rather than behind the whole queue.
 */
const warmApp = (): Plugin => ({
  name: 'zixtaro:warm-app',
  apply: 'serve',
  configureServer(server) {
    server.httpServer?.once('listening', () => {
      const list = (dir: string, ext: string) => readdirSync(`src/${dir}`).filter((f) => f.endsWith(ext) && !f.includes('.test.')).map((f) => `/src/${dir}/${f}`)
      // libraries before the components that import them, the app's root last: each step then has little left to pull in
      const urls = [...list('lib', '.ts'), ...list('lib/objects', '.ts'), ...list('components', '.tsx').filter((u) => !u.endsWith('/App.tsx')), ...list('components/objects', '.tsx'), '/src/index.css', '/src/App.tsx', '/src/main.tsx']
      void (async () => {
        for (const url of urls) {
          await server.warmupRequest(url)
          await new Promise((r) => setTimeout(r, 12))
        }
      })()
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), warmApp()],
  // names this build's offline cache (public/sw.js): a new build replaces the last one's
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  server: {
    watch: {
      // The watcher registers one OS watch per file, and the validation runs, data scripts and bundled data are
      // thousands of files the app never imports: watching them kept a freshly started server deaf for ~4 s.
      ignored: ['**/validation/**', '**/scripts/**', '**/docs/**', '**/.claude/**', '**/public/data/**', '**/public/audio/**'],
      // Inside WSL, files on /mnt/c emit no inotify events — poll so hot reload keeps working.
      ...(process.env.WSL_DISTRO_NAME ? { usePolling: true, interval: 300 } : {}),
    },
    warmup: { clientFiles: ['./src/main.tsx'] },
  },
  build: {
    chunkSizeWarningLimit: 1200, // MapLibre alone is ~800 kB; it is lazy-loaded
    rollupOptions: {
      output: {
        // libraries change rarely: separate chunks stay cached across releases
        manualChunks: { react: ['react', 'react-dom', 'react-dom/client'], motion: ['motion', 'motion/react'], icons: ['lucide-react'] },
      },
    },
  },
})
