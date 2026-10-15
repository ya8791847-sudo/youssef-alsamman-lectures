import { useEffect, useRef, useState } from 'react'
import * as audio from '../../engine/audio.js'
import { blobFor } from '../../store/media.js'

const pending = new Set()

/** Decode (lazily, once) then return a peak envelope for a media item. */
export async function ensurePeaks(mediaId, buckets = 900) {
  if (audio.cachedBuffer(mediaId)) return audio.peaks(mediaId, buckets)
  if (pending.has(mediaId)) return null
  const blob = blobFor(mediaId)
  if (!blob || blob.size > 90 * 1024 * 1024) return null
  pending.add(mediaId)
  try {
    await audio.decodeMedia(mediaId, blob)
    return audio.peaks(mediaId, buckets)
  } catch {
    return null
  } finally {
    pending.delete(mediaId)
  }
}

export default function Waveform({ clip, zoom, width }) {
  const canvasRef = useRef(null)
  const [peaks, setPeaks] = useState(() => (audio.cachedBuffer(clip.mediaId) ? audio.peaks(clip.mediaId, 1200) : null))

  useEffect(() => {
    let alive = true
    if (!peaks) {
      ensurePeaks(clip.mediaId, 1200).then((p) => {
        if (alive && p) setPeaks(p)
      })
    }
    return () => {
      alive = false
    }
  }, [clip.mediaId, peaks])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = Math.max(2, Math.min(2400, Math.round(width)))
    const h = 26
    if (canvas.width !== w) canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    if (!peaks) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      ctx.fillRect(0, h / 2 - 1, w, 2)
      return
    }
    // map the visible source range to the peak window
    const total = peaks.length
    const bufDur = audio.cachedBuffer(clip.mediaId)?.duration || clip.duration
    const srcStart = (clip.srcStart || 0) / Math.max(0.001, bufDur)
    const srcEnd = ((clip.srcEnd ?? (clip.srcStart || 0) + clip.duration * (clip.speed || 1)) || 0) / Math.max(0.001, bufDur)
    const a = Math.max(0, Math.floor(srcStart * total))
    const b = Math.min(total, Math.max(a + 1, Math.floor(srcEnd * total)))
    ctx.fillStyle = 'rgba(255,255,255,0.62)'
    for (let x = 0; x < w; x++) {
      const idx = a + Math.floor(((b - a) * x) / w)
      const v = peaks[Math.min(total - 1, Math.max(0, idx))] || 0
      const bh = Math.max(1, v * (h - 3))
      ctx.fillRect(x, (h - bh) / 2, 1, bh)
    }
  }, [peaks, width, clip.srcStart, clip.srcEnd, clip.duration, clip.speed, clip.mediaId])

  return <canvas className="wave" ref={canvasRef} />
}
