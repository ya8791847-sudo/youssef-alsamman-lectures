/**
 * The AI toolbox — every task runs locally in the browser.
 *
 *  silence · scenes · beats · reframe · enhance · captions · highlight ·
 *  thumbnail · voice · autofx · chroma · writer · music · titlecard
 */

import * as audio from '../audio.js'
import * as analysis from '../analysis.js'
import { blobFor, urlFor, registerGenerated, makeTitleCard } from '../../store/media.js'
import { engine } from '../player.js'
import { uid, sortClips, totalDuration } from '../../store/model.js'
import * as A from '../../store/editorActions.js'
import { getState, patchUi, toast, aiLog, aiRun, aiFinish, aiProgress } from '../../store/store.js'
import { VOICE_PRESETS, MUSIC_STYLES, DEFAULT_ADJ } from '../presets.js'
import { generateCopy } from './writer.js'

/* ------------------------------- helpers ---------------------------------- */

function primaryVideoTrack(project) {
  return project.tracks.find((t) => t.kind === 'video' && t.clips.some((c) => c.mediaId)) || null
}

function videoClips(project, selection = []) {
  const out = []
  for (const t of project.tracks) {
    for (const c of t.clips) {
      if (!c.mediaId) continue
      const m = project.media.find((x) => x.id === c.mediaId)
      if (!m) continue
      if (m.kind === 'video') out.push({ clip: c, track: t, media: m })
    }
  }
  if (selection.length) {
    const sel = out.filter((x) => selection.includes(x.clip.id))
    return sel.length ? sel : out
  }
  return out
}

function audioClips(project, selection = []) {
  const out = []
  for (const t of project.tracks) {
    if (t.kind !== 'audio' && t.kind !== 'video') continue
    for (const c of t.clips) {
      if (!c.mediaId) continue
      const m = project.media.find((x) => x.id === c.mediaId)
      if (m?.hasAudio || m?.kind === 'audio') out.push({ clip: c, track: t, media: m })
    }
  }
  if (selection.length) {
    const sel = out.filter((x) => selection.includes(x.clip.id))
    return sel.length ? sel : out
  }
  return out
}

async function bufferFor(media) {
  const blob = blobFor(media.id) || engine.assetFor(media.id)?.blob
  if (!blob) throw new Error('missing-blob')
  return audio.decodeMedia(media.id, blob)
}

/** Rebuild a track from a list of source-time segments (used by cut tools). */
function rebuildTrack(track, srcClip, segments, { speed = 1, startAt = 0 } = {}) {
  const template = JSON.parse(JSON.stringify(srcClip))
  track.clips = track.clips.filter((c) => c.id !== srcClip.id)
  let cursor = startAt
  const created = []
  for (const seg of segments) {
    const dur = Math.max(0.05, (seg.b - seg.a) / speed)
    const clip = {
      ...JSON.parse(JSON.stringify(template)),
      id: uid('clip'),
      start: +cursor.toFixed(3),
      duration: +dur.toFixed(3),
      srcStart: +seg.a.toFixed(3),
      srcEnd: +(seg.a + dur * speed).toFixed(3),
    }
    track.clips.push(clip)
    created.push(clip)
    cursor += dur
  }
  sortClips(track)
  return { created, end: cursor }
}

/** Complement of a list of intervals inside [a,b]. */
export function complement(intervals, a, b) {
  const out = []
  let cursor = a
  for (const iv of [...intervals].sort((x, y) => x.a - y.a)) {
    const s = Math.max(a, iv.a)
    const e = Math.min(b, iv.b)
    if (e <= s) continue
    if (s > cursor) out.push({ a: cursor, b: s })
    cursor = Math.max(cursor, e)
  }
  if (cursor < b) out.push({ a: cursor, b })
  return out.filter((s) => s.b - s.a > 0.04)
}

/* --------------------------------- TOOLS ---------------------------------- */

