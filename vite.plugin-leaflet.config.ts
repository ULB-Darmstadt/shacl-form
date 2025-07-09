import { defineConfig } from 'vite'
import peerDepsExternal from "rollup-plugin-peer-deps-external";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: "src/plugins/leaflet.ts",
      preserveEntrySignatures: "allow-extension",
      output: {
        dir: "dist/plugins",
        entryFileNames: "leaflet.js",
        format: "es"
      },
    }
  },
  plugins: [
    peerDepsExternal()
  ]
})
