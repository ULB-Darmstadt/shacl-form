import { defineConfig } from 'vite'
// @ts-ignore
import peerDepsExternal from 'rollup-plugin-peer-deps-external'

export default defineConfig({
  build: {
    emptyOutDir: false,

    rollupOptions: {
      input: "src/query/sparql.ts",
      preserveEntrySignatures: "exports-only",
      output: {
        dir: "dist",
        entryFileNames: "sparql.js",
        format: "es",
      },
    }
  },
  plugins: [
    peerDepsExternal()
  ]
})
