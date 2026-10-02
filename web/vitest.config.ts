import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Unit tests for the web dashboard live in the repo-level test/web folder (see test/README.md).
export default defineConfig({
  define: {
    // Mirrors vite.config.ts; tests never call a real API
    __BASE_URL__: JSON.stringify('http://api.test'),
  },
  resolve: {
    alias: {
      dompurify: path.resolve(__dirname, 'src/shims/dompurify.ts'),
      canvg: path.resolve(__dirname, 'src/shims/dummy.ts'),
      html2canvas: path.resolve(__dirname, 'src/shims/dummy.ts'),
    },
  },
  test: {
    dir: path.resolve(__dirname, '../test/web'),
    environment: 'node',
    // Test files sit outside web/, so they use the globals instead of importing 'vitest'
    globals: true,
  },
})
