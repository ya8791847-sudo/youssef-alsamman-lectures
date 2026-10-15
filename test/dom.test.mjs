/**
 * Browser-environment integration test (jsdom + stubs for canvas 2D / Web Audio).
 * Verifies that the app mounts, the editor renders a project, the playback
 * clock advances and the AI tools mutate the timeline.
 *   node test/build-dom.mjs && node test/.dom-bundle.mjs
 */
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true })
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true })
globalThis.HTMLElement = window.HTMLElement
globalThis.HTMLCanvasElement = window.HTMLCanvasElement
globalThis.Image = window.Image
globalThis.localStorage = window.localStorage
globalThis.Blob = window.Blob
globalThis.URL = window.URL
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* ---- canvas 2D stub ----------------------------------------------------- */
function makeCtx() {
  const noop = () => {}
  const ctx = {
    canvas: null,
    filter: 'none',
    direction: 'ltr',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    letterSpacing: '0px',
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arcTo: noop,
    arc: noop,
    rect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    strokeText: noop,
    drawImage: noop,
    measureText: (t) => ({ width: String(t).length * 8 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    putImageData: noop,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
  }
  return ctx
}
window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this.__ctx) {
    this.__ctx = makeCtx()
    this.__ctx.canvas = this
  }
  return this.__ctx
}
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA'
window.HTMLCanvasElement.prototype.toBlob = (cb) => cb(new window.Blob(['x'], { type: 'image/png' }))

/* ---- Web Audio stub ----------------------------------------------------- */
class FakeParam {
  constructor(v = 0) {
    this.value = v
  }
  setValueAtTime() {
    return this
  }
  linearRampToValueAtTime() {
    return this
  }
  exponentialRampToValueAtTime() {
    return this
  }
}
class FakeNode {
  constructor(ctx, type = 'gain') {
    this.context = ctx
    this.type = type
    this.gain = new FakeParam(1)
    this.frequency = new FakeParam(440)
    this.detune = new FakeParam(0)
    this.Q = new FakeParam(1)
    this.pan = new FakeParam(0)
    this.threshold = new FakeParam(-24)
    this.knee = new FakeParam(30)
    this.ratio = new FakeParam(12)
    this.attack = new FakeParam(0.003)
    this.release = new FakeParam(0.25)
    this.curve = null
    this.oversample = 'none'
    this.fftSize = 1024
    this.smoothingTimeConstant = 0.8
    this.frequencyBinCount = 512
    this.buffer = null
    this.playbackRate = new FakeParam(1)
  }
  connect(n) {
    this.__to = n
    return n
  }
  disconnect() {}
  start() {}
  stop() {}
  getByteFrequencyData(arr) {
    for (let i = 0; i < arr.length; i++) arr[i] = 40
  }
}
class FakeAudioContext {
  constructor() {
    this.state = 'running'
    this.sampleRate = 48000
    this.destination = new FakeNode(this)
    this.currentTime = 0
    this._t = setInterval(() => {
      this.currentTime += 0.05
    }, 10)
    if (this._t.unref) this._t.unref()
  }
  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
  createGain() {
    return new FakeNode(this, 'gain')
  }
  createAnalyser() {
    return new FakeNode(this, 'analyser')
  }
  createDynamicsCompressor() {
    return new FakeNode(this, 'comp')
  }
  createBiquadFilter() {
    return new FakeNode(this, 'biquad')
  }
  createWaveShaper() {
    return new FakeNode(this, 'shaper')
  }
  createStereoPanner() {
    return new FakeNode(this, 'panner')
  }
  createConvolver() {
    return new FakeNode(this, 'convolver')
  }
  createOscillator() {
    return new FakeNode(this, 'osc')
  }
  createBufferSource() {
    return new FakeNode(this, 'buffer')
  }
  createMediaElementSource() {
    return new FakeNode(this, 'media')
  }
  createMediaStreamDestination() {
    return { stream: { getAudioTracks: () => [{ kind: 'audio' }], getVideoTracks: () => [] } }
  }
  createBuffer(ch, len) {
    const data = []
    for (let i = 0; i < ch; i++) data.push(new Float32Array(len))
    return {
      numberOfChannels: ch,
      length: len,
      sampleRate: this.sampleRate,
      duration: len / this.sampleRate,
      getChannelData: (i) => data[i],
    }
  }
  decodeAudioData() {
    return Promise.reject(new Error('not-implemented'))
  }
}
class FakeOffline extends FakeAudioContext {
  startRendering() {
    return Promise.resolve(this.createBuffer(2, 1000))
  }
  decodeAudioData() {
    return Promise.reject(new Error('not-implemented'))
  }
}
window.AudioContext = FakeAudioContext
globalThis.OfflineAudioContext = FakeOffline
window.OfflineAudioContext = FakeOffline

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.indexedDB = undefined
globalThis.indexedDB = undefined
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
window.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.requestAnimationFrame = window.requestAnimationFrame
globalThis.cancelAnimationFrame = window.cancelAnimationFrame
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
Object.defineProperty(window.HTMLMediaElement.prototype, 'paused', { get: () => true, configurable: true })
Object.defineProperty(window.HTMLMediaElement.prototype, 'currentTime', {
  get() {
    return this.__t || 0
  },
  set(v) {
    this.__t = v
  },
  configurable: true,
})
window.HTMLMediaElement.prototype.play = function () {
  return Promise.resolve()
}
window.HTMLMediaElement.prototype.pause = function () {}
window.HTMLMediaElement.prototype.load = function () {}

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
    lines.push(`  ✗ ${name}\n      ${String(e.stack || e.message).split('\n').slice(0, 3).join('\n      ')}`)
  }
}

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const store = await import('../src/store/store.js')
const model = await import('../src/store/model.js')
const editorActions = await import('../src/store/editorActions.js')
const App = (await import('../src/App.jsx')).default

