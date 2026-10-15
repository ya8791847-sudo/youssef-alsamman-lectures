/**
 * Exporters — video (WebM/MP4 via MediaRecorder), audio (WAV mixdown),
 * still frames (PNG), subtitles (SRT/VTT) and project files (JSON).
 * Everything is produced locally; nothing is uploaded.
 */

import * as audio from './audio.js'
import { renderFrame } from './renderer.js'
import { engine } from './player.js'
import { blobFor, urlFor } from '../store/media.js'
import { sourceTimeOf, totalDuration } from '../store/model.js'

export function recorderSupported() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

export function bestVideoMime() {
  const list = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const m of list) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* ignore */
    }
  }
  return ''
}

/* ------------------------------- video export ----------------------------- */

/**
 * Render + record the whole timeline in real time.
 * Returns { blob, mime, duration, cancel }.
 */
export function exportVideo({ width, height, fps = 30, bitrate = 8_000_000, muteOutput = false, onProgress, onDone, onError, from = 0 } = {}) {
  if (!recorderSupported()) {
    onError?.(new Error('recorder-unsupported'))
    return null
  }
  const project = engine.project
  if (!project) {
    onError?.(new Error('no-project'))
    return null
  }
  const W = Math.round(width || project.width)
  const H = Math.round(height || project.height)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })
  const gfx = { layer: document.createElement('canvas'), scratch: document.createElement('canvas'), key: document.createElement('canvas') }
  gfx.layer.width = W
  gfx.layer.height = H
  gfx.scratch.width = Math.max(2, Math.round(W / 2))
  gfx.scratch.height = Math.max(2, Math.round(H / 2))
  gfx.key.width = W
  gfx.key.height = H

  const draw = (t) =>
    renderFrame({ ctx, project: engine.project, time: t, getAsset: engine.getAsset, width: W, height: H, gfx })

  const stream = canvas.captureStream(Math.min(60, Math.max(1, fps)))
  let mixTracks = []
  try {
    const mix = audio.mixStream()
    mixTracks = mix.getAudioTracks()
    mixTracks.forEach((t) => stream.addTrack(t))
  } catch {
    /* silent export if the graph is unavailable */
  }

  const mime = bestVideoMime()
  const rec = new MediaRecorder(stream, {
    mimeType: mime || undefined,
    videoBitsPerSecond: bitrate,
    audioBitsPerSecond: 192_000,
  })
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const duration = totalDuration(project)
  const wasMuted = audio.isOutputMuted()
  if (muteOutput) audio.setOutputMuted(true)
  const prevRate = engine.rate
  engine.setRate(1)
  engine.seek(from, { render: false })

  const stopTick = engine.onTick((t) => {
    draw(t)
    onProgress?.(Math.min(0.999, (t - from) / Math.max(0.001, duration - from)))
  })

  const finished = new Promise((resolve) => {
    rec.onstop = () => {
      stopTick()
      engine.pause()
      engine.setRate(prevRate)
      if (muteOutput) audio.setOutputMuted(wasMuted)
      const blob = new Blob(chunks, { type: mime || 'video/webm' })
      onProgress?.(1)
      resolve({ blob, mime: mime || 'video/webm', duration, size: blob.size })
    }
  })

  // first frame before we start recording
  draw(from)
  rec.start(1000)
  engine.play()

  const cancel = () => {
    try {
      rec.stop()
    } catch {
      /* ignore */
    }
    engine.pause()
  }

  finished.then(onDone).catch((e) => onError?.(e))
  return { cancel, promise: finished, canvas }
}

/* ------------------------------- audio export ----------------------------- */

/** Build mixdown segments for every clip that carries audio. */
export function buildAudioSegments(project) {
  const out = []
  const voiceSegments = []
  for (const t of project.tracks) {
    for (const c of t.clips) {
      if (!c.mediaId) continue
      const m = project.media.find((x) => x.id === c.mediaId)
      if (!m) continue
      const blob = blobFor(m.id)
      if (!blob) continue
      if (!(m.kind === 'audio' || m.hasAudio)) continue
      const seg = {
        blob,
        start: c.start,
        end: c.start + c.duration,
        srcStart: sourceTimeOf(c, 0),
        gain: (c.audio?.volume ?? 1) * (t.volume ?? 1) * (t.muted ? 0 : 1),
        pan: c.audio?.pan || 0,
        fadeIn: c.audio?.fadeIn || 0,
        fadeOut: c.audio?.fadeOut || 0,
        rate: c.speed || 1,
        reversed: !!c.reversed,
      }
      out.push(seg)
      if (m.hasAudio && t.kind === 'video') voiceSegments.push({ start: c.start, end: c.start + c.duration })
    }
  }
  if (project.settings?.ducking) {
    for (const s of out) {
      const isMusic = project.tracks.find((t) => t.kind === 'audio')?.clips.some((c) => c.start === s.start)
      if (!isMusic) continue
      s.duck = voiceSegments
    }
  }
  return out
}

