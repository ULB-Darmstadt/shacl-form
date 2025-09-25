import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: "src/form-material.ts",
      preserveEntrySignatures: "allow-extension",
      output: {
        dir: "dist",
        entryFileNames: "form-material.js",
        format: "es"
      },
    }
  },
})
