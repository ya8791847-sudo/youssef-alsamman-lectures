/**
 * Every timeline/project mutation lives here so undo history stays coherent.
 * Components call these instead of touching the project object directly.
 */

import { commit, getState, patchUi, toast } from './store.js'
import {
  newMediaClip,
  newTextClip,
  newTrack,
  placeClip,
  sortClips,
  splitClipAt,
  deleteClips as removeClipsFromTracks,
  uid,
  totalDuration,
  findClip,
} from './model.js'
import { DEFAULT_ADJ, filterAdjustments } from '../engine/presets.js'

export const ui = {
  select: (ids) => patchUi({ selection: Array.isArray(ids) ? ids : [ids] }),
  selectMedia: (id) => patchUi({ selectedMedia: id }),
  toggleSelect: (id) => {
    const cur = getState().ui.selection
    patchUi({ selection: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
  },
  tab: (tab) => patchUi({ leftTab: tab }),
  rightTab: (tab) => patchUi({ rightTab: tab }),
  zoom: (zoom) => patchUi({ zoom: Math.max(6, Math.min(600, zoom)) }),
  set: patchUi,
}

/* ------------------------------ media pool -------------------------------- */

export function addMedia(mediaList) {
  commit((p) => {
    p.media = [...(p.media || []), ...mediaList]
    return p
  })
}

export function updateMedia(mediaId, patch) {
  commit((p) => {
    const m = p.media.find((x) => x.id === mediaId)
    if (m) Object.assign(m, patch)
    return p
  })
}

export function removeMedia(mediaId) {
  commit((p) => {
    p.media = p.media.filter((m) => m.id !== mediaId)
    for (const t of p.tracks) t.clips = t.clips.filter((c) => c.mediaId !== mediaId)
    return p
  })
}

/** Insert media on the right track, appending at the end by default. */
export function addMediaToTimeline(mediaId, { trackId = null, at = null, duration = null, replaceSelection = false } = {}) {
  const state = getState()
  const p = state.project
  if (!p) return null
  const media = p.media.find((m) => m.id === mediaId)
  if (!media) return null
  const track =
    p.tracks.find((t) => t.id === trackId) ||
    p.tracks.find((t) => t.kind === (media.kind === 'audio' ? 'audio' : media.kind === 'image' ? 'overlay' : 'video'))
  if (!track) return null
  const start = at != null ? Math.max(0, at) : track.clips.reduce((e, c) => Math.max(e, c.start + c.duration), 0)
  const clip = newMediaClip({
    media,
    trackId: track.id,
    start,
    duration: duration ?? (media.kind === 'image' ? 5 : undefined),
    srcStart: 0,
  })
  commit((draft) => {
    const tr = draft.tracks.find((t) => t.id === track.id)
    placeClip(tr, clip)
    return draft
  })
  patchUi({ selection: [clip.id], selectedMedia: mediaId })
  return clip
}

/** Append every media item of a project to its natural track. */
export function addAllMedia() {
  const p = getState().project
  if (!p) return
  const ids = (p.media || []).map((m) => m.id)
  let created = 0
  commit((draft) => {
    for (const id of ids) {
      const media = draft.media.find((m) => m.id === id)
      if (!media) continue
      const kind = media.kind === 'audio' ? 'audio' : media.kind === 'image' ? 'overlay' : 'video'
      const track = draft.tracks.find((t) => t.kind === kind)
      if (!track) continue
      const start = track.clips.reduce((e, c) => Math.max(e, c.start + c.duration), 0)
      const clip = newMediaClip({ media, trackId: track.id, start, duration: media.kind === 'image' ? 5 : undefined })
      track.clips.push(clip)
      sortClips(track)
      created++
    }
    return draft
  })
  if (created) toast(`${created}`, 'ok')
}

/* -------------------------------- clips ----------------------------------- */

export function updateClip(clipId, patch, { silent = false } = {}) {
  commit((p) => {
    const { clip } = findClip(p, clipId)
    if (!clip) return p
    Object.assign(clip, typeof patch === 'function' ? patch(clip) : patch)
    return p
  })
  if (!silent) void 0
}

export function updateClipDeep(clipId, path, value) {
  commit((p) => {
    const { clip } = findClip(p, clipId)
    if (!clip) return p
    const keys = path.split('.')
    let obj = clip
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = obj[keys[i]] || {}
      obj = obj[keys[i]]
    }
    obj[keys[keys.length - 1]] = value
    return p
  })
}

export function updateSelected(patch, path = null) {
  const ids = getState().ui.selection
  commit((p) => {
    for (const id of ids) {
      const { clip } = findClip(p, id)
      if (!clip) continue
      if (!path) Object.assign(clip, typeof patch === 'function' ? patch(clip) : patch)
      else {
        const keys = path.split('.')
        let obj = clip
        for (let i = 0; i < keys.length - 1; i++) {
          obj[keys[i]] = obj[keys[i]] || {}
          obj = obj[keys[i]]
        }
        const last = keys[keys.length - 1]
        obj[last] = typeof patch === 'function' ? patch(obj[last], clip) : patch
      }
    }
    return p
  })
}

export function addTextClip(opts = {}) {
  const p = getState().project
  if (!p) return null
  const track = p.tracks.find((t) => t.kind === 'text') || p.tracks[0]
  const clip = newTextClip({ trackId: track.id, ...opts })
  commit((draft) => {
    const tr = draft.tracks.find((t) => t.id === track.id)
    tr.clips.push(clip)
    sortClips(tr)
    return draft
  })
  patchUi({ selection: [clip.id] })
  return clip
}

export function removeClips(ids = null, { ripple = false } = {}) {
  const target = ids || getState().ui.selection
  if (!target.length) return
  commit((p) => removeClipsFromTracks(p, target, { ripple }))
  patchUi({ selection: [] })
}

export function duplicateClips(ids = null) {
  const target = ids || getState().ui.selection
  if (!target.length) return
  const newIds = []
  commit((p) => {
    for (const t of p.tracks) {
      for (const c of t.clips.filter((x) => target.includes(x.id))) {
        const copy = JSON.parse(JSON.stringify(c))
        copy.id = uid('clip')
        copy.start = c.start + c.duration
        t.clips.push(copy)
        newIds.push(copy.id)
      }
      sortClips(t)
    }
    return p
  })
  patchUi({ selection: newIds })
}

export function splitAt(time, { all = true } = {}) {
  const state = getState()
  const sel = state.ui.selection
  const created = []
  commit((p) => {
    const list = splitClipAt(p, time, all ? {} : { onlySelected: sel })
    created.push(...list)
    return p
  })
  if (created.length) patchUi({ selection: created.map((c) => c.id) })
  return created
}

export function moveClip(clipId, { start, trackId = null }, { history = true } = {}) {
  commit(
    (p) => {
      let clip = null
      let from = null
      for (const t of p.tracks) {
        const c = t.clips.find((x) => x.id === clipId)
        if (c) {
          clip = c
          from = t
          break
        }
      }
      if (!clip) return p
      clip.start = Math.max(0, start)
      if (trackId && trackId !== from.id) {
        const to = p.tracks.find((t) => t.id === trackId)
        if (to && (to.kind === from.kind || (from.kind === 'image' && to.kind === 'overlay'))) {
          from.clips = from.clips.filter((c) => c.id !== clipId)
          clip.trackId = to.id
          placeClip(to, clip)
          sortClips(from)
        }
      } else {
        sortClips(from)
      }
      return p
    },
    { history },
  )
}

export function trimClip(clipId, { start, duration, srcStart = null }, { history = true } = {}) {
  commit(
    (p) => {
      const { clip } = findClip(p, clipId)
      if (!clip) return p
      if (start != null) clip.start = Math.max(0, start)
      if (duration != null) clip.duration = Math.max(0.05, duration)
      if (srcStart != null && clip.mediaId) {
        clip.srcStart = Math.max(0, srcStart)
        clip.srcEnd = clip.srcStart + clip.duration * (clip.speed || 1)
      } else if (clip.mediaId && clip.srcStart != null) {
        clip.srcEnd = clip.srcStart + clip.duration * (clip.speed || 1)
      }
      return p
    },
    { history },
  )
}

export function setClipSpeed(clipId, speed) {
  commit((p) => {
    const { clip } = findClip(p, clipId)
    if (!clip) return p
    const local = Math.max(0.05, speed)
    clip.speed = local
    if (clip.srcStart != null) clip.srcEnd = clip.srcStart + clip.duration * local
    return p
  })
}

export function setTransition(clipId, side, type, dur) {
  commit((p) => {
    const { clip } = findClip(p, clipId)
    if (!clip) return p
    clip.transitions = clip.transitions || {}
    clip.transitions[side] = { type, dur: dur ?? clip.transitions?.[side]?.dur ?? 0.4 }
    return p
  })
}

export function applyFilter(clipIds, filterId) {
  const adj = filterAdjustments(filterId)
  commit((p) => {
    for (const id of clipIds) {
      const { clip } = findClip(p, id)
      if (!clip) continue
      clip.fx = { ...(clip.fx || DEFAULT_ADJ), ...adj }
      clip.filterId = filterId
    }
    return p
  })
}

export function applyMotion(clipIds, kf) {
  commit((p) => {
    for (const id of clipIds) {
      const { clip } = findClip(p, id)
      if (!clip) continue
      clip.kf = { ...(clip.kf || {}), ...JSON.parse(JSON.stringify(kf)) }
    }
    return p
  })
}

export function addKeyframe(clipIds, prop, time, value) {
  commit((p) => {
    for (const id of clipIds) {
      const { clip } = findClip(p, id)
      if (!clip) continue
      const local = Math.max(0, Math.min(clip.duration, time - clip.start))
      const norm = clip.duration ? local / clip.duration : 0
      clip.kf = clip.kf || {}
      const list = (clip.kf[prop] || []).filter(([t]) => Math.abs(t - norm) > 0.008)
      list.push([+norm.toFixed(4), value])
      list.sort((a, b) => a[0] - b[0])
      clip.kf[prop] = list
    }
    return p
  })
}

export function removeKeyframe(clipIds, prop, norm) {
  commit((p) => {
    for (const id of clipIds) {
      const { clip } = findClip(p, id)
      if (!clip?.kf?.[prop]) continue
      clip.kf[prop] = clip.kf[prop].filter(([t]) => Math.abs(t - norm) > 0.008)
      if (!clip.kf[prop].length) delete clip.kf[prop]
    }
    return p
  })
}

export function clearKeyframes(clipIds, prop = null) {
  commit((p) => {
    for (const id of clipIds) {
      const { clip } = findClip(p, id)
      if (!clip) continue
      if (prop) delete clip.kf?.[prop]
      else clip.kf = {}
    }
    return p
  })
}

/** Convert current transform values across keyframes into a static bake. */
export function bakeKeyframes(clipIds) {
  commit((p) => {
    for (const id of clipIds) {
      const { clip } = findClip(p, id)
      if (!clip?.kf) continue
      const kf = clip.kf
      const avg = (list) => (list && list.length ? list.reduce((a, [t, v]) => a + v, 0) / list.length : null)
      clip.transform = clip.transform || {}
      const s = avg(kf.scale)
      if (s != null) clip.transform.scale = Math.round(s * 100)
      const x = avg(kf.x)
      if (x != null) clip.transform.x = x
      const y = avg(kf.y)
      if (y != null) clip.transform.y = y
      const r = avg(kf.rotation)
      if (r != null) clip.transform.rotation = r
      clip.kf = {}
    }
    return p
  })
}

/* -------------------------------- tracks ---------------------------------- */

export function addTrack(kind = 'overlay', name = null) {
  commit((p) => {
    p.tracks.push(newTrack(kind, name || (kind === 'text' ? 'نصوص' : kind === 'audio' ? 'صوت' : 'طبقة')))
    return p
  })
}

export function removeTrack(trackId) {
  commit((p) => {
    p.tracks = p.tracks.filter((t) => t.id !== trackId)
    return p
  })
}

export function toggleTrack(trackId, prop) {
  commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId)
    if (!t) return p
    t[prop] = !t[prop]
    return p
  })
}

