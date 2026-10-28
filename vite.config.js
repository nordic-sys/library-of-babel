import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The About page lives at /about. A static host (GitHub Pages) needs a file there, so the built
// index.html is copied to about/index.html; the app picks the view from the path.
const aboutPage = {
  name: 'about-page',
  apply: 'build',
  writeBundle({ dir }) {
    mkdirSync(resolve(dir, 'about'), { recursive: true })
    copyFileSync(resolve(dir, 'index.html'), resolve(dir, 'about/index.html'))
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), aboutPage],
})
