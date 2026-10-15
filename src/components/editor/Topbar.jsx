import { useI18n } from '../../i18n/index.jsx'
import { useStore, patchUi, closeProject, toast, undo, redo, markSaved, undoLabel } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { saveProject } from '../../store/media.js'
import { engine } from '../../engine/player.js'
import { Icon } from '../ui.jsx'

export default function Topbar() {
  const { t, toggle, lang } = useI18n()
  const project = useStore((s) => s.project)
  const dirty = useStore((s) => s.dirty)
  const showLeft = useStore((s) => s.ui.showLeft)
  const showRight = useStore((s) => s.ui.showRight)
  const hist = useStore((s) => s.history)
  if (!project) return null

  const label = undoLabel()
  const undoTitle = label ? `${t('shot.undo')} — ${t(`hist.${label}`)}` : t('shot.undo')

  const save = async () => {
    await saveProject(project)
    markSaved()
    toast('toast.saved', 'ok')
  }

  return (
    <header className="topbar">
      <div className="brand" onClick={() => closeProject()} title={t('nav.projects')} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && closeProject()}
      >
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="#080c18" strokeWidth="2.1" strokeLinecap="round">
            <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
            <circle cx="12" cy="12" r="3.4" fill="#080c18" stroke="none" />
            <path d="M7 2.6v3M17 2.6v3M7 18.4v3M17 18.4v3" />
          </svg>
        </div>
        <b>{t('brand.name')}</b>
      </div>

      <button className="btn sm ghost" onClick={() => closeProject()} title={t('nav.projects')}>
        <Icon name="folder" size={13} /> <span className="hide-sm">{t('nav.projects')}</span>
      </button>

      <input
        className="proj-name-input"
        value={project.name}
        onChange={(e) => A.renameProject(e.target.value)}
        aria-label={t('new.name')}
      />

      <span className="row gap-6 tiny muted hide-sm">
        <span className={`save-dot ${dirty ? 'dirty' : ''}`} />
        {dirty ? t('common.working') : t('toast.autosaved')}
      </span>

      <div className="grow" />

      <button className="btn icon" onClick={undo} disabled={!hist.past.length} title={undoTitle} aria-label={undoTitle}>
        <Icon name="undo" size={15} />
      </button>
      <button className="btn icon" onClick={redo} disabled={!hist.future.length} title={t('shot.redo')} aria-label={t('shot.redo')}>
        <Icon name="redo" size={15} />
      </button>
      <button className="btn icon" onClick={save} title={t('common.save')} aria-label={t('common.save')}>
        <Icon name="save" size={15} />
      </button>

      <div className="row gap-4 hide-sm" style={{ marginInlineStart: 6 }}>
        <button className={`btn sm ${showLeft ? 'active' : ''}`} onClick={() => patchUi({ showLeft: !showLeft })} title={t('editor.media')} aria-label={t('editor.media')}>
          <Icon name="layers" size={13} />
        </button>
        <button className={`btn sm ${showRight ? 'active' : ''}`} onClick={() => patchUi({ showRight: !showRight })} title={t('editor.inspector')} aria-label={t('editor.inspector')}>
          <Icon name="sliders" size={13} />
        </button>
      </div>

      <button className="btn sm ghost hide-sm" onClick={() => patchUi({ showShortcuts: true })} title={t('shot.helpTitle')}>
        <Icon name="info" size={14} />
      </button>
      <button className="btn sm ghost lang-btn" onClick={toggle} title={t('nav.lang')} aria-label={t('nav.lang')}>
        {lang === 'ar' ? 'EN' : 'ع'}
      </button>
      <button className="btn primary" onClick={() => patchUi({ rightTab: 'export' })}>
        <Icon name="download" size={14} /> {t('exp.title')}
      </button>
      <button className="btn sm ghost hide-sm" onClick={() => engine.pause()} title={t('shot.playPause')}>
        <Icon name="stop" size={13} />
      </button>
    </header>
  )
}
