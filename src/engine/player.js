/**
 * Playback engine — media element pool, audio-locked clock, live compositing.
 *
 * The AudioContext clock drives time (like a real NLE), video elements are
 * nudged back into sync when they drift, and every frame is composited by the
 * renderer onto the stage canvas.
 */

import * as audio from './audio.js'
import { renderFrame } from './renderer.js'
import { sourceTimeOf, totalDuration } from '../store/model.js'
import { urlFor } from '../store/media.js'

const DRIFT_TOLERANCE = 0.18
const AUDIO_DRIFT = 0.12

class Engine {
  constructor() {
    this.assets = new Map() // mediaId -> { el, kind, width, height, ready, pendingSeek }
    this.canvas = null
    this.ctx2d = null
    this.gfx = { scratch: null, key: null, layer: null }
    this.project = null
    this.time = 0
    this.playing = false
    this.rate = 1
    this.masterVolume = 1
    this.previewScale = 1
    this.tickCbs = new Set()
    this.stateCbs = new Set()
    this.frame = null
    this.startClock = 0
    this.startTime = 0
    this.duration = 1
    this.loop = false
    this.raf = null
    this.ignoreNextSync = false
    this.rebuildPending = false
  }

  /* ------------------------------ lifecycle ------------------------------ */

  attachProject(project) {
    this.project = project
    this.duration = totalDuration(project)
    this.syncAssets()
  }

  setCanvas(canvas, { width, height, scale = 1 } = {}) {
    this.canvas = canvas
    this.ctx2d = canvas.getContext('2d', { alpha: false })
    this.previewScale = scale
    this.resize(width, height)
  }

  resize(width, height) {
    if (!this.canvas || !width || !height) return
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    const mk = (w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    }
    if (!this.gfx.layer || this.gfx.layer.width !== width) {
      this.gfx.layer = mk(width, height)
      this.gfx.scratch = mk(Math.max(2, Math.round(width / 2)), Math.max(2, Math.round(height / 2)))
      this.gfx.key = mk(width, height)
    }
    this.render()
  }

  onTick(cb) {
    this.tickCbs.add(cb)
    return () => this.tickCbs.delete(cb)
  }

  onState(cb) {
    this.stateCbs.add(cb)
    return () => this.stateCbs.delete(cb)
  }

  emitState() {
    const s = { playing: this.playing, time: this.time, duration: this.duration, rate: this.rate }
    this.stateCbs.forEach((cb) => cb(s))
  }

  /* ------------------------------- assets -------------------------------- */

  assetFor(mediaId) {
    return this.assets.get(mediaId) || null
  }

  getAsset = (mediaId) => this.assets.get(mediaId) || null

