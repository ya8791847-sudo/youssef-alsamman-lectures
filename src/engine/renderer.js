/**
 * Laqta AI — compositing renderer
 * ---------------------------------------------------------------------------
 * Draws a fully composed frame (layers, filters, chroma key, transitions,
 * titles, captions, overlays) onto a 2D canvas at any resolution.
 * Used live by the player and offline by the exporter.
 */

import { DEFAULT_ADJ } from './presets.js'

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F]/

/* ---------------------------- small helpers ------------------------------- */

export function lerp(a, b, t) {
  return a + (b - a) * t
}
export function clamp(v, a = 0, b = 1) {
  return v < a ? a : v > b ? b : v
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}
function easeInCubic(t) {
  return t * t * t
}
function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
function easeOutElastic(t) {
  const c4 = (2 * Math.PI) / 3
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

/** Evaluate a keyframe list [[t0,v0],[t1,v1]…] (t normalized 0..1). */
export function kfValue(list, p, fallback) {
  if (!list || !list.length) return fallback
  if (list.length === 1) return list[0][1]
  if (p <= list[0][0]) return list[0][1]
  if (p >= list[list.length - 1][0]) return list[list.length - 1][1]
  for (let i = 1; i < list.length; i++) {
    if (p <= list[i][0]) {
      const [t0, v0] = list[i - 1]
      const [t1, v1] = list[i]
      const local = t1 === t0 ? 0 : (p - t0) / (t1 - t0)
      const eased = easeOutCubic(clamp(local))
      return lerp(v0, v1, eased)
    }
  }
  return fallback
}

export function activeClips(track, time) {
  return track.clips.filter((c) => time >= c.start - 1e-4 && time < c.start + c.duration - 1e-4)
}

export function clipAt(track, time) {
  return track.clips.find((c) => time >= c.start - 1e-4 && time < c.start + c.duration - 1e-4) || null
}

export function prevClip(track, clip) {
  let best = null
  for (const c of track.clips) {
    if (c.id === clip.id) continue
    if (c.start + c.duration <= clip.start + 0.001) {
      if (!best || c.start + c.duration > best.start + best.duration) best = c
    }
  }
  return best
}

export function projectDuration(project) {
  let end = 0
  for (const tr of project.tracks) for (const c of tr.clips) end = Math.max(end, c.start + c.duration)
  for (const cap of project.captions || []) end = Math.max(end, cap.end)
  return Math.max(end, 1)
}

/** CSS filter string from clip adjustments. */
export function cssFilter(adj = {}) {
  const parts = []
  const b = 1 + (adj.brightness || 0) / 100
  const c = 1 + (adj.contrast || 0) / 100
  const s = 1 + (adj.saturation || 0) / 100
  if (Math.abs(b - 1) > 0.001) parts.push(`brightness(${b.toFixed(3)})`)
  if (Math.abs(c - 1) > 0.001) parts.push(`contrast(${c.toFixed(3)})`)
  if (Math.abs(s - 1) > 0.001) parts.push(`saturate(${Math.max(0, s).toFixed(3)})`)
  if (adj.sepia) parts.push(`sepia(${clamp(adj.sepia / 100).toFixed(3)})`)
  if (adj.hue) parts.push(`hue-rotate(${adj.hue}deg)`)
  if (adj.blur) parts.push(`blur(${adj.blur}px)`)
  return parts.length ? parts.join(' ') : 'none'
}

/* --------------------------- text measuring ------------------------------- */

function wrapText(ctx, text, maxWidth) {
  const paragraphs = String(text ?? '').split('\n')
  const lines = []
  for (const para of paragraphs) {
    if (!para) {
      lines.push('')
      continue
    }
    const words = para.split(/\s+/).filter(Boolean)
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur)
        cur = w
      } else cur = test
    }
    if (cur) lines.push(cur)
  }
  return lines.length ? lines : ['']
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Draw a text block (title clip or caption cue).
 * style: {font,size,weight,color,stroke,strokeW,bg,bgColor,bgAlpha,radius,shadow,
 *         align,x,y,uppercase,spacing,lineHeight,maxWidth,anim,highlight,glow}
 */