export function setTrackVolume(trackId, v) {
  commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId)
    if (t) t.volume = v
    return p
  })
}

/* ------------------------------- captions --------------------------------- */

export function setCaptions(list) {
  commit((p) => {
    p.captions = list
      .map((c) => ({ id: c.id || uid('cap'), start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: c.text, words: c.words || null }))
      .sort((a, b) => a.start - b.start)
    return p
  })
}

export function addCaption(cue = {}) {
  const p = getState().project
  const t = getState().ui.playhead ?? 0
  const cue2 = { id: uid('cap'), start: cue.start ?? t, end: cue.end ?? t + 2.4, text: cue.text ?? 'نص الكابشن', ...cue }
  commit((draft) => {
    draft.captions = [...draft.captions, cue2].sort((a, b) => a.start - b.start)
    return draft
  })
  return cue2
}

export function updateCaption(id, patch) {
  commit((p) => {
    const c = p.captions.find((x) => x.id === id)
    if (!c) return p
    Object.assign(c, patch)
    p.captions.sort((a, b) => a.start - b.start)
    return p
  })
}

export function removeCaption(id) {
  commit((p) => {
    p.captions = p.captions.filter((c) => c.id !== id)
    return p
  })
}

export function shiftCaptions(dt) {
  commit((p) => {
    p.captions = p.captions.map((c) => ({ ...c, start: Math.max(0, c.start + dt), end: Math.max(0.2, c.end + dt) }))
    return p
  })
}

