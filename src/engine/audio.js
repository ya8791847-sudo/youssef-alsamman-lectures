/**
 * Laqta AI — audio engine
 * ---------------------------------------------------------------------------
 * Web Audio graph for playback + export, offline analysis (silence, beats,
 * loudness, waveform peaks) and local audio generation (music, tones, WAV).
 * Everything runs on the client; no network calls, no uploads.
 */

let _ctx = null
let _master = null
let _analyser = null
let _analyserData = null
let _streamDest = null
let _compressor = null
let _recDest = null

const sources = new Map() // mediaId -> { el, node, chain, fxKey }
const buffers = new Map() // mediaId -> AudioBuffer (cache, capped)
const BUFFER_CACHE_MAX = 4
const muted = { value: false }

export function ctx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    _ctx = new AC({ latencyHint: 'interactive' })
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {})
  return _ctx
}

let _speaker = null

export function master() {
  if (!_master) {
    const c = ctx()
    // bus → limiter → analyser → (speakers | export stream)
    _master = c.createGain()
    _master.gain.value = 1
    _compressor = c.createDynamicsCompressor()
    _compressor.threshold.value = -6
    _compressor.knee.value = 12
    _compressor.ratio.value = 3
    _compressor.attack.value = 0.006
    _compressor.release.value = 0.22
    _analyser = c.createAnalyser()
    _analyser.fftSize = 1024
    _analyser.smoothingTimeConstant = 0.75
    _analyserData = new Uint8Array(_analyser.frequencyBinCount)
    _speaker = c.createGain()
    _speaker.gain.value = 1
    _master.connect(_compressor)
    _compressor.connect(_analyser)
    _analyser.connect(_speaker)
    _speaker.connect(c.destination)
  }
  return _master
}

let masterVolume = 1

/** Set the project master level (0..2) — affects speakers and the export mix. */
export function setMasterVolume(v) {
  master()
  masterVolume = Math.max(0, Math.min(2, v))
  _master.gain.value = masterVolume
}

/** Mute the speakers only — the export stream keeps its level. */
export function setOutputMuted(m) {
  master()
  muted.value = !!m
  _speaker.gain.value = muted.value ? 0 : 1
}

export function isOutputMuted() {
  return muted.value
}

/** Live level meter (0..1) built from the analyser. */
export function level() {
  if (!_analyser || !_analyserData) return 0
  _analyser.getByteFrequencyData(_analyserData)
  let sum = 0
  for (let i = 0; i < 64; i++) sum += _analyserData[i]
  return Math.min(1, sum / (64 * 190))
}

/** MediaStream with the full mix — used by the video exporter. */
export function mixStream() {
  const c = ctx()
  master()
  if (!_streamDest) {
    _streamDest = c.createMediaStreamDestination()
    _analyser.connect(_streamDest)
  }
  return _streamDest.stream
}

/* ------------------------------------------------------------------------- */
/* per-media graph with optional voice FX                                     */
/* ------------------------------------------------------------------------- */

function curveDrive(amount) {
  const k = amount / 100
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + k * 22) * x * 20 * Math.PI) / (Math.PI + k * 22 * Math.abs(x))
  }
  return curve
}

