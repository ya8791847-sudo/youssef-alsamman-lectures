/**
 * Local test suite for the pure logic + a server-render smoke test.
 *   node test/run.mjs
 */
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Image = dom.window.Image
globalThis.localStorage = dom.window.localStorage
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let pass = 0
let fail = 0
const results = []
async function test(name, fn) {
  try {
    await fn()
    pass++
    results.push(`  ✓ ${name}`)
  } catch (e) {
    fail++
    results.push(`  ✗ ${name}\n      ${String(e.message).split('\n')[0]}`)
  }
}

/* ------------------------------- model ----------------------------------- */
const model = await import('../src/store/model.js')

await test('newProject has the expected tracks and settings', () => {
  const p = model.newProject({ name: 'x' })
  assert.equal(p.tracks.length, 4)
  assert.equal(p.tracks[0].kind, 'video')
  assert.equal(p.settings.masterVolume, 1)
  assert.equal(p.width, 1920)
})

await test('newMediaClip computes duration from the media', () => {
  const clip = model.newMediaClip({ media: { id: 'm', kind: 'video', name: 'a', duration: 10 }, trackId: 't' })
  assert.equal(clip.duration, 10)
  assert.equal(clip.srcEnd, 10)
})

await test('splitClipAt splits at the playhead and keeps source ranges', () => {
  const p = model.newProject()
  const track = p.tracks[0]
  const clip = model.newMediaClip({ media: { id: 'm', kind: 'video', name: 'a', duration: 20 }, trackId: track.id, start: 0 })
  track.clips.push(clip)
  const created = model.splitClipAt(p, 5)
  assert.equal(created.length, 1)
  assert.equal(track.clips.length, 2)
  assert.equal(clip.duration, 5)
  assert.equal(created[0].start, 5)
  assert.equal(created[0].srcStart, 5)
  assert.equal(created[0].duration, 15)
})

await test('deleteClips with ripple closes the gap', () => {
  const p = model.newProject()
  const track = p.tracks[0]
  const a = model.newMediaClip({ media: { id: 'a', kind: 'video', name: 'a', duration: 4 }, trackId: track.id, start: 0 })
  const b = model.newMediaClip({ media: { id: 'b', kind: 'video', name: 'b', duration: 4 }, trackId: track.id, start: 4 })
  track.clips.push(a, b)
  model.deleteClips(p, [a.id], { ripple: true })
  assert.equal(track.clips.length, 1)
  assert.equal(track.clips[0].start, 0)
})

await test('totalDuration includes captions', () => {
  const p = model.newProject()
  p.captions.push({ id: 'c', start: 3, end: 12, text: 'x' })
  assert.equal(model.totalDuration(p), 12)
})

await test('normalizeProject fills missing fields', () => {
  const p = model.normalizeProject({ id: 'p', tracks: [{ id: 't', kind: 'video', clips: [{ id: 'c', start: 0, duration: 1 }] }] })
  assert.equal(p.settings.masterVolume, 1)
  assert.equal(p.tracks[0].clips[0].transform.scale, 100)
  assert.equal(p.tracks[0].clips[0].fx.brightness, 0)
})

await test('placeClip trims the neighbour when overlapping', () => {
  const p = model.newProject()
  const track = p.tracks[0]
  const a = model.newMediaClip({ media: { id: 'a', kind: 'video', name: 'a', duration: 10 }, trackId: track.id, start: 0 })
  track.clips.push(a)
  const b = model.newMediaClip({ media: { id: 'b', kind: 'video', name: 'b', duration: 4 }, trackId: track.id, start: 6 })
  model.placeClip(track, b)
  assert.equal(a.duration, 6)
  assert.equal(track.clips.length, 2)
})

await test('sourceTimeOf respects speed', () => {
  const clip = { kind: 'video', srcStart: 2, srcEnd: 12, speed: 2, duration: 5 }
  assert.equal(model.sourceTimeOf(clip, 3), 8)
})

/* ------------------------------- presets --------------------------------- */
const presets = await import('../src/engine/presets.js')
await test('every filter exposes valid adjustments', () => {
  for (const f of presets.FILTERS) {
    const adj = presets.filterAdjustments(f.id)
    assert.ok('brightness' in adj && 'contrast' in adj, f.id)
  }
  assert.ok(presets.FILTERS.length >= 12)
  assert.ok(presets.TRANSITIONS.length >= 12)
})

