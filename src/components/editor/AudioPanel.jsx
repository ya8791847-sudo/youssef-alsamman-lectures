import { useState } from 'react'
import { useI18n } from '../../i18n/index.jsx'
import { VOICE_PRESETS } from '../../engine/presets.js'
import * as audio from '../../engine/audio.js'
import { useStore, toast } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { blobFor } from '../../store/media.js'
import { Icon, Section, RangeField, SwitchField, SelectField, EmptyNote } from '../ui.jsx'

export default function AudioPanel() {
  const { t, lang } = useI18n()
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.ui.selection)
  const [stats, setStats] = useState({})
  if (!project) return null

  const audioTracks = project.tracks.filter((x) => x.kind === 'audio')
  const audioClips = project.tracks.flatMap((tr) => tr.clips.filter((c) => c.mediaId)).filter((c) => {
    const m = project.media.find((x) => x.id === c.mediaId)
    return m?.kind === 'audio' || m?.hasAudio
  })

  const measure = async () => {
    const out = {}
    for (const c of audioClips) {
      const blob = blobFor(c.mediaId)
      if (!blob) continue
      try {
        await audio.decodeMedia(c.mediaId, blob)
        out[c.mediaId] = audio.loudnessStats(c.mediaId)
      } catch {
        /* skip */
      }
    }
    setStats(out)
    toast('aud.analyzeLevels', 'ok')
  }

  const normalize = async () => {
    await measure()
    let changed = 0
    A.replaceTimeline((p) => {
      for (const tr of p.tracks) {
        for (const c of tr.clips) {
          if (!c.mediaId) continue
          const m = p.media.find((x) => x.id === c.mediaId)
          if (!(m?.kind === 'audio' || m?.hasAudio)) continue
          const st = stats[c.mediaId]
          if (!st) continue
          const target = -16
          const gain = Math.pow(10, (target - st.rmsDb) / 20)
          c.audio = { ...(c.audio || {}), volume: +(Math.max(0.2, Math.min(2.5, (c.audio?.volume ?? 1) * gain))).toFixed(3) }
          changed++
        }
      }
      return p
    })
    toast(changed ? 'toast.applied' : 'aud.noAudio', changed ? 'ok' : 'warn')
  }

  const applyVoiceAll = (presetId, amount = 100) => {
    const preset = VOICE_PRESETS.find((x) => x.id === presetId) || VOICE_PRESETS[0]
    const scaled = {}
    for (const [k, v] of Object.entries(preset.fx || {})) scaled[k] = typeof v === 'number' ? +(v * (amount / 100)).toFixed(2) : v
    A.replaceTimeline((p) => {
      for (const tr of p.tracks) {
        for (const c of tr.clips) {
          if (!c.mediaId) continue
          const m = p.media.find((x) => x.id === c.mediaId)
          if (!(m?.kind === 'audio' || m?.hasAudio)) continue
          c.audio = { ...(c.audio || {}), voiceFx: { preset: presetId, amount, fx: scaled } }
        }
      }
      return p
    })
    toast('toast.applied', 'ok')
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="row gap-6">
          <Icon name="volume" size={13} /> {t('aud.title')}
        </span>
        <span className="tiny muted">{audioClips.length}</span>
      </div>

      <div className="panel-body">
        <Section title={t('aud.master')} icon="sliders">
          <RangeField
            label={t('aud.master')}
            value={Math.round((project.settings?.masterVolume ?? 1) * 100)}
            min={0}
            max={150}
            step={5}
            onChange={(v) => {
              A.updateSettings({ masterVolume: v / 100 })
              audio.setMasterVolume(v / 100)
            }}
            suffix="%"
          />
          <SwitchField label={t('aud.ducking')} value={!!project.settings?.ducking} onChange={(v) => A.updateSettings({ ducking: v })} hint={t('aud.ducking')} />
          <div className="inline-btns">
            <button className="btn sm" onClick={measure} disabled={!audioClips.length}>
              <Icon name="wave" size={13} /> {t('aud.analyzeLevels')}
            </button>
            <button className="btn sm primary" onClick={normalize} disabled={!audioClips.length}>
              {t('aud.normalize')}
            </button>
            <button
              className="btn sm ghost"
              disabled={!audioClips.length}
              onClick={() => {
                A.replaceTimeline((p) => {
                  for (const tr of p.tracks)
                    for (const c of tr.clips) if (c.audio) c.audio = { ...c.audio, fadeIn: 0.4, fadeOut: 0.6 }
                  return p
                })
                toast('toast.applied', 'ok')
              }}
            >
              {t('aud.fadeAll')}
            </button>
          </div>
        </Section>

        <Section title={t('aud.voiceFx')} icon="mic">
          <div className="preset-grid">
            {VOICE_PRESETS.map((v) => (
              <button key={v.id} className="preset" onClick={() => applyVoiceAll(v.id)}>
                {v.name[lang === 'ar' ? 'ar' : 'en']}
              </button>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {t('ai.applyToAll')}
          </div>
        </Section>

        {audioTracks.length ? (
          <Section title={t('aud.music')} icon="music">
            {audioTracks.map((tr) => (
              <div key={tr.id} style={{ marginBottom: 8 }}>
                <div className="row between">
                  <span className="tiny">{tr.name}</span>
                  <button className={`btn sm ghost ${tr.muted ? 'active' : ''}`} onClick={() => A.toggleTrack(tr.id, 'muted')}>
                    <Icon name={tr.muted ? 'volumeOff' : 'volume'} size={12} />
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.02"
                  value={tr.volume ?? 1}
                  onChange={(e) => A.setTrackVolume(tr.id, parseFloat(e.target.value))}
                />
              </div>
            ))}
          </Section>
        ) : null}

        <Section title={t('aud.meter')} icon="wave" defaultOpen={false}>
          {Object.keys(stats).length === 0 ? (
            <EmptyNote>{t('aud.analyzeLevels')}</EmptyNote>
          ) : (
            Object.entries(stats).map(([id, st]) => {
              const m = project.media.find((x) => x.id === id)
              return (
                <div key={id} className="kv">
                  <span className="ellipsis" style={{ maxWidth: 130 }}>
                    {m?.name}
                  </span>
                  <b className="mono">
                    {st.peakDb} dB / {st.rmsDb} dB
                  </b>
                </div>
              )
            })
          )}
        </Section>

        <Section title={t('insp.audio')} icon="volume" defaultOpen={!!selection.length}>
          {selection.length === 0 ? (
            <EmptyNote>{t('insp.noSel')}</EmptyNote>
          ) : (
            selection.map((id) => {
              const clip = project.tracks.flatMap((x) => x.clips).find((c) => c.id === id)
              if (!clip) return null
              const a = clip.audio || {}
              return (
                <div key={id} style={{ marginBottom: 10 }}>
                  <div className="tiny dim ellipsis">{clip.name}</div>
                  <RangeField
                    label={t('insp.clipVolume')}
                    value={Math.round((a.volume ?? 1) * 100)}
                    min={0}
                    max={200}
                    step={5}
                    onChange={(v) => A.updateClip(id, (c) => ({ audio: { ...c.audio, volume: v / 100 } }))}
                    suffix="%"
                  />
                  <RangeField
                    label={t('insp.fadeIn')}
                    value={a.fadeIn ?? 0}
                    min={0}
                    max={4}
                    step={0.1}
                    onChange={(v) => A.updateClip(id, (c) => ({ audio: { ...c.audio, fadeIn: v } }))}
                    suffix="s"
                  />
                  <RangeField
                    label={t('insp.fadeOut')}
                    value={a.fadeOut ?? 0}
                    min={0}
                    max={4}
                    step={0.1}
                    onChange={(v) => A.updateClip(id, (c) => ({ audio: { ...c.audio, fadeOut: v } }))}
                    suffix="s"
                  />
                </div>
              )
            })
          )}
        </Section>

        <SelectField
          label={t('aud.voiceFx')}
          value="none"
          onChange={(v) => v !== 'none' && applyVoiceAll(v)}
          options={[{ value: 'none', label: t('common.select') }, ...VOICE_PRESETS.map((x) => ({ value: x.id, label: x.name[lang === 'ar' ? 'ar' : 'en'] }))]}
        />
      </div>
    </div>
  )
}
