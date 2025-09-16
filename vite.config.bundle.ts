import { globSync } from 'glob'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    
    rollupOptions: {
      input: "src/bundle.ts",
      preserveEntrySignatures: "exports-only",
      output: {
        dir: "dist",
        entryFileNames: "bundle.js",
        format: "es"
      },
    }
  }
})
