import { useState } from 'react'
import { useI18n } from '../../i18n/index.jsx'
import { FILTERS, TRANSITIONS, TEXT_PRESETS, MOTION_PRESETS, DEFAULT_ADJ } from '../../engine/presets.js'
import { useStore, toast } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { Icon, Section, RangeField, SelectField, SwitchField, ColorField, TextField } from '../ui.jsx'

export default function EffectsPanel() {
  const { t, lang } = useI18n()
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.ui.selection)
  const [transIn, setTransIn] = useState('fade')
  const [transOut, setTransOut] = useState('fade')
  const [transDur, setTransDur] = useState(0.5)
  const [textStyle, setTextStyle] = useState('title-bold')
  const [wmText, setWmText] = useState('')

  if (!project) return null
  const s = project.settings

  const targetIds = selection.length
    ? selection
    : project.tracks.flatMap((tr) => tr.clips).filter((c) => c.kind !== 'text').map((c) => c.id)

  const applyFilterTo = (filterId) => {
    if (!targetIds.length) {
      toast('fx.needSelection', 'warn')
      return
    }
    A.applyFilter(targetIds, filterId)
    toast('toast.applied', 'ok')
  }

  const applyTransitions = () => {
    if (!selection.length) {
      toast('fx.needSelection', 'warn')
      return
    }
    selection.forEach((id) => {
      A.setTransition(id, 'in', transIn, transDur)
      A.setTransition(id, 'out', transOut, transDur)
    })
    toast('toast.applied', 'ok')
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="row gap-6">
          <Icon name="sliders" size={13} /> {t('fx.title')}
        </span>
        <span className="tiny muted">{selection.length ? `${selection.length} ${t('dash.clips')}` : t('common.auto')}</span>
      </div>

      <div className="panel-body">
        <Section title={t('fx.filters')} icon="palette">
          <div className="preset-grid">
            {FILTERS.map((f) => (
              <button key={f.id} className="preset" onClick={() => applyFilterTo(f.id)} title={f.name[lang === 'ar' ? 'ar' : 'en']}>
                <span
                  className="swatch"
                  style={{
                    background: `linear-gradient(135deg, hsl(${(f.id.length * 37) % 360} 70% 55%), hsl(${(f.id.length * 71) % 360} 70% 45%))`,
                    filter: `saturate(${1 + (f.adj.saturation || 0) / 100}) contrast(${1 + (f.adj.contrast || 0) / 100})`,
                  }}
                />
                {f.name[lang === 'ar' ? 'ar' : 'en']}
              </button>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="tiny muted">{t('fx.applyToSelected')}</span>
            <button className="btn sm ghost" onClick={() => A.applyFilter(targetIds, 'none')} disabled={!targetIds.length}>
              {t('common.reset')}
            </button>
          </div>
        </Section>

        <Section title={t('fx.transitions')} icon="layers">
          <SelectField
            label={t('insp.transIn')}
            value={transIn}
            onChange={setTransIn}
            options={TRANSITIONS.map((x) => ({ value: x.id, label: x.name[lang === 'ar' ? 'ar' : 'en'] }))}
          />
          <SelectField
            label={t('insp.transOut')}
            value={transOut}
            onChange={setTransOut}
            options={TRANSITIONS.map((x) => ({ value: x.id, label: x.name[lang === 'ar' ? 'ar' : 'en'] }))}
          />
          <RangeField label={t('insp.transDur')} value={transDur} min={0.15} max={2} step={0.05} onChange={setTransDur} suffix="s" />
          <button className="btn sm primary block" onClick={applyTransitions}>
            <Icon name="check" size={13} /> {t('common.apply')}
          </button>
        </Section>

        <Section title={t('fx.textPresets')} icon="text" defaultOpen={false}>
          <div className="preset-grid">
            {TEXT_PRESETS.map((p) => (
              <button key={p.id} className={`preset ${textStyle === p.id ? 'active' : ''}`} onClick={() => setTextStyle(p.id)}>
                {p.name[lang === 'ar' ? 'ar' : 'en']}
              </button>
            ))}
          </div>
          <button
            className="btn sm block primary"
            style={{ marginTop: 8 }}
            onClick={() => {
              const preset = TEXT_PRESETS.find((p) => p.id === textStyle)
              A.addTextClip({ start: Math.max(0, (project.tracks.flatMap((x) => x.clips).reduce((a, c) => Math.max(a, c.start + c.duration), 0) - 1)), duration: 3.2, text: t('insp.textContent'), style: preset.style })
              toast('toast.clipAdded', 'ok')
            }}
          >
            <Icon name="plus" size={13} /> {t('common.add')}
          </button>
        </Section>

        <Section title={t('fx.motion')} icon="sparkles" defaultOpen={false}>
          <div className="preset-grid">
            {MOTION_PRESETS.map((m) => (
              <button
                key={m.id}
                className="preset"
                onClick={() => {
                  if (!selection.length) {
                    toast('fx.needSelection', 'warn')
                    return
                  }
                  A.applyMotion(selection, m.kf)
                  toast('toast.applied', 'ok')
                }}
              >
                {m.name[lang === 'ar' ? 'ar' : 'en']}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t('fx.globalFx')} icon="film">
          <SwitchField label={t('fx.letterbox')} value={(s.letterbox || 0) > 0} onChange={(v) => A.updateSettings({ letterbox: v ? 8 : 0 })} />
          {s.letterbox ? (
            <RangeField label={t('fx.letterbox')} value={s.letterbox} min={2} max={20} step={1} onChange={(v) => A.updateSettings({ letterbox: v })} suffix="%" />
          ) : null}
          <SwitchField
            label={t('fx.blurBg')}
            value={s.background === 'blur'}
            onChange={(v) => A.updateSettings({ background: v ? 'blur' : 'color' })}
          />
          <RangeField label={t('fx.grain')} value={s.grain || 0} min={0} max={60} step={1} onChange={(v) => A.updateSettings({ grain: v })} />
          <RangeField label={t('fx.vignette')} value={s.vignette || 0} min={0} max={80} step={1} onChange={(v) => A.updateSettings({ vignette: v })} />
          <SwitchField
            label={t('fx.progressBar')}
            value={!!s.progressBar}
            onChange={(v) => A.updateSettings({ progressBar: v })}
          />
          {s.progressBar ? <ColorField label={t('fx.progressBar')} value={s.progressBarColor} onChange={(v) => A.updateSettings({ progressBarColor: v })} /> : null}
          <SwitchField
            label={t('fx.captionBurn')}
            value={s.burnCaptions !== false}
            onChange={(v) => A.updateSettings({ burnCaptions: v })}
          />
          <div className="divider" />
          <SwitchField
            label={t('fx.watermark')}
            value={!!s.watermark?.enabled}
            onChange={(v) => A.updateSettings({ watermark: { ...s.watermark, enabled: v } })}
          />
          {s.watermark?.enabled ? (
            <>
              <TextField label={t('fx.watermark')} value={wmText || s.watermark.text} onChange={(v) => { setWmText(v); A.updateSettings({ watermark: { ...s.watermark, text: v } }) }} placeholder="laqta.ai" />
              <SelectField
                label={t('cap.position')}
                value={s.watermark.pos || 'br'}
                onChange={(v) => A.updateSettings({ watermark: { ...s.watermark, pos: v } })}
                options={[
                  { value: 'br', label: lang === 'ar' ? 'أسفل يمين' : 'Bottom right' },
                  { value: 'bl', label: lang === 'ar' ? 'أسفل يسار' : 'Bottom left' },
                  { value: 'tr', label: lang === 'ar' ? 'أعلى يمين' : 'Top right' },
                  { value: 'tl', label: lang === 'ar' ? 'أعلى يسار' : 'Top left' },
                  { value: 'tc', label: lang === 'ar' ? 'أعلى وسط' : 'Top center' },
                ]}
              />
              <RangeField
                label={t('insp.opacity')}
                value={(s.watermark.opacity ?? 0.5) * 100}
                min={10}
                max={100}
                step={5}
                onChange={(v) => A.updateSettings({ watermark: { ...s.watermark, opacity: v / 100 } })}
                suffix="%"
              />
              <RangeField
                label={t('insp.textSize')}
                value={s.watermark.size || 4}
                min={1}
                max={14}
                step={0.5}
                onChange={(v) => A.updateSettings({ watermark: { ...s.watermark, size: v } })}
                suffix="%"
              />
            </>
          ) : null}
        </Section>

        <Section title={t('fx.chromaKey')} icon="target" defaultOpen={false}>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            {t('ai.chromaDesc')}
          </p>
          <button
            className="btn sm block primary"
            onClick={() => {
              if (!selection.length) {
                toast('fx.needSelection', 'warn')
                return
              }
              selection.forEach((id) => A.updateClip(id, (c) => ({ fx: { ...DEFAULT_ADJ, ...(c.fx || {}), key: { enabled: true, color: '#00b140', similarity: 32, smooth: 10, spill: 40 } } })))
              toast('toast.applied', 'ok')
            }}
          >
            <Icon name="target" size={13} /> {t('common.apply')}
          </button>
          <button
            className="btn sm block ghost"
            style={{ marginTop: 6 }}
            onClick={() => selection.forEach((id) => A.updateClip(id, (c) => ({ fx: { ...(c.fx || {}), key: { ...(c.fx?.key || {}), enabled: false } } })))}
          >
            {t('common.off')}
          </button>
        </Section>
      </div>
    </div>
  )
}
