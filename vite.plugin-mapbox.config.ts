import { defineConfig } from 'vite'
import peerDepsExternal from "rollup-plugin-peer-deps-external";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: "src/plugins/mapbox.ts",
      preserveEntrySignatures: "allow-extension",
      output: {
        dir: "dist/plugins",
        entryFileNames: "mapbox.js",
        format: "es"
      },
    }
  },
    plugins: [
      peerDepsExternal()
    ]
})