function makeImpulse(c, seconds, decay) {
  const rate = c.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = c.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

/** Build (or rebuild) the FX chain of one media element. */
function buildChain(mediaId, el, fx = {}, clipGain = 1) {
  const c = ctx()
  const key = JSON.stringify(fx || {}) + '|' + Number(clipGain).toFixed(3)
  const existing = sources.get(mediaId)
  if (existing && existing.fxKey === key && existing.el === el) return existing

  if (existing) {
    try {
      existing.node.disconnect()
    } catch {
      /* ignore */
    }
    ;(existing.extra || []).forEach((n) => {
      try {
        n.disconnect()
      } catch {
        /* ignore */
      }
      try {
        n.stop?.()
      } catch {
        /* ignore */
      }
    })
  }

  let node = existing?.node
  if (!node || existing.el !== el) {
    try {
      node = c.createMediaElementSource(el)
    } catch {
      node = null
    }
    if (!node) return null
  }

  const extra = []
  let cur = node
  const chainNodes = []
  const push = (n) => {
    cur.connect(n)
    cur = n
    chainNodes.push(n)
  }

  const highpass = c.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = fx.highpass || 20
  highpass.Q.value = 0.7
  push(highpass)

  if (fx.warmth) {
    const shelf = c.createBiquadFilter()
    shelf.type = 'lowshelf'
    shelf.frequency.value = 220
    shelf.gain.value = fx.warmth
    push(shelf)
  }
  if (fx.presence) {
    const peak = c.createBiquadFilter()
    peak.type = 'peaking'
    peak.frequency.value = 3200
    peak.Q.value = 0.9
    peak.gain.value = fx.presence
    push(peak)
  }
  if (fx.deEss) {
    const notch = c.createBiquadFilter()
    notch.type = 'peaking'
    notch.frequency.value = 6800
    notch.Q.value = 2.2
    notch.gain.value = -6
    push(notch)
  }

  const lowpass = c.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = fx.lowpass || 20000
  lowpass.Q.value = 0.7
  push(lowpass)

  if (fx.drive) {
    const shaper = c.createWaveShaper()
    shaper.curve = curveDrive(fx.drive)
    shaper.oversample = '2x'
    push(shaper)
    const trim = c.createGain()
    trim.gain.value = 1 / (1 + fx.drive / 90)
    push(trim)
  }

  if (fx.ringMod) {
    const ringGain = c.createGain()
    ringGain.gain.value = 0
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = fx.ringMod
    const depth = c.createGain()
    depth.gain.value = 0.9
    osc.connect(depth)
    depth.connect(ringGain.gain)
    osc.start()
    extra.push(osc)
    cur.connect(ringGain)
    cur = ringGain
    chainNodes.push(ringGain)
  }

  const comp = c.createDynamicsCompressor()
  if (fx.gate) {
    comp.threshold.value = fx.compThreshold ?? -40
    comp.knee.value = 3
    comp.ratio.value = 14
    comp.attack.value = 0.004
    comp.release.value = 0.12
  } else {
    comp.threshold.value = fx.compThreshold ?? -12
    comp.knee.value = 12
    comp.ratio.value = fx.compRatio ?? 3
    comp.attack.value = 0.006
    comp.release.value = 0.25
  }
  push(comp)

  if (fx.reverb) {
    const dry = c.createGain()
    const wet = c.createGain()
    const conv = c.createConvolver()
    conv.buffer = makeImpulse(c, Math.max(1.2, fx.reverbSize || 1.8), 2.6)
    wet.gain.value = Math.min(1, fx.reverb)
    dry.gain.value = 1 - Math.min(0.6, fx.reverb * 0.5)
    cur.connect(dry)
    cur.connect(conv)
    conv.connect(wet)
    const sum = c.createGain()
    dry.connect(sum)
    wet.connect(sum)
    cur = sum
    chainNodes.push(dry, wet, conv, sum)
  }

  const panner = c.createStereoPanner()
  panner.pan.value = Number.isFinite(clipGain?.pan) ? clipGain.pan : 0
  push(panner)

  const gain = c.createGain()
  gain.gain.value = Math.max(0, Math.min(4, (fx.gain ? fx.gain / 3 : 1) * (typeof clipGain === 'number' ? clipGain : clipGain?.gain ?? 1)))
  push(gain)

  cur.connect(master())

  const rec = { el, node, chain: chainNodes, extra, fxKey: key, gain, panner, input: gain }
  sources.set(mediaId, rec)
  return rec
}

/**
 * Attach a media element to the graph and keep its FX in sync.
 * `voiceFx` = preset fx object, `volume`/`pan` = clip level.
 */
export function attachMedia(mediaId, el, { voiceFx, volume = 1, pan = 0 } = {}) {
  if (!el) return null
  const rec = buildChain(mediaId, el, voiceFx || {}, { gain: volume, pan })
  if (rec && rec.gain) rec.gain.gain.value = Math.max(0, Math.min(4, (voiceFx?.gain ? voiceFx.gain / 3 : 1) * volume))
  if (rec && rec.panner) rec.panner.pan.value = pan
  return rec
}

/** Live volume/pan automation while playing (fades). */
export function setLiveGain(mediaId, value) {
  const rec = sources.get(mediaId)
  if (rec?.gain) rec.gain.gain.value = Math.max(0, Math.min(4, value))
}
export function setLivePan(mediaId, value) {
  const rec = sources.get(mediaId)
  if (rec?.panner) rec.panner.pan.value = Math.max(-1, Math.min(1, value))
}
export function detachMedia(mediaId) {
  const rec = sources.get(mediaId)
  if (!rec) return
  try {
    rec.node.disconnect()
  } catch {
    /* ignore */
  }
  ;(rec.chain || []).forEach((n) => {
    try {
      n.disconnect()
    } catch {
      /* ignore */
    }
  })
  ;(rec.extra || []).forEach((n) => {
    try {
      n.stop?.()
    } catch {
      /* ignore */
    }
  })
  sources.delete(mediaId)
}
export function detachAll() {
  ;[...sources.keys()].forEach(detachMedia)
}

/* ------------------------------------------------------------------------- */
/* offline analysis                                                           */
/* ------------------------------------------------------------------------- */

export async function decodeMedia(mediaId, blob) {
  if (buffers.has(mediaId)) return buffers.get(mediaId)
  const c = ctx()
  const arr = await blob.arrayBuffer()
  const buf = await c.decodeAudioData(arr.slice(0))
  buffers.set(mediaId, buf)
  if (buffers.size > BUFFER_CACHE_MAX) {
    const first = buffers.keys().next().value
    if (first !== mediaId) buffers.delete(first)
  }
  return buf
}

export function cachedBuffer(mediaId) {
  return buffers.get(mediaId) || null
}

/** Mono downsampled view of a buffer (cheap for analysis loops). */
function monoView(buf, step = 4) {
  const ch = buf.numberOfChannels
  const n = Math.floor(buf.length / step)
  const out = new Float32Array(n)
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) out[i] += d[i * step] / ch
  }
  return out
}

