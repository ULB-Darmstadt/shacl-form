import { defineConfig } from 'vite'
// @ts-ignore
import peerDepsExternal from 'rollup-plugin-peer-deps-external'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,

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
