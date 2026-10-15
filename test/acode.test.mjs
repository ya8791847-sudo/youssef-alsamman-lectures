/**
 * Acode / Android-WebView simulation test.
 * ---------------------------------------------------------------------------
 * Loads the real single-file build (`acode/index.html`) inside jsdom from a
 * file:// URL with NO canvas 2D, NO Web Audio, NO IndexedDB, NO ResizeObserver
 * and NO getUserMedia — i.e. a bare Android WebView like Acode's preview.
 * The studio must still boot, render and react to touch input.
 *
 *   node scripts/build-acode.mjs && node test/acode.test.mjs
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const html = await readFile(new URL('../acode/index.html', import.meta.url), 'utf8')

const errors = [] // uncaught exceptions — must stay empty
const logged = [] // console.error — the app may report handled failures
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => {
  const msg = String(e.message || e)
  if (/Not implemented/i.test(msg)) return // expected: jsdom has no canvas/audio
  if (/canvas-unavailable|audio-unavailable|recorder-unavailable/.test(msg)) return // handled gracefully
  errors.push(msg)
})
vc.on('error', (m) => logged.push(String(m)))

const dom = new JSDOM(html, {
  url: 'file:///storage/emulated/0/Acode/laqta/acode/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc, // no `resources` → offline, exactly like a local file
})

const { window } = dom
const doc = window.document
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const q = (s) => doc.querySelectorAll(s)
const btn = (re) => [...q('button')].find((b) => re.test(b.textContent))
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }))
const pointer = (el, type, x = 60, y = 40) =>
  el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }))

let pass = 0
let fail = 0
const lines = []
async function test(name, fn) {
  try {
    await fn()
    pass++
    lines.push(`  ✓ ${name}`)
  } catch (e) {
    fail++
    lines.push(`  ✗ ${name}\n      ${String(e.message).split('\n')[0]}`)
  }
}

await wait(700) // let React mount

await test('the single HTML file is fully self-contained (offline)', () => {
  const externals = [...html.matchAll(/<(script|link)[^>]*?(src|href)="([^"]+)"/g)]
    .map((m) => m[3])
    .filter((u) => !u.startsWith('data:'))
  const blocking = externals.filter((u) => !/fonts\.googleapis|fonts\.gstatic/.test(u))
  assert.deepEqual(blocking, [])
  assert.ok(html.length > 200_000, 'bundle inlined')
})

await test('boots inside a file:// WebView with no Web Audio / canvas 2D', () => {
  const root = doc.getElementById('root')
  assert.ok(root, '#root exists')
  assert.ok(root.textContent.length > 50)
  assert.match(root.textContent, /لقطة|Laqta/)
})

await test('dashboard renders (hero, feature grid, topbar)', () => {
  const root = doc.getElementById('root')
  assert.ok(root.querySelector('.dash-hero'))
  assert.ok(root.querySelectorAll('.feature').length >= 10)
  assert.ok(root.querySelector('.topbar'))
})

await test('the boot splash is removed', () => {
  assert.equal(doc.getElementById('laqta-splash'), null)
})

await test('language toggle works offline', async () => {
  const b = btn(/English|العربية/)
  assert.ok(b, 'language button found')
  click(b)
  await wait(150)
  assert.match(doc.getElementById('root').textContent, /Pro montage|New project|Projects/)
})

await test('creating a project opens the timeline editor', async () => {
  const b = btn(/New project/i)
  assert.ok(b, 'new project button')
  click(b)
  await wait(200)
  assert.ok(doc.querySelector('.modal'), 'new-project dialog opened')
  const create = [...q('.modal button')].find((x) => /blank|فاضي|Create/i.test(x.textContent))
  assert.ok(create, 'create button')
  click(create)
  await wait(300)
  assert.ok(doc.querySelector('.editor'), 'editor layout')
  assert.ok(doc.querySelector('.timeline'), 'timeline')
  assert.ok(doc.querySelector('canvas'), 'preview canvas')
})

await test('four tracks and a full toolbar are rendered', () => {
  assert.equal(q('.track-row').length, 4)
  assert.ok(q('.tl-toolbar button').length >= 8)
})

await test('touch (pointer) scrubbing on the ruler does not throw', async () => {
  const ruler = doc.querySelector('.tl-ruler')
  assert.ok(ruler, 'ruler exists')
  pointer(ruler, 'pointerdown', 120, 10)
  pointer(ruler, 'pointermove', 190, 10)
  pointer(ruler, 'pointerup', 190, 10)
  await wait(60)
  assert.deepEqual(errors, [])
})

await test('the AI panel lists all 14 tools on the mobile layout', async () => {
  // mobile pane tabs: open the tools pane
  const tab = [...q('.tabs .tab')].find((b) => /AI tools|أدوات الذكاء/.test(b.textContent))
  assert.ok(tab, 'AI tab found')
  click(tab)
  await wait(250)
  assert.ok(q('.section').length >= 14, `expected >= 14 tool sections, got ${q('.section').length}`)
})

await test('the export panel exposes every output format', async () => {
  const tab = [...q('.tabs .tab')].find((b) => /Export|تصدير/i.test(`${b.title} ${b.textContent}`))
  assert.ok(tab, 'export tab')
  click(tab)
  await wait(250)
  const text = doc.querySelector('.pane-right')?.textContent || ''
  assert.match(text, /WebM/i, `pane text: ${text.slice(0, 120)}`)
  assert.match(text, /WAV/i)
  assert.match(text, /SRT/i)
})

await test('the demo project fails gracefully without a canvas backend', async () => {
  // back to the dashboard
  const home = btn(/Projects|المشاريع/)
  if (home) click(home)
  await wait(250)
  const demo = btn(/demo|تجريبي/i)
  assert.ok(demo, 'demo button')
  click(demo)
  await wait(600)
  // either the editor opened (real canvas) or a toast reported the failure — never a crash
  const root = doc.getElementById('root')
  assert.ok(doc.querySelector('.editor') || root.textContent.length > 0)
  // a canvas-less WebView must show a friendly error, never crash the app
  assert.deepEqual(errors, [])
  assert.ok(
    logged.some((m) => /canvas-unavailable/.test(m)) || doc.querySelector('.editor'),
    'graceful failure reported',
  )
})

await test('no uncaught exceptions were thrown', () => {
  assert.deepEqual(errors, [])
})

console.log(lines.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
dom.window.close()
process.exit(fail ? 1 : 0)