/** Peak envelope for timeline waveforms (values 0..1). */
export function peaks(mediaId, buckets = 900, step = 4) {
  const buf = buffers.get(mediaId)
  if (!buf) return null
  const mono = monoView(buf, step)
  const per = Math.max(1, Math.floor(mono.length / buckets))
  const out = new Float32Array(buckets)
  for (let b = 0; b < buckets; b++) {
    let max = 0
    const start = b * per
    for (let i = 0; i < per; i++) {
      const v = Math.abs(mono[start + i] || 0)
      if (v > max) max = v
    }
    out[b] = Math.min(1, max * 1.25)
  }
  return out
}

export function peakRange(mediaId, t0, t1, buckets = 200) {
  const buf = buffers.get(mediaId)
  if (!buf) return null
  const sr = buf.sampleRate
  const a = Math.max(0, Math.floor(t0 * sr))
  const b = Math.min(buf.length, Math.floor(t1 * sr))
  const step = Math.max(1, Math.floor((b - a) / buckets))
  const out = new Float32Array(buckets)
  if (b <= a) return out
  const d0 = buf.getChannelData(0)
  const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0
  for (let k = 0; k < buckets; k++) {
    let max = 0
    const s = a + k * step
    for (let i = 0; i < step; i++) {
      const v = Math.max(Math.abs(d0[s + i] || 0), Math.abs(d1[s + i] || 0))
      if (v > max) max = v
    }
    out[k] = Math.min(1, max * 1.3)
  }
  return out
}

