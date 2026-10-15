import { build } from 'esbuild'
await build({
  entryPoints: ['test/dom.test.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'test/.dom-bundle.mjs',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  external: ['jsdom', 'react', 'react-dom', 'react-dom/client', 'react-dom/server'],
  jsx: 'automatic',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"development"' },
})
console.log('bundled (dom)')
