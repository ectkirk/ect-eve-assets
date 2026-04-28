import { defineConfig } from 'vite'
import { config } from 'dotenv'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import path from 'node:path'

config()

const RADIX_VENDOR_PACKAGES = [
  '@radix-ui/react-context-menu',
  '@radix-ui/react-dialog',
  '@radix-ui/react-hover-card',
  '@radix-ui/react-scroll-area',
]

const UTILS_VENDOR_PACKAGES = [
  'zustand',
  'zod',
  'jose',
  'clsx',
  'tailwind-merge',
]

function chunkForPackage(id: string, packages: readonly string[]): boolean {
  return packages.some((pkg) => id.includes(`/node_modules/${pkg}/`))
}

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
              process.env['EVE_CLIENT_ID'] || ''
            ),
            'process.env.REF_API_KEY': JSON.stringify(
              process.env['REF_API_KEY'] || ''
            ),
            'process.env.DISCORD_BUG_WEBHOOK': JSON.stringify(
              process.env['DISCORD_BUG_WEBHOOK'] || ''
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
        manualChunks(id) {
          if (chunkForPackage(id, RADIX_VENDOR_PACKAGES)) {
            return 'radix-vendor'
          }
          if (chunkForPackage(id, UTILS_VENDOR_PACKAGES)) {
            return 'utils-vendor'
          }
          return undefined
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