/**
 * Silence detection — the core of the "remove silence" AI tool.
 * Returns [{ start, end, dur }] in seconds.
 */
export function detectSilence(mediaId, { sensitivity = 50, minSilence = 0.35, padding = 0.08 } = {}) {
  const buf = buffers.get(mediaId)
  if (!buf) return []
  const sr = buf.sampleRate
  const win = Math.max(256, Math.floor(sr * 0.02))
  const mono = monoView(buf, 4) // ~ sr/4 rate
  const mWin = Math.max(64, Math.floor(win / 4))
  const frames = Math.floor(mono.length / mWin)
  if (frames < 4) return []
  const rms = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    const s = f * mWin
    for (let i = 0; i < mWin; i++) {
      const v = mono[s + i] || 0
      sum += v * v
    }
    rms[f] = Math.sqrt(sum / mWin)
  }
  const dbs = Array.from(rms, (v) => 20 * Math.log10(v + 1e-7))
  const sorted = [...dbs].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.1)]
  const speech = sorted[Math.floor(sorted.length * 0.8)]
  const k = (100 - sensitivity) / 100 // sensitivity 100 → most aggressive
  const thr = floor + Math.max(4, (speech - floor) * (0.08 + k * 0.26))
  const frameDur = mWin / (sr / 4)
  const out = []
  let runStart = -1
  for (let f = 0; f <= frames; f++) {
    const quiet = f < frames ? dbs[f] < thr : false
    if (quiet && runStart < 0) runStart = f
    else if (!quiet && runStart >= 0) {
      const start = runStart * frameDur
      const end = f * frameDur
      if (end - start >= minSilence) {
        out.push({
          start: +(start + padding).toFixed(3),
          end: +Math.max(start + padding + 0.02, end - padding).toFixed(3),
          dur: +(end - start).toFixed(3),
        })
      }
      runStart = -1
    }
  }
  // merge segments separated by less than 0.12s of sound
  const merged = []
  for (const s of out) {
    const last = merged[merged.length - 1]
    if (last && s.start - last.end < 0.12) last.end = s.end
    else merged.push({ ...s })
  }
  merged.forEach((m) => (m.dur = +(m.end - m.start).toFixed(3)))
  return merged.filter((m) => m.dur > 0.04)
}