export function mergeCaptions(maxGap = 0.35) {
  commit((p) => {
    const sorted = [...p.captions].sort((a, b) => a.start - b.start)
    const out = []
    for (const c of sorted) {
      const last = out[out.length - 1]
      if (last && c.start - last.end <= maxGap && (last.text + ' ' + c.text).length < 120) {
        last.text = `${last.text} ${c.text}`.trim()
        last.end = c.end
      } else out.push({ ...c })
    }
    p.captions = out
    return p
  })
}

export function splitLongCaptions(maxChars = 42, maxDur = 3.2) {
  commit((p) => {
    const out = []
    for (const c of p.captions) {
      const words = c.text.split(/\s+/).filter(Boolean)
      if (c.text.length <= maxChars && c.end - c.start <= maxDur) {
        out.push(c)
        continue
      }
      const chunks = []
      let cur = []
      let len = 0
      for (const w of words) {
        if (len + w.length + 1 > maxChars && cur.length) {
          chunks.push(cur)
          cur = []
          len = 0
        }
        cur.push(w)
        len += w.length + 1
      }
      if (cur.length) chunks.push(cur)
      const total = c.end - c.start
      const per = total / Math.max(1, chunks.length)
      chunks.forEach((ch, i) => {
        out.push({ id: uid('cap'), start: +(c.start + i * per).toFixed(3), end: +(c.start + (i + 1) * per).toFixed(3), text: ch.join(' ') })
      })
    }
    p.captions = out
    return p
  })
}

