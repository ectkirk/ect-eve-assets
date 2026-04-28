import { build } from 'esbuild'

const defineEnv = (name) => JSON.stringify(process.env[name] ?? '')

await build({
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  format: 'cjs',
  outfile: 'dist-electron/main.cjs',
  define: {
    'process.env.EVE_CLIENT_ID': defineEnv('EVE_CLIENT_ID'),
    'process.env.REF_API_KEY': defineEnv('REF_API_KEY'),
    'process.env.DISCORD_BUG_WEBHOOK': defineEnv('DISCORD_BUG_WEBHOOK'),
  },
})