export function drawTextBlock(ctx, content, style, W, H, localT = 0, dur = 3, progressOverride = null) {
  const size = ((style.size || 5) / 100) * H
  const weight = style.weight || 700
  const font = style.font || 'Cairo'
  const family = `${font}, Cairo, Tahoma, "Segoe UI", sans-serif`
  const text = String(content ?? '')
  const dir = ARABIC_RE.test(text) ? 'rtl' : 'ltr'
  const p = progressOverride != null ? progressOverride : clamp(dur > 0 ? localT / dur : 0)
  const anim = style.anim || 'none'
  const inDur = clamp(Math.min(0.55, dur * 0.35) / Math.max(0.001, dur))

  let alpha = 1
  let dx = 0
  let dy = 0
  let scale = 1
  let revealChars = Infinity
  let glowMul = 1

  if (anim !== 'none') {
    const q = clamp(p / Math.max(0.001, inDur)) // 0..1 over the entrance
    const outStart = 1 - inDur
    const o = p > outStart ? clamp((1 - p) / Math.max(0.001, inDur)) : 1
    switch (anim) {
      case 'fade':
        alpha = q * o
        break
      case 'fadeUp':
        alpha = q * o
        dy = (1 - q) * size * 0.7
        break
      case 'pop':
        alpha = Math.min(1, q * 2) * o
        scale = 0.72 + 0.28 * easeOutBack(q)
        break
      case 'typewriter':
        revealChars = Math.max(0, Math.floor(q * text.length))
        alpha = o
        break
      case 'word':
        revealChars = Math.max(0, Math.floor(q * text.split(/\s+/).length) * 6)
        alpha = o
        break
      case 'bounce':
        alpha = Math.min(1, q * 2) * o
        dy = -(1 - easeOutElastic(q)) * size * 1.2
        break
      case 'slideIn':
        alpha = Math.min(1, q * 1.6) * o
        dx = (1 - easeOutCubic(q)) * -W * 0.25
        break
      case 'neon':
        alpha = o
        glowMul = 0.7 + 0.3 * Math.sin(localT * 6)
        break
      case 'karaoke':
        alpha = o
        break
      default:
        break
    }
  }

  ctx.save()
  ctx.direction = dir
  ctx.textAlign = style.align === 'left' ? 'left' : style.align === 'right' ? 'right' : 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${weight} ${size}px ${family}`
  if ('letterSpacing' in ctx && style.spacing) ctx.letterSpacing = `${style.spacing}px`

  let display = style.uppercase ? text.toUpperCase() : text
  if (revealChars !== Infinity) display = display.slice(0, revealChars)

  const maxW = W * ((style.maxWidth || 86) / 100)
  const lineHeight = size * (style.lineHeight || 1.28)
  const lines = wrapText(ctx, display, maxW)
  const totalH = lines.length * lineHeight
  const anchorX = ((style.x ?? 50) / 100) * W
  const anchorY = ((style.y ?? (style.align === 'left' ? 78 : 50)) / 100) * H

  ctx.globalAlpha = alpha
  ctx.translate(anchorX + dx, anchorY + dy)
  ctx.scale(scale, scale)

  // background pill behind the whole block
  if (style.bg) {
    let maxLineW = 0
    for (const l of lines) maxLineW = Math.max(maxLineW, ctx.measureText(l).width)
    const padX = size * 0.55
    const padY = size * 0.32
    const bw = maxLineW + padX * 2
    const bh = totalH + padY * 1.7
    const bx = ctx.textAlign === 'center' ? -bw / 2 : ctx.textAlign === 'right' ? -bw : 0
    ctx.save()
    ctx.globalAlpha = alpha * (style.bgAlpha ?? 0.7)
    ctx.fillStyle = style.bgColor || '#0b1220'
    roundRect(ctx, bx, -bh / 2, bw, bh, style.radius ?? size * 0.3)
    ctx.fill()
    if (style.accent) {
      ctx.fillStyle = style.highlight || '#5ee7ff'
      roundRect(ctx, bx, -bh / 2, Math.max(3, size * 0.14), bh, 3)
      ctx.fill()
    }
    ctx.restore()
  }

  const startY = -totalH / 2 + lineHeight / 2
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2

    if (style.glow) {
      ctx.save()
      ctx.shadowColor = style.glow
      ctx.shadowBlur = (size * 0.6 + 14) * glowMul
      ctx.fillStyle = style.color || '#fff'
      ctx.fillText(line, 0, y)
      ctx.fillText(line, 0, y)
      ctx.restore()
    }

    if (style.shadow) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.85)'
      ctx.shadowBlur = style.shadow
      ctx.shadowOffsetY = Math.max(1, size * 0.05)
      ctx.fillStyle = style.color || '#ffffff'
      ctx.fillText(line, 0, y)
      ctx.restore()
    }

    if (style.strokeW) {
      ctx.lineWidth = (style.strokeW / 100) * size * 2.2
      ctx.strokeStyle = style.stroke || '#000000'
      ctx.strokeText(line, 0, y)
    }

    if (anim === 'karaoke') {
      // progressive word highlight: draw base then the highlighted part on top
      ctx.fillStyle = style.color || '#ffffff'
      ctx.fillText(line, 0, y)
      const words = line.split(' ')
      const totalWords = Math.max(1, lines.join(' ').split(' ').length)
      const done = p * totalWords
      const widths = words.map((w) => ctx.measureText(`${w} `).width)
      const lineW = widths.reduce((a, b) => a + b, 0)
      let x0 = ctx.textAlign === 'center' ? -lineW / 2 : ctx.textAlign === 'right' ? -lineW : 0
      let idx = 0
      for (let li = 0; li < i; li++) idx += lines[li].split(' ').length
      ctx.save()
      ctx.beginPath()
      let drawn = 0
      for (const w of words) {
        const wd = ctx.measureText(`${w} `).width
        if (idx + drawn < done) {
          ctx.rect(x0 + drawn, y - lineHeight, wd, lineHeight * 1.6)
        }
        drawn++
      }
      ctx.clip()
      ctx.fillStyle = style.highlight || '#5ee7ff'
      ctx.fillText(line, 0, y)
      ctx.restore()
      void x0
    } else {
      ctx.fillStyle = style.color || '#ffffff'
      ctx.fillText(line, 0, y)
    }
  })

  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
  ctx.restore()
  return { lines, totalH }
}

/* ------------------------------ layer render ------------------------------ */

function drawMediaInto(ctx, clip, asset, W, H, opts = {}) {
  const tr = clip.transform || {}
  const fit = tr.fit || 'cover'
  const scale = (tr.scale ?? 100) / 100
  const kf = clip.kf || {}
  const p = clip.duration > 0 ? clamp((opts.localT ?? 0) / clip.duration) : 0
  const kfScale = kfValue(kf.scale, p, 1)
  const kfX = kfValue(kf.x, p, 0)
  const kfY = kfValue(kf.y, p, 0)
  const kfRot = kfValue(kf.rotation, p, 0)

  const el = asset.el
  const sw = asset.width || el.videoWidth || el.naturalWidth || W
  const sh = asset.height || el.videoHeight || el.naturalHeight || H
  if (!sw || !sh) return

  let dw = W
  let dh = H
  const ratio = sw / sh
  const target = W / H
  if (fit === 'cover') {
    if (ratio > target) dw = H * ratio
    else dh = W / ratio
  } else if (fit === 'contain') {
    if (ratio > target) dh = W / ratio
    else dw = H * ratio
  }

  const s = scale * kfScale
  const cx = W / 2 + ((tr.x || 0) / 100) * W + (kfX / 100) * W
  const cy = H / 2 + ((tr.y || 0) / 100) * H + (kfY / 100) * H

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(((tr.rotation || 0) + kfRot) * (Math.PI / 180))
  ctx.scale(s, s)
  const adj = { ...DEFAULT_ADJ, ...(clip.fx || {}) }
  const filter = cssFilter(adj)
  if (filter !== 'none') ctx.filter = filter
  if (opts.flipX) ctx.scale(-1, 1)
  try {
    ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh)
  } catch {
    /* frame not ready — skip */
  }
  ctx.restore()

  // temperature tint + glow passes
  if (adj.temperature) {
    ctx.save()
    ctx.globalCompositeOperation = adj.temperature > 0 ? 'overlay' : 'soft-light'
    ctx.globalAlpha = Math.min(0.32, Math.abs(adj.temperature) / 100)
    ctx.fillStyle = adj.temperature > 0 ? '#ff9a3c' : '#4aa8ff'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }
  if (adj.glow) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(0.4, adj.glow / 100)
    ctx.filter = `blur(${Math.max(4, H * 0.012)}px) brightness(1.1)`
    try {
      ctx.drawImage(el, 0, 0, W, H)
    } catch {
      /* ignore */
    }
    ctx.restore()
  }
  if (adj.sharpen) {
    const amt = Math.min(0.55, adj.sharpen / 100)
    const tmp = opts.scratchA
    if (tmp) {
      const tc = tmp.getContext('2d')
      tc.save()
      tc.setTransform(1, 0, 0, 1, 0, 0)
      tc.clearRect(0, 0, tmp.width, tmp.height)
      tc.filter = `blur(${Math.max(1, H / 540)}px)`
      tc.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, tmp.width, tmp.height)
      tc.filter = 'none'
      tc.restore()
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = amt
      ctx.filter = 'contrast(1.6)'
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, W, H)
      ctx.restore()
    }
  }
}

function chromaticKey(ctx, clip, W, H, keyCanvas) {
  const key = clip.fx?.key
  if (!key?.enabled) return
  const src = ctx.getImageData(0, 0, W, H)
  const out = keyCanvas.getContext('2d').createImageData(W, H)
  const d = src.data
  const o = out.data
  const hex = key.color || '#00b140'
  const kr = parseInt(hex.slice(1, 3), 16)
  const kg = parseInt(hex.slice(3, 5), 16)
  const kb = parseInt(hex.slice(5, 7), 16)
  const sim = (key.similarity ?? 32) / 100
  const smooth = (key.smooth ?? 10) / 100
  const spill = (key.spill ?? 40) / 100
  const t0 = sim * 1.6
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const dist = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2) / 441.7
    let a = (dist - t0) / Math.max(0.02, smooth + 0.02)
    a = a < 0 ? 0 : a > 1 ? 1 : a
    o[i] = r
    o[i + 1] = g
    o[i + 2] = b
    o[i + 3] = Math.round(d[i + 3] * a)
    if (a > 0 && spill > 0) {
      // pull green spill out of the subject
      const excess = g - Math.max(r, b)
      if (excess > 0) {
        const amt = Math.min(excess, 255 * spill * 0.5) * 0.8
        o[i + 1] = Math.max(0, g - amt)
        o[i + 1] = Math.round(o[i + 1])
      }
    }
  }
  keyCanvas.getContext('2d').putImageData(out, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(keyCanvas, 0, 0, W, H)
}

/** Draw one media clip (video/image) fully into the given context. */
function renderMediaClip(ctx, clip, getAsset, W, H, localT, scratch) {
  const asset = getAsset(clip.mediaId)
  if (!asset || !asset.el) return false
  const adj = { ...DEFAULT_ADJ, ...(clip.fx || {}) }
  ctx.save()
  drawMediaInto(ctx, clip, asset, W, H, { localT, scratchA: scratch })
  ctx.restore()
  if (adj.vignette) {
    ctx.save()
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, adj.vignette / 100)})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }
  return true
}

/** Apply a transition transform when compositing a layer onto the frame. */
function transitionParams(type, prog, W, H) {
  // prog: 0 → starts entering, 1 → fully in
  const p = clamp(prog)
  const e = easeOutCubic(p)
  switch (type) {
    case 'slideL':
      return { alpha: 1, dx: (1 - e) * -W, dy: 0, scale: 1, clip: null }
    case 'slideR':
      return { alpha: 1, dx: (1 - e) * W, dy: 0, scale: 1, clip: null }
    case 'slideU':
      return { alpha: 1, dx: 0, dy: (1 - e) * -H, scale: 1, clip: null }
    case 'slideD':
      return { alpha: 1, dx: 0, dy: (1 - e) * H, scale: 1, clip: null }
    case 'zoomIn':
      return { alpha: p, dx: 0, dy: 0, scale: 0.7 + 0.3 * e, clip: null }
    case 'zoomOut':
      return { alpha: p, dx: 0, dy: 0, scale: 1.35 - 0.35 * e, clip: null }
    case 'wipeL':
      return { alpha: 1, dx: 0, dy: 0, scale: 1, clip: { x: 0, y: 0, w: W * e, h: H } }
    case 'wipeR':
      return { alpha: 1, dx: 0, dy: 0, scale: 1, clip: { x: W * (1 - e), y: 0, w: W * e, h: H } }
    case 'circle':
      return { alpha: 1, dx: 0, dy: 0, scale: 1, circle: e }
    case 'spin':
      return { alpha: p, dx: 0, dy: 0, scale: 0.6 + 0.4 * e, rotation: (1 - e) * Math.PI * 0.5, clip: null }
    case 'glitch':
      return { alpha: p, dx: 0, dy: 0, scale: 1, glitch: 1 - e, clip: null }
    case 'blur':
      return { alpha: p, dx: 0, dy: 0, scale: 1, blur: (1 - e) * (H * 0.02), clip: null }
    case 'flash':
      return { alpha: p, dx: 0, dy: 0, scale: 1, flash: p > 0.5 ? 0 : 1 - p * 2, clip: null }
    case 'fade':
    default:
      return { alpha: p, dx: 0, dy: 0, scale: 1, clip: null }
  }
}

function compositeLayer(dst, layer, params, W, H) {
  if (params.circle != null && params.circle < 1) {
    dst.save()
    dst.beginPath()
    dst.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * params.circle, 0, Math.PI * 2)
    dst.clip()
    dst.drawImage(layer, params.dx, params.dy, W, H)
    dst.restore()
    return
  }
  if (params.clip) {
    dst.save()
    dst.beginPath()
    dst.rect(params.clip.x, params.clip.y, params.clip.w, params.clip.h)
    dst.clip()
    dst.drawImage(layer, params.dx, params.dy, W, H)
    dst.restore()
    return
  }
  dst.save()
  dst.globalAlpha = clamp(params.alpha)
  if (params.blur) dst.filter = `blur(${params.blur}px)`
  if (params.scale && params.scale !== 1) {
    dst.translate(W / 2, H / 2)
    dst.rotate(params.rotation || 0)
    dst.scale(params.scale, params.scale)
    dst.drawImage(layer, -W / 2, -H / 2, W, H)
  } else if (params.rotation) {
    dst.translate(W / 2, H / 2)
    dst.rotate(params.rotation)
    dst.drawImage(layer, -W / 2, -H / 2, W, H)
  } else {
    dst.drawImage(layer, params.dx, params.dy, W, H)
  }
  dst.restore()
}

let grainTile = null
function grainPattern(ctx, amount) {
  if (!grainTile) {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 128
    const cc = c.getContext('2d')
    const img = cc.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 90
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 48
    }
    cc.putImageData(img, 0, 0)
    grainTile = c
  }
  return ctx.createPattern(grainTile, 'repeat')
}

/* ------------------------------ main render ------------------------------- */

/**
 * Compose one frame.
 * ctx: 2D context of the target canvas (already sized to width×height)
 * project, time (timeline seconds), getAsset(mediaId) → { el, kind, width, height }
 * gfx: { scratch, key, layer } canvases at the project resolution (reused)
 */
export function renderFrame({ ctx, project, time, getAsset, width, height, gfx, dynamicOnly = false }) {
  const W = width
  const H = height
  const g = gfx || {}
  const settings = project.settings || {}

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'none'

  const videoTracks = project.tracks.filter((t) => t.kind === 'video' || t.kind === 'overlay')

  // ---- background -------------------------------------------------------
  let bgFilled = false
  const baseTrack = project.tracks.find((t) => t.kind === 'video' && !t.hidden)
  const baseClip = baseTrack ? clipAt(baseTrack, time) : null

  if (settings.background === 'blur' && baseClip) {
    const asset = getAsset(baseClip.mediaId)
    if (asset?.el) {
      ctx.save()
      ctx.filter = 'blur(26px) brightness(0.75) saturate(1.2)'
      drawMediaInto(ctx, { ...baseClip, transform: { ...baseClip.transform, scale: 118 }, fx: {} }, asset, W, H, { localT: 0 })
      ctx.restore()
      bgFilled = true
    }
  }
  if (!bgFilled) {
    ctx.fillStyle = settings.backgroundColor || '#000000'
    ctx.fillRect(0, 0, W, H)
  }

  // ---- media layers -----------------------------------------------------
  if (!g.layer) {
    g.layer = document.createElement('canvas')
    g.layer.width = W
    g.layer.height = H
  }
  const lc = g.layer.getContext('2d')

  const drawLayerToFrame = (alpha, params) => {
    compositeLayer(ctx, g.layer, { alpha, dx: 0, dy: 0, scale: 1, ...(params || {}) }, W, H)
  }

  for (const track of videoTracks) {
    if (track.hidden) continue
    const clip = clipAt(track, time)
    if (!clip) continue
    const localT = time - clip.start
    const kf = clip.kf || {}
    const p = clip.duration > 0 ? clamp(localT / clip.duration) : 0
    const kfOpacity = kfValue(kf.opacity, p, 1)
    const baseOpacity = clamp(((clip.transform?.opacity ?? 100) / 100) * kfOpacity * (track.opacity ?? 1))

    const transIn = clip.transitions?.in || { type: 'none', dur: 0.4 }
    const transOut = clip.transitions?.out || { type: 'none', dur: 0.4 }
    const entering = transIn.type !== 'none' && transIn.dur > 0 && localT < transIn.dur
    const leaving = transOut.type !== 'none' && transOut.dur > 0 && localT > clip.duration - transOut.dur
    const keyOn = !!clip.fx?.key?.enabled

    const clearLayer = () => {
      lc.setTransform(1, 0, 0, 1, 0, 0)
      lc.globalAlpha = 1
      lc.globalCompositeOperation = 'source-over'
      lc.filter = 'none'
      lc.clearRect(0, 0, W, H)
    }

    const paintClip = (c, t, target = lc) => {
      renderMediaClip(target, c, getAsset, W, H, t, g.scratch)
      if (c.fx?.key?.enabled) chromaticKey(target, c, W, H, g.key)
    }

    clearLayer()
    paintClip(clip, localT)

    if (entering) {
      const crossTypes = ['fade', 'blur', 'flash', 'glitch']
      const prev = crossTypes.includes(transIn.type) ? prevClip(track, clip) : null
      if (prev && getAsset(prev.mediaId)?.el) {
        // hold the outgoing clip's last frame underneath, then blend the new one over it
        clearLayer()
        paintClip(prev, Math.max(0, prev.duration - 0.04))
        drawLayerToFrame(baseOpacity)
        clearLayer()
        paintClip(clip, localT)
      }
      const params = transitionParams(transIn.type, clamp(localT / transIn.dur), W, H)
      drawLayerToFrame(params.alpha * baseOpacity, params)
      if (params.flash) {
        ctx.save()
        ctx.globalAlpha = params.flash * 0.9
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }
      if (params.glitch) {
        ctx.save()
        const slices = 7
        for (let i = 0; i < slices; i++) {
          const sy = (H / slices) * i
          const off = (Math.random() - 0.5) * params.glitch * W * 0.1
          ctx.globalAlpha = 0.8
          ctx.drawImage(g.layer, 0, sy, W, H / slices, off, sy, W, H / slices)
        }
        ctx.restore()
      }
    } else if (leaving) {
      const params = transitionParams(transOut.type, clamp((clip.duration - localT) / transOut.dur), W, H)
      drawLayerToFrame(params.alpha * baseOpacity, params)
    } else {
      drawLayerToFrame(baseOpacity)
    }
  }

  // ---- text clips (any track marked text) -------------------------------
  for (const track of project.tracks) {
    if (track.kind !== 'text' || track.hidden) continue
    for (const clip of track.clips) {
      if (time < clip.start || time >= clip.start + clip.duration) continue
      const localT = time - clip.start
      const st = clip.text || {}
      ctx.save()
      ctx.globalAlpha = (clip.transform?.opacity ?? 100) / 100
      drawTextBlock(ctx, st.content || '', { ...st, x: st.x ?? clip.transform?.x ?? 50, y: st.y ?? clip.transform?.y ?? 50 }, W, H, localT, clip.duration)
      ctx.restore()
    }
  }

  // ---- burned captions ---------------------------------------------------
  if (settings.burnCaptions !== false) {
    const cap = project.captions || []
    const style = project.captionStyle || {}
    for (const cue of cap) {
      if (time < cue.start || time >= cue.end) continue
      ctx.save()
      drawTextBlock(ctx, cue.text || '', style, W, H, time - cue.start, Math.max(0.1, cue.end - cue.start))
      ctx.restore()
    }
  }

  // ---- overlays (watermark, bars, progress, grain, vignette) ------------
  const wm = settings.watermark
  if (wm?.enabled && wm.text) {
    ctx.save()
    ctx.globalAlpha = wm.opacity ?? 0.5
    const size = ((wm.size || 4) / 100) * H
    ctx.font = `700 ${size}px Cairo, Tahoma, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.direction = ARABIC_RE.test(wm.text) ? 'rtl' : 'ltr'
    const pad = Math.round(H * 0.035)
    const pos = wm.pos || 'br'
    const x = pos.includes('l') ? pad : pos.includes('c') ? W / 2 : W - pad
    const y = pos[0] === 't' ? pad + size : H - pad
    ctx.textAlign = pos.includes('c') ? 'center' : pos.includes('l') ? 'left' : 'right'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 8
    ctx.fillText(wm.text, x, y)
    ctx.restore()
  }

  if (settings.letterbox > 0) {
    const bar = (settings.letterbox / 100) * H * 0.5
    ctx.save()
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, bar)
    ctx.fillRect(0, H - bar, W, bar)
    ctx.restore()
  }

  if (settings.progressBar) {
    const total = projectDuration(project)
    const ph = Math.max(3, ((settings.progressBarThickness || 0.7) / 100) * H)
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(0, H - ph, W, ph)
    ctx.fillStyle = settings.progressBarColor || '#5ee7ff'
    ctx.fillRect(0, H - ph, W * clamp(time / total), ph)
    ctx.restore()
  }

  if (settings.vignette) {
    ctx.save()
    const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
    grd.addColorStop(0, 'rgba(0,0,0,0)')
    grd.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, settings.vignette / 100)})`)
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  if (settings.grain) {
    ctx.save()
    ctx.globalAlpha = Math.min(0.5, settings.grain / 100)
    ctx.globalCompositeOperation = 'overlay'
    const pat = grainPattern(ctx)
    ctx.translate((Math.random() * 128) | 0, (Math.random() * 128) | 0)
    ctx.fillStyle = pat
    ctx.fillRect(-128, -128, W + 256, H + 256)
    ctx.restore()
  }

  if (dynamicOnly) return

  // subtle idle indicator when there is nothing on the timeline
  const empty = project.tracks.every((t) => t.clips.length === 0)
  if (empty) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.font = `600 ${H * 0.03}px Cairo, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('Laqta AI', W / 2, H / 2)
    ctx.restore()
  }
}

/** Render a frame into a fresh (or provided) canvas — used for posters. */
export function renderToCanvas(project, time, getAsset, canvas, gfx) {
  const W = canvas.width
  const H = canvas.height
  renderFrame({ ctx: canvas.getContext('2d'), project, time, getAsset, width: W, height: H, gfx })
  return canvas
}
