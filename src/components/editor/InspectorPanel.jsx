import { useState } from 'react'
import { useI18n, fmtTime, fmtDur } from '../../i18n/index.jsx'
import { TRANSITIONS, TEXT_ANIMS, TEXT_PRESETS, CAPTION_FONTS, VOICE_PRESETS, FILTERS, DEFAULT_ADJ } from '../../engine/presets.js'
import { useStore, toast } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { engine } from '../../engine/player.js'
import { Icon, Section, RangeField, SelectField, SwitchField, ColorField, TextField, EmptyNote } from '../ui.jsx'
import { findClip, mediaById } from '../../store/model.js'

export default function InspectorPanel() {
  const { t, lang } = useI18n()
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.ui.selection)
  const [advanced, setAdvanced] = useState(false)
  if (!project) return null

  if (!selection.length) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="row gap-6">
            <Icon name="sliders" size={13} /> {t('insp.title')}
          </span>
        </div>
        <div className="panel-body">
          <EmptyNote>{t('insp.noSel')}</EmptyNote>
        </div>
      </div>
    )
  }

  const { clip, track } = findClip(project, selection[0])
  if (!clip) return null
  const media = clip.mediaId ? mediaById(project, clip.mediaId) : null
  const fx = { ...DEFAULT_ADJ, ...(clip.fx || {}) }
  const tr = clip.transform || {}
  const audio = clip.audio || {}
  const isText = clip.kind === 'text'
  const hasAudio = !!media?.hasAudio || media?.kind === 'audio'
  const local = engine.time - clip.start
  const norm = clip.duration ? Math.max(0, Math.min(1, local / clip.duration)) : 0

  const setFx = (key, v) => A.updateClip(clip.id, (c) => ({ fx: { ...DEFAULT_ADJ, ...(c.fx || {}), [key]: v } }))
  const setTr = (key, v) => A.updateClip(clip.id, (c) => ({ transform: { ...c.transform, [key]: v } }))
  const setText = (key, v) => A.updateClip(clip.id, (c) => ({ text: { ...c.text, [key]: v } }))
  const setText2 = (style) => A.updateClip(clip.id, (c) => ({ text: { ...c.text, ...style } }))
  const setAudio = (key, v) => A.updateClip(clip.id, (c) => ({ audio: { ...c.audio, [key]: v } }))

  const addKey = (prop, value) => {
    A.addKeyframe([clip.id], prop, engine.time, value)
    toast('insp.addKf', 'ok')
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="row gap-6">
          <Icon name={isText ? 'text' : clip.kind === 'audio' ? 'music' : 'film'} size={13} />
          <span className="ellipsis" style={{ maxWidth: 150 }}>
            {isText ? clip.text?.content?.slice(0, 22) : clip.name}
          </span>
        </span>
        <span className="row gap-4">
          <button className="btn icon sm ghost" title={t('common.duplicate')} onClick={() => A.duplicateClips([clip.id])}>
            <Icon name="copy" size={13} />
          </button>
          <button className="btn icon sm ghost" title={t('common.delete')} onClick={() => A.removeClips([clip.id])}>
            <Icon name="trash" size={13} />
          </button>
        </span>
      </div>

      <div className="panel-body">
        <div className="section">
          <div className="kv">
            <span>{t('insp.info')}</span>
            <b>
              {lang === 'ar' ? 'المسار' : 'Track'}: {track?.name}
            </b>
          </div>
          <div className="kv">
            <span>{t('cap.start')}</span>
            <b className="mono">{fmtTime(clip.start, { frames: 1, fps: project.fps })}</b>
          </div>
          <div className="kv">
            <span>{t('cap.end')}</span>
            <b className="mono">{fmtTime(clip.start + clip.duration, { frames: 1, fps: project.fps })}</b>
          </div>
          <div className="kv">
            <span>{t('exp.frame')}</span>
            <b className="mono">{fmtDur(clip.duration)}</b>
          </div>
          {media ? (
            <div className="kv">
              <span>{lang === 'ar' ? 'المصدر' : 'Source'}</span>
              <b className="ellipsis" style={{ maxWidth: 150 }}>
                {media.name}
              </b>
            </div>
          ) : null}
          <div className="row gap-6" style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={() => engine.seek(clip.start)}>
              <Icon name="play" size={12} fill /> {t('cap.start')}
            </button>
            <button className="btn sm" onClick={() => A.splitAt(engine.time, { all: false })}>
              <Icon name="scissors" size={12} /> {t('tl.split')}
            </button>
          </div>
        </div>

        {!isText ? (
          <Section title={t('insp.transform')} icon="crop">
            <RangeField label={t('insp.scale')} value={tr.scale ?? 100} min={10} max={300} step={1} onChange={(v) => setTr('scale', v)} suffix="%" />
            <RangeField label={t('insp.posX')} value={tr.x ?? 0} min={-100} max={100} step={1} onChange={(v) => setTr('x', v)} suffix="%" />
            <RangeField label={t('insp.posY')} value={tr.y ?? 0} min={-100} max={100} step={1} onChange={(v) => setTr('y', v)} suffix="%" />
            <RangeField label={t('insp.rotation')} value={tr.rotation ?? 0} min={-180} max={180} step={1} onChange={(v) => setTr('rotation', v)} suffix="°" />
            <RangeField label={t('insp.opacity')} value={tr.opacity ?? 100} min={0} max={100} step={1} onChange={(v) => setTr('opacity', v)} suffix="%" />
            <SelectField
              label={t('insp.fit')}
              value={tr.fit || 'cover'}
              onChange={(v) => setTr('fit', v)}
              options={[
                { value: 'cover', label: t('insp.fitCover') },
                { value: 'contain', label: t('insp.fitContain') },
                { value: 'stretch', label: t('insp.fitStretch') },
              ]}
            />
            <RangeField label={t('tl.speed')} value={clip.speed || 1} min={0.25} max={4} step={0.05} onChange={(v) => A.setClipSpeed(clip.id, v)} suffix="×" />
            <SwitchField label={t('insp.reversed')} value={!!clip.reversed} onChange={(v) => A.updateClip(clip.id, { reversed: v })} />
          </Section>
        ) : null}

        {isText ? (
          <Section title={t('insp.text')} icon="text">
            <TextField label={t('insp.textContent')} value={clip.text?.content} onChange={(v) => setText('content', v)} rows={3} />
            <SelectField label={t('insp.textFont')} value={clip.text?.font} onChange={(v) => setText('font', v)} options={CAPTION_FONTS.map((f) => ({ value: f.id, label: f.label }))} />
            <RangeField label={t('insp.textSize')} value={clip.text?.size ?? 7} min={2} max={20} step={0.2} onChange={(v) => setText('size', v)} suffix="%" format={(v) => `${Math.round(v * 10) / 10}%`} />
            <RangeField label={t('insp.textWeight')} value={clip.text?.weight ?? 800} min={300} max={900} step={100} onChange={(v) => setText('weight', v)} />
            <ColorField label={t('insp.textColor')} value={clip.text?.color} onChange={(v) => setText('color', v)} />
            <ColorField label={t('insp.textStroke')} value={clip.text?.stroke} onChange={(v) => setText('stroke', v)} />
            <RangeField label={t('insp.textStrokeW')} value={clip.text?.strokeW ?? 0} min={0} max={10} step={0.5} onChange={(v) => setText('strokeW', v)} />
            <RangeField label={t('insp.textShadow')} value={clip.text?.shadow ?? 0} min={0} max={50} step={1} onChange={(v) => setText('shadow', v)} />
            <SwitchField label={t('insp.textBg')} value={!!clip.text?.bg} onChange={(v) => setText('bg', v)} />
            {clip.text?.bg ? (
              <>
                <ColorField label={t('insp.textBgColor')} value={clip.text?.bgColor} onChange={(v) => setText('bgColor', v)} />
                <RangeField label={t('insp.opacity')} value={(clip.text?.bgAlpha ?? 0.7) * 100} min={10} max={100} step={5} onChange={(v) => setText('bgAlpha', v / 100)} suffix="%" />
              </>
            ) : null}
            <SelectField
              label={t('insp.textAlign')}
              value={clip.text?.align || 'center'}
              onChange={(v) => setText('align', v)}
              options={[
                { value: 'left', label: t('insp.alignLeft') },
                { value: 'center', label: t('insp.alignCenter') },
                { value: 'right', label: t('insp.alignRight') },
              ]}
            />
            <SelectField
              label={t('insp.textAnim')}
              value={clip.text?.anim || 'none'}
              onChange={(v) => setText('anim', v)}
              options={TEXT_ANIMS.map((x) => ({ value: x.id, label: x.name[lang === 'ar' ? 'ar' : 'en'] }))}
            />
            <RangeField label={t('insp.posX')} value={clip.text?.x ?? 50} min={0} max={100} step={1} onChange={(v) => setText('x', v)} suffix="%" />
            <RangeField label={t('insp.posY')} value={clip.text?.y ?? 50} min={0} max={100} step={1} onChange={(v) => setText('y', v)} suffix="%" />
            <SwitchField label={t('insp.textCase')} value={!!clip.text?.uppercase} onChange={(v) => setText('uppercase', v)} />
            <RangeField label={t('insp.textSpacing')} value={clip.text?.spacing ?? 0} min={-4} max={14} step={0.5} onChange={(v) => setText('spacing', v)} />
            <RangeField label={t('insp.textLineHeight')} value={clip.text?.lineHeight ?? 1.28} min={0.9} max={2.2} step={0.02} onChange={(v) => setText('lineHeight', v)} />
            <RangeField label={t('insp.textMaxWidth')} value={clip.text?.maxWidth ?? 86} min={20} max={100} step={1} onChange={(v) => setText('maxWidth', v)} suffix="%" />
            <div className="preset-grid" style={{ marginTop: 6 }}>
              {TEXT_PRESETS.map((p) => (
                <button key={p.id} className="preset" onClick={() => setText2(p.style)} title={p.name[lang === 'ar' ? 'ar' : 'en']}>
                  {p.name[lang === 'ar' ? 'ar' : 'en']}
                </button>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title={t('insp.filters')} icon="palette">
          <SelectField
            label={t('fx.filters')}
            value={clip.filterId || 'custom'}
            onChange={(v) => v !== 'custom' && A.applyFilter([clip.id], v)}
            options={[{ value: 'custom', label: t('insp.filters') }, ...FILTERS.map((f) => ({ value: f.id, label: f.name[lang === 'ar' ? 'ar' : 'en'] }))]}
          />
          <RangeField label={t('insp.brightness')} value={fx.brightness} min={-60} max={60} step={1} onChange={(v) => setFx('brightness', v)} />
          <RangeField label={t('insp.contrast')} value={fx.contrast} min={-60} max={80} step={1} onChange={(v) => setFx('contrast', v)} />
          <RangeField label={t('insp.saturation')} value={fx.saturation} min={-100} max={100} step={1} onChange={(v) => setFx('saturation', v)} />
          <RangeField label={t('insp.temperature')} value={fx.temperature} min={-60} max={60} step={1} onChange={(v) => setFx('temperature', v)} />
          <RangeField label={t('insp.hue')} value={fx.hue} min={-180} max={180} step={1} onChange={(v) => setFx('hue', v)} />
          <RangeField label={t('insp.sepia')} value={fx.sepia} min={0} max={100} step={1} onChange={(v) => setFx('sepia', v)} />
          <RangeField label={t('insp.blur')} value={fx.blur} min={0} max={20} step={0.5} onChange={(v) => setFx('blur', v)} />
          {advanced ? (
            <>
              <RangeField label={t('insp.sharpness')} value={fx.sharpen} min={0} max={100} step={1} onChange={(v) => setFx('sharpen', v)} />
              <RangeField label={t('fx.vignette')} value={fx.vignette} min={0} max={100} step={1} onChange={(v) => setFx('vignette', v)} />
              <RangeField label={t('fx.grain')} value={fx.grain} min={0} max={100} step={1} onChange={(v) => setFx('grain', v)} />
              <RangeField label={t('insp.opacity')} value={fx.glow} min={0} max={100} step={1} onChange={(v) => setFx('glow', v)} />
            </>
          ) : null}
          <div className="inline-btns">
            <button className="btn sm ghost" onClick={() => setAdvanced((a) => !a)}>
              {advanced ? t('common.close') : '…'}
            </button>
            <button className="btn sm ghost" onClick={() => A.updateClip(clip.id, { fx: { ...DEFAULT_ADJ } })}>
              {t('common.reset')}
            </button>
          </div>
        </Section>

        {!isText ? (
          <Section title={t('insp.transition')} icon="layers" defaultOpen={false}>
            <SelectField
              label={t('insp.transIn')}
              value={clip.transitions?.in?.type || 'none'}
              onChange={(v) => A.setTransition(clip.id, 'in', v, clip.transitions?.in?.dur ?? 0.5)}
              options={TRANSITIONS.map((x) => ({ value: x.id, label: x.name[lang === 'ar' ? 'ar' : 'en'] }))}
            />
            <SelectField
              label={t('insp.transOut')}
              value={clip.transitions?.out?.type || 'none'}
              onChange={(v) => A.setTransition(clip.id, 'out', v, clip.transitions?.out?.dur ?? 0.5)}
              options={TRANSITIONS.map((x) => ({ value: x.id, label: x.name[lang === 'ar' ? 'ar' : 'en'] }))}
            />
            <RangeField
              label={t('insp.transDur')}
              value={clip.transitions?.in?.dur ?? 0.5}
              min={0.15}
              max={2}
              step={0.05}
              onChange={(v) => {
                A.setTransition(clip.id, 'in', clip.transitions?.in?.type || 'fade', v)
                A.setTransition(clip.id, 'out', clip.transitions?.out?.type || 'fade', v)
              }}
              suffix="s"
            />
          </Section>
        ) : null}

        {!isText ? (
          <Section title={t('insp.chroma')} icon="target" defaultOpen={false}>
            <SwitchField
              label={t('insp.chroma')}
              value={!!clip.fx?.key?.enabled}
              onChange={(v) => A.updateClip(clip.id, (c) => ({ fx: { ...DEFAULT_ADJ, ...(c.fx || {}), key: { ...(c.fx?.key || {}), enabled: v, color: c.fx?.key?.color || '#00b140' } } }))}
            />
            {clip.fx?.key?.enabled ? (
              <>
                <ColorField label={t('insp.chromaPick')} value={clip.fx.key.color} onChange={(v) => setFx('key', { ...clip.fx.key, color: v })} />
                <RangeField label={t('insp.chromaSimilarity')} value={clip.fx.key.similarity || 30} min={5} max={80} step={1} onChange={(v) => setFx('key', { ...clip.fx.key, similarity: v })} />
                <RangeField label={t('insp.chromaSmooth')} value={clip.fx.key.smooth || 10} min={0} max={40} step={1} onChange={(v) => setFx('key', { ...clip.fx.key, smooth: v })} />
                <RangeField label={t('insp.chromaSpill')} value={clip.fx.key.spill || 40} min={0} max={100} step={1} onChange={(v) => setFx('key', { ...clip.fx.key, spill: v })} />
              </>
            ) : null}
          </Section>
        ) : null}

        <Section title={t('insp.keyframes')} icon="target" defaultOpen={false}>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            {t('insp.kfHint')}
          </p>
          <div className="tiny mono dim">
            {Math.round(norm * 100)}% ({fmtDur(Math.max(0, local))})
          </div>
          <div className="inline-btns" style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={() => addKey('scale', (tr.scale ?? 100) / 100)}>
              + {t('insp.scale')}
            </button>
            <button className="btn sm" onClick={() => addKey('x', tr.x ?? 0)}>
              + {t('insp.posX')}
            </button>
            <button className="btn sm" onClick={() => addKey('y', tr.y ?? 0)}>
              + {t('insp.posY')}
            </button>
            <button className="btn sm" onClick={() => addKey('rotation', tr.rotation ?? 0)}>
              + {t('insp.rotation')}
            </button>
            <button className="btn sm" onClick={() => addKey('opacity', (tr.opacity ?? 100) / 100)}>
              + {t('insp.opacity')}
            </button>
          </div>
          <div className="divider" />
          {Object.entries(clip.kf || {}).map(([prop, list]) => (
            <div key={prop} className="kv">
              <span>{prop}</span>
              <b className="mono">{list.length}</b>
            </div>
          ))}
          <div className="inline-btns">
            <button className="btn sm ghost" onClick={() => A.clearKeyframes([clip.id])}>
              {t('insp.clearKf')}
            </button>
            <button className="btn sm ghost" onClick={() => A.bakeKeyframes([clip.id])}>
              {t('insp.bakeKf')}
            </button>
          </div>
        </Section>

        {hasAudio ? (
          <Section title={t('insp.audio')} icon="volume">
            <RangeField label={t('insp.clipVolume')} value={Math.round((audio.volume ?? 1) * 100)} min={0} max={200} step={5} onChange={(v) => setAudio('volume', v / 100)} suffix="%" />
            <RangeField label={t('insp.pan')} value={audio.pan ?? 0} min={-1} max={1} step={0.05} onChange={(v) => setAudio('pan', v)} />
            <RangeField label={t('insp.fadeIn')} value={audio.fadeIn ?? 0} min={0} max={4} step={0.1} onChange={(v) => setAudio('fadeIn', v)} suffix="s" />
            <RangeField label={t('insp.fadeOut')} value={audio.fadeOut ?? 0} min={0} max={4} step={0.1} onChange={(v) => setAudio('fadeOut', v)} suffix="s" />
            <SelectField
              label={t('insp.voice')}
              value={audio.voiceFx?.preset || 'none'}
              onChange={(v) => {
                const preset = VOICE_PRESETS.find((x) => x.id === v) || VOICE_PRESETS[0]
                const amount = audio.voiceFx?.amount ?? 100
                const scaledFactor = amount / 100
                const scaled = {}
                for (const [k, val] of Object.entries(preset.fx || {})) scaled[k] = typeof val === 'number' ? +(val * scaledFactor).toFixed(2) : val
                setAudio('voiceFx', { preset: v, amount, fx: scaled })
              }}
              options={VOICE_PRESETS.map((v) => ({ value: v.id, label: v.name[lang === 'ar' ? 'ar' : 'en'] }))}
            />
            <RangeField
              label={t('ai.voiceAmount')}
              value={audio.voiceFx?.amount ?? 100}
              min={20}
              max={160}
              step={5}
              onChange={(v) => {
                const preset = VOICE_PRESETS.find((x) => x.id === (audio.voiceFx?.preset || 'none')) || VOICE_PRESETS[0]
                const scaled = {}
                for (const [k, val] of Object.entries(preset.fx || {})) scaled[k] = typeof val === 'number' ? +(val * (v / 100)).toFixed(2) : val
                setAudio('voiceFx', { preset: preset.id, amount: v, fx: scaled })
              }}
              suffix="%"
            />
          </Section>
        ) : null}
      </div>
    </div>
  )
}
