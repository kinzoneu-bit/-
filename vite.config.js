import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD_ID = Date.now().toString(36)

export default defineConfig({
  plugins: [react()],
  build: {
    minify: false, // 关闭压缩, 防止 esbuild tree-shake 误删 (KK 2026-08-10)
    rollupOptions: {
      treeshake: false, // 双保险
      output: {
        entryFileNames: `assets/index-${BUILD_ID}.js`,
        chunkFileNames: `assets/[name]-${BUILD_ID}.js`,
        assetFileNames: `assets/[name]-${BUILD_ID}[extname]`
      }
    }
  }
})