  /** Create/refresh media elements for every media item referenced by clips. */
  syncAssets(project = this.project) {
    if (!project) return
    const used = new Set()
    for (const t of project.tracks) for (const c of t.clips) if (c.mediaId) used.add(c.mediaId)
    // drop unused
    for (const [id, a] of this.assets) {
      if (!used.has(id) || !project.media.some((m) => m.id === id)) {
        try {
          a.el.pause()
        } catch {
          /* ignore */
        }
        audio.detachMedia(id)
        this.assets.delete(id)
      }
    }
    for (const m of project.media) {
      if (!used.has(m.id)) continue
      const existing = this.assets.get(m.id)
      const url = m.url || urlFor(m.id)
      if (existing && existing.url === url) continue
      if (existing) {
        try {
          existing.el.pause()
        } catch {
          /* ignore */
        }
        audio.detachMedia(m.id)
        this.assets.delete(m.id)
      }
      if (!url) continue
      const kind = m.kind
      if (kind === 'video' || kind === 'audio') {
        const v = document.createElement(kind === 'audio' ? 'audio' : 'video')
        v.src = url
        v.preload = 'auto'
        v.playsInline = true
        v.crossOrigin = 'anonymous'
        v.muted = false
        v.volume = 1
        v.addEventListener('loadeddata', () => {
          const a = this.assets.get(m.id)
          if (a) {
            a.ready = true
            a.width = v.videoWidth || m.width
            a.height = v.videoHeight || m.height
          }
          if (!this.playing) this.render()
        })
        this.assets.set(m.id, { el: v, kind, url, ready: false, width: m.width, height: m.height, missing: false })
      } else if (kind === 'image') {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const a = this.assets.get(m.id)
          if (a) {
            a.ready = true
            a.width = img.naturalWidth
            a.height = img.naturalHeight
          }
          if (!this.playing) this.render()
        }
        img.src = url
        this.assets.set(m.id, { el: img, kind: 'image', url, ready: true, width: m.width, height: m.height })
      }
    }
  }

  /* ------------------------------ transport ------------------------------ */

  setRate(rate) {
    this.rate = rate
    if (this.playing) {
      // re-anchor the clock so the change is seamless
      this.startClock = this.currentClock()
      this.startTime = this.time
    }
    this.applyPlaybackRates()
    this.emitState()
  }

  play() {
    if (!this.project) return
    const d = totalDuration(this.project)
    this.duration = d
    if (this.time >= d - 0.02) this.time = 0
    try {
      audio.master()
      audio.setMasterVolume(this.project.settings?.masterVolume ?? 1)
    } catch {
      // Web Audio is not available (some WebViews) — silent playback still works
      this.audioDisabled = true
    }
    this.syncAssets()
    this.playing = true
    this.startClock = this.currentClock()
    this.startTime = this.time
    this.syncMedia(true)
    this.emitState()
    this.startLoop()
  }

  pause() {
    this.playing = false
    this.stopLoop()
    for (const a of this.assets.values()) {
      if (a.kind !== 'image' && !a.el.paused) {
        try {
          a.el.pause()
        } catch {
          /* ignore */
        }
      }
    }
    this.emitState()
    this.render()
  }

  toggle() {
    if (this.playing) this.pause()
    else this.play()
  }

  seek(t, { render = true, syncAudio = true } = {}) {
    const clamped = Math.max(0, Math.min(this.duration - 0.001, t))
    this.time = clamped
    if (this.playing) {
      this.startClock = this.currentClock()
      this.startTime = clamped
      this.syncMedia(syncAudio)
    } else {
      this.scrubTo(clamped, true)
    }
    if (render) this.render()
    this.emitState()
  }

  stepFrame(dir = 1) {
    const fps = this.project?.fps || 30
    this.seek(this.time + (dir * 1) / fps)
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = null
  }

  startLoop() {
    this.stopLoop()
    const loop = () => {
      if (!this.playing) return
      this.raf = requestAnimationFrame(loop)
      this.update()
    }
    this.raf = requestAnimationFrame(loop)
  }

  currentClock() {
    try {
      const c = audio.ctx()
      if (c && c.state === 'running') return c.currentTime
    } catch {
      /* fall through to the wall clock */
    }
    return performance.now() / 1000
  }

  /* -------------------------------- update ------------------------------- */

  update() {
    if (!this.project) return
    const elapsed = this.currentClock() - this.startClock
    let t = this.startTime + elapsed * this.rate
    const d = this.duration
    if (t >= d) {
      t = this.loop ? 0 : d
      if (!this.loop) {
        this.time = d
        this.pause()
        this.render()
        this.emitTick()
        return
      }
      this.startClock = this.currentClock()
      this.startTime = 0
    }
    this.time = t
    this.syncMedia(false)
    this.render()
    this.emitTick()
    if (this.raf == null && this.playing) this.startLoop()
  }

  emitTick() {
    this.tickCbs.forEach((cb) => cb(this.time))
  }

  /** Keep media elements aligned with the timeline. */
  syncMedia(force) {
    const project = this.project
    if (!project) return
    const active = new Map()
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => this.time >= c.start - 1e-4 && this.time < c.start + c.duration - 1e-4)
      if (!clip || !clip.mediaId) continue
      const prev = active.get(clip.mediaId)
      if (!prev) active.set(clip.mediaId, { clip, track, tracks: [track] })
      else {
        prev.tracks.push(track)
        prev.track = track
        prev.clip = clip
      }
    }

    for (const [mediaId, a] of this.assets) {
      if (a.kind === 'image') continue
      const act = active.get(mediaId)
      const el = a.el
      if (!act) {
        if (!el.paused && this.playing) {
          try {
            el.pause()
          } catch {
            /* ignore */
          }
        }
        if (this.playing) continue
        continue
      }
      const { clip, tracks } = act
      const local = this.time - clip.start
      const src = sourceTimeOf(clip, local)
      const speed = clip.speed || 1
      const wantRate = speed * this.rate * (clip.reversed ? 1 : 1)
      if (clip.reversed) {
        try {
          el.pause()
        } catch {
          /* ignore */
        }
        if (Math.abs(el.currentTime - src) > 0.06 || force) {
          try {
            el.currentTime = Math.max(0, src)
          } catch {
            /* ignore */
          }
        }
      } else if (this.playing) {
        const drift = el.currentTime - src
        const isAudioTrack = a.kind === 'audio'
        if (!el.paused && Math.abs(drift) > (isAudioTrack ? AUDIO_DRIFT : DRIFT_TOLERANCE)) {
          try {
            el.currentTime = Math.max(0, src)
          } catch {
            /* ignore */
          }
        }
        if (el.paused || force) {
          try {
            el.currentTime = Math.max(0, src)
          } catch {
            /* ignore */
          }
          el.play().catch(() => {})
        }
        if (Math.abs(el.playbackRate - wantRate) > 0.001) el.playbackRate = wantRate
        // attach once for Web Audio routing
        const voiceFx = clip.audio?.voiceFx?.fx || {}
        if (!this.audioDisabled) {
          try {
            audio.attachMedia(mediaId, el, { voiceFx, volume: 1, pan: 0 })
          } catch {
            this.audioDisabled = true
          }
        }
        // live gain: clip volume × track volume × fades × ducking
        let gain = clip.audio?.volume ?? 1
        for (const tr of tracks) {
          gain *= tr.volume ?? 1
          if (tr.muted) gain = 0
        }
        const fi = clip.audio?.fadeIn || 0
        const fo = clip.audio?.fadeOut || 0
        if (fi > 0 && local < fi) gain *= Math.max(0, local / fi)
        if (fo > 0 && local > clip.duration - fo) gain *= Math.max(0, (clip.duration - local) / fo)
        if (project.settings?.ducking && a.kind === 'audio' && this.voiceActive()) gain *= 0.32
        if (!this.audioDisabled) {
          try {
            audio.setLiveGain(mediaId, gain)
            audio.setLivePan(mediaId, clip.audio?.pan || 0)
          } catch {
            /* ignore */
          }
        }
      } else {
        try {
          el.pause()
        } catch {
          /* ignore */
        }
        if (Math.abs(el.currentTime - src) > 0.05 || force) {
          try {
            el.currentTime = Math.max(0, src)
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  voiceActive() {
    for (const track of this.project.tracks) {
      if (track.kind !== 'video' && track.kind !== 'overlay') continue
      const clip = track.clips.find((c) => this.time >= c.start && this.time < c.start + c.duration)
      if (clip?.mediaId) {
        const m = this.project.media.find((x) => x.id === clip.mediaId)
        if (m?.hasAudio) return true
      }
    }
    return false
  }

  /** Move elements to the right frame while paused (scrubbing). */
  scrubTo(t, force = false) {
    const project = this.project
    if (!project) return
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => t >= c.start - 1e-4 && t < c.start + c.duration - 1e-4)
      if (!clip?.mediaId) continue
      const a = this.assets.get(clip.mediaId)
      if (!a || a.kind === 'image') continue
      const src = sourceTimeOf(clip, t - clip.start)
      if (Math.abs(a.el.currentTime - src) > (force ? 0.02 : 0.06)) {
        try {
          a.el.currentTime = Math.max(0, src)
        } catch {
          /* ignore */
        }
      }
    }
  }

  /* -------------------------------- render ------------------------------- */

  render() {
    if (!this.ctx2d || !this.project) return
    const { width, height } = this.canvas
    renderFrame({
      ctx: this.ctx2d,
      project: this.project,
      time: this.time,
      getAsset: this.getAsset,
      width,
      height,
      gfx: this.gfx,
    })
  }

  level() {
    try {
      return audio.level()
    } catch {
      return 0
    }
  }

  dispose() {
    this.stopLoop()
    for (const [id, a] of this.assets) {
      try {
        a.el.pause()
        a.el.removeAttribute?.('src')
      } catch {
        /* ignore */
      }
      audio.detachMedia(id)
    }
    this.assets.clear()
  }
}

export const engine = new Engine()
export default engine
