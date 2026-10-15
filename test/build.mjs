// Bundles the test entry (JSX aware) so plain Node can run it.
import { build } from 'esbuild'
await build({
  entryPoints: ['test/run.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'test/.bundle.mjs',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  external: ['jsdom', 'react', 'react-dom', 'react-dom/server'],
  logLevel: 'warning',
  jsx: 'automatic',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
})
console.log('bundled')