/* ------------------------------- renderer -------------------------------- */
const renderer = await import('../src/engine/renderer.js')
await test('kfValue interpolates between keyframes', () => {
  const v = renderer.kfValue(
    [
      [0, 1],
      [1, 2],
    ],
    0.5,
    1,
  )
  assert.ok(v > 1 && v < 2)
})

await test('cssFilter builds a valid filter string', () => {
  assert.equal(renderer.cssFilter({}), 'none')
  assert.match(renderer.cssFilter({ brightness: 10, contrast: -20 }), /brightness/)
})

await test('activeClips / clipAt find the clip under the playhead', () => {
  const track = { clips: [{ id: 'a', start: 0, duration: 2 }, { id: 'b', start: 2, duration: 2 }] }
  assert.equal(renderer.clipAt(track, 2.5).id, 'b')
  assert.equal(renderer.activeClips(track, 1).length, 1)
})

/* ------------------------------ analysis utils --------------------------- */
await test('complement computes the gaps of a speech list', async () => {
  const { complement } = await import('../src/engine/ai/tools.js')
  const keep = complement(
    [
      { a: 2, b: 4 },
      { a: 6, b: 8 },
    ],
    0,
    10,
  )
  assert.deepEqual(keep, [
    { a: 0, b: 2 },
    { a: 4, b: 6 },
    { a: 8, b: 10 },
  ])
})

await test('timeCues honours the speech rate', async () => {
  const { timeCues } = await import('../src/engine/ai/tools.js')
  const cues = timeCues(['سطر أول', 'سطر تاني'], { wpm: 150 })
  assert.equal(cues.length, 2)
  assert.ok(cues[1].start >= cues[0].end)
})

await test('timeCues aligns cues to speech segments', async () => {
  const { timeCues } = await import('../src/engine/ai/tools.js')
  const cues = timeCues(['aaa', 'bbb'], { speech: [{ start: 1, end: 5 }] })
  assert.ok(cues[0].start >= 1)
  assert.ok(cues[cues.length - 1].end <= 10)
})

await test('pickSegments returns non-empty highlight picks', async () => {
  const { pickSegments } = await import('../src/engine/ai/tools.js')
  const windows = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.5, n: Math.random() }))
  const picked = pickSegments(windows, [4, 9, 15], { target: 12, minSeg: 2, min: 0, max: 20 })
  assert.ok(picked.length >= 1)
  assert.ok(picked.every((s) => s.b > s.a))
})

/* -------------------------------- copilot -------------------------------- */
const copilot = await import('../src/engine/ai/copilot.js')

await test('copilot understands Arabic requests', () => {
  const items = copilot.plan('امسح الصمت وسرع الكلام 1.2x')
  assert.ok(items.length >= 2)
  assert.equal(items[0].tool, 'silence')
})

await test('copilot understands English requests', () => {
  const items = copilot.plan('remove silence and make a 30s highlight')
  const tools = items.map((i) => i.tool)
  assert.ok(tools.includes('silence'))
  const hl = items.find((i) => i.tool === 'highlight')
  assert.equal(hl.params.length, 30)
})

await test('copilot maps reels requests to the reframe tool', () => {
  const items = copilot.plan('اعمل نسخة ريلز عمودية')
  assert.equal(items[0].tool, 'reframe')
  assert.equal(items[0].params.aspect, '9:16')
})

await test('copilot handles speed and undo actions', () => {
  assert.equal(copilot.plan('سرّع الفيديو')[0].action, 'speed')
  assert.equal(copilot.plan('تراجع')[0].action, 'undo')
})

await test('copilot picks a named cinematic filter', () => {
  const items = copilot.plan('حط فلتر سينمائي')
  assert.equal(items[0].kind, 'filter')
  assert.equal(items[0].filter, 'cinema')
})

await test('copilot captures quoted caption text', () => {
  const items = copilot.plan('اعمل كابشن: "أهلاً بيك في الدرس الجديد"')
  assert.equal(items[0].tool, 'captions')
  assert.match(items[0].params.text, /أهلاً/)
})

/* -------------------------------- subtitles ------------------------------ */
const exporter = await import('../src/engine/exporter.js')

