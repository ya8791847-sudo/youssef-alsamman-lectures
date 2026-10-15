import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/index.jsx'
import { TOOLS, runTool, dictationSupported, startDictation, setProgressHandler } from '../../engine/ai/tools.js'
import { ask, describeRequest } from '../../engine/ai/copilot.js'
import { useStore, toast, aiLog, aiProgress, patchUi } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { WRITER_TONES, MUSIC_STYLES, VOICE_PRESETS } from '../../engine/presets.js'
import { engine } from '../../engine/player.js'
import { Icon, Section, Progress, EmptyNote } from '../ui.jsx'

const ICONS = {
  silence: 'scissors',
  scenes: 'grid',
  beats: 'music',
  reframe: 'crop',
  enhance: 'palette',
  captions: 'text',
  highlight: 'lightning',
  thumbnail: 'image',
  voice: 'wave',
  autofx: 'sparkles',
  chroma: 'target',
  writer: 'magic',
  music: 'music',
  titlecard: 'film',
}

const ORDER = [
  'silence',
  'scenes',
  'beats',
  'highlight',
  'reframe',
  'enhance',
  'autofx',
  'chroma',
  'captions',
  'thumbnail',
  'voice',
  'writer',
  'music',
  'titlecard',
]

export default function AiPanel() {
  const { t, lang } = useI18n()
  const ai = useStore((s) => s.ai)
  const [command, setCommand] = useState('')
  const [params, setParams] = useState(() => {
    const out = {}
    for (const id of ORDER) {
      out[id] = {}
      for (const p of TOOLS[id].params || []) out[id][p.id] = p.def
    }
    return out
  })
  const [results, setResults] = useState({})
  const [open, setOpen] = useState({ captions: true })
  const [dictating, setDictating] = useState(null)
  // wire the shared progress channel into the store once
  useEffect(() => {
    setProgressHandler(aiProgress)
  }, [])

  const suggestions = [
    'ai.suggest1',
    'ai.suggest2',
    'ai.suggest3',
    'ai.suggest6',
    'ai.suggest7',
    'ai.suggest5',
  ]

  const setParam = (toolId, key, value) => setParams((p) => ({ ...p, [toolId]: { ...p[toolId], [key]: value } }))

  const runOne = async (toolId) => {
    const tool = TOOLS[toolId]
    try {
      A.ui.set({})
      const res = await runTool(toolId, params[toolId], {
        log: (m) => aiLog({ tool: toolId, msg: m }),
      })
      setResults((r) => ({ ...r, [toolId]: res }))
      toast('toast.done', 'ok', t(tool.titleKey))
      if (toolId === 'music' || toolId === 'titlecard' || toolId === 'thumbnail') patchUi({ leftTab: 'media' })
    } catch (e) {
      const code = String(e.message || e)
      const map = {
        'no-video-clip': 'ai.needVideo',
        'no-audio-clip': 'ai.needAudio',
        'no-audio': 'ai.needAudio',
        'missing-blob': 'err.decode',
        'no-text': 'cap.empty',
      }
      toast(map[code] || 'err.title', 'err')
      aiLog({ tool: toolId, ok: false, error: code })
    }
  }

  const runCommand = async () => {
    const text = command.trim()
    if (!text) return
    const preview = describeRequest(text)
    aiLog({ request: text, plan: preview })
    const res = await ask(text, { log: (m) => aiLog({ msg: m }) })
    if (!res.ok) {
      toast('toast.nothing', 'warn')
      return
    }
    toast('toast.applied', 'ok')
    setCommand('')
  }

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('toast.copied', 'ok', label)
    } catch {
      toast('err.title', 'err')
    }
  }

  const toggleDictation = async () => {
    if (dictating) {
      dictating.stop()
      setDictating(null)
      patchUi({ dictating: false })
      return
    }
    const ctl = startDictation({
      lang: lang === 'ar' ? 'ar-EG' : 'en-US',
      cursor: engine.time,
      onCue: (cue, final) => {
        if (final) A.addCaption({ start: cue.start, end: cue.end, text: cue.text })
      },
      onError: () => {
        toast('toast.micDenied', 'err')
        setDictating(null)
      },
    })
    if (ctl) {
      setDictating(ctl)
      patchUi({ dictating: true, rightTab: 'captions' })
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="row gap-6">
          <Icon name="sparkles" size={13} /> {t('ai.title')}
          <span className="badge-ai">AI</span>
        </span>
        <span className="tiny muted">{Object.keys(TOOLS).length}</span>
      </div>

      <div className="copilot">
        <div className="copilot-input">
          <span className="spark">
            <Icon name="magic" size={15} />
          </span>
          <input
            value={command}
            placeholder={t('ai.copilotPlaceholder')}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runCommand()}
          />
          <button className="btn primary sm" onClick={runCommand} disabled={!!ai.running}>
            {t('ai.run')}
          </button>
        </div>
        <div className="suggest-row">
          {suggestions.map((s) => (
            <button key={s} className="suggest-chip" onClick={() => setCommand(t(s))}>
              {t(s)}
            </button>
          ))}
        </div>
        {ai.running ? (
          <div style={{ marginTop: 8 }}>
            <div className="tiny dim">
              {t('common.working')} {Math.round((ai.progress || 0) * 100)}%
            </div>
            <Progress value={ai.progress} />
          </div>
        ) : null}
      </div>

      <div className="panel-body">
        {dictationSupported() ? null : (
          <div className="warn-box" style={{ marginBottom: 8 }}>
            {t('ai.dictateUnsupported')}
          </div>
        )}

        {ORDER.map((id) => {
          const tool = TOOLS[id]
          const res = results[id]
          const isOpen = !!open[id]
          return (
            <div className="section" key={id}>
              <h4 style={{ cursor: 'pointer' }} onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}>
                <span className="row gap-6">
                  <Icon name={ICONS[id] || 'sparkles'} size={13} />
                  {t(tool.titleKey)}
                </span>
                <span className="row gap-6">
                  {res ? <Icon name="check" size={12} /> : null}
                  <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} />
                </span>
              </h4>

              {isOpen ? (
                <>
                  <p className="tiny muted" style={{ margin: '0 0 8px' }}>
                    {t(tool.descKey)}
                  </p>
                  {(tool.params || []).map((p) => (
                    <ParamField key={p.id} param={p} value={params[id]?.[p.id]} onChange={(v) => setParam(id, p.id, v)} t={t} />
                  ))}

                  {id === 'captions' ? (
                    <div className="inline-btns" style={{ marginBottom: 6 }}>
                      <button className={`btn sm ${dictating ? 'danger' : ''}`} onClick={toggleDictation}>
                        <Icon name="mic" size={12} /> {dictating ? t('media.recording') : t('ai.dictate')}
                      </button>
                      <button className="btn sm ghost" onClick={() => A.addCaption({})}>
                        <Icon name="plus" size={12} /> {t('cap.addLine')}
                      </button>
                    </div>
                  ) : null}

                  <button className="btn primary sm block" onClick={() => runOne(id)} disabled={!!ai.running} style={{ marginTop: 4 }}>
                    <Icon name="lightning" size={13} /> {ai.running === id ? t('ai.running') : t('ai.apply')}
                  </button>

                  {id === 'music' ? (
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      {MUSIC_STYLES.map((s) => (s.id === params.music.style ? s.name[lang === 'ar' ? 'ar' : 'en'] : null)).join('')}
                    </div>
                  ) : null}
                  {id === 'voice' ? (
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      {VOICE_PRESETS.find((v) => v.id === params.voice.profile)?.name[lang === 'ar' ? 'ar' : 'en']}
                    </div>
                  ) : null}
                  {id === 'writer' ? (
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      {WRITER_TONES.find((w) => w.id === params.writer.tone)?.name[lang === 'ar' ? 'ar' : 'en']}
                    </div>
                  ) : null}

                  {res ? (
                    <div style={{ marginTop: 8 }}>
                      <ResultView toolId={id} res={res} t={t} lang={lang} onCopy={copyText} />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          )
        })}

        <Section title={t('ai.log')} icon="clock" defaultOpen>
          <div style={{ maxHeight: 210, overflow: 'auto' }}>
            {ai.logs.length === 0 ? (
              <EmptyNote>{t('ai.noLog')}</EmptyNote>
            ) : (
              ai.logs.map((l) => (
                <div key={l.id} className="log-line">
                  <span className="t">{new Date(l.at).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</span>
                  <span>
                    {l.msg || l.request || l.error || (l.tool ? t(`ai.${l.tool}Title`) : '')}
                    {l.ms ? ` · ${l.ms}ms` : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </Section>

        <div className="tiny muted row gap-6" style={{ padding: '4px 2px' }}>
          <Icon name="lock" size={12} /> {t('ai.engineLocal')}
        </div>
      </div>
    </div>
  )
}

function ParamField({ param, value, onChange, t }) {
  const label = t(param.labelKey)
  if (param.type === 'range') {
    return (
      <label className="field">
        <span className="row between">
          <span>{label}</span>
          <span className="mono tiny dim">
            {value}
            {param.unit || ''}
          </span>
        </span>
        <input type="range" min={param.min} max={param.max} step={param.step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      </label>
    )
  }
  if (param.type === 'toggle') {
    return (
      <div className="row between" style={{ padding: '3px 0' }}>
        <span className="tiny dim">{label}</span>
        <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} />
      </div>
    )
  }
  if (param.type === 'select') {
    return (
      <label className="field">
        <span>{label}</span>
        <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          {param.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (param.type === 'textarea') {
    return (
      <label className="field">
        <span>{label}</span>
        <textarea className="input" rows={5} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function ResultView({ toolId, res, t, lang, onCopy }) {
  const detail = res.detail || {}
  if (toolId === 'writer' && detail.titles) {
    return (
      <div className="stack">
        <div className="row between">
          <span className="tiny dim">{t('ai.transcript')}</span>
          <button className="btn sm ghost" onClick={() => onCopy(detail.description, 'description')}>
            <Icon name="copy" size={12} /> {t('ai.copyAll')}
          </button>
        </div>
        <div className="result-box">
          {detail.titles.map((x, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              • {x}
            </div>
          ))}
          <div className="divider" />
          {detail.description}
        </div>
      </div>
    )
  }
  if (toolId === 'thumbnail') {
    return (
      <div className="tiny dim">
        {t('ai.found')} {detail.candidates} · {detail.added ? t('ai.applied') : t('ai.thumbPick')}
      </div>
    )
  }
  if (toolId === 'silence') {
    return (
      <div className="tiny dim">
        {detail.removed} {t('ai.silencesSkipped')} · {t('ai.savedTime')} {Math.round(detail.saved || 0)}s
      </div>
    )
  }
  if (toolId === 'highlight') {
    return (
      <div className="tiny dim">
        {detail.segments} {t('dash.clips')} · {Math.round(detail.seconds || 0)}s
      </div>
    )
  }
  if (toolId === 'beats') {
    return (
      <div className="tiny dim">
        {detail.beats} {t('ai.beatCount')} · {detail.bpm || '—'} {t('ai.tempo')}
      </div>
    )
  }
  if (toolId === 'scenes') {
    return (
      <div className="tiny dim">
        {detail.cuts?.length || 0} {t('ai.scenesFound')}
      </div>
    )
  }
  return (
    <div className="tiny dim">
      {res.summary} {res.ms ? `· ${res.ms}ms` : ''}
    </div>
  )
}
