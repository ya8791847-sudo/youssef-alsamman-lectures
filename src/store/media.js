/**
 * Media registry — blob storage (IndexedDB + in-memory), probing and
 * local asset generation (title cards, backgrounds, generated audio).
 */

import { idb } from './idb.js'
import { uid } from './model.js'
import { videoPoster } from '../engine/analysis.js'
import { drawTextBlock } from '../engine/renderer.js'

const blobs = new Map() // mediaId -> Blob
const urls = new Map() // mediaId -> object URL

export function kindOf(file) {
  const t = (file.type || '').toLowerCase()
  const n = (file.name || '').toLowerCase()
  if (t.startsWith('video') || /\.(mp4|webm|mov|mkv|m4v|ogv)$/.test(n)) return 'video'
  if (t.startsWith('audio') || /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/.test(n)) return 'audio'
  if (t.startsWith('image') || /\.(png|jpe?g|webp|gif|bmp|avif)$/.test(n)) return 'image'
  return null
}

export function urlFor(id) {
  return urls.get(id) || null
}

export function blobFor(id) {
  return blobs.get(id) || null
}

export function setBlob(id, blob) {
  blobs.set(id, blob)
  if (urls.has(id)) {
    try {
      URL.revokeObjectURL(urls.get(id))
    } catch {
      /* ignore */
    }
  }
  urls.set(id, URL.createObjectURL(blob))
  return urls.get(id)
}

export function releaseMedia(id) {
  blobs.delete(id)
  const u = urls.get(id)
  if (u) {
    try {
      URL.revokeObjectURL(u)
    } catch {
      /* ignore */
    }
    urls.delete(id)
  }
}

/* ------------------------------- probing ---------------------------------- */

function loadEl(src, kind) {
  return new Promise((resolve, reject) => {
    const el = kind === 'audio' ? document.createElement('audio') : document.createElement('video')
    el.preload = 'metadata'
    el.muted = true
    el.playsInline = true
    el.crossOrigin = 'anonymous'
    el.onloadedmetadata = () => resolve(el)
    el.onerror = () => reject(new Error('media-load-failed'))
    el.src = src
  })
}

export async function probe(blob, kind, url) {
  const out = { duration: 0, width: 0, height: 0, hasAudio: kind === 'audio', poster: null }
  if (kind === 'image') {
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej(new Error('img-load-failed'))
        i.src = url
      })
      out.width = img.naturalWidth
      out.height = img.naturalHeight
      const c = document.createElement('canvas')
      const w = 320
      c.width = w
      c.height = Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth))
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      out.poster = c.toDataURL('image/jpeg', 0.8)
      out.duration = 5
    } catch {
      /* keep defaults */
    }
    return out
  }

  try {
    const el = await loadEl(url, kind)
    out.duration = isFinite(el.duration) ? el.duration : 0
    if (kind === 'video') {
      out.width = el.videoWidth
      out.height = el.videoHeight
      try {
        const stream = el.captureStream ? el.captureStream() : el.mozCaptureStream ? el.mozCaptureStream() : null
        if (stream) out.hasAudio = stream.getAudioTracks().length > 0
        else out.hasAudio = true
      } catch {
        out.hasAudio = true
      }
      try {
        const p = await videoPoster(url, 0.25, 320)
        out.poster = p.dataUrl
      } catch {
        /* poster is optional */
      }
    } else {
      out.duration = isFinite(el.duration) ? el.duration : 0
    }
    el.removeAttribute('src')
    try {
      el.load()
    } catch {
      /* ignore */
    }
  } catch {
    /* element could not load metadata — keep what we have */
  }
  return out
}

/* ------------------------------- importing -------------------------------- */

export async function importFiles(fileList, { onProgress, persist = true } = {}) {
  const files = [...fileList]
  const out = []
  let i = 0
  for (const file of files) {
    i++
    const kind = kindOf(file)
    if (!kind) {
      out.push({ error: 'unsupported', name: file.name })
      onProgress?.(i / files.length, file.name)
      continue
    }
    const id = uid('med')
    const url = setBlob(id, file)
    const info = await probe(file, kind, url)
    const meta = {
      id,
      name: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      kind,
      size: file.size,
      createdAt: Date.now(),
      url,
      ...info,
    }
    if (persist) {
      try {
        await idb.put('media', file, id)
      } catch {
        /* storage may be full — project still works this session */
      }
    }
    out.push(meta)
    onProgress?.(i / files.length, file.name)
  }
  return out
}

