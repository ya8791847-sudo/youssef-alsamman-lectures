/**
 * Laqta AI — visual analysis engine (runs fully in the browser)
 * ---------------------------------------------------------------------------
 * Frame sampling, scene detection, subject tracking for smart reframing,
 * best-frame selection and automatic color/level correction.
 */

const STAT_W = 64
const STAT_H = 36

function withVideo(url, fn) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.src = url
    const cleanup = () => {
      v.removeAttribute('src')
      try {
        v.load()
      } catch {
        /* ignore */
      }
    }
    v.onloadedmetadata = async () => {
      try {
        const out = await fn(v)
        cleanup()
        resolve(out)
      } catch (e) {
        cleanup()
        reject(e)
      }
    }
    v.onerror = () => {
      cleanup()
      reject(new Error('video-load-failed'))
    }
  })
}

function seek(v, t) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      v.removeEventListener('seeked', finish)
      resolve()
    }
    v.addEventListener('seeked', finish)
    try {
      v.currentTime = Math.max(0, t)
    } catch {
      finish()
    }
    // safety net for stubborn browsers
    setTimeout(finish, 1200)
  })
}

const work = document.createElement('canvas')
work.width = STAT_W
work.height = STAT_H
const wctx = work.getContext('2d', { willReadFrequently: true })

/** Downscaled pixel snapshot + derived stats for one frame. */
export function frameStats(imageData) {
  const d = imageData.data
  const px = imageData.width * imageData.height
  let luma = 0
  let r = 0
  let g = 0
  let b = 0
  let skin = 0
  let skinX = 0
  let skinW = 0
  const hist = new Float32Array(32)
  const lumas = new Float32Array(px)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const R = d[i]
    const G = d[i + 1]
    const B = d[i + 2]
    r += R
    g += G
    b += B
    const L = 0.299 * R + 0.587 * G + 0.114 * B
    lumas[p] = L
    luma += L
    hist[Math.min(31, (L / 256) * 32) | 0]++
    // crude skin-tone test, good enough for framing heuristics
    if (R > 95 && G > 40 && B > 20 && R > G && G > B && R - Math.min(G, B) > 15 && R - B > 15) {
      skin++
      const x = p % imageData.width
      skinX += x
      skinW++
    }
  }
  luma /= px
  let variance = 0
  let edges = 0
  const w = imageData.width
  for (let p = 0; p < px; p++) {
    variance += (lumas[p] - luma) ** 2
    const x = p % w
    const right = x < w - 1 ? lumas[p + 1] : lumas[p]
    const down = p + w < px ? lumas[p + w] : lumas[p]
    edges += Math.abs(lumas[p] - right) + Math.abs(lumas[p] - down)
  }
  const std = Math.sqrt(variance / px)
  const edgeMean = edges / (px * 2)
  const colorfulness =
    Math.sqrt((r / px - g / px) ** 2 + (g / px - b / px) ** 2) + Math.abs(r / px - b / px) * 0.35
  return {
    luma,
    std,
    edgeMean,
    colorfulness,
    meanR: r / px,
    meanG: g / px,
    meanB: b / px,
    skinRatio: skin / px,
    skinX: skinW ? skinX / skinW / imageData.width : -1,
    hist,
    lumas,
    width: imageData.width,
    height: imageData.height,
  }
}

function histDiff(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / (a.length * 255 * 2) || 0
}

function grab(v) {
  wctx.drawImage(v, 0, 0, STAT_W, STAT_H)
  return wctx.getImageData(0, 0, STAT_W, STAT_H)
}

/**
 * Sample `count` frames evenly across the clip.
 * Returns [{ t, stats, imageData }] (imageData only when keepFrames).
 */
export async function sampleFrames(url, { count = 40, from = 0, to = null, onProgress, keepFrames = false }) {
  return withVideo(url, async (v) => {
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0
    const end = to != null ? Math.min(to, dur || to) : dur
    const n = Math.max(2, Math.min(400, count))
    const out = []
    for (let i = 0; i < n; i++) {
      const t = from + ((end - from) * i) / (n - 1 || 1)
      await seek(v, t)
      const id = grab(v)
      out.push({ t: +t.toFixed(3), stats: frameStats(id), imageData: keepFrames ? id : null })
      onProgress?.((i + 1) / n)
    }
    return out
  })
}