export const TOOLS = {
  /* ---------------------------------------------------------------- silence */
  silence: {
    id: 'silence',
    titleKey: 'ai.silenceTitle',
    descKey: 'ai.silenceDesc',
    params: [
      { id: 'sensitivity', labelKey: 'ai.sensitivity', type: 'range', min: 10, max: 95, step: 1, def: 60 },
      { id: 'minSilence', labelKey: 'ai.minSilence', type: 'range', min: 0.15, max: 2, step: 0.05, def: 0.4, unit: 's' },
      { id: 'padding', labelKey: 'ai.cutPadding', type: 'range', min: 0, max: 0.4, step: 0.01, def: 0.08, unit: 's' },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = videoClips(project, getState().ui.selection).filter((c) => c.media.hasAudio)
      if (!cands.length) throw new Error('no-audio-clip')
      let removed = 0
      let saved = 0
      const perClip = cands.length
      for (let i = 0; i < perClip; i++) {
        const { clip, media } = cands[i]
        log(`تحليل الصوت: ${media.name}`)
        const buf = await bufferFor(media)
        const silences = audio.detectSilence(media.id, {
          sensitivity: params.sensitivity,
          minSilence: params.minSilence,
          padding: params.padding,
        })
        const speed = clip.speed || 1
        const srcA = clip.srcStart || 0
        const srcB = (clip.srcEnd ?? srcA + clip.duration * speed) || buf.duration
        const gaps = silences
          .map((s) => ({ a: s.start, b: s.end }))
          .filter((s) => s.b > srcA && s.a < srcB)
          .map((s) => ({ a: Math.max(srcA, s.a), b: Math.min(srcB, s.b) }))
        const keep = complement(gaps, srcA, srcB)
        saved += gaps.reduce((acc, g) => acc + (g.b - g.a), 0)
        removed += gaps.length
        log(`${gaps.length} سكتة → ${keep.length} مقطع`)
        A.replaceTimeline((p) => {
          const tr = p.tracks.find((t) => t.id === clip.trackId)
          const c = tr?.clips.find((x) => x.id === clip.id)
          if (!tr || !c) return p
          rebuildTrack(tr, c, keep, { speed })
          return p
        })
        progress((i + 1) / perClip)
      }
      return { summary: `silences:${removed}`, detail: { removed, saved } }
    },
  },

  /* ----------------------------------------------------------------- scenes */
  scenes: {
    id: 'scenes',
    titleKey: 'ai.scenesTitle',
    descKey: 'ai.scenesDesc',
    params: [
      { id: 'sensitivity', labelKey: 'ai.sensitivity', type: 'range', min: 10, max: 95, step: 1, def: 55 },
      { id: 'apply', labelKey: 'ai.apply', type: 'toggle', def: true },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = videoClips(project, getState().ui.selection)
      if (!cands.length) throw new Error('no-video-clip')
      const { clip, media } = cands[0]
      const url = media.url || urlFor(media.id)
      log(`تحليل المشاهد: ${media.name}`)
      const { cuts } = await analysis.detectScenes(url, { sensitivity: params.sensitivity, onProgress: progress })
      log(`${cuts.length} قطع مشهد مكتشف`)
      const speed = clip.speed || 1
      const srcA = clip.srcStart || 0
      const srcB = clip.srcEnd ?? srcA + clip.duration * speed
      const points = cuts.filter((c) => c > srcA + 0.2 && c < srcB - 0.2)
      if (params.apply && points.length) {
        const segs = []
        let cursor = srcA
        for (const p of points) {
          segs.push({ a: cursor, b: p })
          cursor = p
        }
        segs.push({ a: cursor, b: srcB })
        A.replaceTimeline((p2) => {
          const tr = p2.tracks.find((t) => t.id === clip.trackId)
          const c = tr?.clips.find((x) => x.id === clip.id)
          if (tr && c) rebuildTrack(tr, c, segs, { speed })
          return p2
        })
      }
      A.setAnalysis({ cuts: points })
      return { summary: `scenes:${points.length}`, detail: { cuts: points } }
    },
  },

  /* ------------------------------------------------------------------ beats */
  beats: {
    id: 'beats',
    titleKey: 'ai.beatTitle',
    descKey: 'ai.beatDesc',
    params: [
      { id: 'sensitivity', labelKey: 'ai.sensitivity', type: 'range', min: 10, max: 95, step: 1, def: 50 },
      { id: 'apply', labelKey: 'ai.apply', type: 'toggle', def: true },
      { id: 'every', labelKey: 'ai.autoFxAmount', type: 'range', min: 1, max: 8, step: 1, def: 2 },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = audioClips(project, getState().ui.selection).filter((c) => c.media.kind === 'audio' || c.media.hasAudio)
      if (!cands.length) throw new Error('no-audio')
      const target = cands.find((c) => c.track.kind === 'audio') || cands[0]
      const buf = await bufferFor(target.media)
      progress(0.4)
      const { beats, bpm } = audio.detectBeats(target.media.id, { sensitivity: params.sensitivity })
      log(`${beats.length} نبضة · ${bpm || '—'} BPM`)
      progress(0.7)
      const t0 = target.clip.srcStart || 0
      const times = beats
        .map((b) => target.clip.start + (b - t0) / (target.clip.speed || 1))
        .filter((t) => t > 0 && t < totalDuration(project))
        .filter((_, i) => i % Math.max(1, params.every) === 0)
      A.setAnalysis({ beats, bpm })
      if (params.apply) {
        const markers = times.map((t, i) => ({ id: uid('mk'), t: +t.toFixed(3), label: `♪${i + 1}`, kind: 'beat' }))
        A.replaceTimeline((p) => {
          p.markers = [...(p.markers || []).filter((m) => m.kind !== 'beat'), ...markers].sort((a, b) => a.t - b.t)
          // split video clips on the beat grid so cuts land on the music
          for (const track of p.tracks) {
            if (track.kind !== 'video' && track.kind !== 'overlay') continue
            for (const clip of [...track.clips]) {
              if (!clip.mediaId) continue
              const inside = times.filter((t) => t > clip.start + 0.12 && t < clip.start + clip.duration - 0.12)
              if (!inside.length) continue
              for (const t of inside) {
                const created = require_split(track, clip, t)
                void created
              }
            }
          }
          return p
        })
      }
      progress(1)
      return { summary: `beats:${times.length}`, detail: { beats: times.length, bpm } }
    },
  },

  /* ---------------------------------------------------------------- reframe */
  reframe: {
    id: 'reframe',
    titleKey: 'ai.reframeTitle',
    descKey: 'ai.reframeDesc',
    params: [
      { id: 'aspect', labelKey: 'ai.style', type: 'select', def: '9:16', options: ['9:16', '1:1', '4:5'] },
      { id: 'setFormat', labelKey: 'ai.apply', type: 'toggle', def: true },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = videoClips(project, getState().ui.selection)
      if (!cands.length) throw new Error('no-video-clip')
      if (params.setFormat) {
        const [aw, ah] = params.aspect.split(':').map(Number)
        const long = Math.max(project.width, project.height)
        const width = aw >= ah ? long : Math.round((long * aw) / ah)
        const height = aw >= ah ? Math.round((long * ah) / aw) : long
        A.setProjectFormat({ width, height, aspect: params.aspect })
      }
      let processed = 0
      for (const { clip, media } of cands) {
        const url = media.url || urlFor(media.id)
        log(`تتبع الهدف: ${media.name}`)
        const path = await analysis.reframePath(url, { samples: 40, onProgress: (p) => progress((processed + p) / cands.length) })
        const W = getState().project.width
        const H = getState().project.height
        const sw = media.width || 16
        const sh = media.height || 9
        // how much wider the scaled image is than the canvas (cover fit)
        const ratio = sw / sh
        const canvasRatio = W / H
        // for a cover fit the scaled image is wider than the canvas by this factor
        const overflow = ratio > canvasRatio ? (ratio * H) / W - 1 : 0
        const kf = []
        path.forEach((p) => {
          const norm = path.length > 1 ? p.t / Math.max(0.001, path[path.length - 1].t) : 0
          const limit = Math.max(0, overflow) * 50
          const xPct = Math.max(-limit, Math.min(limit, -((p.x - 0.5) * (overflow + 1) * 100)))
          kf.push([+norm.toFixed(4), +xPct.toFixed(3)])
        })
        A.updateClip(clip.id, (c) => ({
          kf: { ...(c.kf || {}), x: kf },
          transform: { ...c.transform, fit: 'cover', scale: 104 },
        }))
        processed++
      }
      A.setAnalysis({ reframe: cands.map((c) => c.clip.id) })
      return { summary: `reframe:${processed}`, detail: { segments: processed } }
    },
  },

  /* ---------------------------------------------------------------- enhance */
  enhance: {
    id: 'enhance',
    titleKey: 'ai.enhanceTitle',
    descKey: 'ai.enhanceDesc',
    params: [{ id: 'strength', labelKey: 'ai.voiceAmount', type: 'range', min: 20, max: 140, step: 5, def: 100 }],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = videoClips(project, getState().ui.selection)
      if (!cands.length) throw new Error('no-video-clip')
      let i = 0
      for (const { clip, media } of cands) {
        const url = media.url || urlFor(media.id)
        log(`قياس الألوان: ${media.name}`)
        const { adj, stats } = await analysis.autoEnhance(url, { samples: 12, onProgress: (p) => progress((i + p) / cands.length) })
        const k = params.strength / 100
        const scaled = {}
        for (const [key, v] of Object.entries(adj)) scaled[key] = +(v * k).toFixed(2)
        A.updateClip(clip.id, (c) => ({ fx: { ...DEFAULT_ADJ, ...(c.fx || {}), ...scaled } }))
        log(`سطوع ${stats?.luma ?? '—'} → تصحيح تلقائي`)
        i++
      }
      return { summary: `enhance:${cands.length}`, detail: { clips: cands.length } }
    },
  },

  /* --------------------------------------------------------------- captions */
  captions: {
    id: 'captions',
    titleKey: 'ai.captionsTitle',
    descKey: 'ai.captionsDesc',
    params: [
      { id: 'text', labelKey: 'ai.scriptText', type: 'textarea', def: '' },
      { id: 'wpm', labelKey: 'ai.wpm', type: 'range', min: 90, max: 220, step: 5, def: 155 },
      { id: 'alignSpeech', labelKey: 'ai.autoTime', type: 'toggle', def: true },
      { id: 'style', labelKey: 'ai.style', type: 'select', def: 'caption-pill', options: ['caption-yt', 'caption-pill', 'caption-karaoke', 'minimal'] },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const lines = String(params.text || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (!lines.length) {
        // fall back to the project's title clips so the tool never fails silently
        const tclips = project.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips)
        tclips.forEach((c) => lines.push(c.text.content))
        if (!lines.length) throw new Error('no-text')
      }
      // speech segments help place the cues where the voice actually is
      let speech = null
      if (params.alignSpeech) {
        const cands = audioClips(project, getState().ui.selection)
        if (cands.length) {
          try {
            const c = cands[0]
            const buf = await bufferFor(c.media)
            const sil = audio.detectSilence(c.media.id, { sensitivity: 70, minSilence: 0.45, padding: 0.02 })
            const speed = c.clip.speed || 1
            const srcA = c.clip.srcStart || 0
            const srcB = c.clip.srcEnd ?? srcA + c.clip.duration * speed
            speech = complement(
              sil.map((s) => ({ a: s.start, b: s.end })),
              srcA,
              srcB,
            ).map((s) => ({
              start: c.clip.start + (s.a - srcA) / speed,
              end: c.clip.start + (s.b - srcA) / speed,
            }))
          } catch {
            speech = null
          }
        }
      }
      progress(0.6)
      const cues = timeCues(lines, { wpm: params.wpm, speech })
      log(`${cues.length} كابشن`)
      A.setCaptions(cues)
      const preset = params.style
      const presetMap = {
        'caption-yt': { size: 4.4, strokeW: 4, bg: false, anim: 'fade', uppercase: false },
        'caption-pill': { size: 4.2, strokeW: 0, bg: true, anim: 'pop', uppercase: false },
        'caption-karaoke': { size: 5.2, strokeW: 5, bg: false, anim: 'karaoke', uppercase: true, karaoke: true },
        minimal: { size: 4.6, strokeW: 0, bg: false, anim: 'fadeUp', uppercase: false },
      }
      A.setCaptionStyle({ ...presetMap[preset], highlight: '#5ee7ff' })
      progress(1)
      return { summary: `captions:${cues.length}`, detail: { cues: cues.length, speech: !!speech } }
    },
  },

  /* -------------------------------------------------------------- highlight */
  highlight: {
    id: 'highlight',
    titleKey: 'ai.highlightTitle',
    descKey: 'ai.highlightDesc',
    params: [
      { id: 'length', labelKey: 'ai.highlightLen', type: 'range', min: 10, max: 180, step: 5, def: 30, unit: 's' },
      { id: 'minSeg', labelKey: 'ai.minSilence', type: 'range', min: 1, max: 8, step: 0.5, def: 2.5, unit: 's' },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = videoClips(project, getState().ui.selection).filter((c) => c.media.hasAudio)
      if (!cands.length) throw new Error('no-audio-clip')
      const { clip, media } = cands[0]
      const buf = await bufferFor(media)
      progress(0.25)
      const windows = energyWindows(buf, 0.5)
      // combine with scene changes for better boundaries
      let cuts = []
      try {
        const url = media.url || urlFor(media.id)
        const res = await analysis.detectScenes(url, { sensitivity: 55, onProgress: (p) => progress(0.25 + p * 0.45) })
        cuts = res.cuts
      } catch {
        /* scene detection is optional */
      }
      const speed = clip.speed || 1
      const srcA = clip.srcStart || 0
      const srcB = clip.srcEnd ?? srcA + clip.duration * speed
      const picked = pickSegments(windows, cuts, {
        target: params.length,
        minSeg: params.minSeg,
        min: srcA,
        max: srcB,
      })
      log(`${picked.length} لحظة قوية · ${picked.reduce((a, s) => a + (s.b - s.a), 0).toFixed(1)} ثانية`)
      progress(0.8)
      A.replaceTimeline((p) => {
        const tr = p.tracks.find((t) => t.id === clip.trackId)
        const c = tr?.clips.find((x) => x.id === clip.id)
        if (tr && c) rebuildTrack(tr, c, picked, { speed })
        return p
      })
      A.setAnalysis({ highlight: picked })
      return { summary: `highlight:${picked.length}`, detail: { segments: picked.length, seconds: picked.reduce((a, s) => a + (s.b - s.a), 0) } }
    },
  },

  /* -------------------------------------------------------------- thumbnail */
  thumbnail: {
    id: 'thumbnail',
    titleKey: 'ai.thumbTitle',
    descKey: 'ai.thumbDesc',
    params: [
      { id: 'title', labelKey: 'ai.cardTitle', type: 'text', def: '' },
      { id: 'addClip', labelKey: 'ai.thumbUse', type: 'toggle', def: false },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = videoClips(project, getState().ui.selection)
      if (!cands.length) throw new Error('no-video-clip')
      const { clip, media } = cands[0]
      const url = media.url || urlFor(media.id)
      log('ترتيب الإطارات…')
      const best = await analysis.bestThumbnails(url, { count: 24, top: 4, onProgress: progress })
      if (best.length) {
        A.updateClip(clip.id, { poster: best[0].dataUrl })
      }
      let added = null
      if (params.addClip && best.length) {
        const blob = await dataUrlToBlob(best[0].dataUrl)
        const meta = await registerGenerated(`${media.name}-poster`, blob, 'image')
        A.addMedia([meta])
        const newClip = A.addMediaToTimeline(meta.id, { at: 0, duration: 2.2 })
        added = newClip?.id || null
        if (params.title) {
          A.addTextClip({ start: 0, duration: 2.2, text: params.title, style: { size: 8, anim: 'pop' } })
        }
      }
      return { summary: `thumbnail:${best.length}`, detail: { candidates: best.length, added } }
    },
  },

  /* ------------------------------------------------------------------ voice */
  voice: {
    id: 'voice',
    titleKey: 'ai.voiceTitle',
    descKey: 'ai.voiceDesc',
    params: [
      { id: 'profile', labelKey: 'ai.voiceProfile', type: 'select', def: 'clean', options: VOICE_PRESETS.map((v) => v.id) },
      { id: 'amount', labelKey: 'ai.voiceAmount', type: 'range', min: 20, max: 140, step: 5, def: 100 },
    ],
    async run({ params, log }) {
      const preset = VOICE_PRESETS.find((p) => p.id === params.profile) || VOICE_PRESETS[1]
      const k = params.amount / 100
      const fx = {}
      for (const [key, v] of Object.entries(preset.fx || {})) {
        fx[key] = typeof v === 'number' ? +(v * k).toFixed(2) : v
      }
      log(`معالجة صوتية: ${preset.name.ar} (${params.amount}%)`)
      A.replaceTimeline((p) => {
        for (const t of p.tracks) {
          for (const c of t.clips) {
            if (!c.mediaId) continue
            const m = p.media.find((x) => x.id === c.mediaId)
            if (!m?.hasAudio && m?.kind !== 'audio') continue
            c.audio = { ...(c.audio || {}), voiceFx: { preset: preset.id, amount: params.amount, fx } }
          }
        }
        return p
      })
      engine.syncAssets()
      return { summary: `voice:${preset.id}`, detail: { preset: preset.id } }
    },
  },

  /* ----------------------------------------------------------------- autofx */
  autofx: {
    id: 'autofx',
    titleKey: 'ai.autoFxTitle',
    descKey: 'ai.autoFxDesc',
    params: [
      { id: 'amount', labelKey: 'ai.autoFxAmount', type: 'range', min: 20, max: 150, step: 10, def: 70 },
      { id: 'style', labelKey: 'ai.style', type: 'select', def: 'punch', options: ['punch', 'kenburns', 'pulse', 'shake'] },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = videoClips(project, getState().ui.selection)
      if (!cands.length) throw new Error('no-video-clip')
      const k = params.amount / 100
      let i = 0
      for (const { clip, media } of cands) {
        let strong = []
        try {
          const buf = await bufferFor(media)
          const windows = energyWindows(buf, 0.4)
          const speed = clip.speed || 1
          const srcA = clip.srcStart || 0
          strong = windows
            .filter((w) => w.energy > 0.045)
            .slice(0, 24)
            .map((w) => (clip.start + (w.t - srcA) / speed))
            .filter((t) => t > clip.start && t < clip.start + clip.duration)
        } catch {
          strong = []
        }
        if (!strong.length) {
          // spread a few punch-ins evenly
          const n = Math.max(2, Math.round(clip.duration / 4))
          for (let j = 0; j < n; j++) strong.push(clip.start + (clip.duration * (j + 0.5)) / n)
        }
        const groups = []
        for (const t of strong) {
          const last = groups[groups.length - 1]
          if (last && t - last[last.length - 1] < 1.2) last.push(t)
          else groups.push([t])
        }
        const kfScale = []
        for (const g of groups) {
          const base = (g[0] - clip.start) / clip.duration
          const zoom = 1.03 + 0.07 * k
          kfScale.push([+Math.max(0, base - 0.02).toFixed(4), 1])
          kfScale.push([+Math.min(1, base + 0.08).toFixed(4), +zoom.toFixed(3)])
          kfScale.push([+Math.min(1, base + 0.55).toFixed(4), 1])
        }
        kfScale.sort((a, b) => a[0] - b[0])
        if (params.style === 'shake') {
          A.updateClip(clip.id, (c) => ({
            kf: { ...(c.kf || {}), x: [[0, 0], [0.25, -1.2 * k], [0.5, 1.2 * k], [0.75, -0.8 * k], [1, 0]] },
          }))
        } else if (params.style === 'kenburns') {
          A.updateClip(clip.id, (c) => ({ kf: { ...(c.kf || {}), scale: [[0, 1], [1, +(1.1 + 0.08 * k).toFixed(3)]] } }))
        } else {
          A.updateClip(clip.id, (c) => ({ kf: { ...(c.kf || {}), scale: kfScale } }))
        }
        log(`مؤثرات تلقائية: ${media.name} (${groups.length})`)
        i++
        progress(i / cands.length)
      }
      return { summary: `autofx:${cands.length}`, detail: { clips: cands.length } }
    },
  },

  /* ----------------------------------------------------------------- chroma */
  chroma: {
    id: 'chroma',
    titleKey: 'ai.chromaTitle',
    descKey: 'ai.chromaDesc',
    params: [
      { id: 'coverage', labelKey: 'ai.voiceAmount', type: 'range', min: 10, max: 90, step: 5, def: 45 },
    ],
    async run({ params, progress, log }) {
      const project = getState().project
      const cands = videoClips(project, getState().ui.selection)
      if (!cands.length) throw new Error('no-video-clip')
      let i = 0
      for (const { clip, media } of cands) {
        const url = media.url || urlFor(media.id)
        const dom = await analysis.dominantEdgesColor(url, { samples: 8 })
        progress((i + 1) / cands.length)
        i++
        if (!dom) continue
        log(`اللون المستهدف ${dom.hex} (ثقة ${(dom.confidence * 100).toFixed(0)}%)`)
        A.updateClip(clip.id, (c) => ({
          fx: {
            ...DEFAULT_ADJ,
            ...(c.fx || {}),
            key: { enabled: true, color: dom.hex, similarity: params.coverage, smooth: 12, spill: 40 },
          },
        }))
      }
      return { summary: `chroma:${cands.length}`, detail: { clips: cands.length } }
    },
  },

  /* ----------------------------------------------------------------- writer */
  writer: {
    id: 'writer',
    titleKey: 'ai.writerTitle',
    descKey: 'ai.writerDesc',
    params: [
      { id: 'tone', labelKey: 'ai.tone', type: 'select', def: 'youtube', options: ['youtube', 'tiktok', 'edu', 'sales', 'vlog'] },
    ],
    async run({ params, log }) {
      const state = getState()
      const project = state.project
      const transcript =
        project.analysis?.transcript ||
        project.tracks
          .filter((t) => t.kind === 'text')
          .flatMap((t) => t.clips.map((c) => c.text.content))
          .join(' ') ||
        project.captions.map((c) => c.text).join(' ')
      const copy = generateCopy({
        tone: params.tone,
        transcript,
        projectName: project.name,
        clips: project.tracks.find((t) => t.kind === 'video')?.clips || [],
        lang: state.ui.lang || (document.documentElement.lang === 'en' ? 'en' : 'ar'),
        duration: totalDuration(project),
      })
      log(`تم توليد ${copy.titles.length} عنوان + وصف + هاشتاجات`)
      A.setAnalysis({ copy })
      return { summary: `writer:${copy.titles.length}`, detail: copy }
    },
  },

  /* ------------------------------------------------------------------ music */
  music: {
    id: 'music',
    titleKey: 'ai.assetsTitle',
    descKey: 'ai.assetsDesc',
    params: [
      { id: 'style', labelKey: 'ai.musicStyle', type: 'select', def: 'uplift', options: MUSIC_STYLES.map((s) => s.id) },
      { id: 'length', labelKey: 'ai.musicLen', type: 'range', min: 10, max: 180, step: 5, def: 45, unit: 's' },
      { id: 'volume', labelKey: 'insp.clipVolume', type: 'range', min: 5, max: 100, step: 5, def: 55 },
    ],
    async run({ params, progress, log }) {
      const style = MUSIC_STYLES.find((s) => s.id === params.style) || MUSIC_STYLES[0]
      log(`توليد موسيقى: ${style.name.ar} · ${params.length}s`)
      const blob = await audio.generateMusic(style, params.length, { onProgress: (p) => progress(p * 0.95) })
      const meta = await registerGenerated(`موسيقى ${style.name.ar}`, blob, 'audio', { style: style.id })
      A.addMedia([meta])
      const clip = A.addMediaToTimeline(meta.id, { duration: params.length })
      if (clip) A.updateClip(clip.id, (c) => ({ audio: { ...c.audio, volume: params.volume / 100, fadeIn: 1.5, fadeOut: 3 } }))
      A.updateSettings({ ducking: true })
      progress(1)
      toast('toast.musicGen', 'ok')
      return { summary: `music:${style.id}`, detail: { duration: params.length } }
    },
  },

  /* -------------------------------------------------------------- titlecard */
  titlecard: {
    id: 'titlecard',
    titleKey: 'ai.generateTitleCard',
    descKey: 'media.genCardDesc',
    params: [
      { id: 'title', labelKey: 'ai.cardTitle', type: 'text', def: '' },
      { id: 'subtitle', labelKey: 'ai.cardSubtitle', type: 'text', def: '' },
      { id: 'theme', labelKey: 'ai.style', type: 'range', min: 0, max: 4, step: 1, def: 0 },
      { id: 'duration', labelKey: 'ai.musicLen', type: 'range', min: 1, max: 8, step: 0.5, def: 3, unit: 's' },
    ],
    async run({ params, log }) {
      const project = getState().project
      const title = params.title || project.name
      log(`كارت عنوان: ${title}`)
      const blob = await makeTitleCard({ title, subtitle: params.subtitle, theme: params.theme, width: project.width, height: project.height })
      const meta = await registerGenerated(`كارت: ${title}`, blob, 'image')
      A.addMedia([meta])
      A.addMediaToTimeline(meta.id, { at: 0, duration: params.duration })
      return { summary: 'titlecard', detail: { title } }
    },
  },
}

