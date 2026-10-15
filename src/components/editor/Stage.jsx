import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n, fmtTime } from '../../i18n/index.jsx'
import { engine } from '../../engine/player.js'
import * as audio from '../../engine/audio.js'
import { useStore, patchUi, toast } from '../../store/store.js'
import { exportStill, downloadBlob } from '../../engine/exporter.js'
import { Icon } from '../ui.jsx'

export default function Stage() {
  const { t } = useI18n()
  const project = useStore((s) => s.project)
  const analyzing = useStore((s) => s.ui.analyzing)
  const timelineCollapsed = useStore((s) => s.ui.timelineCollapsed)
  const wrapRef = useRef(null)
  const holderRef = useRef(null)
  const canvasRef = useRef(null)
  const timeRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [mute, setMute] = useState(false)
  const meterRef = useRef(null)
  const [volume, setVolume] = useState(project?.settings?.masterVolume ?? 1)
  const [fit, setFit] = useState('fit')

  // keep the engine in sync with the project
  useEffect(() => {
    if (!project) return
    engine.attachProject(project)
    engine.duration = Math.max(1, projectDuration(project))
    audio.setMasterVolume(project.settings?.masterVolume ?? 1)
    if (!engine.playing) engine.render()
  }, [project])

  useEffect(() => {
    const off = engine.onState((s) => setPlaying(s.playing))
    const tick = engine.onTick((time) => {
      if (timeRef.current) timeRef.current.textContent = `${fmtTime(time, { frames: 1, fps: project?.fps || 30 })} / ${fmtTime(engine.duration)}`
    })
    return () => {
      off()
      tick()
    }
  }, [project?.fps])

  useEffect(() => {
    timeRef.current.textContent = `${fmtTime(engine.time, { frames: 1, fps: project?.fps || 30 })} / ${fmtTime(engine.duration)}`
  })

  // level meter — written directly to the DOM so playback never re-renders the stage
  useEffect(() => {
    let raf = 0
    let level = 0
    let last = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      // when idle, refresh at ~12fps instead of 60fps (battery on phones)
      if (!engine.playing && now - last < 80) return
      last = now
      const v = audio.level()
      level = v > level ? v : level * 0.86
      const el = meterRef.current
      if (el) el.style.width = `${Math.min(100, level * 130)}%`
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // canvas sizing
  useLayoutEffect(() => {
    if (!project || !canvasRef.current) return
    const measure = () => {
      const wrap = wrapRef.current
      if (!wrap) return
      const box = wrap.getBoundingClientRect()
      const ratio = project.width / project.height
      const maxW = Math.max(80, box.width - 24)
      const maxH = Math.max(60, box.height - 24)
      let w = maxW
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      const holder = holderRef.current
      if (holder) {
        holder.style.width = `${Math.round(w)}px`
        holder.style.height = `${Math.round(h)}px`
      }
      const scale = fit === 'half' ? 0.5 : fit === 'full' ? 1 : 0.66
      const cap = 1920
      const backingW = Math.min(cap, Math.max(320, Math.round(project.width * scale)))
      const backingH = Math.round((backingW * project.height) / project.width)
      engine.setCanvas(canvasRef.current, { width: backingW, height: backingH })
      engine.resize(backingW, backingH)
      engine.render()
    }
    measure()
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      if (wrapRef.current) ro.observe(wrapRef.current)
    } else {
      // older WebViews: re-measure on window resize as a fallback
      window.addEventListener('resize', measure)
      window.addEventListener('orientationchange', measure)
    }
    return () => {
      if (ro) ro.disconnect()
      else {
        window.removeEventListener('resize', measure)
        window.removeEventListener('orientationchange', measure)
      }
    }
  }, [project, fit])

  if (!project) return null

  const togglePlay = () => engine.toggle()
  const applyVolume = (v) => {
    setVolume(v)
    audio.setMasterVolume(v)
  }

  return (
    <div className="stage">
      <div className="stage-view" ref={wrapRef}>
        <div className="canvas-wrap checker" ref={holderRef} style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            onClick={togglePlay}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            aria-label={t('shot.playPause')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                togglePlay()
              }
            }}
          />
          <div className="stage-overlay-badges" aria-hidden="true">
            <span className="chip">
              <Icon name="film" size={11} /> {project.width}×{project.height}
            </span>
            <span className="chip">{project.fps} fps</span>
            {playing ? (
              <span className="chip on">
                <Icon name="play" size={10} fill /> {t('shot.playPause').split('(')[0]}
              </span>
            ) : null}
            {analyzing ? (
              <span className="chip pink pulse">
                <Icon name="sparkles" size={11} /> {t('common.working')}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="transport">
        <button className="btn icon" title={t('cap.start')} aria-label={t('cap.start')} onClick={() => engine.seek(0)}>
          <Icon name="undo" size={15} />
        </button>
        <button className="btn icon" title={t('shot.frameStep')} aria-label={t('shot.frameStep')} onClick={() => engine.stepFrame(-1)}>
          <Icon name="chevronRight" size={15} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button className="play-btn" onClick={togglePlay} title={t('shot.playPause')} aria-label={t('shot.playPause')}>
          <Icon name={playing ? 'pause' : 'play'} size={18} fill />
        </button>
        <button className="btn icon" title={t('shot.frameStep')} aria-label={t('shot.frameStep')} onClick={() => engine.stepFrame(1)}>
          <Icon name="chevronRight" size={15} />
        </button>
        <button className="btn icon" title={t('cap.end')} aria-label={t('cap.end')} onClick={() => engine.seek(engine.duration)}>
          <Icon name="redo" size={15} />
        </button>

        <div className="time-display" ref={timeRef}>
          00:00.00 / 00:00
        </div>

        <select className="select" aria-label={t('aud.rate')} style={{ width: 78, padding: '4px 8px' }} value={rate} onChange={(e) => { const v = Number(e.target.value); setRate(v); engine.setRate(v) }}>
          {[0.25, 0.5, 1, 1.5, 2].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>

        <div className="row gap-6" style={{ minWidth: 132 }}>
          <button
            className="btn icon ghost"
            aria-label={volume === 0 || mute ? t('tl.mute') : t('aud.master')}
            title={volume === 0 || mute ? t('tl.mute') : t('aud.master')}
            onClick={() => {
              const m = !mute
              setMute(m)
              audio.setOutputMuted(m)
            }}
          >
            <Icon name={mute || volume === 0 ? 'volumeOff' : 'volume'} size={15} />
          </button>
          <input
            type="range"
            min="0"
            max="1.4"
            step="0.02"
            value={volume}
            onChange={(e) => applyVolume(parseFloat(e.target.value))}
            aria-label={t('aud.master')}
            style={{ width: 66 }}
          />
        </div>

        <div className="row gap-6">
          <span className="tiny muted">{t('aud.meter')}</span>
          <div className="meter">
            <i ref={meterRef} />
          </div>
        </div>

        <div className="grow" />

        <select className="select" style={{ width: 92, padding: '4px 8px' }} value={fit} onChange={(e) => setFit(e.target.value)}>
          <option value="half">480p</option>
          <option value="fit">720p</option>
          <option value="full">1080p</option>
        </select>
        <button className="btn icon ghost" title={t('exp.frame')} aria-label={t('exp.frame')} onClick={() => flipFrame(project)}>
          <Icon name="image" size={15} />
        </button>
        <button
          className="btn icon ghost"
          title={t('tl.collapse')}
          aria-label={t('tl.collapse')}
          onClick={() => patchUi({ timelineCollapsed: !timelineCollapsed })}
        >
          <Icon name={timelineCollapsed ? 'chevronDown' : 'chevronRight'} size={15} />
        </button>
      </div>
    </div>
  )
}

function projectDuration(project) {
  let end = 0
  for (const t of project.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration)
  for (const c of project.captions || []) end = Math.max(end, c.end)
  return Math.max(end, 1)
}

async function flipFrame(project) {
  try {
    const { blob } = await exportStill({ width: project.width, height: project.height })
    downloadBlob(blob, `${project.name}-frame.png`)
    toast('toast.exported', 'ok')
  } catch (e) {
    toast('err.title', 'err')
    console.warn(e)
  }
}