const container = document.getElementById('root')
const root = createRoot(container)

await test('the app mounts and the dashboard renders', async () => {
  await act(async () => {
    root.render(React.createElement(App))
  })
  assert.match(container.textContent, /لقطة AI|Laqta/)
  assert.ok(container.innerHTML.includes('dash-hero'))
})

await test('creating a project opens the editor UI', async () => {
  await act(async () => {
    store.createProject({ name: 'اختبار التكامل', width: 1280, height: 720, fps: 30 })
  })
  assert.equal(store.getState().view, 'editor')
  assert.ok(container.innerHTML.includes('editor'))
  assert.ok(container.innerHTML.includes('timeline'))
})

await test('the AI copilot supports opening the tool panel', async () => {
  const { plan } = await import('../src/engine/ai/copilot.js')
  const items = plan('حط كابشن: "مرحبا"')
  assert.equal(items[0].tool, 'captions')
})

await test('adding + trimming clips through editorActions works', async () => {
  const p = store.getState().project
  const media = {
    id: 'med_test',
    name: 'test clip',
    kind: 'video',
    duration: 10,
    hasAudio: true,
    url: 'blob:fake',
  }
  await act(async () => {
    editorActions.addMedia([media])
    editorActions.addMediaToTimeline('med_test', { duration: 6 })
  })
  const project = store.getState().project
  const track = project.tracks.find((t) => t.kind === 'video')
  assert.equal(track.clips.length, 1)
  const clip = track.clips[0]
  await act(async () => {
    editorActions.trimClip(clip.id, { duration: 3 })
    editorActions.updateClip(clip.id, (c) => ({ fx: { ...c.fx, brightness: 12 } }))
  })
  const after = store.getState().project.tracks.find((t) => t.kind === 'video').clips[0]
  assert.equal(after.duration, 3)
  assert.equal(after.fx.brightness, 12)
})

const stripTime = (p) => {
  const c = JSON.parse(JSON.stringify(p))
  delete c.updatedAt
  return JSON.stringify(c)
}