/* helper used by the beats tool (splitting without importing model helpers twice) */
function require_split(track, clip, t) {
  const leftDur = t - clip.start
  if (leftDur < 0.08 || clip.duration - leftDur < 0.08) return null
  const right = JSON.parse(JSON.stringify(clip))
  right.id = uid('clip')
  right.start = t
  right.duration = clip.duration - leftDur
  if (right.srcStart != null) right.srcStart = clip.srcStart + leftDur * (clip.speed || 1)
  clip.duration = leftDur
  if (clip.srcEnd != null) clip.srcEnd = clip.srcStart + clip.duration * (clip.speed || 1)
  track.clips.push(right)
  sortClips(track)
  return right
}

/* ------------------------------- sub tools -------------------------------- */

/** Cue list from text lines, optionally aligned to detected speech windows. */
export function timeCues(lines, { wpm = 155, speech = null, start = 0 } = {}) {
  const cues = []
  if (speech && speech.length) {
    const totalSpeech = speech.reduce((a, s) => a + (s.end - s.start), 0)
    const totalChars = lines.reduce((a, l) => a + l.length, 0) || 1
    let si = 0
    let cursor = speech[0].start
    let remaining = speech[0].end - speech[0].start
    for (const line of lines) {
      const need = (line.length / totalChars) * totalSpeech
      let left = need
      const cue = { id: uid('cap'), start: +cursor.toFixed(3), end: +(cursor + need).toFixed(3), text: line }
      while (left > remaining && si < speech.length - 1) {
        left -= remaining
        si++
        cursor = speech[si].start
        remaining = speech[si].end - speech[si].start
        cue.end = +(cursor + left).toFixed(3)
      }
      remaining -= need
      cursor += need
      if (cue.end <= cue.start) cue.end = +(cue.start + 0.8).toFixed(3)
      cues.push(cue)
    }
    return cues
  }
  const perChar = 60 / Math.max(60, wpm) / 5 // ~5 chars per word
  let t = start
  for (const line of lines) {
    const dur = Math.max(1.1, line.length * perChar)
    cues.push({ id: uid('cap'), start: +t.toFixed(3), end: +(t + dur).toFixed(3), text: line })
    t += dur + 0.12
  }
  return cues
}

