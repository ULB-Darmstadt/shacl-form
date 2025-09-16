import { defineConfig } from 'vite'
// @ts-ignore
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import { globSync } from 'glob'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    
    rollupOptions: {
      input: globSync("src/plugins/*.ts"),
      preserveEntrySignatures: "allow-extension",
      output: {
        dir: "dist/plugins",
        entryFileNames: "[name].js",
        format: "es"
      },
    }
  },
  plugins: [
    peerDepsExternal()
  ]
})
