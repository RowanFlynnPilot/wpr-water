import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const BASE = '/wpr-water/'

// In production, GitHub Pages serves web/dist at the site root with
// data/processed/ alongside it. This middleware mirrors that layout in dev
// so the app has exactly one fetch path.
function localData() {
  const dataDir = path.resolve(import.meta.dirname, '..', 'data', 'processed')
  return {
    name: 'serve-local-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url && req.url.match(/^\/wpr-water\/data\/processed\/([\w.-]+\.json)(\?.*)?$/)
        if (!m) return next()
        const file = path.join(dataDir, m[1])
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          return res.end('not found')
        }
        res.setHeader('Content-Type', 'application/json')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [react(), localData()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
  },
})