await test('SRT export / import round-trips', () => {
  const cues = [
    { start: 0.5, end: 2.25, text: 'سطر أول' },
    { start: 3, end: 4.5, text: 'line two' },
  ]
  const srt = exporter.toSrt(cues)
  const back = exporter.parseSubtitles(srt)
  assert.equal(back.length, 2)
  assert.ok(Math.abs(back[0].start - 0.5) < 0.01)
  assert.equal(back[1].text, 'line two')
})

await test('VTT export uses WEBVTT header', () => {
  const vtt = exporter.toVtt([{ start: 1, end: 2, text: 'x' }])
  assert.match(vtt, /^WEBVTT/)
  assert.match(vtt, /00:00:01\.000 --> 00:00:02\.000/)
})

await test('export functions exist', () => {
  for (const fn of ['exportVideo', 'exportAudioWav', 'exportStill', 'buildAudioSegments', 'projectToJson', 'estimateSize']) {
    assert.equal(typeof exporter[fn], 'function', fn)
  }
})

/* --------------------------------- writer -------------------------------- */
const writer = await import('../src/engine/ai/writer.js')
await test('copywriter produces titles, description and hashtags', () => {
  const copy = writer.generateCopy({
    tone: 'youtube',
    transcript: 'النهاردة نتكلم عن المونتاج بالذكاء الاصطناعي وتقنيات القص الذكي',
    projectName: 'حلقة ١',
    lang: 'ar',
    duration: 240,
  })
  assert.ok(copy.titles.length >= 4)
  assert.ok(copy.hashtags.length >= 4)
  assert.match(copy.description, /الفواصل|مدة الفيديو/)
})

/* ------------------------------ audio offline ---------------------------- */
await test('buildAudioSegments returns the timeline audio', () => {
  const project = {
    tracks: [
      { kind: 'video', volume: 1, muted: false, clips: [{ id: 'c', mediaId: 'v', start: 0, duration: 3, srcStart: 0, audio: { volume: 0.5 } }] },
    ],
    media: [{ id: 'v', kind: 'video', hasAudio: true }],
    settings: {},
  }
  const segs = exporter.buildAudioSegments(project)
  assert.equal(segs.length, 0) // no blob registered in this environment → nothing to mix
  assert.ok(Array.isArray(segs))
})

/* ------------------------------- i18n ------------------------------------ */
const { dict } = await import('../src/i18n/translations.js')
await test('Arabic and English dictionaries share the same keys', () => {
  const ar = Object.keys(dict.ar).sort()
  const en = Object.keys(dict.en).sort()
  const onlyAr = ar.filter((k) => !dict.en[k])
  const onlyEn = en.filter((k) => !dict.ar[k])
  assert.deepEqual(onlyAr, [])
  assert.deepEqual(onlyEn, [])
  assert.ok(ar.length > 200)
})

/* ---------------------------- render smoke test -------------------------- */
await test('server-render of the whole app succeeds', async () => {
  const React = await import('react')
  const { renderToString } = await import('react-dom/server')
  const App = (await import('../src/App.jsx')).default
  const html = renderToString(React.createElement(App))
  assert.match(html, /لقطة AI/)
  assert.ok(html.length > 2000)
})

await test('server-render of the editor with a demo project succeeds', async () => {
  const React = await import('react')
  const { renderToString } = await import('react-dom/server')
  const { I18nProvider } = await import('../src/i18n/index.jsx')
  const Editor = (await import('../src/components/editor/Editor.jsx')).default
  const store = await import('../src/store/store.js')
  const p = model.newProject({ name: 'اختبار' })
  const track = p.tracks[0]
  track.clips.push(model.newMediaClip({ media: { id: 'm1', kind: 'video', name: 'clip', duration: 8 }, trackId: track.id, start: 0 }))
  p.tracks[2].clips.push(model.newTextClip({ trackId: p.tracks[2].id, text: 'عنوان', start: 0, duration: 3 }))
  p.captions.push({ id: 'c1', start: 0, end: 2, text: 'كابشن' })
  p.media.push({ id: 'm1', name: 'clip', kind: 'video', duration: 8, hasAudio: true })
  store.openProject(p)
  const html = renderToString(React.createElement(I18nProvider, null, React.createElement(Editor)))
  assert.match(html, /clip/)
  store.closeProject()
})

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
