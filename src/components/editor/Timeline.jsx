import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, fmtTime } from '../../i18n/index.jsx'
import { engine } from '../../engine/player.js'
import * as audio from '../../engine/audio.js'
import { useStore, patchUi } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { totalDuration } from '../../store/model.js'
import { Icon } from '../ui.jsx'
import SceneTrack from './SceneTrack.jsx'
import Waveform from './Waveform.jsx'

const TRACK_H = 58
const SNAP_PX = 9

export default function Timeline() {
  const { t } = useI18n()
  const project = useStore((s) => s.project)
  const ui = useStore((s) => s.ui)
  const scrollRef = useRef(null)
  const innerRef = useRef(null)
  const headRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const [hoverTime, setHoverTime] = useState(null)
  const zoom = ui.zoom
  const duration = project ? totalDuration(project) : 1

  const selected = ui.selection
  const snapTargets = useMemo(() => {
    const list = [0]
    if (project) {
      for (const t of project.tracks) for (const c of t.clips) list.push(c.start, c.start + c.duration)
      for (const m of project.markers || []) list.push(m.t)
    }
    return list
  }, [project])

  // scrub helpers -----------------------------------------------------------
  const timeFromEvent = useCallback(
    (e) => {
      const el = innerRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      return Math.max(0, x / zoom)
    },
    [zoom],
  )

  const snap = useCallback(
    (t, { ignore = [], threshold = SNAP_PX / zoom } = {}) => {
      if (!ui.snap) return t
      let best = t
      let bestD = threshold
      for (const s of snapTargets) {
        if (ignore.some((v) => Math.abs(v - s) < 1e-6)) continue
        const d = Math.abs(s - t)
        if (d < bestD) {
          bestD = d
          best = s
        }
      }
      // second grid when zoomed in enough
      if (zoom > 34) {
        const grid = Math.round(t * 2) / 2
        if (Math.abs(grid - t) < threshold * 0.5 && Math.abs(grid - best) > 0) best = grid
      }
      return Math.max(0, best)
    },
    [snapTargets, ui.snap, zoom],
  )

  // drag & drop from the media pool ----------------------------------------
  const onDrop = (e) => {
    e.preventDefault()
    const mediaId = e.dataTransfer.getData('text/laqta-media')
    if (!mediaId) return
    const t2 = timeFromEvent(e)
    const lane = e.target.closest('[data-track-id]')
    const trackId = lane?.dataset.trackId || null
    A.addMediaToTimeline(mediaId, { at: Math.max(0, t2), trackId })
  }

  // pointer interactions on clips ------------------------------------------
  const startClipDrag = (e, clip, track, mode) => {
    e.stopPropagation()
    if (track.locked) return
    if (e.button !== 0) return
    const x0 = e.clientX
    const y0 = e.clientY
    const multi = e.shiftKey || e.metaKey || e.ctrlKey
    if (!selected.includes(clip.id)) A.ui.select(multi ? [...selected, clip.id] : [clip.id])
    setDrag({
      mode,
      clipId: clip.id,
      trackId: track.id,
      x0,
      y0,
      origStart: clip.start,
      origDuration: clip.duration,
      origSrcStart: clip.srcStart ?? 0,
      moved: false,
      overTrackId: track.id,
    })
    const move = (ev) => {
      ev.preventDefault()
      setDrag((d) => {
        if (!d) return d
        const dx = ev.clientX - d.x0
        const dt = dx / zoom
        const next = { ...d, moved: Math.abs(dx) > 2 || Math.abs(ev.clientY - d.y0) > 4 }
        if (d.mode === 'move') {
          const raw = Math.max(0, d.origStart + dt)
          next.start = snap(raw)
          const lane = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-track-id]')
          if (lane?.dataset.trackId) next.overTrackId = lane.dataset.trackId
        } else if (d.mode === 'trimL') {
          const maxDur = d.origDuration - 0.08
          const newStart = Math.max(0, Math.min(d.origStart + d.origDuration - 0.08, snap(d.origStart + dt)))
          next.start = newStart
          next.duration = d.origStart + d.origDuration - newStart
          next.srcStart = Math.max(0, d.origSrcStart + (newStart - d.origStart))
          next.minDur = maxDur
        } else if (d.mode === 'trimR') {
          const rawEnd = Math.max(0.1, d.origStart + d.origDuration + dt)
          const snapped = snap(rawEnd)
          next.duration = Math.max(0.08, snapped - d.origStart)
        }
        return next
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag((d) => {
        if (!d) return null
        if (d.moved) {
          if (d.mode === 'move') {
            A.moveClip(d.clipId, { start: d.start, trackId: d.overTrackId })
          } else if (d.mode === 'trimL') {
            A.trimClip(d.clipId, { start: d.start, duration: d.duration, srcStart: d.srcStart })
          } else {
            A.trimClip(d.clipId, { duration: d.duration })
          }
        }
        return null
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startScrub = (e) => {
    engine.pause()
    const apply = (ev) => {
      const t2 = Math.max(0, (ev.clientX - innerRef.current.getBoundingClientRect().left) / zoom)
      engine.seek(t2, { render: true, syncAudio: true })
    }
    apply(e)
    const up = () => {
      window.removeEventListener('pointermove', apply)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', apply)
    window.addEventListener('pointerup', up)
  }

  // playhead position + auto scroll ----------------------------------------
  const phRef = useRef(null)
  const lastTime = useRef(0)
  useEffect(() => {
    const off = engine.onTick((time) => {
      lastTime.current = time
      if (phRef.current) phRef.current.style.transform = `translateX(${time * zoom}px)`
      const sc = scrollRef.current
      if (sc && ui.autoScroll && engine.playing) {
        const x = time * zoom
        const head = 136
        if (x - sc.scrollLeft > sc.clientWidth - head - 60) sc.scrollLeft = x - sc.clientWidth + head + 60
        else if (x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 20)
      }
    })
    return off
  }, [zoom, ui.autoScroll])

  useEffect(() => {
    if (phRef.current) phRef.current.style.transform = `translateX(${engine.time * zoom}px)`
  }, [zoom, project])

  // ctrl+wheel zoom ---------------------------------------------------------
  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14
      A.ui.zoom(zoom * factor)
      return
    }
    if (e.shiftKey) {
      e.preventDefault()
      if (scrollRef.current) scrollRef.current.scrollLeft += e.deltaY
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected.length) {
        A.removeClips(selected)
        e.preventDefault()
      }
    }
  }

  if (!project) return null

  const totalWidth = Math.max(duration * zoom + 400, 700)
  const showBeatMarkers = (project.markers || []).some((m) => m.kind === 'beat')

  return (
    <div className="timeline" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="tl-toolbar">
        <button className="btn sm soft" onClick={() => A.splitAt(engine.time, { all: !selected.length })} title={t('shot.split')}>
          <Icon name="scissors" size={13} /> {t('tl.split')}
        </button>
        <button className="btn sm" onClick={() => A.removeClips(selected)} disabled={!selected.length} title={t('shot.delete')}>
          <Icon name="trash" size={13} /> {t('tl.delete')}
        </button>
        <button className="btn sm" onClick={() => A.removeClips(selected, { ripple: true })} disabled={!selected.length}>
          {t('tl.ripple')}
        </button>
        <button className="btn sm" onClick={() => A.duplicateClips(selected)} disabled={!selected.length} title={t('shot.duplicate')}>
          <Icon name="copy" size={13} /> {t('tl.duplicate')}
        </button>
        <button className="btn sm" onClick={() => A.addTextClip({ start: engine.time, duration: 3 })}>
          <Icon name="text" size={13} /> {t('editor.captions')}
        </button>
        <button className="btn sm" onClick={() => A.addMarker(engine.time, '★')} title={t('shot.marker')}>
          <Icon name="target" size={13} /> {t('tl.marker')}
        </button>
        <span className="divider" style={{ width: 1, height: 20, margin: '0 4px' }} />
        <button className={`btn sm ${ui.snap ? 'active' : ''}`} onClick={() => patchUi({ snap: !ui.snap })} title={t('shot.snapToggle')}>
          <Icon name="grid" size={13} /> {t('tl.snap')}
        </button>
        <button className={`btn sm ${ui.autoScroll ? 'active' : ''}`} onClick={() => patchUi({ autoScroll: !ui.autoScroll })}>
          {t('tl.autoScroll')}
        </button>
        <div className="grow" />
        <span className="tiny muted mono">{fmtTime(engine.time, { frames: 1, fps: project.fps })}</span>
        <button className="btn icon sm" onClick={() => A.ui.zoom(zoom / 1.25)} title={t('tl.zoomOut')}>
          <Icon name="zoomOut" size={14} />
        </button>
        <input type="range" min="8" max="400" value={zoom} onChange={(e) => A.ui.zoom(parseFloat(e.target.value))} style={{ width: 110 }} title={t('tl.zoomIn')} />
        <button className="btn icon sm" onClick={() => A.ui.zoom(zoom * 1.25)} title={t('tl.zoomIn')}>
          <Icon name="zoomIn" size={14} />
        </button>
        <button
          className="btn sm"
          onClick={() => {
            const w = scrollRef.current?.clientWidth || 900
            A.ui.zoom((w - 160) / Math.max(1, duration))
          }}
        >
          {t('tl.fit')}
        </button>
        {showBeatMarkers ? (
          <button className="btn sm" onClick={() => A.clearMarkers('beat')}>
            {t('tl.clearMarkers')}
          </button>
        ) : null}
        <button className="btn sm ghost" onClick={() => A.addTrack('overlay')} title={t('tl.addTrack')}>
          <Icon name="plus" size={13} /> {t('tl.addTrack')}
        </button>
      </div>

      <div className="tl-scroll" ref={scrollRef} onWheel={onWheel} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <div className="tl-inner" ref={innerRef} style={{ width: totalWidth }}>
          <div className="tl-ruler" ref={headRef} onPointerDown={startScrub} onMouseMove={(e) => setHoverTime(timeFromEvent(e))} onMouseLeave={() => setHoverTime(null)}>
            {rulerTicks(zoom, totalWidth, project.fps).map((tk) => (
              <div key={tk.t} className={`ruler-tick ${tk.minor ? 'minor' : ''}`} style={{ left: tk.t * zoom }}>
                {tk.label}
              </div>
            ))}
            <div className="playhead" ref={phRef} style={{ left: 0 }}>
              <span />
            </div>
            {hoverTime != null ? (
              <div style={{ position: 'absolute', left: hoverTime * zoom + 4, top: 3 }} className="tiny mono muted">
                {fmtTime(hoverTime, { frames: 1, fps: project.fps })}
              </div>
            ) : null}
          </div>

          <div style={{ position: 'absolute', top: 26, bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
            {(project.markers || []).map((m) => (
              <div key={m.id} className="tl-marker" style={{ left: m.t * zoom, borderColor: m.kind === 'beat' ? 'rgba(176,108,255,.8)' : undefined }}>
                {m.label ? <span style={{ background: m.kind === 'beat' ? 'rgba(176,108,255,.9)' : undefined }}>{m.label}</span> : null}
              </div>
            ))}
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="track-row" style={{ ['--track-h']: `${TRACK_H}px` }}>
              <div className="track-head" style={{ minHeight: TRACK_H }}>
                <div className="th-name">
                  <Icon name={track.kind === 'audio' ? 'music' : track.kind === 'text' ? 'text' : track.kind === 'overlay' ? 'layers' : 'film'} size={12} />
                  <span className="ellipsis" style={{ maxWidth: 74 }}>
                    {track.name}
                  </span>
                </div>
                <div className="th-actions">
                  <button className={track.hidden ? '' : 'on'} onClick={() => A.toggleTrack(track.id, 'hidden')} title={t('tl.hide')}>
                    <Icon name={track.hidden ? 'eyeOff' : 'eye'} size={12} />
                  </button>
                  <button className={track.muted ? 'on' : ''} onClick={() => A.toggleTrack(track.id, 'muted')} title={t('tl.mute')}>
                    <Icon name={track.muted ? 'volumeOff' : 'volume'} size={12} />
                  </button>
                  <button className={track.locked ? 'on' : ''} onClick={() => A.toggleTrack(track.id, 'locked')} title={t('tl.lock')}>
                    <Icon name={track.locked ? 'lock' : 'unlock'} size={12} />
                  </button>
                  <button onClick={() => A.removeTrack(track.id)} title={t('common.delete')}>
                    <Icon name="close" size={12} />
                  </button>
                </div>
              </div>
              <div className="lane-wrap">
                <div className="tl-track" data-track-id={track.id} style={{ ['--track-h']: `${TRACK_H}px` }}>
                  {track.clips.length === 0 ? (
                    <div className="tl-empty tiny">{t('tl.emptyTrack')}</div>
                  ) : null}
                  {track.clips.map((clip) => {
                    const ghost = drag && drag.clipId === clip.id ? drag : null
                    const start = ghost?.start ?? clip.start
                    const dur = ghost?.duration ?? clip.duration
                    const isSel = selected.includes(clip.id)
                    return (
                      <div
                        key={clip.id}
                        className={`tl-clip ${clip.kind} ${isSel ? 'selected' : ''} ${ghost?.moved ? 'dragging' : ''}`}
                        style={{ left: start * zoom, width: Math.max(6, dur * zoom) }}
                        onPointerDown={(e) => startClipDrag(e, clip, track, 'move')}
                        onDoubleClick={() => {
                          if (clip.kind === 'text') patchUi({ rightTab: 'inspect', selection: [clip.id] })
                        }}
                        title={`${clip.name} — ${dur.toFixed(2)}s`}
                        data-clip-id={clip.id}
                      >
                        {clip.poster || clip.kind === 'image' ? <div className="thumb-strip">{clip.poster ? <img src={clip.poster} alt="" /> : null}</div> : null}
                        {clip.kind === 'audio' ? <Waveform clip={clip} zoom={zoom} width={Math.max(6, dur * zoom)} /> : null}
                        <div className="clip-body">
                          <span className="clip-title">{clip.kind === 'text' ? clip.text?.content : clip.name}</span>
                          <span className="clip-kind">
                            {clip.kind === 'text' ? 'TEXT' : clip.kind === 'audio' ? 'AUDIO' : clip.kind === 'image' ? 'IMAGE' : 'VIDEO'}
                            {clip.speed && clip.speed !== 1 ? ` · ${clip.speed}×` : ''}
                            {clip.fx?.key?.enabled ? ' · KEY' : ''}
                            {clip.kf && Object.keys(clip.kf).length ? ' · KF' : ''}
                          </span>
                        </div>
                        <div className="tl-handle" style={{ insetInlineStart: 0 }} onPointerDown={(e) => startClipDrag(e, clip, track, 'trimL')} />
                        <div className="tl-handle end" onPointerDown={(e) => startClipDrag(e, clip, track, 'trimR')} />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}

          {project.tracks.every((t2) => t2.clips.length === 0) ? (
            <div className="tl-empty">
              {t('tl.noTimeline')}
              <div className="row gap-8 center" style={{ justifyContent: 'center', marginTop: 10 }}>
                <button className="btn primary sm" onClick={() => A.addTextClip({ start: 0, duration: 3 })}>
                  <Icon name="text" size={13} /> {t('editor.captions')}
                </button>
                <button className="btn sm" onClick={() => A.addTrack('overlay')}>
                  <Icon name="layers" size={13} /> {t('tl.addTrack')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <SceneTrack />
    </div>
  )
}

function rulerTicks(zoom, width, fps) {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  const step = steps.find((s) => s * zoom > 62) || 600
  const minor = step / 5
  const out = []
  const end = width / zoom
  for (let t = 0; t <= end; t += minor) {
    const isMajor = Math.abs(t / step - Math.round(t / step)) < 1e-6
    out.push({ t: +t.toFixed(3), minor: !isMajor, label: isMajor ? fmtTime(t, { fps: 0 }) : '' })
  }
  void fps
  return out
}
