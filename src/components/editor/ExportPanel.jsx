import { useState } from 'react'
import { useI18n, fmtDur, fmtSize } from '../../i18n/index.jsx'
import { RES_PRESETS } from '../../engine/presets.js'
import {
  exportVideo,
  exportAudioWav,
  exportStill,
  toSrt,
  toVtt,
  projectToJson,
  downloadBlob,
  isStandalone,
  recorderSupported,
  bestVideoMime,
  estimateSize,
} from '../../engine/exporter.js'
import { engine } from '../../engine/player.js'
import { useStore, toast, setBusy, setProgress, markSaved } from '../../store/store.js'
import { totalDuration } from '../../store/model.js'
import { saveProject } from '../../store/media.js'
import { Icon, Section, RangeField, SelectField, SwitchField, Progress } from '../ui.jsx'

export default function ExportPanel() {
  const { t } = useI18n()
  const project = useStore((s) => s.project)
  const [res, setRes] = useState('1080p')
  const [fps, setFps] = useState(30)
  const [bitrate, setBitrate] = useState(8)
  const [muteOutput, setMuteOutput] = useState(true)
  const [progress, setLocalProgress] = useState(0)
  const [busyLabel, setBusyLabel] = useState('')
  const [result, setResult] = useState(null)
  const [job, setJob] = useState(null)
  const [savedUrl, setSavedUrl] = useState('')

  if (!project) return null
  const duration = totalDuration(project)
  const preset = RES_PRESETS.find((r) => r.id === res) || RES_PRESETS[2]
  const portrait = project.height > project.width
  const outW = portrait ? preset.long : preset.short
  const outH = portrait ? preset.short : preset.long
  const supported = recorderSupported()
  const mime = supported ? bestVideoMime() : ''

  const startVideo = () => {
    if (!supported) {
      toast('exp.compatWarning', 'err')
      return
    }
    setResult(null)
    setLocalProgress(0)
    setBusyLabel(t('exp.recording'))
    const rec = exportVideo({
      width: outW,
      height: outH,
      fps,
      bitrate: bitrate * 1_000_000,
      muteOutput,
      onProgress: setLocalProgress,
      onDone: (r) => {
        setResult({ kind: 'video', ...r })
        setBusyLabel('')
        setJob(null)
        toast('toast.exported', 'ok', t('exp.done'))
      },
      onError: (e) => {
        setBusyLabel('')
        setJob(null)
        toast('err.export', 'err')
        console.warn(e)
      },
    })
    if (rec) setJob(rec)
  }

  const startWav = async () => {
    setBusy(t('common.working'), 0.1)
    try {
      const blob = await exportAudioWav({ onProgress: (p) => setProgress(p) })
      setResult({ kind: 'audio', ...blob })
      toast('toast.exported', 'ok')
    } catch (e) {
      toast('err.decode', 'err')
    }
    setBusy(null)
  }

  const startPoster = async () => {
    setBusy(t('common.working'), 0.3)
    try {
      const still = await exportStill({ width: outW, height: outH })
      setResult({ kind: 'image', ...still })
      toast('toast.exported', 'ok')
    } catch (e) {
      toast('err.title', 'err')
    }
    setBusy(null)
  }

  const saveLocal = async () => {
    await saveProject(project)
    markSaved()
    toast('toast.saved', 'ok')
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="row gap-6">
          <Icon name="download" size={13} /> {t('exp.title')}
        </span>
        <span className="tiny muted">
          {fmtDur(duration)} · {outW}×{outH}
        </span>
      </div>

      <div className="panel-body">
        {!supported ? <div className="warn-box" style={{ marginBottom: 10 }}>{t('exp.compatWarning')}</div> : null}

        <Section title={t('exp.video')} icon="film">
          <SelectField
            label={t('exp.res')}
            value={res}
            onChange={setRes}
            options={RES_PRESETS.map((r) => ({ value: r.id, label: r.label }))}
          />
          <SelectField label={t('exp.fps')} value={String(fps)} onChange={(v) => setFps(Number(v))} options={['24', '30', '50', '60']} />
          <RangeField label={t('exp.bitrate')} value={bitrate} min={2} max={24} step={1} onChange={setBitrate} suffix=" Mbps" />
          <SwitchField label={t('exp.muteWhileExport')} value={muteOutput} onChange={setMuteOutput} />
          <div className="kv">
            <span>{t('exp.estimate')}</span>
            <b className="mono">{fmtDur(duration)}</b>
          </div>
          <div className="kv">
            <span>{t('exp.size')}</span>
            <b className="mono">{fmtSize(estimateSize(bitrate * 1_000_000, duration))}</b>
          </div>
          <div className="kv">
            <span>{t('exp.format')}</span>
            <b className="mono tiny">{mime || 'webm'}</b>
          </div>
          {busyLabel ? (
            <div style={{ marginTop: 8 }}>
              <div className="tiny dim">{busyLabel}</div>
              <Progress value={progress} />
              <button className="btn sm danger block" style={{ marginTop: 6 }} onClick={() => job?.cancel()}>
                {t('exp.stop')}
              </button>
            </div>
          ) : (
            <button className="btn primary block" style={{ marginTop: 8 }} onClick={startVideo} disabled={!supported}>
              <Icon name="record" size={14} /> {t('exp.start')}
            </button>
          )}
          <div className="warn-box" style={{ marginTop: 8 }}>
            {t('exp.note')}
          </div>
        </Section>

        <Section title={t('exp.audio')} icon="music" defaultOpen={false}>
          <div className="tiny muted" style={{ marginTop: 0, marginBottom: 6 }}>
            {t('exp.audioOnlyNote')}
          </div>
          <button className="btn block" onClick={startWav}>
            <Icon name="download" size={13} /> {t('exp.audio')}
          </button>
        </Section>

        <Section title={t('exp.poster')} icon="image" defaultOpen={false}>
          <button className="btn block" onClick={startPoster}>
            <Icon name="image" size={13} /> {t('exp.poster')}
          </button>
        </Section>

        <Section title={t('exp.srt')} icon="text" defaultOpen={false}>
          <div className="inline-btns">
            <button className="btn sm" disabled={!project.captions.length} onClick={() => downloadBlob(new Blob([toSrt(project.captions)], { type: 'text/plain' }), `${project.name}.srt`)}>
              SRT
            </button>
            <button className="btn sm" disabled={!project.captions.length} onClick={() => downloadBlob(new Blob([toVtt(project.captions)], { type: 'text/plain' }), `${project.name}.vtt`)}>
              VTT
            </button>
          </div>
          <div className="tiny muted">{project.captions.length} {t('cap.count')}</div>
        </Section>

        <Section title={t('exp.project')} icon="save" defaultOpen={false}>
          <div className="inline-btns">
            <button className="btn sm" onClick={saveLocal}>
              <Icon name="save" size={13} /> {t('common.save')}
            </button>
            <button
              className="btn sm"
              onClick={() => downloadBlob(new Blob([projectToJson(project)], { type: 'application/json' }), `${project.name}.laqta.json`)}
            >
              <Icon name="download" size={13} /> JSON
            </button>
          </div>
          <div className="tiny muted">{t('exp.projectDesc')}</div>
        </Section>

        {result ? (
          <Section title={t('exp.done')} icon="check">
            <div className="tiny dim">
              {result.kind} · {fmtSize(result.size || result.blob?.size || 0)}
            </div>
            <button
              className="btn primary block"
              style={{ marginTop: 6 }}
              onClick={() => {
                const ext = result.kind === 'video' ? (result.mime?.includes('mp4') ? 'mp4' : 'webm') : result.kind === 'audio' ? 'wav' : 'png'
                setSavedUrl(downloadBlob(result.blob, `${project.name}.${ext}`))
              }}
            >
              <Icon name="download" size={13} /> {t('exp.download')}
            </button>
            {savedUrl ? (
              <>
                {isStandalone() ? <div className="tiny muted" style={{ marginTop: 6 }}>{t('exp.saveHint')}</div> : null}
                <a className="btn sm ghost block" style={{ marginTop: 6 }} href={savedUrl} target="_blank" rel="noreferrer" download>
                  <Icon name="folder" size={13} /> {t('exp.openFile')}
                </a>
              </>
            ) : null}
          </Section>
        ) : null}
      </div>
    </div>
  )
}