/** Shot-change detection → cut timestamps. */
export async function detectScenes(url, { sensitivity = 50, minLen = 0.6, from = 0, to = null, onProgress } = {}) {
  const samples = await sampleFrames(url, { count: 220, from, to, onProgress: (p) => onProgress?.(p * 0.9) })
  if (samples.length < 3) return { cuts: [], samples }
  const diffs = []
  for (let i = 1; i < samples.length; i++) diffs.push(histDiff(samples[i - 1].stats.hist, samples[i].stats.hist))
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
  const std = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length)
  const k = 2.6 - (sensitivity / 100) * 1.6 // more sensitivity → lower threshold
  const thr = mean + k * std
  const minGap = 0.25
  const cuts = []
  let lastCut = -99
  for (let i = 0; i < diffs.length; i++) {
    const t = samples[i + 1].t
    if (diffs[i] > thr && t - lastCut > Math.max(minGap, minLen)) {
      cuts.push(+t.toFixed(3))
      lastCut = t
    }
  }
  onProgress?.(1)
  return { cuts, samples, threshold: thr, mean, std }
}

/**
 * Subject tracking for smart reframe: motion + skin + edge weighting gives a
 * horizontal/vertical centroid we use to place the crop window.
 */
export async function reframePath(url, { samples = 48, onProgress } = {}) {
  const frames = await sampleFrames(url, { count: samples, onProgress, keepFrames: false })
  const path = []
  let prev = null
  for (const f of frames) {
    const s = f.stats
    let cx = 0.5
    let cy = 0.45
    let conf = 0.2
    if (s.skinRatio > 0.01 && s.skinX >= 0) {
      cx = s.skinX
      conf = 0.85
    }
    if (prev) {
      // motion-weighted fallback
      const motion = s.edgeMean - prev.edgeMean
      if (conf < 0.5 && Math.abs(motion) > 0.001) {
        cx = 0.5 + Math.max(-0.25, Math.min(0.25, motion * 60))
      }
    }
    path.push({ t: f.t, x: +cx.toFixed(3), y: +cy.toFixed(3), conf })
    prev = s
  }
  // smooth the path (moving average) so the crop does not jitter
  const smoothed = path.map((p, i) => {
    let sum = 0
    let n = 0
    let sumY = 0
    for (let j = Math.max(0, i - 3); j <= Math.min(path.length - 1, i + 3); j++) {
      sum += path[j].x * path[j].conf
      sumY += path[j].y * path[j].conf
      n += path[j].conf
    }
    return { ...p, x: +(n ? sum / n : p.x).toFixed(3), y: +(n ? sumY / n : p.y).toFixed(3) }
  })
  return smoothed
}

/** Ranked candidate frames for a poster/thumbnail. */
export async function bestThumbnails(url, { count = 24, from = 0, to = null, onProgress, top = 5 } = {}) {
  return withVideo(url, async (v) => {
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0
    const end = to != null ? Math.min(to, dur || to) : dur
    const n = Math.max(4, Math.min(120, count))
    const full = document.createElement('canvas')
    const scaleW = 480
    const results = []
    const prevStats = { current: null }
    for (let i = 0; i < n; i++) {
      const t = from + ((end - from) * i) / (n - 1 || 1)
      await seek(v, t)
      const id = grab(v)
      const st = frameStats(id)
      const motion = prevStats.current ? Math.abs(st.edgeMean - prevStats.current.edgeMean) : 0
      prevStats.current = st
      const brightnessScore = 1 - Math.min(1, Math.abs(st.luma - 122) / 122)
      const score =
        st.edgeMean * 42 + st.colorfulness * 0.16 + brightnessScore * 0.9 + (st.skinRatio > 0.012 ? 0.5 : 0) - motion * 22
      const ratio = dur ? v.videoWidth / Math.max(1, v.videoHeight) : 16 / 9
      const h = Math.round(scaleW / (ratio || 16 / 9))
      full.width = scaleW
      full.height = h
      full.getContext('2d').drawImage(v, 0, 0, scaleW, h)
      results.push({
        t: +t.toFixed(3),
        score: +score.toFixed(3),
        dataUrl: full.toDataURL('image/jpeg', 0.82),
        stats: { luma: st.luma, colorfulness: st.colorfulness, skinRatio: st.skinRatio },
      })
      onProgress?.((i + 1) / n)
    }
    return results.sort((a, b) => b.score - a.score).slice(0, top)
  })
}

/**
 * Auto color correction: measures exposure, contrast and white balance across
 * the clip and returns filter adjustments.
 */
