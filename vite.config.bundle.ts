import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    // The bundle is loaded directly from a nested CDN path. Vite's module
    // preload helper resolves lazy chunk dependencies from the CDN root,
    // instead of relative to bundle.js.
    modulePreload: false,
    
    rollupOptions: {
      input: "src/bundle.ts",
      preserveEntrySignatures: "exports-only",
      output: {
        dir: "dist",
        entryFileNames: "bundle.js",
        format: "es",
      },
    }
  }
})