/** Short-time energy envelope (for highlight / autofx). */
export function energyWindows(buf, win = 0.5) {
  const sr = buf.sampleRate
  const step = Math.floor(sr * win)
  const mono = buf.getChannelData(0)
  const out = []
  for (let i = 0; i + step < buf.length; i += step) {
    let sum = 0
    for (let j = i; j < i + step; j += 8) sum += mono[j] * mono[j]
    const rms = Math.sqrt(sum / (step / 8))
    out.push({ t: i / sr, energy: rms })
  }
  const max = out.reduce((a, w) => Math.max(a, w.energy), 0) || 1
  out.forEach((w) => (w.n = w.energy / max))
  return out
}

/** Pick highlight segments from energy + scene boundaries. */
export function pickSegments(windows, cuts, { target = 30, minSeg = 2.5, min = 0, max = Infinity } = {}) {
  const bounds = new Set([min, ...cuts.filter((c) => c > min && c < max), max])
  const sorted = [...bounds].sort((a, b) => a - b)
  const segs = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (b - a < minSeg) continue
    const inside = windows.filter((w) => w.t >= a && w.t < b)
    const energy = inside.reduce((acc, w) => acc + w.n, 0) / Math.max(1, inside.length)
    segs.push({ a, b, energy })
  }
  if (!segs.length) {
    // fall back to energy windows alone
    const sortedW = [...windows].sort((x, y) => y.n - x.n)
    const picked = []
    for (const w of sortedW) {
      if (picked.length * minSeg >= target) break
      const overlap = picked.some((p) => Math.abs(p.a - w.t) < minSeg * 1.4)
      if (!overlap) picked.push({ a: Math.max(min, w.t), b: Math.min(max, w.t + minSeg), energy: w.n })
    }
    return picked.sort((x, y) => x.a - y.a)
  }
  segs.sort((x, y) => y.energy - x.energy)
  const out = []
  let acc = 0
  for (const s of segs) {
    if (acc >= target) break
    const len = Math.min(s.b - s.a, Math.max(minSeg, target - acc))
    if (len < minSeg * 0.6) continue
    out.push({ a: s.a, b: s.a + len, energy: s.energy })
    acc += len
  }
  return out.sort((x, y) => x.a - y.a)
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/* --------------------------- dictation (mic ASR) --------------------------- */

