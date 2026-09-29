import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // BASE_URL in .env / .env.production is the backend origin. Vite only exposes VITE_* vars and
  // reserves import.meta.env.BASE_URL for the site path, so it is passed in as __BASE_URL__ instead.
  const env = loadEnv(mode, __dirname, '')

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __BASE_URL__: JSON.stringify(env.BASE_URL ?? ''),
    },
    resolve: {
      alias: {
        dompurify: path.resolve(__dirname, 'src/shims/dompurify.ts'),
        canvg: path.resolve(__dirname, 'src/shims/dummy.ts'),
        html2canvas: path.resolve(__dirname, 'src/shims/dummy.ts'),
      },
    },
  }
})