/** Onset / beat detection with tempo estimate. */
export function detectBeats(mediaId, { sensitivity = 50 } = {}) {
  const buf = buffers.get(mediaId)
  if (!buf) return { beats: [], bpm: 0, onsets: [] }
  const sr = buf.sampleRate
  const step = 4
  const rate = sr / step
  const mono = monoView(buf, step)
  const mWin = Math.max(32, Math.floor(rate * 0.0116)) // ~11.6ms
  const frames = Math.floor(mono.length / mWin)
  if (frames < 8) return { beats: [], bpm: 0, onsets: [] }
  const env = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    const s = f * mWin
    for (let i = 0; i < mWin; i++) {
      const v = mono[s + i] || 0
      sum += v * v
    }
    env[f] = Math.sqrt(sum / mWin)
  }
  // spectral-flux style: positive first difference of the energy envelope
  const flux = new Float32Array(frames)
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, env[f] - env[f - 1])
  // local adaptive threshold
  const halfWin = Math.max(3, Math.floor(rate / mWin / 2))
  const onsets = []
  const mult = 1.35 + (50 - sensitivity) / 120
  let lastIdx = -999
  let prevFlux = 0
  for (let f = 1; f < frames - 1; f++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, f - halfWin); j < Math.min(frames, f + halfWin); j++) {
      sum += flux[j]
      n++
    }
    const mean = sum / Math.max(1, n)
    let varSum = 0
    for (let j = Math.max(0, f - halfWin); j < Math.min(frames, f + halfWin); j++) varSum += (flux[j] - mean) ** 2
    const std = Math.sqrt(varSum / Math.max(1, n))
    const thr = mean + mult * std
    const isPeak = flux[f] > thr && flux[f] >= prevFlux && flux[f] > flux[f + 1]
    const minGap = Math.floor(0.12 / (mWin / rate))
    if (isPeak && f - lastIdx > minGap) {
      onsets.push((f * mWin) / rate)
      lastIdx = f
    }
    prevFlux = flux[f]
  }
  // tempo via autocorrelation of the flux envelope
  const hop = mWin / rate
  let bpm = 0
  if (onsets.length > 6) {
    const minBpm = 60
    const maxBpm = 180
    let best = { score: -1, bpm: 0 }
    for (let b = minBpm; b <= maxBpm; b++) {
      const period = 60 / b
      let score = 0
      for (const o of onsets) {
        const phase = ((o % period) + period) % period
        score += Math.exp(-Math.pow(Math.min(phase, period - phase) / (period * 0.14), 2))
      }
      score /= onsets.length
      // favour typical 4/4 ranges slightly
      score *= 1 + (b >= 80 && b <= 140 ? 0.06 : 0)
      if (score > best.score) best = { score, bpm: b }
    }
    bpm = best.score > 0.25 ? best.bpm : 0
  }
  // snap onsets onto the grid when we have a confident tempo
  let beats = onsets
  if (bpm) {
    const period = 60 / bpm
    const grid = []
    let t = onsets[0] % period
    const end = buf.length / sr
    while (t < end) {
      grid.push(+t.toFixed(4))
      t += period
    }
    beats = grid
    // keep onsets close to grid lines where possible (tighter sync)
    const snapped = new Set()
    for (const o of onsets) {
      const idx = Math.round((o - grid[0]) / period)
      const g = grid[Math.max(0, Math.min(grid.length - 1, idx))]
      if (Math.abs(g - o) < period * 0.32) snapped.add(+(g).toFixed(4))
    }
    if (snapped.size > grid.length * 0.5) beats = [...snapped].sort((a, b) => a - b)
  }
  return { beats, bpm, onsets: onsets.map((o) => +o.toFixed(3)), hop }
}

/** Whole-file loudness stats (dBFS peak + average). */
export function loudnessStats(mediaId) {
  const buf = buffers.get(mediaId)
  if (!buf) return null
  const mono = monoView(buf, 8)
  let peak = 0
  let sum = 0
  for (let i = 0; i < mono.length; i++) {
    const v = Math.abs(mono[i])
    if (v > peak) peak = v
    sum += v * v
  }
  const rms = Math.sqrt(sum / Math.max(1, mono.length))
  return {
    peakDb: +(20 * Math.log10(peak + 1e-7)).toFixed(1),
    rmsDb: +(20 * Math.log10(rms + 1e-7)).toFixed(1),
    peak,
    rms,
  }
}

/* ------------------------------------------------------------------------- */
/* generation (music, tones, title cards are generated in canvas module)      */
/* ------------------------------------------------------------------------- */

export function wavBlobFromBuffer(buffer) {
  const numCh = buffer.numberOfChannels
  const len = buffer.length
  const sr = buffer.sampleRate
  const bytes = 44 + len * numCh * 2
  const ab = new ArrayBuffer(bytes)
  const view = new DataView(ab)
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, bytes - 8, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * numCh * 2, true)
  view.setUint16(32, numCh * 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, len * numCh * 2, true)
  let off = 44
  const chans = []
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c))
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]))
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

/**
 * Generate background music offline (OfflineAudioContext) — chords + pad +
 * bass + optional kick/hat/arp. Returns a WAV Blob.
 */
