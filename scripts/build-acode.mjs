/**
 * Acode / offline single-file build.
 * ---------------------------------------------------------------------------
 * Produces `acode/index.html` (minified) and `acode/dev.html` (readable):
 * one self-contained HTML file with React, the whole studio and the CSS inlined,
 * so it can be opened directly inside Acode's preview (file:// WebView) on
 * Android without npm, a terminal or an internet connection.
 *
 *   node scripts/build-acode.mjs            # both files
 *   node scripts/build-acode.mjs --no-dev   # minified only
 */
import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(root, 'acode')

/** Let esbuild hand us the CSS as a JS string so it can be inlined. */
const cssAsText = {
  name: 'css-as-text',
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (args) => ({ path: resolve(args.resolveDir, args.path), namespace: 'css-text' }))
    b.onLoad({ filter: /.*/, namespace: 'css-text' }, async (args) => {
      const text = await readFile(args.path, 'utf8')
      return { contents: `export default ${JSON.stringify(text)}`, loader: 'js' }
    })
  },
}

async function bundle({ minify }) {
  const result = await build({
    entryPoints: [resolve(root, 'src/acode-entry.jsx')],
    bundle: true,
    write: false,
    format: 'iife',
    target: ['chrome90', 'safari15', 'firefox90', 'edge90'],
    platform: 'browser',
    minify,
    legalComments: 'none',
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [cssAsText],
    logLevel: 'warning',
  })
  const files = result.outputFiles || []
  const file = files.find((f) => f.path.endsWith('.js')) || files[0]
  if (!file) throw new Error('esbuild produced no output')
  return file.text
}

const htmlShell = ({ js, minify }) => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#070912" />
<meta name="mobile-web-app-capable" content="yes" />
<title>لقطة AI — استوديو المونتاج بالذكاء الاصطناعي</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230a0c14'/%3E%3Crect x='10' y='14' width='44' height='36' rx='8' fill='none' stroke='%236ee7ff' stroke-width='4'/%3E%3Ccircle cx='32' cy='32' r='7' fill='%23ff5fa2'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  html,body{margin:0;height:100%;background:#070912;color:#e9edf8;font-family:Cairo,'Segoe UI',Tahoma,system-ui,sans-serif}
  #laqta-splash{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#070912;z-index:9999;transition:opacity .3s}
  #laqta-splash .box{width:64px;height:64px;border-radius:18px;background:linear-gradient(120deg,#5ee7ff,#b06cff 55%,#ff5fa2);display:grid;place-items:center;font-weight:800;color:#080c18;font-size:26px}
  #laqta-splash p{margin:0;color:#8b93ab;font-size:13px}
</style>
</head>
<body>
<div id="root"></div>
<div id="laqta-splash"><div class="box">ل</div><p>${minify ? 'بيتم تحميل استوديو لقطة AI…' : 'نسخة المطوّر — Laqta AI Studio'}</p></div>
<noscript>لازم تشغيل JavaScript لعرض الاستوديو.</noscript>
<script>
/*! لقطة AI — Laqta AI Studio — standalone build (Acode / offline WebView) */
${js.split('</script').join('<\\/script')}
</script>
</body>
</html>
`

const args = process.argv.slice(2)
const makeMin = true
const makeDev = !args.includes('--no-dev')

await mkdir(outDir, { recursive: true })

if (makeMin) {
  const js = await bundle({ minify: true })
  const html = htmlShell({ js, minify: true })
  await writeFile(resolve(outDir, 'index.html'), html, 'utf8')
  console.log(`acode/index.html  → ${(html.length / 1024).toFixed(0)} KB`)
}

if (makeDev) {
  const js = await bundle({ minify: false })
  const html = htmlShell({ js, minify: false })
  await writeFile(resolve(outDir, 'dev.html'), html, 'utf8')
  console.log(`acode/dev.html    → ${(html.length / 1024).toFixed(0)} KB (قابل للقراءة والتعديل)`)
}
