import { useRef } from 'react'
import { useI18n } from '../../i18n/index.jsx'
import { CAPTION_FONTS, TEXT_ANIMS } from '../../engine/presets.js'
import { useStore, toast, patchUi } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { engine } from '../../engine/player.js'
import { toSrt, toVtt, parseSubtitles, downloadBlob } from '../../engine/exporter.js'
import { Icon, Section, RangeField, SelectField, SwitchField, ColorField, EmptyNote } from '../ui.jsx'

export default function CaptionsPanel() {
  const { t, lang } = useI18n()
  const project = useStore((s) => s.project)
  const fileRef = useRef(null)
  if (!project) return null
  const style = project.captionStyle || {}
  const captions = project.captions || []

  const importFile = async (file) => {
    try {
      const text = await file.text()
      const cues = parseSubtitles(text)
      if (!cues.length) {
        toast('cap.empty', 'warn')
        return
      }
      A.setCaptions(cues)
      toast('toast.importedProject', 'ok')
    } catch {
      toast('err.title', 'err')
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="row gap-6">
          <Icon name="text" size={13} /> {t('cap.title')}
        </span>
        <span className="tiny muted">
          {captions.length} {t('cap.count')}
        </span>
      </div>

      <div className="panel-body">
        <div className="inline-btns" style={{ marginBottom: 10 }}>
          <button className="btn sm primary" onClick={() => A.addCaption({ text: '' })}>
            <Icon name="plus" size={13} /> {t('cap.addLine')}
          </button>
          <button className="btn sm" onClick={() => patchUi({ leftTab: 'ai' })}>
            <Icon name="sparkles" size={13} /> {t('ai.captionsTitle')}
          </button>
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={13} /> {t('cap.import')}
          </button>
          <input ref={fileRef} type="file" accept=".srt,.vtt,text/plain" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </div>

        <div className="inline-btns" style={{ marginBottom: 10 }}>
          <button className="btn sm" disabled={!captions.length} onClick={() => downloadBlob(new Blob([toSrt(captions)], { type: 'text/plain' }), `${project.name}.srt`)}>
            <Icon name="download" size={13} /> SRT
          </button>
          <button className="btn sm" disabled={!captions.length} onClick={() => downloadBlob(new Blob([toVtt(captions)], { type: 'text/plain' }), `${project.name}.vtt`)}>
            <Icon name="download" size={13} /> VTT
          </button>
          <button className="btn sm ghost" disabled={!captions.length} onClick={() => A.shiftCaptions(-0.1)}>
            −0.1s
          </button>
          <button className="btn sm ghost" disabled={!captions.length} onClick={() => A.shiftCaptions(0.1)}>
            +0.1s
          </button>
          <button className="btn sm ghost" disabled={!captions.length} onClick={() => A.mergeCaptions()}>
            {t('cap.merge')}
          </button>
          <button className="btn sm ghost" disabled={!captions.length} onClick={() => A.splitLongCaptions()}>
            {t('cap.splitLong')}
          </button>
        </div>

        <Section title={t('cap.style')} icon="palette" defaultOpen={false}>
          <SelectField label={t('insp.textFont')} value={style.font} onChange={(v) => A.setCaptionStyle({ font: v })} options={CAPTION_FONTS.map((f) => ({ value: f.id, label: f.label }))} />
          <RangeField label={t('cap.fontSize')} value={style.size ?? 4.4} min={2} max={12} step={0.2} onChange={(v) => A.setCaptionStyle({ size: v })} suffix="%" />
          <RangeField label={t('insp.textWeight')} value={style.weight ?? 800} min={300} max={900} step={100} onChange={(v) => A.setCaptionStyle({ weight: v })} />
          <ColorField label={t('insp.textColor')} value={style.color} onChange={(v) => A.setCaptionStyle({ color: v })} />
          <RangeField label={t('insp.textStrokeW')} value={style.strokeW ?? 0} min={0} max={10} step={0.5} onChange={(v) => A.setCaptionStyle({ strokeW: v })} />
          <ColorField label={t('insp.textStroke')} value={style.stroke} onChange={(v) => A.setCaptionStyle({ stroke: v })} />
          <SwitchField label={t('cap.bg')} value={!!style.bg} onChange={(v) => A.setCaptionStyle({ bg: v })} />
          {style.bg ? <ColorField label={t('insp.textBgColor')} value={style.bgColor} onChange={(v) => A.setCaptionStyle({ bgColor: v })} /> : null}
          <SelectField
            label={t('cap.position')}
            value={style.y >= 70 ? 'bottom' : style.y <= 30 ? 'top' : 'middle'}
            onChange={(v) => A.setCaptionStyle({ y: v === 'bottom' ? 84 : v === 'top' ? 12 : 50 })}
            options={[
              { value: 'bottom', label: t('cap.bottom') },
              { value: 'middle', label: t('cap.middle') },
              { value: 'top', label: t('cap.top') },
            ]}
          />
          <RangeField label={t('insp.posY')} value={style.y ?? 84} min={4} max={96} step={1} onChange={(v) => A.setCaptionStyle({ y: v })} suffix="%" />
          <SelectField
            label={t('insp.textAnim')}
            value={style.anim || 'fadeUp'}
            onChange={(v) => A.setCaptionStyle({ anim: v })}
            options={TEXT_ANIMS.map((x) => ({ value: x.id, label: x.name[lang === 'ar' ? 'ar' : 'en'] }))}
          />
          <SwitchField label={t('cap.uppercase')} value={!!style.uppercase} onChange={(v) => A.setCaptionStyle({ uppercase: v })} />
          <SwitchField label={t('cap.karaoke')} value={style.anim === 'karaoke'} onChange={(v) => A.setCaptionStyle({ anim: v ? 'karaoke' : 'fadeUp', karaoke: v })} />
          <ColorField label={t('cap.karaoke')} value={style.highlight} onChange={(v) => A.setCaptionStyle({ highlight: v })} />
          <RangeField label={t('insp.textMaxWidth')} value={style.maxWidth ?? 88} min={30} max={100} step={1} onChange={(v) => A.setCaptionStyle({ maxWidth: v })} suffix="%" />
        </Section>

        {captions.length === 0 ? (
          <EmptyNote>{t('cap.empty')}</EmptyNote>
        ) : (
          captions.map((c) => {
            const isActive = engine.time >= c.start && engine.time < c.end
            return (
              <div key={c.id} className={`caption-row ${isActive ? 'active' : ''}`}>
                <div className="col" style={{ gap: 4, flex: 'none', width: 66 }}>
                  <input
                    className="input"
                    type="number"
                    step="0.05"
                    min="0"
                    style={{ padding: '2px 4px', fontSize: 10.5 }}
                    value={+c.start.toFixed(2)}
                    onChange={(e) => A.updateCaption(c.id, { start: Math.max(0, parseFloat(e.target.value) || 0) })}
                    title={t('cap.start')}
                  />
                  <input
                    className="input"
                    type="number"
                    step="0.05"
                    min="0.1"
                    style={{ padding: '2px 4px', fontSize: 10.5 }}
                    value={+c.end.toFixed(2)}
                    onChange={(e) => A.updateCaption(c.id, { end: Math.max(c.start + 0.2, parseFloat(e.target.value) || 0) })}
                    title={t('cap.end')}
                  />
                  <button className="btn sm ghost" onClick={() => engine.seek(c.start)} title={t('cap.start')}>
                    <Icon name="play" size={11} fill />
                  </button>
                </div>
                <div className="col grow" style={{ gap: 4 }}>
                  <textarea className="input" value={c.text} onChange={(e) => A.updateCaption(c.id, { text: e.target.value })} placeholder={t('cap.text')} />
                  <div className="row gap-6 between">
                    <span className="caption-time">
                      {(c.end - c.start).toFixed(2)}s
                    </span>
                    <span className="row gap-4">
                      <button
                        className="btn sm ghost"
                        title={t('cap.start')}
                        onClick={() => A.updateCaption(c.id, { start: engine.time, end: Math.max(engine.time + 0.4, c.end) })}
                      >
                        ⇤
                      </button>
                      <button className="btn sm ghost" onClick={() => A.removeCaption(c.id)}>
                        <Icon name="trash" size={11} />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