export async function generateMusic(style, duration = 30, { onProgress } = {}) {
  const c = ctx()
  const sr = c.sampleRate
  const dur = Math.max(2, Math.min(300, duration))
  const off = new OfflineAudioContext(2, Math.ceil(sr * dur), sr)
  const beat = 60 / style.bpm
  const bar = beat * 4
  const bars = Math.ceil(dur / bar)

  const out = off.createGain()
  out.gain.value = 0.85
  const lp = off.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = style.lofi ? 2600 : 12000
  out.connect(lp)
  lp.connect(off.destination)

  const rev = off.createConvolver()
  rev.buffer = makeImpulse(off, 2.6, 3.2)
  const revGain = off.createGain()
  revGain.gain.value = style.lofi ? 0.3 : 0.2
  rev.connect(revGain)
  revGain.connect(lp)

  const note = (f, t, len, type, gain, dest, glide = 0) => {
    const o = off.createOscillator()
    const g = off.createGain()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (glide) o.frequency.linearRampToValueAtTime(f * glide, t + len)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.04, len / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    o.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + len + 0.02)
    return o
  }

  const semi = (root, s) => root * Math.pow(2, s / 12)

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar
    if (t0 > dur) break
    const chordIdx = b % style.chords.length
    const chord = style.chords[chordIdx]
    chord.forEach((s, i) => {
      const t = t0 + (style.arp ? i * beat * 0.5 : 0)
      if (t > dur) return
      const g = 0.055 * (style.pad || 0.5) * (i === 0 ? 1.2 : 1)
      const osc = note(semi(style.root, s), t, bar * 0.96, style.wave, g, out)
      osc.detune.value = (i - 1) * 4
      // send some of the pad to the reverb
      const send = off.createGain()
      send.gain.value = 0.35
      osc.connect(send)
      send.connect(rev)
    })
    // bass
    if (t0 + beat <= dur) {
      note(semi(style.root, chord[0] - 24), t0, beat * 1.8, 'triangle', 0.16, out)
      if (t0 + beat * 2 <= dur) note(semi(style.root, chord[0] - 12), t0 + beat * 2, beat * 0.9, 'triangle', 0.1, out)
    }
    // drums
    if (style.kick) {
      for (const off_ of [0, 2]) {
        const t = t0 + off_ * beat
        if (t > dur) continue
        const o = off.createOscillator()
        const g = off.createGain()
        o.frequency.setValueAtTime(130, t)
        o.frequency.exponentialRampToValueAtTime(42, t + 0.16)
        g.gain.setValueAtTime(0.7, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.24)
        o.connect(g)
        g.connect(out)
        o.start(t)
        o.stop(t + 0.26)
      }
    }
    if (style.hat) {
      for (let k = 0; k < 8; k++) {
        const t = t0 + k * (beat / 2)
        if (t > dur) continue
        const len = 0.03
        const buf = off.createBuffer(1, Math.ceil(sr * len), sr)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
        const src = off.createBufferSource()
        src.buffer = buf
        const bp = off.createBiquadFilter()
        bp.type = 'highpass'
        bp.frequency.value = 7000
        const g = off.createGain()
        g.gain.value = k % 2 ? 0.05 : 0.09
        src.connect(bp)
        bp.connect(g)
        g.connect(out)
        src.start(t)
      }
    }
    if (style.strings) {
      const t = t0
      note(semi(style.root, chord[0] + 12), t, bar, 'sine', 0.05, out)
    }
    if (onProgress && b % 8 === 0) onProgress(Math.min(0.95, (b / bars) * 1.1))
  }

  // master fade in / out
  out.gain.setValueAtTime(0, 0)
  out.gain.linearRampToValueAtTime(0.85, Math.min(0.8, dur * 0.08))
  out.gain.setValueAtTime(0.85, Math.max(0.9, dur - 1.2))
  out.gain.linearRampToValueAtTime(0, dur)

  const rendered = await off.startRendering()
  return wavBlobFromBuffer(rendered)
}