await test('undo restores the previous state', async () => {
  const before = stripTime(store.getState().project)
  await act(async () => {
    editorActions.addTextClip({ start: 0, duration: 2, text: 'عنوان تجريبي' })
  })
  const mid = stripTime(store.getState().project)
  assert.notEqual(before, mid)
  await act(async () => {
    store.undo()
  })
  const restored = stripTime(store.getState().project)
  if (restored !== before) {
    const a = JSON.parse(before)
    const b = JSON.parse(restored)
    const diffs = []
    const walk = (x, y, path) => {
      if (typeof x !== typeof y) {
        diffs.push(`${path}: type ${typeof x} vs ${typeof y}`)
        return
      }
      if (x && typeof x === 'object') {
        const keys = new Set([...Object.keys(x), ...Object.keys(y)])
        for (const k of keys) walk(x[k], y[k], `${path}.${k}`)
      } else if (x !== y) diffs.push(`${path}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`)
    }
    walk(a, b, '')
    console.log('DIFF:', diffs.slice(0, 10).join(' | '))
  }
  assert.equal(restored, before)
})

await test('the playback engine advances time and renders frames', async () => {
  const { engine } = await import('../src/engine/player.js')
  const project = store.getState().project
  const canvas = document.createElement('canvas')
  await act(async () => {
    engine.attachProject(project)
    engine.setCanvas(canvas, { width: 640, height: 360 })
  })
  assert.equal(engine.canvas.width, 640)
  await act(async () => {
    engine.play()
  })
  await new Promise((r) => setTimeout(r, 260))
  await act(async () => {
    engine.pause()
  })
  assert.ok(engine.time > 0.05, `time should advance, got ${engine.time}`)
  assert.ok(canvas.width === 640)
})

await test('seeking clamps inside the project duration', async () => {
  const { engine } = await import('../src/engine/player.js')
  engine.seek(9999)
  assert.ok(engine.time <= engine.duration)
  engine.seek(-5)
  assert.equal(engine.time, 0)
})

await test('captions can be generated from text through the AI tool', async () => {
  const { TOOLS } = await import('../src/engine/ai/tools.js')
  const { timeCues } = await import('../src/engine/ai/tools.js')
  const cues = timeCues(['سطر أول', 'سطر تاني', 'سطر تالت'], { wpm: 150 })
  assert.equal(cues.length, 3)
  assert.equal(typeof TOOLS.captions.run, 'function')
})

await test('filter presets apply to the selected clips', async () => {
  const project = store.getState().project
  const clip = project.tracks.find((t) => t.kind === 'video').clips[0]
  await act(async () => {
    editorActions.applyFilter([clip.id], 'noir')
  })
  const after = store.getState().project.tracks.find((t) => t.kind === 'video').clips[0]
  assert.equal(after.fx.saturation, -100)
  assert.ok(after.fx.vignette > 0)
})

await test('settings changes propagate (watermark, letterbox)', async () => {
  await act(async () => {
    editorActions.updateSettings({ letterbox: 8, watermark: { enabled: true, text: 'laqta', pos: 'br', opacity: 0.4, size: 4 } })
  })
  const s = store.getState().project.settings
  assert.equal(s.letterbox, 8)
  assert.equal(s.watermark.enabled, true)
})

await test('project serialisation round-trips', async () => {
  const { projectToJson } = await import('../src/engine/exporter.js')
  const json = projectToJson(store.getState().project)
  const parsed = JSON.parse(json)
  assert.equal(parsed.name, 'اختبار التكامل')
  assert.ok(parsed.tracks.length === 4)
})

await test('splitting at the playhead creates two clips', async () => {
  const project = store.getState().project
  const clip = project.tracks.find((t) => t.kind === 'video').clips[0]
  await act(async () => {
    editorActions.ui.select([clip.id])
  })
  await act(async () => {
    editorActions.splitAt(clip.start + clip.duration / 2, { all: false })
  })
  const track = store.getState().project.tracks.find((t) => t.kind === 'video')
  assert.ok(track.clips.length >= 2)
})

console.log(lines.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
