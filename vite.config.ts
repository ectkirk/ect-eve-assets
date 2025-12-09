import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/ref-api': {
        target: 'https://ref.edencom.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ref-api/, '/api'),
      },
      '/mutamarket-api': {
        target: 'https://mutamarket.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mutamarket-api/, '/api'),
      },
    },
  },
})
