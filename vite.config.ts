import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import path from 'node:path'

const RADIX_VENDOR_PACKAGES = [
  '@radix-ui/react-context-menu',
  '@radix-ui/react-dialog',
  '@radix-ui/react-hover-card',
  '@radix-ui/react-scroll-area',
]

const UTILS_VENDOR_PACKAGES = ['zustand', 'zod', 'jose', 'tailwind-merge']

function packagesTest(packages: readonly string[]): RegExp {
  const names = packages.map((pkg) => pkg.replace('/', '[\\\\/]')).join('|')
  return new RegExp(`[\\\\/]node_modules[\\\\/](?:${names})[\\\\/]`)
}

function electronEntry(entry: string, fileName: string) {
  return {
    entry,
    formats: ['cjs' as const],
    fileName: () => fileName,
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const buildEnv = Object.fromEntries(
    ['EVE_CLIENT_ID', 'REF_API_KEY', 'DISCORD_BUG_WEBHOOK'].map((name) => [
      `process.env.${name}`,
      JSON.stringify(env[name] ?? ''),
    ]),
  )

  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            define: buildEnv,
            build: {
              lib: electronEntry('electron/main.ts', 'main.cjs'),
            },
          },
        },
        {
          entry: 'electron/preload.ts',
          onstart({ reload }) {
            reload()
          },
          vite: {
            build: {
              lib: electronEntry('electron/preload.ts', 'preload.cjs'),
            },
          },
        },
      ]),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'radix-vendor',
                test: packagesTest(RADIX_VENDOR_PACKAGES),
              },
              {
                name: 'utils-vendor',
                test: packagesTest(UTILS_VENDOR_PACKAGES),
              },
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
  }
})
