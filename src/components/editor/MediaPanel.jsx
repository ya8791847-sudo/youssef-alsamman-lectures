import { useRef, useState } from 'react'
import { useI18n, fmtDur, fmtSize } from '../../i18n/index.jsx'
import { importFiles, registerGenerated, makeTitleCard, makeSolid, deleteMediaBlob } from '../../store/media.js'
import * as audio from '../../engine/audio.js'
import { videoPoster } from '../../engine/analysis.js'
import { useStore, patchUi, toast, setBusy, setProgress } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { Icon, EmptyNote } from '../ui.jsx'

export default function MediaPanel() {
  const { t, lang } = useI18n()
  const project = useStore((s) => s.project)
  const selectedMedia = useStore((s) => s.ui.selectedMedia)
  const [over, setOver] = useState(false)
  const [recording, setRecording] = useState(null)
  const fileRef = useRef(null)
  const busy = useStore((s) => s.busy)

  if (!project) return null

  const doImport = async (files) => {
    if (!files?.length) return
    setBusy(t('media.importing'), 0)
    const list = await importFiles(files, {
      onProgress: (p, name) => {
        setProgress(p)
        void name
      },
    })
    const good = list.filter((m) => m.id)
    const bad = list.filter((m) => m.error)
    if (good.length) {
      A.addMedia(good)
      patchUi({ selectedMedia: good[0].id })
      toast('toast.mediaImported', 'ok')
    }
    if (bad.length) toast('toast.unsupported', 'warn')
    setBusy(null)
  }

  const record = async () => {
    if (recording) {
      recording.stop()
      setRecording(null)
      return
    }
    try {
      const rec = await audio.recordVoiceover()
      setRecording(rec)
      const blob = await rec.done
      setRecording(null)
      if (blob.size > 1000) {
        const meta = await registerGenerated(`تعليق صوتي ${new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB')}`, blob, 'audio')
        A.addMedia([meta])
        A.addMediaToTimeline(meta.id)
        toast('toast.recordingDone', 'ok')
      }
    } catch (e) {
      setRecording(null)
      toast('toast.micDenied', 'err')
    }
  }

  const genTitleCard = async () => {
    setBusy(t('common.working'), 0.2)
    const blob = await makeTitleCard({
      title: project.name,
      subtitle: lang === 'ar' ? 'استوديو لقطة AI' : 'Laqta AI Studio',
      width: project.width,
      height: project.height,
      theme: Math.floor(Math.random() * 5),
    })
    const meta = await registerGenerated('كارت عنوان', blob, 'image')
    A.addMedia([meta])
    A.addMediaToTimeline(meta.id, { at: 0, duration: 3 })
    setBusy(null)
    toast('toast.clipAdded', 'ok')
  }

  const genSolid = async () => {
    const blob = await makeSolid({ width: project.width, height: project.height, color: '#0b1220' })
    const meta = await registerGenerated('خلفية صلبة', blob, 'image')
    A.addMedia([meta])
    toast('toast.clipAdded', 'ok')
  }

  const genTone = async () => {
    setBusy(t('common.working'), 0.3)
    const blob = await audio.generateTone({ freq: 220, freq2: 880, duration: 4 })
    const meta = await registerGenerated('نغمة مُولَّدة', blob, 'audio')
    A.addMedia([meta])
    const clip = A.addMediaToTimeline(meta.id, { duration: 4 })
    if (clip) A.updateClip(clip.id, (c) => ({ audio: { ...c.audio, fadeIn: 0.6, fadeOut: 1 } }))
    setBusy(null)
    toast('toast.clipAdded', 'ok')
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="row gap-6">
          <Icon name="folder" size={13} /> {t('media.title')}
        </span>
        <span className="tiny muted">
          {project.media.length} {t('media.files')}
        </span>
      </div>

      <div className="panel-body">
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            doImport(e.dataTransfer.files)
          }}
        >
          <Icon name="upload" size={20} />
          <div className="bold" style={{ marginTop: 6 }}>
            {t('media.drop')}
          </div>
          <div className="tiny">{t('media.dropHint')}</div>
          <input ref={fileRef} type="file" multiple accept="video/*,audio/*,image/*" onChange={(e) => doImport(e.target.files)} />
        </div>

        <div className="inline-btns" style={{ marginBottom: 10 }}>
          <button className={`btn sm ${recording ? 'danger' : ''}`} onClick={record} disabled={!navigator.mediaDevices?.getUserMedia}>
            <Icon name="mic" size={13} /> {recording ? t('media.recording') : t('media.record')}
          </button>
          <button className="btn sm" onClick={genTitleCard} disabled={!!busy}>
            <Icon name="text" size={13} /> {t('media.genCard')}
          </button>
          <button className="btn sm" onClick={genSolid}>
            <Icon name="image" size={13} /> {t('media.genSolid')}
          </button>
          <button className="btn sm" onClick={genTone} disabled={!!busy}>
            <Icon name="music" size={13} /> {t('media.genAudio')}
          </button>
          <button className="btn sm soft" onClick={() => patchUi({ leftTab: 'ai' })}>
            <Icon name="sparkles" size={13} /> {t('media.genMusic')}
          </button>
        </div>

        {project.media.length === 0 ? (
          <EmptyNote>{t('media.empty')}</EmptyNote>
        ) : (
          <>
            <div className="inline-btns" style={{ marginBottom: 8 }}>
              <button className="btn sm ghost" onClick={() => A.addAllMedia()}>
                <Icon name="layers" size={13} /> {t('media.addAll')}
              </button>
            </div>
            <div className="media-grid">
              {project.media.map((m) => (
                <div
                  key={m.id}
                  className={`media-card ${selectedMedia === m.id ? 'selected' : ''}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/laqta-media', m.id)}
                  onClick={() => patchUi({ selectedMedia: m.id })}
                >
                  <div className="thumb" style={m.poster ? { backgroundImage: `url(${m.poster})` } : undefined}>
                    {!m.poster ? <Icon name={m.kind === 'audio' ? 'music' : m.kind === 'image' ? 'image' : 'film'} size={20} /> : null}
                    <span className="badge-kind">{m.kind === 'video' ? 'VIDEO' : m.kind === 'audio' ? 'AUDIO' : 'IMG'}</span>
                    {m.missing ? <span className="badge-kind" style={{ top: 'auto', bottom: 4, background: 'rgba(255,95,109,.8)' }}>!</span> : null}
                  </div>
                  <div className="meta">
                    <b className="ellipsis" title={m.name}>
                      {m.name}
                    </b>
                    <span>
                      {m.kind === 'image' ? `${m.width}×${m.height}` : fmtDur(m.duration)} · {fmtSize(m.size)}
                      {m.hasAudio === false ? ` · ${t('media.noAudio')}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="divider" />
            <div className="inline-btns">
              <button className="btn sm primary" disabled={!selectedMedia} onClick={() => selectedMedia && A.addMediaToTimeline(selectedMedia)}>
                <Icon name="plus" size={13} /> {t('media.addToTimeline')}
              </button>
              <button
                className="btn sm danger"
                disabled={!selectedMedia}
                onClick={async () => {
                  if (!selectedMedia) return
                  A.removeMedia(selectedMedia)
                  await deleteMediaBlob(selectedMedia)
                  patchUi({ selectedMedia: null })
                  toast('toast.deleted', 'ok')
                }}
              >
                <Icon name="trash" size={13} /> {t('media.remove')}
              </button>
              <button
                className="btn sm ghost"
                disabled={!selectedMedia}
                onClick={async () => {
                  const m = project.media.find((x) => x.id === selectedMedia)
                  if (!m) return
                  setBusy(t('toast.analysing'), 0.3)
                  try {
                    if (m.kind === 'video' && m.url) {
                      const p = await videoPoster(m.url, 0.3, 320)
                      A.updateMedia(m.id, { poster: p.dataUrl, width: p.width, height: p.height, duration: p.duration, hasAudio: m.hasAudio })
                    }
                    toast('media.analyzed', 'ok')
                  } catch {
                    toast('err.media', 'err')
                  }
                  setBusy(null)
                }}
              >
                <Icon name="target" size={13} /> {t('media.analyze')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
