import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: false,
    rollupOptions: {
      input: "src/form-default.ts",
      preserveEntrySignatures: "allow-extension",
      output: {
        dir: "dist",
        entryFileNames: "form-default.js",
        format: "es"
      },
    }
  },
  plugins: [
    dts({ insertTypesEntry: true }),
  ]
})
