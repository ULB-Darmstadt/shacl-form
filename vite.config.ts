import { defineConfig } from 'vite'
// @ts-ignore
import peerDepsExternal from 'rollup-plugin-peer-deps-external'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    // This package is bundled again by consuming applications. Vite's module
    // preload dependency map contains the library build's hashed chunk names,
    // which cannot be rewritten reliably by the consumer's Vite build.
    modulePreload: false,

    rollupOptions: {
      input: "src/form.ts",
      preserveEntrySignatures: "exports-only",
      output: {
        dir: "dist",
        entryFileNames: "index.js",
        format: "es",
      },
    }
  },
  plugins: [
    // dts({ insertTypesEntry: true }),
    peerDepsExternal()
  ]
})
