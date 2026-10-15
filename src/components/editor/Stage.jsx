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
  const ui = useStore((s) => s.ui)
  const wrapRef = useRef(null)
  const holderRef = useRef(null)
  const canvasRef = useRef(null)
  const timeRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [mute, setMute] = useState(false)
  const [meter, setMeter] = useState(0)
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

  // level meter
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      setMeter((m) => {
        const v = audio.level()
        return v > m ? v : m * 0.86
      })
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
          <canvas ref={canvasRef} onClick={togglePlay} style={{ cursor: 'pointer' }} />
          <div className="stage-overlay-badges">
            <span className="chip">
              <Icon name="film" size={11} /> {project.width}×{project.height}
            </span>
            <span className="chip">{project.fps} fps</span>
            {playing ? (
              <span className="chip on">
                <Icon name="play" size={10} fill /> {t('shot.playPause').split('(')[0]}
              </span>
            ) : null}
            {ui.analyzing ? (
              <span className="chip pink pulse">
                <Icon name="sparkles" size={11} /> {t('common.working')}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="transport">
        <button className="btn icon" title={t('shot.prevClip')} onClick={() => engine.seek(Math.max(0, engine.time - 1))}>
          <Icon name="undo" size={15} />
        </button>
        <button className="btn icon" onClick={() => engine.seek(engine.time - 1 / (project.fps || 30))}>
          <Icon name="chevronRight" size={15} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button className="play-btn" onClick={togglePlay} title={t('shot.playPause')}>
          <Icon name={playing ? 'pause' : 'play'} size={18} fill />
        </button>
        <button className="btn icon" onClick={() => engine.seek(engine.time + 1 / (project.fps || 30))}>
          <Icon name="chevronRight" size={15} />
        </button>
        <button className="btn icon" onClick={() => engine.seek(engine.duration)}>
          <Icon name="redo" size={15} />
        </button>

        <div className="time-display" ref={timeRef}>
          00:00.00 / 00:00
        </div>

        <select className="select" style={{ width: 78, padding: '4px 8px' }} value={rate} onChange={(e) => { const v = Number(e.target.value); setRate(v); engine.setRate(v) }}>
          {[0.25, 0.5, 1, 1.5, 2].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>

        <div className="row gap-6" style={{ minWidth: 132 }}>
          <button
            className="btn icon ghost"
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
            style={{ width: 66 }}
          />
        </div>

        <div className="row gap-6">
          <span className="tiny muted">{t('aud.meter')}</span>
          <div className="meter">
            <i style={{ width: `${Math.min(100, meter * 130)}%` }} />
          </div>
        </div>

        <div className="grow" />

        <select className="select" style={{ width: 92, padding: '4px 8px' }} value={fit} onChange={(e) => setFit(e.target.value)}>
          <option value="half">480p</option>
          <option value="fit">720p</option>
          <option value="full">1080p</option>
        </select>
        <button className="btn icon ghost" title={t('exp.frame')} onClick={() => flipFrame(project)}>
          <Icon name="image" size={15} />
        </button>
        <button className="btn icon ghost" title={t('tl.collapse')} onClick={() => patchUi({ timelineCollapsed: !ui.timelineCollapsed })}>
          <Icon name={ui.timelineCollapsed ? 'chevronDown' : 'chevronRight'} size={15} />
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