export function generateTone({ freq = 440, duration = 3, type = 'sine', freq2 = null } = {}) {
  const c = ctx()
  const off = new OfflineAudioContext(2, Math.ceil(c.sampleRate * Math.max(0.2, duration)), c.sampleRate)
  const o = off.createOscillator()
  const g = off.createGain()
  o.type = type
  o.frequency.value = freq
  if (freq2) o.frequency.linearRampToValueAtTime(freq2, duration)
  g.gain.setValueAtTime(0, 0)
  g.gain.linearRampToValueAtTime(0.5, 0.05)
  g.gain.setValueAtTime(0.5, Math.max(0.06, duration - 0.4))
  g.gain.linearRampToValueAtTime(0, duration)
  o.connect(g)
  g.connect(off.destination)
  o.start(0)
  o.stop(duration)
  return off.startRendering().then(wavBlobFromBuffer)
}

/**
 * Offline mixdown of the whole project → WAV Blob.
 * `segments` = [{ blob, start, end, srcStart, gain, pan, fades, voiceFx }]
 */
export async function mixdownWav(segments, duration, { onProgress, sampleRate } = {}) {
  const c = ctx()
  const sr = sampleRate || c.sampleRate
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(sr * duration)), sr)
  const masterG = off.createGain()
  masterG.gain.value = 1
  masterG.connect(off.destination)

  let done = 0
  for (const seg of segments) {
    if (!seg.blob) continue
    try {
      const buf = await off.decodeAudioData((await seg.blob.arrayBuffer()).slice(0))
      const src = off.createBufferSource()
      src.buffer = buf
      const gain = off.createGain()
      const panner = off.createStereoPanner()
      panner.pan.value = seg.pan || 0
      const vol = seg.gain ?? 1
      const t0 = Math.max(0, seg.start)
      const end = Math.min(duration, seg.end)
      const dur = Math.max(0.01, end - t0)
      src.playbackRate.value = seg.rate || 1
      if (seg.reversed) {
        const rev = off.createBuffer(2, buf.length, buf.sampleRate)
        for (let ch = 0; ch < 2; ch++) {
          const srcD = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1))
          const dstD = rev.getChannelData(ch)
          for (let i = 0; i < buf.length; i++) dstD[i] = srcD[buf.length - 1 - i]
        }
        src.buffer = rev
      }
      gain.gain.setValueAtTime(vol, t0)
      if (seg.fadeIn > 0) {
        gain.gain.setValueAtTime(0, t0)
        gain.gain.linearRampToValueAtTime(vol, t0 + Math.min(seg.fadeIn, dur))
      }
      if (seg.fadeOut > 0) {
        const fo = Math.min(seg.fadeOut, dur)
        gain.gain.setValueAtTime(vol, end - fo)
        gain.gain.linearRampToValueAtTime(0, end)
      }
      if (seg.duck) {
        // simple ducking: reduce music while a voice segment is active
        for (const d of seg.duck) {
          const s = Math.max(t0, d.start)
          const e = Math.min(end, d.end)
          if (e <= s) continue
          gain.gain.setValueAtTime(vol * 0.35, s)
          gain.gain.setValueAtTime(vol, e)
        }
      }
      src.connect(gain)
      gain.connect(panner)
      panner.connect(masterG)
      src.start(t0, Math.max(0, seg.srcStart || 0), dur + 0.05)
    } catch {
      /* skip undecodable segments */
    }
    done++
    onProgress?.(done / Math.max(1, segments.length))
  }
  const rendered = await off.startRendering()
  return wavBlobFromBuffer(rendered)
}

/* ------------------------------------------------------------------------- */
/* microphone (voice-over)                                                    */
/* ------------------------------------------------------------------------- */

export async function recordVoiceover({ onStop, mimeType } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
      resolve(blob)
    }
  })
  rec.start(250)
  onStop?.(() => {
    try {
      rec.stop()
    } catch {
      /* ignore */
    }
  })
  return { recorder: rec, done }
}

export function supportedRecorderMime(preferVideo = true) {
  const list = preferVideo
    ? [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4',
      ]
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of list) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* ignore */
    }
  }
  return null
}

export function audioContextState() {
  return _ctx ? _ctx.state : 'suspended'
}