export function dictationSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * Live dictation → captions. Uses the browser's built-in speech recognition
 * (no cloud service from our side). Returns a controller.
 */
export function startDictation({ lang = 'ar-EG', cursor = 0, onCue, onState, onError } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    onError?.(new Error('not-supported'))
    return null
  }
  const rec = new SR()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = lang
  let base = cursor
  let t0 = performance.now()
  const cues = []
  rec.onstart = () => onState?.('listening')
  rec.onerror = (e) => onError?.(new Error(e.error || 'speech-error'))
  rec.onend = () => onState?.('stopped')
  rec.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i]
      const text = res[0].transcript.trim()
      if (!text) continue
      const now = base + (performance.now() - t0) / 1000
      if (res.isFinal) {
        const last = cues[cues.length - 1]
        const cue = { id: uid('cap'), start: +(last ? last.end : base).toFixed(2), end: +now.toFixed(2), text }
        if (cue.end <= cue.start) cue.end = cue.start + 1.2
        cues.push(cue)
        onCue?.(cue, true)
      } else {
        onCue?.({ start: +now.toFixed(2), end: +now.toFixed(2), text, interim: true }, false)
      }
    }
  }
  rec.start()
  return {
    stop: () => {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    },
    setCursor: (t) => {
      base = t
      t0 = performance.now()
    },
    cues,
  }
}

/* -------------------------------- runner ---------------------------------- */

export async function runTool(id, params, { log = () => {} } = {}) {
  const tool = TOOLS[id]
  if (!tool) throw new Error(`unknown-tool:${id}`)
  const started = performance.now()
  patchUi({ analyzing: id })
  aiRun(id)
  try {
    const result = await tool.run({
      params: { ...defaultsOf(tool), ...params },
      progress: (p) => {
        aiProgress(p)
        setAnalysisProgress(p)
      },
      log,
    })
    const ms = Math.round(performance.now() - started)
    aiLog({ tool: id, ok: true, ms, summary: result?.summary })
    return { ...result, ms }
  } catch (err) {
    aiLog({ tool: id, ok: false, error: String(err.message || err) })
    throw err
  } finally {
    patchUi({ analyzing: null })
    aiFinish(null)
  }
}

function defaultsOf(tool) {
  const out = {}
  for (const p of tool.params || []) out[p.id] = p.def
  return out
}

let progressSetter = null
export function setProgressHandler(fn) {
  progressSetter = fn
}
function setAnalysisProgress(p) {
  progressSetter?.(p)
}
