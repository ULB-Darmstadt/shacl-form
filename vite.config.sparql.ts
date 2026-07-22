import { defineConfig } from 'vite'

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
  }
})
