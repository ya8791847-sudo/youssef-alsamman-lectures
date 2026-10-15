import { useI18n, fmtTime } from '../../i18n/index.jsx'
import { engine } from '../../engine/player.js'
import { useStore } from '../../store/store.js'
import { Icon } from '../ui.jsx'

/**
 * Compact analysis strip under the timeline: scenes, beats, highlight picks,
 * silences and AI activity. Click a chip to jump the playhead there.
 */
export default function SceneTrack() {
  const { t } = useI18n()
  const project = useStore((s) => s.project)
  const ai = useStore((s) => s.ai)
  if (!project) return null
  const { cuts = [], beats = [], silences = [], highlight = [], copy = null } = project.analysis || {}
  const hasAny = cuts.length || beats.length || highlight.length || (project.markers || []).length

  return (
    <div className="row gap-8 wrap" style={{ padding: '5px 8px', borderTop: '1px solid var(--line)', background: 'rgba(255,255,255,.015)', flex: 'none' }}>
      <span className="chip">
        <Icon name="sparkles" size={11} /> {t('ai.title')}
      </span>
      {ai.running ? (
        <span className="chip pink pulse">
          {t(`ai.${ai.running}Title`)} · {Math.round((ai.progress || 0) * 100)}%
        </span>
      ) : null}
      {cuts.length ? <span className="chip on">{cuts.length} {t('ai.scenesFound')}</span> : null}
      {beats.length ? <span className="chip on">{beats.length} {t('ai.beatsFound')}</span> : null}
      {silences.length ? <span className="chip on">{silences.length} {t('ai.silenceFound')}</span> : null}
      {highlight.length ? (
        <span className="chip pink">
          {t('ai.highlightTitle')}: {highlight.length} × {t('dash.clips')}
        </span>
      ) : null}
      {copy ? (
        <span className="chip" title={copy.titles?.[0]}>
          <Icon name="magic" size={11} /> {copy.titles?.[0]?.slice(0, 34) || ''}
        </span>
      ) : null}
      {!hasAny && !ai.running ? <span className="tiny muted">{t('ai.noLog')}</span> : null}
      <div className="grow" />
      {cuts.slice(0, 24).map((c, i) => (
        <button key={`${c}-${i}`} className="chip" onClick={() => engine.seek(c)} title={fmtTime(c, { frames: 1, fps: project.fps })}>
          <Icon name="scissors" size={10} /> {fmtTime(c, { fps: 0 })}
        </button>
      ))}
    </div>
  )
}
