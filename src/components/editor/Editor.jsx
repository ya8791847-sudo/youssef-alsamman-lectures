import { useEffect } from 'react'
import { useI18n } from '../../i18n/index.jsx'
import { useStore, patchUi, getState, aiProgress, undo, redo, markSaved } from '../../store/store.js'
import * as A from '../../store/editorActions.js'
import { engine } from '../../engine/player.js'
import { setProgressHandler } from '../../engine/ai/tools.js'
import { saveProject } from '../../store/media.js'
import Topbar from './Topbar.jsx'
import MediaPanel from './MediaPanel.jsx'
import AiPanel from './AiPanel.jsx'
import EffectsPanel from './EffectsPanel.jsx'
import InspectorPanel from './InspectorPanel.jsx'
import CaptionsPanel from './CaptionsPanel.jsx'
import AudioPanel from './AudioPanel.jsx'
import ExportPanel from './ExportPanel.jsx'
import Stage from './Stage.jsx'
import Timeline from './Timeline.jsx'
import { Icon, Modal, Progress, Kbd } from '../ui.jsx'

export default function Editor() {
  const { t } = useI18n()
  const ui = useStore((s) => s.ui)
  const project = useStore((s) => s.project)

  // keep the engine pointed at the current project + autosave
  useEffect(() => {
    if (!project) return
    engine.attachProject(project)
    const timer = setTimeout(async () => {
      if (getState().dirty) {
        await saveProject(project)
        markSaved()
      }
    }, 1600)
    return () => clearTimeout(timer)
  }, [project])

  // global progress wiring for AI tools
  useEffect(() => {
    setProgressHandler(aiProgress)
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        patchUi({ rightTab: 'export' })
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        A.duplicateClips(getState().ui.selection)
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveProject(getState().project).then(() => markSaved())
        return
      }
      if (typing) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          engine.toggle()
          break
        case 's':
        case 'S':
          A.splitAt(engine.time, { all: !getState().ui.selection.length })
          break
        case 'Delete':
        case 'Backspace':
          if (getState().ui.selection.length) {
            e.preventDefault()
            A.removeClips(getState().ui.selection)
          }
          break
        case 'n':
        case 'N':
          patchUi({ snap: !getState().ui.snap })
          break
        case 'm':
        case 'M':
          A.addMarker(engine.time, '★')
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) engine.seek(engine.time - 0.1)
          else jumpClip(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) engine.seek(engine.time + 0.1)
          else jumpClip(1)
          break
        case ',':
          engine.stepFrame(-1)
          break
        case '.':
          engine.stepFrame(1)
          break
        case 'Home':
          engine.seek(0)
          break
        case 'End':
          engine.seek(engine.duration)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!project) return null

  const leftTabs = [
    ['media', 'folder', t('editor.media')],
    ['ai', 'sparkles', t('editor.aiTools')],
    ['effects', 'sliders', t('editor.effects')],
  ]
  const rightTabs = [
    ['inspect', 'crop', t('editor.inspector')],
    ['captions', 'text', t('editor.captions')],
    ['audio', 'volume', t('editor.audio')],
    ['export', 'download', t('editor.export')],
  ]

  return (
    <div className="app">
      <Topbar />
      <div
        className={`editor ${ui.showLeft ? '' : 'no-left'} ${ui.showRight ? '' : 'no-right'} ${ui.timelineCollapsed ? 'collapsed-timeline' : ''} ${ui.mobilePane === 'media' ? 'show-left' : ''}`}
      >
        <div className="pane-left panel">
          <div className="tabs">
            {leftTabs.map(([id, icon, label]) => (
              <button key={id} className={`tab ${ui.leftTab === id ? 'active' : ''}`} onClick={() => A.ui.tab(id)}>
                <span className="row gap-6">
                  <Icon name={icon} size={12} /> {label}
                </span>
              </button>
            ))}
          </div>
          <div className="grow" style={{ minHeight: 0, overflow: 'hidden' }}>
            {ui.leftTab === 'media' ? <MediaPanel /> : ui.leftTab === 'ai' ? <AiPanel /> : <EffectsPanel />}
          </div>
        </div>

        <div className="pane-stage">
          <Stage />
        </div>

        <div className="pane-right panel">
          <div className="tabs">
            {rightTabs.map(([id, icon, label]) => (
              <button key={id} className={`tab ${ui.rightTab === id ? 'active' : ''}`} onClick={() => A.ui.rightTab(id)} title={label}>
                <Icon name={icon} size={13} />
              </button>
            ))}
          </div>
          <div className="grow" style={{ minHeight: 0, overflow: 'hidden' }}>
            {ui.rightTab === 'inspect' ? (
              <InspectorPanel />
            ) : ui.rightTab === 'captions' ? (
              <CaptionsPanel />
            ) : ui.rightTab === 'audio' ? (
              <AudioPanel />
            ) : (
              <ExportPanel />
            )}
          </div>
        </div>

        <div className="pane-bottom">
          {ui.timelineCollapsed ? (
            <div className="row between" style={{ padding: '6px 10px', height: 44, background: 'var(--bg-2)', borderTop: '1px solid var(--line)' }}>
              <span className="tiny muted">{t('editor.timeline')}</span>
              <button className="btn sm ghost" onClick={() => patchUi({ timelineCollapsed: false })}>
                <Icon name="plus" size={13} /> {t('tl.expand')}
              </button>
            </div>
          ) : (
            <Timeline />
          )}
        </div>

        <div className="mobile-tabs">
          {[
            ['stage', 'film', t('editor.preview')],
            ['media', 'folder', t('editor.media')],
            ['tools', 'sliders', t('editor.tools')],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={`tab ${ui.mobilePane === id ? 'active' : ''}`}
              onClick={() => patchUi({ mobilePane: id, showLeft: id === 'media' || id === 'tools', showRight: id === 'tools' })}
            >
              <span className="row gap-6 center" style={{ justifyContent: 'center' }}>
                <Icon name={icon} size={12} /> {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {ui.showShortcuts ? <ShortcutsDialog onClose={() => patchUi({ showShortcuts: false })} /> : null}
      {ui.analyzing ? <AnalyzingOverlay /> : null}
    </div>
  )
}

function jumpClip(dir) {
  const project = getState().project
  const times = []
  for (const tr of project.tracks) for (const c of tr.clips) times.push(c.start, c.start + c.duration)
  const uniq = [...new Set(times)].sort((a, b) => a - b)
  const cur = engine.time
  const next = dir > 0 ? uniq.find((x) => x > cur + 0.02) : [...uniq].reverse().find((x) => x < cur - 0.02)
  if (next != null) engine.seek(next)
}

function AnalyzingOverlay() {
  const { t } = useI18n()
  const ai = useStore((s) => s.ai)
  return (
    <div className="modal-back" style={{ alignItems: 'flex-end', paddingBottom: 40, background: 'rgba(0,0,0,.35)' }}>
      <div className="modal sm" style={{ pointerEvents: 'auto' }}>
        <div className="modal-body">
          <div className="row gap-8">
            <span className="spin">
              <Icon name="refresh" size={16} />
            </span>
            <div className="grow">
              <b>{t('common.working')}</b>
              <div className="tiny muted">{ai.running ? t(`ai.${ai.running}Title`) : ''}</div>
              <Progress value={ai.progress} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ShortcutsDialog({ onClose }) {
  const { t } = useI18n()
  const rows = [
    ['Space', 'shot.playPause'],
    ['S', 'shot.split'],
    ['Delete', 'shot.delete'],
    ['Ctrl+Z', 'shot.undo'],
    ['Ctrl+Y', 'shot.redo'],
    ['Ctrl+D', 'shot.duplicate'],
    ['Ctrl+E', 'shot.export'],
    ['M', 'shot.marker'],
    ['N', 'shot.snapToggle'],
    ['← / →', 'shot.prevClip'],
    [', / .', 'shot.frameStep'],
    ['Shift+←/→', 'shot.nudge'],
    ['Ctrl+عجلة', 'shot.zoom'],
    ['Home / End', 'cap.start'],
  ]
  return (
    <Modal title={t('shot.helpTitle')} onClose={onClose} size="lg">
      <div className="help-list">
        {rows.map(([keys, key]) => (
          <div className="help-item" key={keys}>
            <span>{t(key)}</span>
            <Kbd>{keys}</Kbd>
          </div>
        ))}
      </div>
      <div className="divider" />
      <div className="stack">
        <b className="small">{t('shot.tips')}</b>
        <span className="tiny muted">
          {t('ai.dictateHint')}
        </span>
        <span className="tiny muted">{t('exp.note')}</span>
        <span className="tiny muted">{t('ai.engineLocal')}</span>
      </div>
    </Modal>
  )
}