export async function autoEnhance(url, { samples = 16, onProgress } = {}) {
  const frames = await sampleFrames(url, { count: samples, onProgress })
  if (!frames.length) return { adj: {}, stats: null }
  const avg = frames.reduce(
    (a, f) => {
      a.luma += f.stats.luma
      a.std += f.stats.std
      a.r += f.stats.meanR
      a.g += f.stats.meanG
      a.b += f.stats.meanB
      return a
    },
    { luma: 0, std: 0, r: 0, g: 0, b: 0 },
  )
  const n = frames.length
  const luma = avg.luma / n
  const std = avg.std / n
  const r = avg.r / n
  const g = avg.g / n
  const b = avg.b / n
  const meanCh = (r + g + b) / 3

  // exposure: target average luma ~120 (of 255)
  const brightness = Math.round(Math.max(-26, Math.min(30, (120 - luma) / 3.4)))
  // contrast: target std ~58
  const contrast = Math.round(Math.max(-10, Math.min(34, (58 - std) / 1.5)))
  // white balance → temperature (warm/cool) and tint via green/magenta
  const warmth = (r - b) / Math.max(1, meanCh)
  const temperature = Math.round(Math.max(-40, Math.min(40, -warmth * 140)))
  const greenish = (g - (r + b) / 2) / Math.max(1, meanCh)
  const hue = Math.round(Math.max(-14, Math.min(14, -greenish * 90)))
  const saturation = Math.round(Math.max(-6, Math.min(18, (140 - std) / 22)))
  const sharpen = std < 42 ? 22 : std < 55 ? 14 : 8
  return {
    adj: { brightness, contrast, saturation, temperature, hue, sharpen, vignette: 12 },
    stats: { luma: +luma.toFixed(1), std: +std.toFixed(1), r: +r.toFixed(1), g: +g.toFixed(1), b: +b.toFixed(1) },
  }
}

/** Quick thumbnail of a video source (used by the media pool). */
export function videoPoster(url, at = 0.6, width = 320) {
  return withVideo(url, async (v) => {
    const dur = isFinite(v.duration) ? v.duration : 0
    await seek(v, Math.min(dur ? dur * at : 0.1, Math.max(0, dur - 0.05)))
    const ratio = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9
    const c = document.createElement('canvas')
    c.width = width
    c.height = Math.round(width / ratio)
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    return { dataUrl: c.toDataURL('image/jpeg', 0.8), width: v.videoWidth, height: v.videoHeight, duration: dur }
  })
}

/** Multi-frame filmstrip used as the clip thumbnail on the timeline. */
export function filmstrip(url, { count = 4, width = 160, at = 0.5 } = {}) {
  return withVideo(url, async (v) => {
    const dur = isFinite(v.duration) ? v.duration : 0
    const ratio = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9
    const c = document.createElement('canvas')
    c.width = width
    c.height = Math.round(width / ratio)
    const cx = c.getContext('2d')
    const out = []
    for (let i = 0; i < count; i++) {
      const t = dur ? (dur * (i + 0.5)) / count : 0
      await seek(v, t)
      cx.drawImage(v, 0, 0, c.width, c.height)
      out.push(c.toDataURL('image/jpeg', 0.7))
    }
    return out
  })
}

/** Average dominant color of a frame — used by the auto chroma key tool. */
export async function dominantEdgesColor(url, { samples = 10 } = {}) {
  const frames = await sampleFrames(url, { count: samples, keepFrames: true })
  if (!frames.length) return null
  const tally = new Map()
  for (const f of frames) {
    const d = f.imageData.data
    const w = f.imageData.width
    const h = f.imageData.height
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const onEdge = x < w * 0.12 || x > w * 0.88 || y < h * 0.12
        if (!onEdge) continue
        const i = (y * w + x) * 4
        const key = `${d[i] >> 4}-${d[i + 1] >> 4}-${d[i + 2] >> 4}`
        tally.set(key, (tally.get(key) || 0) + 1)
      }
    }
  }
  let best = null
  let bestN = 0
  for (const [k, n] of tally) if (n > bestN) ((bestN = n), (best = k))
  if (!best) return null
  const [r, g, b] = best.split('-').map((v) => parseInt(v, 10) * 16 + 8)
  return { r, g, b, hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, confidence: bestN / (tally.values().reduce((a, b2) => a + b2, 0) || 1) }
}
