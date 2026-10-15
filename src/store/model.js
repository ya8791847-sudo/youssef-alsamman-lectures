/**
 * Project / clip / track model + pure helpers.
 * A project is a plain JSON object — easy to persist in IndexedDB or export.
 */

import { DEFAULT_ADJ } from '../engine/presets.js'

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`

export function newTrack(kind, name) {
  return {
    id: uid('trk'),
    kind, // video | overlay | text | audio
    name,
    clips: [],
    muted: false,
    solo: false,
    hidden: false,
    locked: false,
    volume: 1,
  }
}

export function newTextClip({ trackId, start = 0, duration = 3, text = 'النص هنا', style = {} } = {}) {
  return {
    id: uid('clip'),
    kind: 'text',
    trackId,
    name: text.slice(0, 24) || 'Text',
    start,
    duration,
    text: {
      content: text,
      font: 'Cairo',
      size: 7,
      weight: 800,
      color: '#ffffff',
      stroke: '#000000',
      strokeW: 0,
      shadow: 18,
      bg: false,
      bgColor: '#0b1220',
      bgAlpha: 0.7,
      radius: 12,
      align: 'center',
      anim: 'pop',
      x: 50,
      y: 50,
      uppercase: false,
      spacing: 0,
      lineHeight: 1.28,
      maxWidth: 86,
      highlight: '#5ee7ff',
      ...style,
    },
    transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, fit: 'cover' },
    fx: { ...DEFAULT_ADJ },
    transitions: { in: { type: 'none', dur: 0.4 }, out: { type: 'none', dur: 0.4 } },
    audio: { volume: 1, pan: 0, fadeIn: 0, fadeOut: 0, voiceFx: { preset: 'none', amount: 50, fx: {} } },
    kf: {},
  }
}

export function newMediaClip({ media, trackId, start = 0, srcStart = 0, duration = null } = {}) {
  const dur = duration ?? Math.max(0.5, (media.duration || 5) - srcStart)
  return {
    id: uid('clip'),
    kind: media.kind,
    trackId,
    mediaId: media.id,
    name: media.name,
    start,
    duration: dur,
    srcStart,
    srcEnd: srcStart + dur,
    speed: 1,
    reversed: false,
    transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, fit: 'cover' },
    fx: { ...DEFAULT_ADJ },
    transitions: { in: { type: 'none', dur: 0.4 }, out: { type: 'none', dur: 0.4 } },
    audio: { volume: 1, pan: 0, fadeIn: 0, fadeOut: 0, voiceFx: { preset: 'none', amount: 50, fx: {} } },
    kf: {},
    poster: media.poster || null,
  }
}

export function newProject({ name = 'مشروع جديد', width = 1920, height = 1080, fps = 30, aspect = '16:9' } = {}) {
  return {
    id: uid('prj'),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    width,
    height,
    fps,
    aspect,
    tracks: [
      newTrack('video', 'فيديو'),
      newTrack('overlay', 'طبقة عليا'),
      newTrack('text', 'نصوص'),
      newTrack('audio', 'صوت'),
    ],
    media: [], // metadata only (blobs live in IndexedDB)
    captions: [],
    captionStyle: {
      font: 'Cairo',
      size: 4.4,
      weight: 800,
      color: '#ffffff',
      stroke: '#000000',
      strokeW: 4,
      shadow: 12,
      bg: false,
      bgColor: '#0b1220',
      bgAlpha: 0.72,
      radius: 14,
      align: 'center',
      anim: 'fadeUp',
      x: 50,
      y: 84,
      uppercase: false,
      spacing: 0,
      lineHeight: 1.3,
      maxWidth: 88,
      highlight: '#5ee7ff',
      karaoke: false,
    },
    settings: {
      backgroundColor: '#000000',
      background: 'color', // color | blur
      masterVolume: 1,
      letterbox: 0,
      grain: 0,
      vignette: 0,
      burnCaptions: true,
      progressBar: false,
      progressBarColor: '#5ee7ff',
      progressBarThickness: 0.7,
      watermark: { enabled: false, text: '', pos: 'br', opacity: 0.5, size: 4 },
      ducking: false,
      normalize: false,
      outputMute: false,
    },
    markers: [],
    analysis: { cuts: [], beats: [], bpm: 0, silences: [], reframe: null, transcript: '', thumbnails: [] },
  }
}

/** Ensure a project loaded from storage has every field of the current model. */
export function normalizeProject(p) {
  const base = newProject()
  const out = { ...base, ...p }
  out.settings = { ...base.settings, ...(p.settings || {}) }
  out.settings.watermark = { ...base.settings.watermark, ...(p.settings?.watermark || {}) }
  out.captionStyle = { ...base.captionStyle, ...(p.captionStyle || {}) }
  out.analysis = { ...base.analysis, ...(p.analysis || {}) }
  out.captions = p.captions || []
  out.markers = p.markers || []
  out.media = p.media || []
  out.tracks = (p.tracks || base.tracks).map((t) => ({
    ...newTrack(t.kind, t.name),
    ...t,
    clips: (t.clips || []).map((c) => ({
      ...c,
      transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, fit: 'cover', ...(c.transform || {}) },
      fx: { ...DEFAULT_ADJ, ...(c.fx || {}) },
      transitions: {
        in: { type: 'none', dur: 0.4, ...(c.transitions?.in || {}) },
        out: { type: 'none', dur: 0.4, ...(c.transitions?.out || {}) },
      },
      audio: { volume: 1, pan: 0, fadeIn: 0, fadeOut: 0, voiceFx: { preset: 'none', amount: 50, fx: {} }, ...(c.audio || {}) },
      kf: c.kf || {},
    })),
  }))
  return out
}

/* ------------------------------- queries ---------------------------------- */

export function allClips(project) {
  return project.tracks.flatMap((t) => t.clips)
}

export function findClip(project, clipId) {
  for (const t of project.tracks) {
    const c = t.clips.find((x) => x.id === clipId)
    if (c) return { clip: c, track: t }
  }
  return { clip: null, track: null }
}

export function trackOf(project, trackId) {
  return project.tracks.find((t) => t.id === trackId) || null
}

export function mediaById(project, id) {
  return project.media.find((m) => m.id === id) || null
}

export function totalDuration(project) {
  let end = 0
  for (const t of project.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration)
  for (const cap of project.captions) end = Math.max(end, cap.end)
  return Math.max(end, 1)
}

/** Clips that would overlap [start, start+duration) on a track (excluding one id). */
export function overlapping(track, start, duration, exceptId = null) {
  return track.clips.filter((c) => c.id !== exceptId && start < c.start + c.duration - 1e-4 && c.start < start + duration - 1e-4)
}

/**
 * Place a clip on the track without overlapping: trim the neighbours so the
 * new clip always wins. Expects `track.clips` to already contain the others.
 */
export function placeClip(track, clip) {
  const hits = overlapping(track, clip.start, clip.duration, clip.id)
  for (const other of hits) {
    const aStart = other.start
    const aEnd = other.start + other.duration
    const bStart = clip.start
    const bEnd = clip.start + clip.duration
    const speed = other.speed || 1

    if (bStart <= aStart && bEnd >= aEnd) {
      // fully covered → drop the neighbour
      other.remove = true
    } else if (bStart <= aStart) {
      // overlaps the head → keep the tail
      const delta = bEnd - aStart
      other.start = bEnd
      other.duration = aEnd - bEnd
      if (other.srcStart != null) other.srcStart += delta * speed
      if (other.srcEnd != null) other.srcEnd = other.srcStart + other.duration * speed
    } else if (bEnd >= aEnd) {
      // overlaps the tail → keep the head
      other.duration = bStart - aStart
      if (other.srcEnd != null) other.srcEnd = (other.srcStart || 0) + other.duration * speed
    } else {
      // sits inside the neighbour → split it in two
      const right = JSON.parse(JSON.stringify(other))
      right.id = uid('clip')
      right.start = bEnd
      right.duration = aEnd - bEnd
      if (right.srcStart != null) right.srcStart += (bEnd - aStart) * speed
      if (right.srcEnd != null) right.srcEnd = right.srcStart + right.duration * speed
      other.duration = bStart - aStart
      if (other.srcEnd != null) other.srcEnd = (other.srcStart || 0) + other.duration * speed
      track.clips.push(right)
    }
  }
  track.clips = track.clips.filter((c) => !c.remove && c.duration > 0.02)
  track.clips.push(clip)
  sortClips(track)
  return clip
}

export function sortClips(track) {
  track.clips.sort((a, b) => a.start - b.start)
}

export function splitClipAt(project, time, { onlySelected = null } = {}) {
  const created = []
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (onlySelected && onlySelected.length && !onlySelected.includes(clip.id)) continue
      if (time > clip.start + 0.03 && time < clip.start + clip.duration - 0.03) {
        const leftDur = time - clip.start
        const right = JSON.parse(JSON.stringify(clip))
        right.id = uid('clip')
        right.start = time
        right.duration = clip.duration - leftDur
        if (right.srcStart != null) right.srcStart = clip.srcStart + leftDur * (clip.speed || 1)
        if (right.srcEnd != null) right.srcEnd = right.srcStart + right.duration * (right.speed || 1)
        right.transitions = { in: { type: 'none', dur: 0.4 }, out: clip.transitions?.out || { type: 'none', dur: 0.4 } }
        clip.duration = leftDur
        if (clip.srcEnd != null) clip.srcEnd = clip.srcStart + clip.duration * (clip.speed || 1)
        track.clips.push(right)
        sortClips(track)
        created.push(right)
      }
    }
  }
  return created
}

export function deleteClips(project, ids, { ripple = false } = {}) {
  const idSet = new Set(ids)
  for (const track of project.tracks) {
    const removed = track.clips.filter((c) => idSet.has(c.id))
    if (ripple) {
      for (const r of removed.sort((a, b) => a.start - b.start)) {
        for (const c of track.clips) {
          if (c.start >= r.start + r.duration - 1e-4) c.start = Math.max(0, c.start - r.duration)
        }
      }
    }
    track.clips = track.clips.filter((c) => !idSet.has(c.id))
    sortClips(track)
  }
  return project
}

/** Map timeline time → source time inside the clip. */
export function sourceTimeOf(clip, localT) {
  const speed = clip.speed || 1
  if (clip.kind === 'text') return localT
  if (clip.reversed && clip.srcEnd != null) return Math.max(clip.srcStart || 0, (clip.srcEnd ?? 0) - localT * speed)
  return (clip.srcStart || 0) + localT * speed
}

export function clipEnd(clip) {
  return clip.start + clip.duration
}
