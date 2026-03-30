import { defineConfig } from 'vite'
import { config } from 'dotenv'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

config()

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          define: {
            'process.env.EVE_CLIENT_ID': JSON.stringify(
              process.env.EVE_CLIENT_ID || ''
            ),
            'process.env.REF_API_KEY': JSON.stringify(
              process.env.REF_API_KEY || ''
            ),
            'process.env.DISCORD_BUG_WEBHOOK': JSON.stringify(
              process.env.DISCORD_BUG_WEBHOOK || ''
            ),
          },
          build: {
            outDir: 'dist-electron',
            rolldownOptions: {
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
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react/')
          ) {
            return 'react-vendor'
          }
          if (
            id.includes('@tanstack/react-table') ||
            id.includes('@tanstack/react-virtual')
          ) {
            return 'tanstack-vendor'
          }
          if (id.includes('@radix-ui/')) {
            return 'radix-vendor'
          }
          if (
            id.includes('node_modules/zustand/') ||
            id.includes('node_modules/zod/') ||
            id.includes('node_modules/jose/') ||
            id.includes('node_modules/clsx/') ||
            id.includes('node_modules/class-variance-authority/') ||
            id.includes('node_modules/tailwind-merge/')
          ) {
            return 'utils-vendor'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ref-api': {
        target: 'https://edencom.net',
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