export async function registerGenerated(name, blob, kind, extra = {}) {
  const id = uid('med')
  const url = setBlob(id, blob)
  const info = await probe(blob, kind, url)
  const meta = { id, name, fileName: name, kind, size: blob.size, createdAt: Date.now(), url, generated: true, ...info, ...extra }
  try {
    await idb.put('media', blob, id)
  } catch {
    /* ignore */
  }
  return meta
}

/** Restore blobs for a project loaded from storage. */
export async function hydrateProjectMedia(project, { onProgress } = {}) {
  const list = project.media || []
  let done = 0
  for (const m of list) {
    if (blobs.has(m.id)) {
      m.url = urls.get(m.id)
      done++
      continue
    }
    try {
      const blob = await idb.get('media', m.id)
      if (blob) {
        m.url = setBlob(m.id, blob)
        m.missing = false
      } else if (m.url && m.url.startsWith('blob:')) {
        m.missing = true
      }
    } catch {
      m.missing = true
    }
    done++
    onProgress?.(done / Math.max(1, list.length))
  }
  return project
}

export async function deleteMediaBlob(id) {
  releaseMedia(id)
  try {
    await idb.del('media', id)
  } catch {
    /* ignore */
  }
}

/* --------------------------- generated assets ----------------------------- */

const CARD_THEMES = [
  ['#111827', '#5ee7ff', '#b06cff'],
  ['#1a0b2e', '#ff5fa2', '#ffc857'],
  ['#04141a', '#35d99b', '#5ee7ff'],
  ['#20061a', '#ff8a5b', '#b06cff'],
  ['#0b1220', '#ffffff', '#5ee7ff'],
]

export async function makeTitleCard({ title = 'العنوان', subtitle = '', width = 1920, height = 1080, theme = 0, fontSize = 9, anim = 'pop', dark = true } = {}) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const x = c.getContext('2d')
  const [bg, a1, a2] = CARD_THEMES[theme % CARD_THEMES.length]
  const g = x.createLinearGradient(0, 0, width, height)
  g.addColorStop(0, bg)
  g.addColorStop(0.55, a1)
  g.addColorStop(1, a2)
  x.fillStyle = g
  x.globalAlpha = dark ? 1 : 0.9
  x.fillRect(0, 0, width, height)
  x.globalAlpha = 1
  // soft blobs for depth
  for (let i = 0; i < 5; i++) {
    const rx = Math.random() * width
    const ry = Math.random() * height
    const rr = Math.random() * height * 0.5 + height * 0.2
    const rg = x.createRadialGradient(rx, ry, 0, rx, ry, rr)
    rg.addColorStop(0, 'rgba(255,255,255,0.14)')
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = rg
    x.fillRect(0, 0, width, height)
  }
  x.fillStyle = 'rgba(0,0,0,0.28)'
  x.fillRect(0, 0, width, height)
  drawTextBlock(
    x,
    title,
    { font: 'Cairo', size: fontSize, weight: 800, color: '#ffffff', shadow: 26, align: 'center', x: 50, y: subtitle ? 46 : 50, maxWidth: 80, anim },
    width,
    height,
    0.4,
    3,
  )
  if (subtitle) {
    drawTextBlock(
      x,
      subtitle,
      { font: 'Cairo', size: 4, weight: 600, color: 'rgba(255,255,255,0.86)', shadow: 14, align: 'center', x: 50, y: 58, maxWidth: 76 },
      width,
      height,
      0.6,
      3,
    )
  }
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
  return blob
}

export async function makeSolid({ width = 1920, height = 1080, color = '#0b1220' } = {}) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const x = c.getContext('2d')
  x.fillStyle = color
  x.fillRect(0, 0, width, height)
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
  return blob
}

export async function loadAllProjects() {
  try {
    const all = await idb.getAll('projects')
    return (all || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  } catch {
    return []
  }
}

export async function saveProject(project) {
  const copy = { ...project, updatedAt: Date.now() }
  copy.media = (project.media || []).map((m) => ({ ...m, url: m.url && m.url.startsWith('blob:') ? undefined : m.url }))
  try {
    await idb.put('projects', copy, project.id)
  } catch {
    /* quota — ignore */
  }
  return copy
}

export async function removeProject(id) {
  try {
    await idb.del('projects', id)
  } catch {
    /* ignore */
  }
}
