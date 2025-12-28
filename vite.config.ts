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
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'tanstack-vendor': [
            '@tanstack/react-table',
            '@tanstack/react-virtual',
          ],
          'radix-vendor': [
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-scroll-area',
          ],
          'utils-vendor': [
            'zustand',
            'zod',
            'jose',
            'clsx',
            'class-variance-authority',
            'tailwind-merge',
          ],
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