export function setCaptionStyle(patch) {
  commit((p) => {
    p.captionStyle = { ...p.captionStyle, ...patch }
    return p
  })
}

/* ------------------------------- markers ---------------------------------- */

export function addMarker(t, label = '') {
  commit((p) => {
    p.markers = [...(p.markers || []), { id: uid('mk'), t: +t.toFixed(3), label }].sort((a, b) => a.t - b.t)
    return p
  })
}

export function clearMarkers(kind = null) {
  commit((p) => {
    if (!kind) p.markers = []
    else p.markers = (p.markers || []).filter((m) => m.kind !== kind)
    return p
  })
}

export function setAnalysis(patch) {
  commit((p) => {
    p.analysis = { ...p.analysis, ...patch }
    return p
  })
}

export function updateSettings(patch) {
  commit((p) => {
    p.settings = { ...p.settings, ...patch }
    return p
  })
}

export function renameProject(name) {
  commit((p) => {
    p.name = name
    return p
  })
}

export function setProjectFormat({ width, height, aspect, fps }) {
  commit((p) => {
    if (width) p.width = width
    if (height) p.height = height
    if (aspect) p.aspect = aspect
    if (fps) p.fps = fps
    return p
  })
}

export function duration() {
  const p = getState().project
  return p ? totalDuration(p) : 1
}

/** Replace the whole timeline (used by AI tools: highlight, reels version…) */
export function replaceTimeline(mutator) {
  commit((p) => mutator(p))
  patchUi({ selection: [] })
}