export async function exportAudioWav({ onProgress } = {}) {
  const project = engine.project
  if (!project) throw new Error('no-project')
  const duration = totalDuration(project)
  const segments = buildAudioSegments(project)
  const blob = await audio.mixdownWav(segments, duration, { onProgress })
  return { blob, duration, size: blob.size, type: 'audio/wav' }
}

/* ------------------------------- still frame ------------------------------ */

function waitEl(el, timeout = 1800) {
  return new Promise((resolve) => {
    if (!el) {
      resolve()
      return
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      el.removeEventListener('seeked', finish)
      el.removeEventListener('loadeddata', finish)
      resolve()
    }
    el.addEventListener('seeked', finish, { once: true })
    el.addEventListener('loadeddata', finish, { once: true })
    setTimeout(finish, timeout)
  })
}

/** Render one frame at full resolution (poster/thumbnail/cover). */
export async function exportStill({ time = null, width = null, height = null, format = 'image/png', quality = 0.94 } = {}) {
  const project = engine.project
  if (!project) throw new Error('no-project')
  const t = time != null ? time : engine.time
  engine.syncAssets()
  // make sure every element that shows at this time holds the right frame
  const waits = []
  for (const track of project.tracks) {
    for (const c of track.clips) {
      if (!c.mediaId) continue
      const local = t - c.start
      if (local < 0 || local >= c.duration) continue
      const asset = engine.assetFor(c.mediaId)
      if (!asset || asset.kind === 'image') continue
      const src = sourceTimeOf(c, local)
      if (Math.abs(asset.el.currentTime - src) > 0.03) {
        try {
          asset.el.currentTime = Math.max(0, src)
          waits.push(waitEl(asset.el))
        } catch {
          /* ignore */
        }
      }
    }
  }
  await Promise.all(waits)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width || project.width)
  canvas.height = Math.round(height || project.height)
  const gfx = { layer: document.createElement('canvas'), scratch: document.createElement('canvas'), key: document.createElement('canvas') }
  gfx.layer.width = canvas.width
  gfx.layer.height = canvas.height
  gfx.scratch.width = Math.max(2, Math.round(canvas.width / 2))
  gfx.scratch.height = Math.max(2, Math.round(canvas.height / 2))
  gfx.key.width = canvas.width
  gfx.key.height = canvas.height
  renderFrame({ ctx: canvas.getContext('2d'), project, time: t, getAsset: engine.getAsset, width: canvas.width, height: canvas.height, gfx })
  const blob = await new Promise((res) => canvas.toBlob(res, format, quality))
  return { blob, width: canvas.width, height: canvas.height, type: format }
}

/* -------------------------------- subtitles ------------------------------- */

function tc(sec, sep = ',') {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const secs = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return `${p(h)}:${p(m)}:${p(secs)}${sep}${p(ms, 3)}`
}

export function toSrt(captions) {
  return captions
    .map((c, i) => `${i + 1}\n${tc(c.start)} --> ${tc(c.end)}\n${c.text}\n`)
    .join('\n')
}

export function toVtt(captions) {
  return `WEBVTT\n\n${captions.map((c) => `${tc(c.start, '.')} --> ${tc(c.end, '.')}\n${c.text}\n`).join('\n')}`
}

export function parseSubtitles(text) {
  const src = String(text || '').replace(/\r/g, '')
  const blocks = src.split(/\n{2,}/)
  const out = []
  const parseTime = (s) => {
    const m = /(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(s)
    if (!m) return null
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000
  }
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '')
    if (!lines.length) continue
    const arrowIdx = lines.findIndex((l) => l.includes('-->'))
    if (arrowIdx < 0) continue
    const [a, bb] = lines[arrowIdx].split('-->')
    const start = parseTime(a)
    const end = parseTime(bb)
    if (start == null || end == null) continue
    const txt = lines
      .slice(arrowIdx + 1)
      .join('\n')
      .trim()
    if (txt) out.push({ start, end, text: txt })
  }
  return out
}

/* ------------------------------- project file ----------------------------- */

export function projectToJson(project) {
  const clean = JSON.parse(JSON.stringify(project))
  clean.media = (project.media || []).map((m) => ({ ...m, url: undefined }))
  return JSON.stringify(clean, null, 2)
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function extensionFor(mime, fallback = 'webm') {
  if (!mime) return fallback
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg')) return 'jpg'
  return fallback
}

export function estimateSize(bitrate, durationSec) {
  return (bitrate / 8) * durationSec
}

export { urlFor }
