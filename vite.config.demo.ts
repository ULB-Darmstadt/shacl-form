import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  // Relative URLs work both at the GitHub Pages project path and when the
  // generated site is opened from another base path.
  base: './',
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true
  }
})
