import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD_ID = Date.now().toString(36)

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/index-${BUILD_ID}.js`,
        chunkFileNames: `assets/[name]-${BUILD_ID}.js`,
        assetFileNames: `assets/[name]-${BUILD_ID}[extname]`
      }
    }
  }
})